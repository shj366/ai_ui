import type { AIChatProviderRequest } from './use-chat-stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderUserMessage } from './message';
import { useAIChatStream } from './use-chat-stream';

vi.mock('../api/chat', () => ({
  getAIChatRequestHeaders: () => ({}),
  readAIChatErrorMessage: async () => 'request failed',
  resolveAIChatApiUrl: (url: string) => url,
  resolveAIChatTransportUrl: (request: AIChatProviderRequest) =>
    `/chat/${request.conversationId}`,
}));

function buildRequest(
  conversationId: string,
  content: string,
): AIChatProviderRequest {
  return {
    body: { conversationId } as AIChatProviderRequest['body'],
    conversationId,
    localMessages: [createProviderUserMessage(content)],
    mode: 'create',
  };
}

function readFirstText(
  messages: ReturnType<typeof useAIChatStream>['messages']['value'],
) {
  const block = messages[0]?.message.blocks[0];
  return block && 'text' in block ? block.text : undefined;
}

describe('useAIChatStream', () => {
  const requests: RequestInit[] = [];

  beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit = {}) => {
        requests.push(init);
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('detached');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps concurrent streams isolated when the viewed conversation changes', async () => {
    const stream = useAIChatStream();

    stream.setViewedConversationId('conversation-a');
    const requestA = stream.onRequest(buildRequest('conversation-a', 'A'));
    expect(readFirstText(stream.messages.value)).toBe('A');

    stream.setViewedConversationId('conversation-b');
    expect(requests[0]?.signal?.aborted).toBe(false);
    const requestB = stream.onRequest(buildRequest('conversation-b', 'B'));
    expect(readFirstText(stream.messages.value)).toBe('B');
    expect(stream.isConversationRequesting('conversation-a')).toBe(true);
    expect(stream.isConversationRequesting('conversation-b')).toBe(true);

    stream.setViewedConversationId('conversation-a');
    expect(readFirstText(stream.messages.value)).toBe('A');
    expect(requests[1]?.signal?.aborted).toBe(false);

    stream.abort('conversation-a');
    await expect(requestA).resolves.toBe('detached');
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests[1]?.signal?.aborted).toBe(false);
    expect(stream.isConversationRequesting('conversation-b')).toBe(true);

    stream.detachAll();
    await expect(requestB).resolves.toBe('detached');
  });
});
