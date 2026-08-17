import type {
  AIChatCompletionParams,
  AIChatRegenerateParams,
  AIChatTransportMode,
} from '../api/chat';
import type { AGUIStreamEvent } from '../types/ag-ui';
import type { AIChatProviderMessage, ChatTransientStatus } from './message';

import { computed, ref } from 'vue';

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

interface ConversationStreamState {
  abortController: AbortController | null;
  error: null | string;
  isRequesting: boolean;
  lastAssistantRenderAt: number;
  messages: AIChatStreamMessageInfo[];
  pendingAssistantUpdate: null | {
    message: AIChatProviderMessage;
    status: ChatTransientStatus;
  };
  renderTimer?: ReturnType<typeof setTimeout>;
  requestId: number;
}

export type AIChatStreamOutcome =
  | 'completed'
  | 'detached'
  | 'failed'
  | 'ignored';

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

function createConversationStreamState(): ConversationStreamState {
  return {
    abortController: null,
    error: null,
    isRequesting: false,
    lastAssistantRenderAt: 0,
    messages: [],
    pendingAssistantUpdate: null,
    requestId: 0,
  };
}

function resolveStreamKey(requestParams: AIChatProviderRequest) {
  return (
    requestParams.conversationId || requestParams.body.conversationId || 'draft'
  );
}

export function useAIChatStream() {
  const viewedConversationId = ref('');
  const streams = ref<Record<string, ConversationStreamState>>({});

  function getStreamKey(conversationId?: string) {
    return conversationId || viewedConversationId.value || 'draft';
  }

  function ensureStream(conversationId?: string) {
    const key = getStreamKey(conversationId);
    const current = streams.value[key];
    if (current) {
      return current;
    }
    const next = createConversationStreamState();
    streams.value = { ...streams.value, [key]: next };
    return next;
  }

  function replaceStream(
    conversationId: string,
    patch: Partial<ConversationStreamState>,
  ) {
    const key = getStreamKey(conversationId);
    const current = ensureStream(key);
    streams.value = {
      ...streams.value,
      [key]: {
        ...current,
        ...patch,
      },
    };
  }

  const viewedStream = computed(
    () => streams.value[getStreamKey()] ?? createConversationStreamState(),
  );
  const isRequesting = computed(() => viewedStream.value.isRequesting);
  const messages = computed(() => viewedStream.value.messages);
  const transientRequestError = computed({
    get: () => viewedStream.value.error,
    set: (value) => {
      replaceStream(getStreamKey(), { error: value });
    },
  });

  function setViewedConversationId(conversationId: string) {
    viewedConversationId.value = conversationId;
  }

  function isConversationRequesting(conversationId?: string) {
    return Boolean(streams.value[getStreamKey(conversationId)]?.isRequesting);
  }

  function setMessages(
    nextMessages: AIChatStreamMessageInfo[],
    conversationId?: string,
  ) {
    replaceStream(getStreamKey(conversationId), { messages: nextMessages });
  }

  function clearScheduledAssistantRender(state: ConversationStreamState) {
    if (!state.renderTimer) {
      return;
    }
    clearTimeout(state.renderTimer);
    state.renderTimer = undefined;
  }

  function updateAssistantMessage(
    conversationId: string,
    message: AIChatProviderMessage,
    status: ChatTransientStatus,
  ) {
    const state = ensureStream(conversationId);
    const assistantIndex = state.messages.findIndex(
      (item) => item.message.role === 'assistant',
    );
    const nextInfo: AIChatStreamMessageInfo = {
      id:
        assistantIndex === -1
          ? buildMessageId('assistant')
          : state.messages[assistantIndex]?.id || buildMessageId('assistant'),
      message,
      status,
    };
    const nextMessages =
      assistantIndex === -1
        ? [...state.messages, nextInfo]
        : state.messages.map((item, index) =>
            index === assistantIndex ? nextInfo : item,
          );
    replaceStream(conversationId, { messages: nextMessages });
  }

  function flushAssistantMessageUpdate(conversationId: string) {
    const state = ensureStream(conversationId);
    if (!state.pendingAssistantUpdate) {
      return;
    }
    const nextUpdate = state.pendingAssistantUpdate;
    replaceStream(conversationId, {
      lastAssistantRenderAt: Date.now(),
      pendingAssistantUpdate: null,
    });
    updateAssistantMessage(
      conversationId,
      nextUpdate.message,
      nextUpdate.status,
    );
  }

  function queueAssistantMessageUpdate(
    conversationId: string,
    message: AIChatProviderMessage,
    status: ChatTransientStatus,
    options: { immediate?: boolean } = {},
  ) {
    const state = ensureStream(conversationId);
    state.pendingAssistantUpdate = { message, status };
    if (options.immediate || state.lastAssistantRenderAt === 0) {
      clearScheduledAssistantRender(state);
      flushAssistantMessageUpdate(conversationId);
      return;
    }
    if (state.renderTimer) {
      return;
    }
    const elapsed = Date.now() - state.lastAssistantRenderAt;
    const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - elapsed);
    state.renderTimer = setTimeout(() => {
      state.renderTimer = undefined;
      flushAssistantMessageUpdate(conversationId);
    }, delay);
  }

  async function onRequest(requestParams: AIChatProviderRequest) {
    const conversationId = resolveStreamKey(requestParams);
    const state = ensureStream(conversationId);
    if (state.isRequesting) {
      return 'ignored' satisfies AIChatStreamOutcome;
    }

    const currentRequestId = state.requestId + 1;
    const streamState = createAGUIStreamAccumulator();
    let streamBuffer = '';
    let currentAssistantMessage: AIChatProviderMessage | undefined;
    const abortController = new AbortController();

    function applyStreamEvent(event: AGUIStreamEvent) {
      const runErrorMessage = resolveAGUIRunErrorMessage(event);
      if (runErrorMessage) {
        replaceStream(conversationId, { error: runErrorMessage });
      }

      const message = toAIChatMessageFromAGUIEvent(event, streamState);
      if (
        !message ||
        ensureStream(conversationId).requestId !== currentRequestId
      ) {
        return;
      }
      if (message.role !== 'assistant') {
        return;
      }

      currentAssistantMessage = mergeStreamMessage(
        currentAssistantMessage,
        message,
      );
      queueAssistantMessageUpdate(
        conversationId,
        currentAssistantMessage,
        'updating',
      );
    }

    replaceStream(conversationId, {
      abortController,
      error: null,
      isRequesting: true,
      lastAssistantRenderAt: 0,
      messages: [
        ...(requestParams.localMessages ?? []).map((message, index) =>
          createLocalMessageInfo(message, index),
        ),
        createAssistantLoadingMessageInfo(),
      ],
      pendingAssistantUpdate: null,
      requestId: currentRequestId,
    });
    currentAssistantMessage =
      ensureStream(conversationId).messages.at(-1)?.message;

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
        if (
          !text ||
          ensureStream(conversationId).requestId !== currentRequestId
        ) {
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
        queueAssistantMessageUpdate(
          conversationId,
          currentAssistantMessage,
          'success',
          { immediate: true },
        );
      }
      return 'completed' satisfies AIChatStreamOutcome;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      if (normalizedError.name !== 'AbortError') {
        replaceStream(conversationId, { error: normalizedError.message });
      }

      currentAssistantMessage = createFallbackMessage(
        normalizedError,
        currentAssistantMessage,
      );
      queueAssistantMessageUpdate(
        conversationId,
        currentAssistantMessage,
        normalizedError.name === 'AbortError' ? 'abort' : 'error',
        { immediate: true },
      );
      return normalizedError.name === 'AbortError'
        ? ('detached' satisfies AIChatStreamOutcome)
        : ('failed' satisfies AIChatStreamOutcome);
    } finally {
      const latest = ensureStream(conversationId);
      if (latest.requestId === currentRequestId) {
        clearScheduledAssistantRender(latest);
        replaceStream(conversationId, {
          abortController: null,
          isRequesting: false,
        });
      }
    }
  }

  function abort(conversationId?: string) {
    const state = streams.value[getStreamKey(conversationId)];
    if (!state?.isRequesting || !state.abortController) {
      return;
    }
    state.abortController.abort();
  }

  function detachAll() {
    for (const [conversationId, state] of Object.entries(streams.value)) {
      if (state.isRequesting && state.abortController) {
        state.abortController.abort();
        replaceStream(conversationId, {
          abortController: null,
        });
      }
    }
  }

  return {
    abort,
    detachAll,
    isConversationRequesting,
    isRequesting,
    messages,
    onRequest,
    setMessages,
    setViewedConversationId,
    transientRequestError,
  };
}
