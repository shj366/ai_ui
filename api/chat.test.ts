import { describe, expect, it } from 'vitest';

import {
  buildAIChatCompletionRequest,
  buildAIChatRegenerateRequest,
} from './chat-request';
import { resolveAIChatTransportUrl } from './chat-transport';

const buildChatCompletionRequest = (
  input: Parameters<typeof buildAIChatCompletionRequest>[0],
) =>
  buildAIChatCompletionRequest(input, {
    inferAttachmentType: () => 'document',
    resolveUrl: (url) => url,
  });

const composerParams = {
  enable_builtin_tools: true,
  enable_code_execution: true,
  enable_web_fetch: false,
  mcp_ids: [1, 2],
  mode: 'create' as const,
  model_id: 'gpt-test',
  provider_id: 8,
  web_search: 'off' as const,
};

describe('buildChatCompletionRequest', () => {
  it('builds the latest camel-case chat completion contract', () => {
    const request = buildChatCompletionRequest({
      conversationId: 'conversation-1',
      params: composerParams,
      promptText: 'hello',
    });

    expect(request).toMatchObject({
      conversationId: 'conversation-1',
      forwardedProps: {
        enableBuiltinTools: true,
        enableCodeExecution: true,
        enableWebFetch: false,
        generationType: 'text',
        mcpIds: [1, 2],
        modelId: 'gpt-test',
        providerId: 8,
        webSearch: 'off',
      },
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
    });
  });

  it('rejects requests without text or attachments', () => {
    expect(() =>
      buildChatCompletionRequest({ params: composerParams, promptText: '  ' }),
    ).toThrow('聊天消息不能为空');
  });

  it('builds AG-UI attachment content without text', () => {
    const request = buildChatCompletionRequest({
      attachments: [
        {
          data: 'aGVsbG8=',
          file_type: 'document',
          mime_type: 'text/plain',
          name: 'hello.txt',
        },
      ],
      params: composerParams,
    });

    expect(request.messages[0].content).toEqual([
      {
        metadata: { filename: 'hello.txt', size: undefined },
        source: {
          mimeType: 'text/plain',
          type: 'data',
          value: 'aGVsbG8=',
        },
        type: 'document',
      },
    ]);
  });
});

describe('buildAIChatRegenerateRequest', () => {
  it('builds a regenerate request without requiring chat messages', () => {
    const request = buildAIChatRegenerateRequest({
      content: '  edited prompt  ',
      conversationId: 'conversation-1',
      params: { ...composerParams, mode: 'regenerate' },
    });

    expect(request).toMatchObject({
      content: 'edited prompt',
      conversationId: 'conversation-1',
      forwardedProps: {
        modelId: 'gpt-test',
        providerId: 8,
      },
    });
    expect(request).not.toHaveProperty('messages');
  });

  it('routes regeneration to the user-message endpoint', () => {
    expect(
      resolveAIChatTransportUrl({
        body: buildAIChatRegenerateRequest({
          conversationId: 'conversation-1',
          params: { ...composerParams, mode: 'regenerate' },
        }),
        conversationId: 'conversation-1',
        messageId: 12,
        mode: 'regenerate-from-message',
      }),
    ).toBe('/api/v1/conversations/conversation-1/messages/12/regenerate');
  });
});
