import type {
  AudioInputContent,
  DocumentInputContent,
  ImageInputContent,
  InputContentSource,
  TextInputContent,
  VideoInputContent,
} from '@ag-ui/core';

import type {
  AIChatCompletionParams,
  BuildChatCompletionRequestInput,
} from '#/plugins/ai/api/chat';
import type {
  AGUIAssistantMessage,
  AGUIDeveloperMessage,
  AGUISystemMessage,
  AGUIToolCall,
  AGUIToolMessage,
  AGUIUserMessage,
} from '#/plugins/ai/types/ag-ui';
import type {
  AIChatFileMessageBlock,
  AIChatMessageBlock,
  AIChatMessageDetail,
} from '#/plugins/ai/types/message';

import {
  AGUI_DEVELOPER_MESSAGE_EVENT_TYPE,
  AGUI_SYSTEM_MESSAGE_EVENT_TYPE,
} from './block-mappers';
import { isRecord, parseDataUrl } from './utils';

function toAGUIInputSource(
  block: AIChatFileMessageBlock,
): InputContentSource | null {
  if (!block.url) {
    return null;
  }

  if (block.source_type === 'base64') {
    const parsed = parseDataUrl(block.url);
    if (!parsed) {
      return null;
    }

    return {
      mimeType: block.mime_type ?? parsed.mimeType,
      type: 'data',
      value: parsed.value,
    };
  }

  return {
    mimeType: block.mime_type ?? undefined,
    type: 'url',
    value: block.url,
  };
}

function toAGUIUserFileContent(
  block: AIChatFileMessageBlock,
):
  | AudioInputContent
  | DocumentInputContent
  | ImageInputContent
  | null
  | VideoInputContent {
  const source = toAGUIInputSource(block);
  if (!source) {
    return null;
  }

  const metadata = block.name?.trim() || null;

  switch (block.file_type) {
    case 'audio': {
      return { metadata, source, type: 'audio' };
    }
    case 'document': {
      return { metadata, source, type: 'document' };
    }
    case 'image': {
      return { metadata, source, type: 'image' };
    }
    case 'video': {
      return { metadata, source, type: 'video' };
    }
    default: {
      if (block.mime_type?.startsWith('audio/')) {
        return { metadata, source, type: 'audio' };
      }
      if (block.mime_type?.startsWith('image/')) {
        return { metadata, source, type: 'image' };
      }
      if (block.mime_type?.startsWith('video/')) {
        return { metadata, source, type: 'video' };
      }
      return { metadata, source, type: 'document' };
    }
  }
}

function toAGUIUserContent(
  message: AIChatMessageDetail,
): AGUIUserMessage['content'] | null {
  const parts: Array<
    | AudioInputContent
    | DocumentInputContent
    | ImageInputContent
    | TextInputContent
    | VideoInputContent
  > = [];

  for (const block of message.blocks ?? []) {
    if (block.type === 'text' && block.text.trim()) {
      parts.push({
        text: block.text,
        type: 'text',
      });
      continue;
    }

    if (block.type === 'file') {
      const filePart = toAGUIUserFileContent(block);
      if (filePart) {
        parts.push(filePart);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  const onlyPart = parts[0];
  if (parts.length === 1 && onlyPart?.type === 'text') {
    return onlyPart.text;
  }

  return parts;
}

function getEventDataRecord(block: AIChatMessageBlock) {
  if (block.type !== 'event' || !isRecord(block.data)) {
    return undefined;
  }

  return block.data;
}

function buildHistoryMessageId(
  message: AIChatMessageDetail,
  role: string,
  index: number,
) {
  const baseId =
    message.message_id !== null && message.message_id !== undefined
      ? String(message.message_id)
      : `${role}-history-${message.message_index}`;

  return index === 0 ? baseId : `${baseId}-${role}-${index}`;
}

function buildToolCallFromEventBlocks(blocks: AIChatMessageBlock[]) {
  const toolCalls = new Map<string, AGUIToolCall>();

  for (const block of blocks) {
    if (
      block.type !== 'event' ||
      (block.event_type !== 'TOOL_CALL_ARGS' &&
        block.event_type !== 'TOOL_CALL_START')
    ) {
      continue;
    }

    const data = getEventDataRecord(block);
    const toolCallId =
      (typeof data?.toolCallId === 'string' && data.toolCallId) ||
      block.event_key.replace(/^tool-call:/u, '').trim();
    const toolCallName =
      typeof data?.toolCallName === 'string' ? data.toolCallName : '';
    const toolArguments =
      (typeof data?.arguments === 'string' && data.arguments) ||
      (typeof data?.args === 'string' && data.args) ||
      block.text?.trim() ||
      '{}';

    if (!toolCallId || !toolCallName) {
      continue;
    }

    const previous = toolCalls.get(toolCallId);
    toolCalls.set(toolCallId, {
      encryptedValue:
        typeof data?.encryptedValue === 'string'
          ? data.encryptedValue
          : previous?.encryptedValue,
      function: {
        arguments: toolArguments,
        name: toolCallName,
      },
      id: toolCallId,
      type: 'function',
    });
  }

  return [...toolCalls.values()];
}

function toAGUIAssistantMessages(
  message: AIChatMessageDetail,
): AIChatCompletionParams['messages'] {
  const messages: AIChatCompletionParams['messages'] = [];
  const pendingTextBlocks: string[] = [];
  const pendingToolCallBlocks: AIChatMessageBlock[] = [];
  let sequence = 0;

  const flushAssistantMessage = () => {
    const content =
      pendingTextBlocks
        .map((value) => value.trim())
        .filter(Boolean)
        .join('\n\n') || null;
    const toolCalls = buildToolCallFromEventBlocks(pendingToolCallBlocks);

    pendingTextBlocks.length = 0;
    pendingToolCallBlocks.length = 0;

    if (!content && toolCalls.length === 0) {
      return;
    }

    messages.push({
      content: content ?? undefined,
      id: buildHistoryMessageId(message, 'assistant', sequence++),
      role: 'assistant',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    } satisfies AGUIAssistantMessage);
  };

  for (const block of message.blocks ?? []) {
    if (block.type === 'text') {
      if (block.text.trim()) {
        pendingTextBlocks.push(block.text);
      }
      continue;
    }

    if (block.type !== 'event') {
      continue;
    }

    const data = getEventDataRecord(block);
    if (block.event_type === AGUI_SYSTEM_MESSAGE_EVENT_TYPE) {
      flushAssistantMessage();
      const content =
        (typeof data?.content === 'string'
          ? data.content
          : block.text
        )?.trim() || '';
      if (!content) {
        continue;
      }
      messages.push({
        content,
        encryptedValue:
          typeof data?.encryptedValue === 'string'
            ? data.encryptedValue
            : undefined,
        id: buildHistoryMessageId(message, 'system', sequence++),
        name: typeof data?.name === 'string' ? data.name : undefined,
        role: 'system',
      } satisfies AGUISystemMessage);
      continue;
    }

    if (block.event_type === AGUI_DEVELOPER_MESSAGE_EVENT_TYPE) {
      flushAssistantMessage();
      const content =
        (typeof data?.content === 'string'
          ? data.content
          : block.text
        )?.trim() || '';
      if (!content) {
        continue;
      }
      messages.push({
        content,
        encryptedValue:
          typeof data?.encryptedValue === 'string'
            ? data.encryptedValue
            : undefined,
        id: buildHistoryMessageId(message, 'developer', sequence++),
        name: typeof data?.name === 'string' ? data.name : undefined,
        role: 'developer',
      } satisfies AGUIDeveloperMessage);
      continue;
    }

    if (
      block.event_type === 'TOOL_CALL_ARGS' ||
      block.event_type === 'TOOL_CALL_START'
    ) {
      pendingToolCallBlocks.push(block);
      continue;
    }

    if (
      block.event_type === 'TOOL_CALL_RESULT' &&
      data?.sourceRole === 'tool'
    ) {
      flushAssistantMessage();
      const toolCallId =
        typeof data.toolCallId === 'string' ? data.toolCallId : '';
      const content =
        (typeof data.content === 'string'
          ? data.content
          : block.text
        )?.trim() || (typeof data.error === 'string' ? data.error.trim() : '');

      if (!toolCallId || !content) {
        continue;
      }

      messages.push({
        content,
        encryptedValue:
          typeof data.encryptedValue === 'string'
            ? data.encryptedValue
            : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
        id: buildHistoryMessageId(message, 'tool', sequence++),
        role: 'tool',
        toolCallId,
      } satisfies AGUIToolMessage);
    }
  }

  flushAssistantMessage();

  return messages;
}

function toAGUIInputMessages(
  input: BuildChatCompletionRequestInput,
): AIChatCompletionParams['messages'] {
  const messages: AIChatCompletionParams['messages'] = [];
  const historyMessages = [...input.history];

  while (
    historyMessages.length > 0 &&
    historyMessages[historyMessages.length - 1]?.role !== 'user'
  ) {
    historyMessages.pop();
  }

  for (const historyMessage of historyMessages) {
    if (historyMessage.role === 'user') {
      const content = toAGUIUserContent(historyMessage);
      if (!content) {
        continue;
      }

      messages.push({
        content,
        id:
          historyMessage.message_id !== null &&
          historyMessage.message_id !== undefined
            ? String(historyMessage.message_id)
            : `user-history-${historyMessage.message_index}`,
        role: 'user',
      } satisfies AGUIUserMessage);
      continue;
    }

    messages.push(...toAGUIAssistantMessages(historyMessage));
  }

  const promptText = input.promptText?.trim();
  if (promptText) {
    messages.push({
      content: promptText,
      id: `user-draft-${Date.now()}`,
      role: 'user',
    } satisfies AGUIUserMessage);
  }

  return messages;
}

export function buildAGUIChatCompletionRequest(
  input: BuildChatCompletionRequestInput,
  forwardedProps: AIChatCompletionParams['forwardedProps'],
): AIChatCompletionParams {
  return {
    conversationId: input.conversationId ?? undefined,
    forwardedProps,
    messages: toAGUIInputMessages(input),
  };
}
