import type { AIChatProviderMessage } from '../../runtime/message';
import type {
  AIChatProtocol,
  AIChatProtocolChunk,
  AIChatProtocolDriver,
} from '../factory';
import type { AGUIStreamAccumulator } from './runtime-state';

import type {
  AIChatCompletionParams,
  AIChatConversationDetail,
  AIChatConversationDetailResult,
  BuildChatCompletionRequestInput,
} from '#/plugins/ai/api/chat';
import type { AGUIStreamEvent } from '#/plugins/ai/types/ag-ui';

import {
  createProviderSeedMessage,
  providerMessageToChatMessage,
} from '../../runtime/message';
import { AG_UI_AI_CHAT_PROTOCOL_NAME } from '../factory';
import { normalizeAGUIConversationDetail } from './deserialize';
import { getAGUIRenderableBlocks } from './renderable-blocks';
import {
  toAIChatMessageFromAGUIEvent,
} from './runtime-events';
import {
  createAGUIStreamAccumulator,
} from './runtime-state';
import {
  buildAGUIChatCompletionRequest,
} from './serialize';
import { isRecord } from './utils';

function parseAGUIStreamEventFromSSE(
  data: unknown,
): AGUIStreamEvent | null {
  if (isRecord(data) && typeof data.type === 'string') {
    return data as AGUIStreamEvent;
  }
  return null;
}

function parseAGUIStreamEventFromChunk(
  chunk: AIChatProtocolChunk,
): AGUIStreamEvent | null {
  const rawData = chunk.data?.trim();
  if (!rawData) {
    return null;
  }

  try {
    return parseAGUIStreamEventFromSSE(JSON.parse(rawData));
  } catch {
    return null;
  }
}

function consumeBufferedAGUIChunks(
  buffer: string,
  accumulator: AGUIStreamAccumulator,
  onChunk: (chunk: {
    event: AGUIStreamEvent;
    message: null | ReturnType<typeof toAIChatMessageFromAGUIEvent>;
  }) => void,
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

    const event = parseAGUIStreamEventFromChunk({ data });
    if (!event) {
      continue;
    }

    onChunk({
      event,
      message: toAIChatMessageFromAGUIEvent(event, accumulator),
    });
  }

  return rest;
}

export function createAGUIProtocol(): AIChatProtocol<
  AIChatProtocolChunk,
  AIChatProviderMessage,
  ReturnType<typeof createAGUIStreamAccumulator>
> {
  return {
    createState: () => createAGUIStreamAccumulator(),
    name: AG_UI_AI_CHAT_PROTOCOL_NAME,
    resetState: () => createAGUIStreamAccumulator(),
    transformMessage: ({ chunk, originMessage, state }) => {
      if (!chunk?.data) {
        return originMessage ?? createProviderSeedMessage();
      }

      let nextProviderMessage = originMessage;
      let consumedEvent = false;

      state.buffer = consumeBufferedAGUIChunks(
        `${state.buffer}${chunk.data}`,
        state,
        ({ message }) => {
          consumedEvent = true;

          if (!message) {
            return;
          }

          nextProviderMessage = providerMessageToChatMessage(
            nextProviderMessage,
            message,
          );
        },
      );

      if (consumedEvent) {
        return nextProviderMessage ?? createProviderSeedMessage();
      }

      const event = parseAGUIStreamEventFromChunk({
        ...chunk,
        data: chunk.data.trim(),
      });
      if (!event) {
        return originMessage ?? createProviderSeedMessage();
      }

      const nextMessage = toAIChatMessageFromAGUIEvent(event, state);
      if (!nextMessage) {
        return originMessage ?? createProviderSeedMessage();
      }

      return providerMessageToChatMessage(originMessage, nextMessage);
    },
  };
}

export function createAGUIProtocolDriver(): AIChatProtocolDriver {
  return {
    buildChatCompletionRequest(
      input: BuildChatCompletionRequestInput,
      forwardedProps: AIChatCompletionParams['forwardedProps'],
    ) {
      return buildAGUIChatCompletionRequest(input, forwardedProps);
    },
    createRuntimeProtocol: () => createAGUIProtocol(),
    getRenderableBlocks(message) {
      return getAGUIRenderableBlocks(message);
    },
    name: AG_UI_AI_CHAT_PROTOCOL_NAME,
    normalizeConversationDetail(
      detail: AIChatConversationDetailResult,
    ): AIChatConversationDetail {
      return normalizeAGUIConversationDetail(detail);
    },
  };
}
