import type { Ref } from 'vue';

import type {
  AIChatConversationDetail,
  AIChatConversationResult,
} from '../../../api/chat';
import type { ChatMessageItem } from '../../../runtime/message';

import { computed, ref } from 'vue';

import {
  clearAIChatConversationMessagesApi,
  deleteAIChatConversationApi,
  deleteAIChatMessageApi,
  getAIChatConversationDetailApi,
  getRecentAIChatConversationsApi,
  pinAIChatConversationApi,
} from '../../../api/chat';
import {
  mergeAdjacentAssistantMessagesInOrder,
  normalizeMessage,
} from '../../../runtime/message';

interface UseChatSessionOptions {
  autoFollowMessageScroll: Ref<boolean>;
  closeRenameConversationModal: () => Promise<void> | void;
  confirmAction: (options: {
    content: string;
    icon: 'warning';
  }) => Promise<void>;
  draftConversationTitle: Ref<string>;
  notifySuccess: (content: string) => void;
  renameConversationFormData: Ref<AIChatConversationResult | undefined>;
  resetComposerState: (clearPrompt?: boolean) => void;
  resetMessageListViewport?: () => void;
  scrollToBottom: (force?: boolean) => void;
  scrollToTop: () => void;
  selectedModelId: Ref<string | undefined>;
  selectedProviderId: Ref<number | undefined>;
  clearTransientMessages: () => void;
  isConversationRequesting?: (conversationId?: string) => boolean;
  stopStreaming: (conversationId?: string) => void;
  transientRequestError: Ref<null | string>;
}

interface LoadConversationDetailOptions {
  clearTransientMessages?: boolean;
  forceAutoFollow?: boolean;
  scrollToBottom?: boolean;
  showLoading?: boolean;
}

export function useChatSession(options: UseChatSessionOptions) {
  const activeConversationId = ref('');
  const activeConversationDetail = ref<AIChatConversationDetail>();
  const activeMessages = ref<ChatMessageItem[]>([]);
  const conversationSummaries = ref<AIChatConversationResult[]>([]);
  const sidebarLoading = ref(false);
  const sidebarMoreLoading = ref(false);
  const detailLoading = ref(false);
  const hasMoreConversations = ref(false);
  const conversationBeforeCursor = ref<string>();

  let currentConversationFetchId = 0;
  const messageCache = new Map<string, ChatMessageItem[]>();

  function setActiveConversationKey(value: string) {
    const previousId = activeConversationId.value;
    if (previousId && previousId !== value) {
      messageCache.set(previousId, activeMessages.value);
    }
    activeConversationId.value = value;
    if (value && messageCache.has(value)) {
      activeMessages.value = messageCache.get(value) ?? [];
    }
  }

  function replaceConversationSummaries(items: AIChatConversationResult[]) {
    conversationSummaries.value = [...items];
  }

  function appendConversationSummaries(items: AIChatConversationResult[]) {
    const merged = [...conversationSummaries.value];
    const existingIds = new Set(merged.map((item) => item.conversation_id));

    for (const item of items) {
      if (!existingIds.has(item.conversation_id)) {
        merged.push(item);
      }
    }

    replaceConversationSummaries(merged);
  }

  function upsertConversationSummary(summary: AIChatConversationResult) {
    const items = [...conversationSummaries.value];
    const index = items.findIndex(
      (item) => item.conversation_id === summary.conversation_id,
    );
    if (index >= 0) {
      items[index] = summary;
      conversationSummaries.value = items;
      return;
    }
    if (summary.is_pinned) {
      items.unshift(summary);
    } else {
      const insertAt = items.findIndex((item) => !item.is_pinned);
      if (insertAt === -1) {
        items.push(summary);
      } else {
        items.splice(insertAt, 0, summary);
      }
    }
    conversationSummaries.value = items;
  }

  function removeConversationSummary(conversationId: string) {
    conversationSummaries.value = conversationSummaries.value.filter(
      (item) => item.conversation_id !== conversationId,
    );
  }

  const activeConversation = computed(() => {
    const currentConversationId = activeConversationId.value;
    return conversationSummaries.value.find(
      (item) => item.conversation_id === currentConversationId,
    );
  });

  function createNewConversation() {
    currentConversationFetchId++;
    setActiveConversationKey('');
    activeConversationDetail.value = undefined;
    activeMessages.value = [];
    options.draftConversationTitle.value = '新话题';
    detailLoading.value = false;
    options.resetComposerState(true);
    options.autoFollowMessageScroll.value = true;
    options.scrollToTop();
  }

  function syncConversationSummaryFromDetail(detail: AIChatConversationDetail) {
    upsertConversationSummary({
      conversation_id: detail.conversation_id,
      created_time: detail.created_time,
      id: detail.id,
      is_pinned: detail.is_pinned,
      title: detail.title,
      updated_time: detail.updated_time,
    });
  }

  function syncActiveMessageMetadataFromDetail(
    detail: AIChatConversationDetail,
  ) {
    const persistedMessages = mergeAdjacentAssistantMessagesInOrder(
      detail.messages.map((item, index) =>
        normalizeMessage(item, index, detail.conversation_id),
      ),
    );

    if (activeMessages.value.length !== persistedMessages.length) {
      return;
    }

    const canSyncMetadata = activeMessages.value.every((message, index) => {
      return message.role === persistedMessages[index]?.role;
    });

    if (!canSyncMetadata) {
      return;
    }

    activeMessages.value = activeMessages.value.map((message, index) => {
      const persistedMessage = persistedMessages[index];

      if (!persistedMessage) {
        return message;
      }

      return {
        ...message,
        conversation_id:
          persistedMessage.conversation_id ?? detail.conversation_id,
        created_time: persistedMessage.created_time || message.created_time,
        message_id: persistedMessage.message_id ?? message.message_id ?? null,
        message_index: persistedMessage.message_index ?? message.message_index,
        message_type: persistedMessage.message_type ?? message.message_type,
        model_id: persistedMessage.model_id ?? message.model_id ?? null,
        provider_id: persistedMessage.provider_id ?? message.provider_id ?? null,
      };
    });
  }

  async function fetchConversations(append = false, silent = false) {
    if (!silent) {
      if (append) {
        sidebarMoreLoading.value = true;
      } else {
        sidebarLoading.value = true;
      }
    }

    try {
      const data = await getRecentAIChatConversationsApi({
        cursor: append ? conversationBeforeCursor.value : undefined,
        size: 20,
      });

      if (append) {
        appendConversationSummaries(data.items);
      } else {
        replaceConversationSummaries(data.items);
      }

      hasMoreConversations.value = data.has_more;
      conversationBeforeCursor.value = data.next_cursor || undefined;
    } finally {
      if (!silent) {
        if (append) {
          sidebarMoreLoading.value = false;
        } else {
          sidebarLoading.value = false;
        }
      }
    }
  }

  async function syncConversationDetailMetadata(conversationId: string) {
    const fetchId = currentConversationFetchId;
    const detail = await getAIChatConversationDetailApi(conversationId);

    syncConversationSummaryFromDetail(detail);
    await fetchConversations(false, true);

    if (
      fetchId !== currentConversationFetchId ||
      activeConversationId.value !== conversationId
    ) {
      return;
    }

    syncActiveMessageMetadataFromDetail(detail);
    activeConversationDetail.value = detail;
    options.transientRequestError.value = null;
    options.selectedProviderId.value = detail.provider_id;
    options.selectedModelId.value = detail.model_id;
    options.draftConversationTitle.value = detail.title;
  }

  async function loadConversationDetail(
    conversationId: string,
    loadOptions: LoadConversationDetailOptions = {},
  ) {
    const {
      clearTransientMessages = true,
      forceAutoFollow = true,
      scrollToBottom = false,
      showLoading = true,
    } = loadOptions;
    const fetchId = ++currentConversationFetchId;
    detailLoading.value = showLoading;
    let shouldScrollToBottom = false;

    try {
      const detail = await getAIChatConversationDetailApi(conversationId);

      if (
        fetchId !== currentConversationFetchId ||
        activeConversationId.value !== conversationId
      ) {
        return;
      }

      syncConversationSummaryFromDetail(detail);
      activeConversationDetail.value = detail;
      activeMessages.value = mergeAdjacentAssistantMessagesInOrder(
        detail.messages.map((item, index) =>
          normalizeMessage(item, index, conversationId),
        ),
      );
      if (clearTransientMessages) {
        options.clearTransientMessages();
      }
      options.transientRequestError.value = null;
      options.selectedProviderId.value = detail.provider_id;
      options.selectedModelId.value = detail.model_id;
      options.draftConversationTitle.value = detail.title;
      if (forceAutoFollow) {
        options.autoFollowMessageScroll.value = true;
      }
      shouldScrollToBottom = scrollToBottom;
    } finally {
      if (fetchId === currentConversationFetchId) {
        detailLoading.value = false;
        if (shouldScrollToBottom) {
          options.scrollToBottom(true);
        }
      }
    }
  }

  async function selectConversation(conversationId: string) {
    if (
      conversationId === activeConversationId.value &&
      activeMessages.value.length > 0 &&
      !detailLoading.value
    ) {
      options.autoFollowMessageScroll.value = true;
      options.resetMessageListViewport?.();
      options.scrollToBottom(true);
      return;
    }

    options.resetComposerState(true);
    setActiveConversationKey(conversationId);
    if (options.isConversationRequesting?.(conversationId)) {
      return;
    }
    activeConversationDetail.value = undefined;
    await loadConversationDetail(conversationId);
  }

  async function loadMoreConversations() {
    if (!hasMoreConversations.value || sidebarMoreLoading.value) {
      return;
    }

    await fetchConversations(true);
  }

  async function togglePinConversation(
    conversation?: AIChatConversationResult,
  ) {
    const targetConversation = conversation || activeConversation.value;
    if (!targetConversation) {
      return;
    }

    await pinAIChatConversationApi(targetConversation.conversation_id, {
      is_pinned: !targetConversation.is_pinned,
    });
    await fetchConversations(false);
    options.notifySuccess(
      targetConversation.is_pinned ? '已取消置顶' : '已置顶话题',
    );
  }

  async function closeRenameModalIfMatched(conversationId: string) {
    if (
      options.renameConversationFormData.value?.conversation_id !==
      conversationId
    ) {
      return;
    }

    await options.closeRenameConversationModal();
  }

  async function removeConversation(conversationId: string) {
    options.stopStreaming(conversationId);
    await deleteAIChatConversationApi(conversationId);
    removeConversationSummary(conversationId);
    await closeRenameModalIfMatched(conversationId);

    if (activeConversationId.value === conversationId) {
      const nextConversation = conversationSummaries.value.find(
        (item) => item.conversation_id !== conversationId,
      );

      if (nextConversation) {
        setActiveConversationKey(nextConversation.conversation_id);
        await loadConversationDetail(nextConversation.conversation_id);
      } else {
        createNewConversation();
      }
    }

    options.notifySuccess('聊天历史已删除');
  }

  function confirmRemoveConversation(conversation: AIChatConversationResult) {
    options
      .confirmAction({
        content: `确认删除“${conversation.title}”吗？`,
        icon: 'warning',
      })
      .then(async () => {
        await removeConversation(conversation.conversation_id);
      });
  }

  async function clearMessages() {
    options.stopStreaming(activeConversationId.value);
    const conversation = activeConversation.value;
    const conversationId = activeConversationId.value;

    if (!conversationId) {
      activeMessages.value = [];
      return;
    }

    await clearAIChatConversationMessagesApi(conversationId);
    activeMessages.value = [];
    if (activeConversationDetail.value) {
      activeConversationDetail.value = {
        ...activeConversationDetail.value,
        message_count: 0,
        messages: [],
      };
    }
    if (conversation) {
      upsertConversationSummary({
        ...conversation,
        updated_time: new Date().toISOString(),
      });
    }
    options.notifySuccess('当前话题消息已清空');
  }

  function confirmClearMessages() {
    options
      .confirmAction({
        content: '确认清空当前话题下的全部消息吗？该操作不可恢复',
        icon: 'warning',
      })
      .then(async () => {
        await clearMessages();
      });
  }

  async function deleteMessageChain(item: ChatMessageItem) {
    const currentConversationId = activeConversationId.value;

    if (
      !currentConversationId ||
      item.message_id === undefined ||
      item.message_id === null
    ) {
      return;
    }

    options.stopStreaming(currentConversationId);

    await deleteAIChatMessageApi(currentConversationId, item.message_id);
    activeMessages.value = activeMessages.value.filter(
      (message) => message.id !== item.id,
    );

    if (activeConversationDetail.value) {
      activeConversationDetail.value = {
        ...activeConversationDetail.value,
        message_count: Math.max(
          0,
          (activeConversationDetail.value.message_count ??
            activeMessages.value.length + 1) - 1,
        ),
        messages: activeConversationDetail.value.messages.filter(
          (message) => message.message_id !== item.message_id,
        ),
        updated_time: new Date().toISOString(),
      };
    }

    const conversation = activeConversation.value;
    if (conversation) {
      upsertConversationSummary({
        ...conversation,
        updated_time: new Date().toISOString(),
      });
    }

    options.notifySuccess('聊天消息已删除');
  }

  async function initializeSession() {
    await fetchConversations(false);
    createNewConversation();
  }

  return {
    activeConversation,
    activeConversationId,
    activeConversationDetail,
    activeMessages,
    clearMessages,
    confirmClearMessages,
    confirmRemoveConversation,
    createNewConversation,
    deleteMessageChain,
    detailLoading,
    fetchConversations,
    conversationSummaries,
    hasMoreConversations,
    initializeSession,
    loadConversationDetail,
    loadMoreConversations,
    removeConversation,
    selectConversation,
    setActiveConversationKey,
    sidebarLoading,
    sidebarMoreLoading,
    syncConversationDetailMetadata,
    togglePinConversation,
    upsertConversationSummary,
  };
}
