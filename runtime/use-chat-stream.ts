import type { XRequestOptions } from '@antdv-next/x-sdk';

import type {
  AIChatProtocol,
  AIChatProtocolChunk,
  AIChatProtocolName,
} from '../protocols/factory';
import type { AIChatProviderMessage } from './message';

import type {
  AIChatCompletionParams,
  AIChatRegenerateParams,
  AIChatTransportMode,
} from '#/plugins/ai/api/chat';

import { ref } from 'vue';

import { AbstractChatProvider, useXChat, XRequest } from '@antdv-next/x-sdk';

import {
  getAIChatRequestHeaders,
  readAIChatErrorMessage,
  resolveAIChatApiUrl,
  resolveAIChatTransportUrl,
} from '#/plugins/ai/api/chat';

import { createAIChatProtocol } from '../protocols';
import { createProviderSeedMessage } from './message';

export interface AIChatProviderRequest {
  body: AIChatCompletionParams | AIChatRegenerateParams;
  conversationId?: string;
  localMessages?: AIChatProviderMessage[];
  messageId?: number;
  mode: AIChatTransportMode;
}

type ProviderTransformMessage = {
  chunk: AIChatProtocolChunk;
  chunks: AIChatProtocolChunk[];
  originMessage?: AIChatProviderMessage;
  responseHeaders: Headers;
  status: string;
};

interface AIChatProviderOptions<TState = unknown> {
  protocol: AIChatProtocol<AIChatProtocolChunk, AIChatProviderMessage, TState>;
}

class AIChatProvider extends AbstractChatProvider<
  AIChatProviderMessage,
  AIChatProviderRequest,
  AIChatProtocolChunk
> {
  private protocol: AIChatProtocol<AIChatProtocolChunk, AIChatProviderMessage>;
  private protocolState: unknown;

  constructor(options: AIChatProviderOptions) {
    super({
      request: createAIChatRequest(),
    });
    this.protocol = options.protocol;
    this.protocolState = options.protocol.createState();
  }

  transformLocalMessage(requestParams: Partial<AIChatProviderRequest>) {
    return requestParams.localMessages ?? [];
  }

  transformMessage(
    info: ProviderTransformMessage,
  ): AIChatProviderMessage {
    return this.protocol.transformMessage({
      ...info,
      state: this.protocolState,
    });
  }

  transformParams(
    requestParams: Partial<AIChatProviderRequest>,
    _options: XRequestOptions<
      AIChatProviderRequest,
      AIChatProtocolChunk,
      AIChatProviderMessage
    >,
  ) {
    this.protocolState = this.protocol.resetState(this.protocolState);
    return requestParams as AIChatProviderRequest;
  }
}

function createAIChatRequest() {
  return XRequest<AIChatProviderRequest, AIChatProtocolChunk, AIChatProviderMessage>(
    '__ai_chat_transport__',
    {
      callbacks: {
        onError: () => {},
        onSuccess: () => {},
      },
      fetch: async (_baseUrl, requestOptions) => {
        const params = requestOptions.params;
        if (!params?.body || !params.mode) {
          throw new Error('AI chat request params are required');
        }

        const response = await fetch(
          resolveAIChatApiUrl(resolveAIChatTransportUrl(params as AIChatProviderRequest)),
          {
            ...requestOptions,
            body: JSON.stringify(params.body),
            headers: getAIChatRequestHeaders(),
          },
        );

        if (!response.ok) {
          throw new Error(await readAIChatErrorMessage(response));
        }

        if (!response.body) {
          throw new Error('AI stream is unavailable');
        }

        return response;
      },
      manual: true,
      method: 'POST',
    },
  );
}

export interface UseAIChatStreamOptions {
  protocolName?: AIChatProtocolName;
}

export function useAIChatStream(options: UseAIChatStreamOptions = {}) {
  return useChatStream(
    new AIChatProvider({
      protocol: createAIChatProtocol(options.protocolName),
    }),
  );
}

function useChatStream(chatProvider: AIChatProvider) {
  const transientRequestError = ref<null | string>(null);
  const chat = useXChat<
    AIChatProviderMessage,
    AIChatProviderMessage,
    AIChatProviderRequest
  >({
    provider: chatProvider,
    requestFallback: (_requestParams, { error, messageInfo }) => {
      if (error.name !== 'AbortError') {
        transientRequestError.value = error.message;
      }

      const currentMessage =
        messageInfo?.message ?? createProviderSeedMessage();
      const hasContent = currentMessage.blocks.some((block) => {
        if (block.type === 'file') {
          return Boolean(block.url || block.name);
        }
        return Boolean(block.text?.trim());
      });
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
        ...currentMessage,
        blocks: hasContent ? currentMessage.blocks : fallbackBlocks,
        created_time: currentMessage.created_time || new Date().toISOString(),
        message_type: error.name === 'AbortError' ? 'normal' : 'error',
        role: currentMessage.role || 'assistant',
      };
    },
  });

  function abort() {
    if (!chatProvider.request.isRequesting) {
      return;
    }

    chat.abort();
  }

  return {
    ...chat,
    abort,
    chatProvider,
    transientRequestError,
  };
}
