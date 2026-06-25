import type {
  AIChatCompletionParams,
  AIChatRegenerateParams,
  AIChatTransportMode,
} from '../api/chat';
import type { AGUIStreamEvent } from '../types/ag-ui';
import type { AIChatProviderMessage, ChatTransientStatus } from './message';

import { ref } from 'vue';

import {
  getAIChatRequestHeaders,
  readAIChatErrorMessage,
  resolveAIChatApiUrl,
  resolveAIChatTransportUrl,
} from '../api/chat';
import { toAIChatMessageFromAGUIEvent } from './ag-ui/runtime-events';
import { createAGUIStreamAccumulator } from './ag-ui/runtime-state';
import {
  buildMessageId,
  createProviderSeedMessage,
  mergeStreamMessage,
} from './message';

export interface AIChatProviderRequest {
  body: AIChatCompletionParams | AIChatRegenerateParams;
  conversationId?: string;
  localMessages?: AIChatProviderMessage[];
  messageId?: number;
  mode: AIChatTransportMode;
}

export interface AIChatStreamMessageInfo {
  id: string;
  message: AIChatProviderMessage;
  status: ChatTransientStatus;
}

const STREAM_RENDER_INTERVAL_MS = 48;

function hasProviderMessageContent(message: AIChatProviderMessage) {
  return message.blocks.some((block) => {
    if (block.type === 'file') {
      return Boolean(block.url || block.name);
    }
    return Boolean(block.text?.trim());
  });
}

function createFallbackMessage(
  error: Error,
  currentMessage?: AIChatProviderMessage,
): AIChatProviderMessage {
  const message = currentMessage ?? createProviderSeedMessage();
  const fallbackBlocks =
    error.name !== 'AbortError' && error.message.trim()
      ? [
          {
            text: error.message,
            type: 'text' as const,
          },
        ]
      : [];

  return {
    ...message,
    blocks: hasProviderMessageContent(message)
      ? message.blocks
      : fallbackBlocks,
    created_time: message.created_time || new Date().toISOString(),
    message_type: error.name === 'AbortError' ? 'normal' : 'error',
    role: message.role || 'assistant',
  };
}

function createLocalMessageInfo(
  message: AIChatProviderMessage,
  index: number,
): AIChatStreamMessageInfo {
  return {
    id: buildMessageId(`local-${index}`),
    message,
    status: 'local',
  };
}

function createAssistantLoadingMessageInfo(): AIChatStreamMessageInfo {
  return {
    id: buildMessageId('assistant-loading'),
    message: createProviderSeedMessage(),
    status: 'loading',
  };
}

function parseAGUIStreamEvent(data: string): AGUIStreamEvent | null {
  const rawData = data.trim();
  if (!rawData) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawData) as unknown;
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as AGUIStreamEvent;
    }
  } catch {
    return null;
  }

  return null;
}

function consumeAGUISSEBuffer(
  buffer: string,
  onEvent: (event: AGUIStreamEvent) => void,
) {
  const segments = buffer.split(/\r?\n\r?\n/u);
  const rest = segments.pop() || '';

  for (const segment of segments) {
    const lines = segment
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    const event = parseAGUIStreamEvent(data);
    if (event) {
      onEvent(event);
    }
  }

  return rest;
}

function resolveAGUIRunErrorMessage(event: AGUIStreamEvent) {
  if (event.type !== 'RUN_ERROR' || !('message' in event)) {
    return '';
  }

  return typeof event.message === 'string' ? event.message.trim() : '';
}

async function readAIChatStream(
  response: Response,
  onChunk: (text: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('AI stream is unavailable');
  }

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      onChunk(decoder.decode(value, { stream: !done }));
    }

    if (done) {
      break;
    }
  }

  const rest = decoder.decode();
  if (rest) {
    onChunk(rest);
  }
}

export function useAIChatStream() {
  const isRequesting = ref(false);
  const messages = ref<AIChatStreamMessageInfo[]>([]);
  const transientRequestError = ref<null | string>(null);

  let abortController: AbortController | null = null;
  let requestId = 0;
  let pendingAssistantUpdate: null | {
    message: AIChatProviderMessage;
    status: ChatTransientStatus;
  } = null;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let lastAssistantRenderAt = 0;
  let hasRenderedStreamUpdate = false;

  function setMessages(nextMessages: AIChatStreamMessageInfo[]) {
    messages.value = nextMessages;
  }

  function clearScheduledAssistantRender() {
    if (!renderTimer) {
      return;
    }

    clearTimeout(renderTimer);
    renderTimer = undefined;
  }

  function updateAssistantMessage(
    message: AIChatProviderMessage,
    status: ChatTransientStatus,
  ) {
    const assistantIndex = messages.value.findIndex(
      (item) => item.message.role === 'assistant',
    );
    const nextInfo: AIChatStreamMessageInfo = {
      id:
        assistantIndex === -1
          ? buildMessageId('assistant')
          : messages.value[assistantIndex]?.id || buildMessageId('assistant'),
      message,
      status,
    };

    if (assistantIndex === -1) {
      messages.value = [...messages.value, nextInfo];
      return;
    }

    messages.value = messages.value.map((item, index) =>
      index === assistantIndex ? nextInfo : item,
    );
  }

  function flushAssistantMessageUpdate() {
    if (!pendingAssistantUpdate) {
      return;
    }

    const nextUpdate = pendingAssistantUpdate;
    pendingAssistantUpdate = null;
    lastAssistantRenderAt = Date.now();
    hasRenderedStreamUpdate = true;
    updateAssistantMessage(nextUpdate.message, nextUpdate.status);
  }

  function queueAssistantMessageUpdate(
    message: AIChatProviderMessage,
    status: ChatTransientStatus,
    options: { immediate?: boolean } = {},
  ) {
    pendingAssistantUpdate = { message, status };

    if (options.immediate || !hasRenderedStreamUpdate) {
      clearScheduledAssistantRender();
      flushAssistantMessageUpdate();
      return;
    }

    if (renderTimer) {
      return;
    }

    const elapsed = Date.now() - lastAssistantRenderAt;
    const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - elapsed);
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      flushAssistantMessageUpdate();
    }, delay);
  }

  async function onRequest(requestParams: AIChatProviderRequest) {
    if (isRequesting.value) {
      return;
    }

    const currentRequestId = ++requestId;
    const streamState = createAGUIStreamAccumulator();
    let streamBuffer = '';
    let currentAssistantMessage: AIChatProviderMessage | undefined;

    function applyStreamEvent(event: AGUIStreamEvent) {
      const runErrorMessage = resolveAGUIRunErrorMessage(event);
      if (runErrorMessage) {
        transientRequestError.value = runErrorMessage;
      }

      const message = toAIChatMessageFromAGUIEvent(event, streamState);
      if (!message || currentRequestId !== requestId) {
        return;
      }

      if (message.role !== 'assistant') {
        return;
      }

      currentAssistantMessage = mergeStreamMessage(
        currentAssistantMessage,
        message,
      );
      queueAssistantMessageUpdate(currentAssistantMessage, 'updating');
    }

    abortController = new AbortController();
    transientRequestError.value = null;
    isRequesting.value = true;
    pendingAssistantUpdate = null;
    clearScheduledAssistantRender();
    lastAssistantRenderAt = Date.now();
    hasRenderedStreamUpdate = false;
    messages.value = [
      ...(requestParams.localMessages ?? []).map((message, index) =>
        createLocalMessageInfo(message, index),
      ),
      createAssistantLoadingMessageInfo(),
    ];
    currentAssistantMessage = messages.value.at(-1)?.message;

    try {
      const response = await fetch(
        resolveAIChatApiUrl(resolveAIChatTransportUrl(requestParams)),
        {
          body: JSON.stringify(requestParams.body),
          headers: getAIChatRequestHeaders(),
          method: 'POST',
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        throw new Error(await readAIChatErrorMessage(response));
      }

      await readAIChatStream(response, (text) => {
        if (!text || currentRequestId !== requestId) {
          return;
        }

        streamBuffer = consumeAGUISSEBuffer(
          `${streamBuffer}${text}`,
          applyStreamEvent,
        );

        if (streamBuffer === text) {
          const event = parseAGUIStreamEvent(text);
          if (event) {
            streamBuffer = '';
            applyStreamEvent(event);
          }
        }
      });

      if (streamBuffer.trim()) {
        streamBuffer = consumeAGUISSEBuffer(
          `${streamBuffer}\n\n`,
          applyStreamEvent,
        );
      }

      if (currentAssistantMessage) {
        queueAssistantMessageUpdate(currentAssistantMessage, 'success', {
          immediate: true,
        });
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      if (normalizedError.name !== 'AbortError') {
        transientRequestError.value = normalizedError.message;
      }

      currentAssistantMessage = createFallbackMessage(
        normalizedError,
        currentAssistantMessage,
      );
      queueAssistantMessageUpdate(
        currentAssistantMessage,
        normalizedError.name === 'AbortError' ? 'abort' : 'error',
        { immediate: true },
      );
    } finally {
      if (currentRequestId === requestId) {
        clearScheduledAssistantRender();
        isRequesting.value = false;
        abortController = null;
      }
    }
  }

  function abort() {
    if (!isRequesting.value || !abortController) {
      return;
    }

    abortController.abort();
  }

  return {
    abort,
    isRequesting,
    messages,
    onRequest,
    setMessages,
    transientRequestError,
  };
}
