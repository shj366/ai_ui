import type {
  AudioInputContent,
  DocumentInputContent,
  ImageInputContent,
  InputContentSource,
  VideoInputContent,
} from '@ag-ui/core';

import type {
  AIChatConversationDetail,
  AIChatConversationDetailResult,
} from '#/plugins/ai/api/chat';
import type {
  AGUIActivityMessage,
  AGUIAssistantMessage,
  AGUIConversationMessage,
  AGUIDeveloperMessage,
  AGUIMessagesSnapshotEvent,
  AGUISystemMessage,
  AGUIUserMessage,
} from '#/plugins/ai/types/ag-ui';
import type {
  AIChatMessageBlock,
  AIChatMessageDetail,
  AIMessageRoleType,
  AIMessageType,
} from '#/plugins/ai/types/message';

import {
  AGUI_DEVELOPER_MESSAGE_EVENT_TYPE,
  AGUI_SYSTEM_MESSAGE_EVENT_TYPE,
  createAGUIBinaryFileBlock,
  createAGUIEventBlock,
  createAGUIInputSourceFileBlock,
  normalizeAGUIToolResultBlocks,
} from './block-mappers';
import { isRecord, resolveMetadataFilename } from './utils';

function isAGUIMessagesSnapshotEvent(
  value: unknown,
): value is AGUIMessagesSnapshotEvent {
  return isRecord(value) && Array.isArray(value.messages);
}

function resolveAGUIMessageCreatedTime(
  message: AGUIConversationMessage,
  fallback: string,
) {
  const candidates = [message.createdTime];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return fallback;
}

function resolveAGUIConversationId(
  message: AGUIConversationMessage,
  detail: AIChatConversationDetailResult,
) {
  const candidates = [message.conversationId, detail.conversationId];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function resolveAGUIConversationMessageId(message: AGUIConversationMessage) {
  if (
    typeof message.persistedMessageId === 'number' &&
    Number.isFinite(message.persistedMessageId)
  ) {
    return message.persistedMessageId;
  }

  if (typeof message.id === 'string' && /^\d+$/u.test(message.id)) {
    return Number(message.id);
  }

  return null;
}

function resolveAGUIConversationMessageIndex(
  message: AGUIConversationMessage,
  fallbackIndex: number,
) {
  if (
    typeof message.messageIndex === 'number' &&
    Number.isFinite(message.messageIndex)
  ) {
    return message.messageIndex;
  }

  return fallbackIndex;
}

function resolveAGUIInputContentName(
  item:
    | AudioInputContent
    | DocumentInputContent
    | ImageInputContent
    | VideoInputContent,
) {
  return resolveMetadataFilename(item.metadata);
}

function normalizeAGUIUserContentBlocks(
  content: AGUIUserMessage['content'],
): AIChatMessageBlock[] {
  if (typeof content === 'string') {
    return content.trim() ? [{ text: content, type: 'text' }] : [];
  }

  const blocks: AIChatMessageBlock[] = [];

  for (const item of content) {
    switch (item.type) {
      case 'audio': {
        blocks.push(
          createAGUIInputSourceFileBlock(
            'audio',
            item.source,
            resolveAGUIInputContentName(item),
          ),
        );
        break;
      }
      case 'binary': {
        const url =
          item.url ??
          (item.data
            ? `data:${item.mimeType ?? 'application/octet-stream'};base64,${item.data}`
            : null);

        blocks.push(
          createAGUIBinaryFileBlock({
            data: item.data ?? null,
            mimeType: item.mimeType ?? null,
            name: item.filename ?? null,
            url,
            urlMimeTypeFallback: 'application/octet-stream',
          }),
        );
        break;
      }
      case 'document': {
        blocks.push(
          createAGUIInputSourceFileBlock(
            'document',
            item.source,
            resolveAGUIInputContentName(item),
          ),
        );
        break;
      }
      case 'image': {
        blocks.push(
          createAGUIInputSourceFileBlock(
            'image',
            item.source,
            resolveAGUIInputContentName(item),
          ),
        );
        break;
      }
      case 'text': {
        if (item.text.trim()) {
          blocks.push({
            text: item.text,
            type: 'text',
          });
        }
        break;
      }
      case 'video': {
        blocks.push(
          createAGUIInputSourceFileBlock(
            'video',
            item.source,
            resolveAGUIInputContentName(item),
          ),
        );
        break;
      }
    }
  }

  return blocks;
}

function normalizeAGUIAssistantToolCallBlocks(
  message: AGUIAssistantMessage,
): AIChatMessageBlock[] {
  if (!Array.isArray(message.toolCalls)) {
    return [];
  }

  return message.toolCalls.flatMap((toolCall, index) => {
    const toolCallId =
      typeof toolCall.id === 'string' && toolCall.id
        ? toolCall.id
        : `${message.id}-tool-${index}`;
    const toolCallName =
      typeof toolCall.function?.name === 'string' ? toolCall.function.name : '';
    const toolArguments =
      typeof toolCall.function?.arguments === 'string'
        ? toolCall.function.arguments
        : '';

    if (!toolCallName) {
      return [];
    }

    return [
      createAGUIEventBlock({
        data: {
          encryptedValue: toolCall.encryptedValue ?? null,
          toolCallId,
          toolCallName,
        },
        eventKey: `tool-call:${toolCallId}:start`,
        eventType: 'TOOL_CALL_START',
        summary: toolCallName,
        title: '调用工具',
      }),
      createAGUIEventBlock({
        data: {
          arguments: toolArguments,
          encryptedValue: toolCall.encryptedValue ?? null,
          toolCallId,
          toolCallName,
        },
        eventKey: `tool-call:${toolCallId}:args`,
        eventType: 'TOOL_CALL_ARGS',
        summary: toolCallName,
        text: toolArguments,
        title: '工具输入',
      }),
    ];
  });
}

function normalizeAGUISystemMessageBlocks(
  message: AGUIDeveloperMessage | AGUISystemMessage,
): AIChatMessageBlock[] {
  const content = message.content.trim();
  if (!content) {
    return [];
  }

  const isSystem = message.role === 'system';
  const eventType = isSystem
    ? AGUI_SYSTEM_MESSAGE_EVENT_TYPE
    : AGUI_DEVELOPER_MESSAGE_EVENT_TYPE;
  const title = isSystem ? '系统消息' : '开发者消息';

  return [
    createAGUIEventBlock({
      data: {
        content,
        encryptedValue: message.encryptedValue ?? null,
        name: message.name ?? null,
        role: message.role,
      },
      eventKey: `${eventType.toLowerCase()}:${message.id}`,
      eventType,
      summary: message.name ?? title,
      text: content,
      title,
    }),
  ];
}

function normalizeAGUIActivityMessageBlocks(
  message: AGUIActivityMessage,
): AIChatMessageBlock[] {
  const content = message.content;
  if (!isRecord(content) || !('file' in content)) {
    return [
      createAGUIEventBlock({
        data: {
          activityType: message.activityType,
          content,
          sourceRole: 'activity',
        },
        eventKey: `activity:${message.id}`,
        eventType: 'ACTIVITY_SNAPSHOT',
        summary: message.activityType,
        title: '活动快照',
      }),
    ];
  }

  const file = content.file;
  if (!isRecord(file) || typeof file.type !== 'string') {
    return [];
  }

  switch (file.type) {
    case 'audio':
    case 'document':
    case 'image':
    case 'video': {
      return [
        createAGUIInputSourceFileBlock(
          file.type,
          'source' in file ? (file.source as InputContentSource | null) : null,
          resolveMetadataFilename(file.metadata),
        ),
      ];
    }
    case 'binary': {
      const mimeType = typeof file.mimeType === 'string' ? file.mimeType : null;
      const url =
        typeof file.url === 'string'
          ? file.url
          : typeof file.data === 'string' && mimeType
            ? `data:${mimeType};base64,${file.data}`
            : null;

      return [
        createAGUIBinaryFileBlock({
          data: typeof file.data === 'string' ? file.data : null,
          mimeType,
          name: typeof file.filename === 'string' ? file.filename : null,
          url,
        }),
      ];
    }
    default: {
      return [
        createAGUIEventBlock({
          data: {
            activityType: message.activityType,
            content,
            sourceRole: 'activity',
          },
          eventKey: `activity:${message.id}`,
          eventType: 'ACTIVITY_SNAPSHOT',
          summary: message.activityType,
          title: '活动快照',
        }),
      ];
    }
  }
}

function resolveAGUIConversationModelId(
  message: AGUIConversationMessage,
  detail: AIChatConversationDetailResult,
) {
  const value = message.modelId;
  return typeof value === 'string' && value.trim() ? value : detail.modelId;
}

function resolveAGUIConversationProviderId(
  message: AGUIConversationMessage,
  detail: AIChatConversationDetailResult,
) {
  if (
    typeof message.providerId === 'number' &&
    Number.isFinite(message.providerId)
  ) {
    return message.providerId;
  }

  return detail.providerId;
}

function resolveAGUIConversationMessageType(message: AGUIConversationMessage) {
  const value = message.messageType;
  return value === 'error' ? 'error' : 'normal';
}

function normalizeAGUIConversationMessage(
  message: AGUIConversationMessage,
  detail: AIChatConversationDetailResult,
  fallbackIndex: number,
): AIChatMessageDetail | null {
  const createdTime = resolveAGUIMessageCreatedTime(
    message,
    detail.createdTime,
  );
  const conversationId = resolveAGUIConversationId(message, detail);
  const messageId = resolveAGUIConversationMessageId(message);
  const messageIndex = resolveAGUIConversationMessageIndex(
    message,
    fallbackIndex,
  );
  const modelId = resolveAGUIConversationModelId(message, detail);
  const providerId = resolveAGUIConversationProviderId(message, detail);
  let blocks: AIChatMessageBlock[] = [];
  let role: AIMessageRoleType = 'assistant';
  let messageType: AIMessageType = resolveAGUIConversationMessageType(message);

  switch (message.role) {
    case 'activity': {
      blocks = normalizeAGUIActivityMessageBlocks(message);
      break;
    }
    case 'assistant': {
      if (typeof message.content === 'string' && message.content.trim()) {
        blocks.push({ text: message.content, type: 'text' });
      }
      blocks.push(...normalizeAGUIAssistantToolCallBlocks(message));
      break;
    }
    case 'developer': {
      blocks = normalizeAGUISystemMessageBlocks(message);
      break;
    }
    case 'reasoning': {
      role = 'assistant';
      blocks = message.content.trim()
        ? [{ text: message.content, type: 'reasoning' }]
        : [];
      break;
    }
    case 'system': {
      blocks = normalizeAGUISystemMessageBlocks(message);
      break;
    }
    case 'tool': {
      role = 'assistant';
      const toolResultBlocks = normalizeAGUIToolResultBlocks(message.content);
      const hasExtractedFiles = toolResultBlocks.length > 0;
      blocks = [
        createAGUIEventBlock({
          data: {
            content: hasExtractedFiles ? undefined : message.content,
            contentOmitted: hasExtractedFiles,
            encryptedValue: message.encryptedValue ?? null,
            error: message.error ?? null,
            extractedFileCount: hasExtractedFiles
              ? toolResultBlocks.length
              : undefined,
            sourceRole: 'tool',
            toolCallId: message.toolCallId,
          },
          eventKey: `tool-result:${message.toolCallId}`,
          eventType: 'TOOL_CALL_RESULT',
          summary: message.toolCallId,
          text: message.error ?? (hasExtractedFiles ? '' : message.content),
          title: '工具结果',
        }),
        ...toolResultBlocks,
      ];
      if (message.error) {
        messageType = 'error';
      }
      break;
    }
    case 'user': {
      role = 'user';
      blocks = normalizeAGUIUserContentBlocks(message.content);
      break;
    }
  }

  if (blocks.length === 0) {
    return null;
  }

  return {
    blocks,
    conversation_id: conversationId ?? null,
    created_time: createdTime,
    message_id: messageId,
    message_index: messageIndex,
    message_type: messageType,
    model_id: modelId ?? null,
    provider_id: providerId ?? null,
    role,
  };
}

export function normalizeAGUIConversationDetail(
  detail: AIChatConversationDetailResult,
): AIChatConversationDetail {
  const snapshot = isAGUIMessagesSnapshotEvent(detail.messagesSnapshot)
    ? detail.messagesSnapshot
    : { messages: [] };

  const messages = snapshot.messages
    .map((message, index) =>
      normalizeAGUIConversationMessage(message, detail, index),
    )
    .filter((message): message is AIChatMessageDetail => message !== null);

  return {
    context_cleared_time: detail.contextClearedTime ?? null,
    context_start_message_id: detail.contextStartMessageId ?? null,
    conversation_id: detail.conversationId,
    created_time: detail.createdTime,
    id: detail.id,
    is_pinned: detail.isPinned,
    message_count: messages.length,
    messages,
    model_id: detail.modelId,
    provider_id: detail.providerId,
    title: detail.title,
    updated_time: detail.updatedTime ?? undefined,
  };
}
