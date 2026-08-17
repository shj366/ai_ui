import type { AIChatConversationDetail } from '../../../api/chat';

import { ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatSession } from './use-chat-session';

const api = vi.hoisted(() => ({
  clearMessages: vi.fn(),
  deleteConversation: vi.fn(),
  deleteMessage: vi.fn(),
  getDetail: vi.fn(),
  getRecent: vi.fn(),
  pinConversation: vi.fn(),
}));

vi.mock('../../../api/chat', () => ({
  clearAIChatConversationMessagesApi: api.clearMessages,
  deleteAIChatConversationApi: api.deleteConversation,
  deleteAIChatMessageApi: api.deleteMessage,
  getAIChatConversationDetailApi: api.getDetail,
  getRecentAIChatConversationsApi: api.getRecent,
  pinAIChatConversationApi: api.pinConversation,
}));

function buildDetail(
  conversationId: string,
  content: string,
): AIChatConversationDetail {
  return {
    conversation_id: conversationId,
    created_time: '2026-08-17T00:00:00Z',
    id: conversationId === 'conversation-a' ? 1 : 2,
    is_generating: false,
    is_pinned: false,
    message_count: 1,
    messages: [
      {
        blocks: [{ text: content, type: 'text' }],
        conversation_id: conversationId,
        created_time: '2026-08-17T00:00:00Z',
        message_id: conversationId === 'conversation-a' ? 11 : 21,
        message_index: 0,
        message_type: 'normal',
        model_id: 'test-model',
        provider_id: 1,
        role: 'assistant',
      },
    ],
    model_id: 'test-model',
    provider_id: 1,
    title: conversationId,
    updated_time: '2026-08-17T00:00:00Z',
  };
}

function createSession(
  requesting: Set<string>,
  stopStreaming: (conversationId?: string) => Promise<void> | void = vi.fn(),
) {
  return useChatSession({
    autoFollowMessageScroll: ref(true),
    clearTransientMessages: vi.fn(),
    closeRenameConversationModal: vi.fn(),
    confirmAction: vi.fn(),
    draftConversationTitle: ref('新话题'),
    isConversationRequesting: (conversationId) =>
      requesting.has(conversationId ?? ''),
    notifySuccess: vi.fn(),
    renameConversationFormData: ref(),
    resetComposerState: vi.fn(),
    resetMessageListViewport: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollToTop: vi.fn(),
    selectedModelId: ref(),
    selectedProviderId: ref(),
    stopStreaming,
    transientRequestError: ref<null | string>(null),
  });
}

describe('useChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getRecent.mockResolvedValue({
      has_more: false,
      items: [],
      next_cursor: undefined,
    });
  });

  it('restores messages and detail from the target conversation cache', async () => {
    const requesting = new Set<string>();
    const details = new Map([
      ['conversation-a', buildDetail('conversation-a', 'message-a')],
      ['conversation-b', buildDetail('conversation-b', 'message-b')],
    ]);
    api.getDetail.mockImplementation(async (conversationId: string) =>
      details.get(conversationId),
    );
    const session = createSession(requesting);

    await session.selectConversation('conversation-a');
    await session.selectConversation('conversation-b');
    requesting.add('conversation-a');
    await session.selectConversation('conversation-a');

    expect(session.activeConversationDetail.value?.conversation_id).toBe(
      'conversation-a',
    );
    expect(session.activeMessages.value[0]?.blocks[0]).toMatchObject({
      text: 'message-a',
    });
    expect(api.getDetail).toHaveBeenCalledTimes(2);
  });

  it('updates a background conversation cache from persisted snapshots', async () => {
    const requesting = new Set<string>();
    let detailA = buildDetail('conversation-a', 'message-a');
    api.getDetail.mockImplementation(async (conversationId: string) =>
      conversationId === 'conversation-a'
        ? detailA
        : buildDetail('conversation-b', 'message-b'),
    );
    const session = createSession(requesting);

    await session.selectConversation('conversation-a');
    await session.selectConversation('conversation-b');
    detailA = buildDetail('conversation-a', 'updated-a');
    await session.syncConversationDetailMetadata('conversation-a');
    requesting.add('conversation-a');
    await session.selectConversation('conversation-a');

    expect(session.activeConversationDetail.value?.conversation_id).toBe(
      'conversation-a',
    );
    expect(session.activeMessages.value[0]?.blocks[0]).toMatchObject({
      text: 'updated-a',
    });
    expect(session.activeConversationId.value).toBe('conversation-a');
  });

  it('waits for generation to stop before deleting a conversation', async () => {
    let finishStop: (() => void) | undefined;
    const stopStreaming = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    api.deleteConversation.mockResolvedValue(null);
    const session = createSession(new Set(), stopStreaming);

    const removal = session.removeConversation('conversation-a');
    await Promise.resolve();

    expect(stopStreaming).toHaveBeenCalledWith('conversation-a');
    expect(api.deleteConversation).not.toHaveBeenCalled();

    finishStop?.();
    await removal;
    expect(api.deleteConversation).toHaveBeenCalledWith('conversation-a');
  });
});
