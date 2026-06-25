import type { Ref } from 'vue';

import type {
  AIChatConversationDetail,
  AIChatConversationResult,
} from '../../../api/chat';
import type { AIChatProtocolName } from '../../../protocols';
import type { ChatMessageItem } from '../../../runtime/message';

import { computed, ref } from 'vue';

import {
  clearAIChatConversationContextApi,
  clearAIChatConversationMessagesApi,
  deleteAIChatConversationApi,
  deleteAIChatMessageApi,
  getAIChatConversationDetailApi,
  getRecentAIChatConversationsApi,
  pinAIChatConversationApi,
} from '../../../api/chat';
import {
  mergeAdjacentAssistantMessages,
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
  protocolName?: AIChatProtocolName;
  renameConversationFormData: Ref<AIChatConversationResult | undefined>;
  resetComposerState: (clearPrompt?: boolean) => void;
  scrollToBottom: () => void;
  scrollToTop: () => void;
  selectedModelId: Ref<string | undefined>;
  selectedProviderId: Ref<number | undefined>;
  clearTransientMessages: () => void;
  stopStreaming: () => void;
  transientRequestError: Ref<null | string>;
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

  function setActiveConversationKey(value: string) {
    activeConversationId.value = value;
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
    const index = conversationSummaries.value.findIndex(
      (item) => item.conversation_id === summary.conversation_id,
    );

    if (index !== -1) {
      const next = [...conversationSummaries.value];
      next[index] = summary;
      conversationSummaries.value = next;
      return;
    }

    conversationSummaries.value = [summary, ...conversationSummaries.value];
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
    options.stopStreaming();
    currentConversationFetchId++;
    setActiveConversationKey('');
    activeConversationDetail.value = undefined;
    activeMessages.value = [];
    options.clearTransientMessages();
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

  async function fetchConversations(append = false) {
    if (append) {
      sidebarMoreLoading.value = true;
    } else {
      sidebarLoading.value = true;
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
      if (append) {
        sidebarMoreLoading.value = false;
      } else {
        sidebarLoading.value = false;
      }
    }
  }

  async function loadConversationDetail(conversationId: string) {
    const fetchId = ++currentConversationFetchId;
    detailLoading.value = true;
    let shouldScrollToBottom = false;

    try {
      const detail = await getAIChatConversationDetailApi(conversationId, {
        protocolName: options.protocolName,
      });

      if (
        fetchId !== currentConversationFetchId ||
        activeConversationId.value !== conversationId
      ) {
        return;
      }

      syncConversationSummaryFromDetail(detail);
      activeConversationDetail.value = detail;
      activeMessages.value = mergeAdjacentAssistantMessages(
        detail.messages.map((item, index) =>
          normalizeMessage(item, index, conversationId),
        ),
      );
      options.clearTransientMessages();
      options.transientRequestError.value = null;
      options.selectedProviderId.value = detail.provider_id;
      options.selectedModelId.value = detail.model_id;
      options.draftConversationTitle.value = detail.title;
      options.autoFollowMessageScroll.value = true;
      shouldScrollToBottom = true;
    } finally {
      if (fetchId === currentConversationFetchId) {
        detailLoading.value = false;
        if (shouldScrollToBottom) {
          options.scrollToBottom();
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
      return;
    }

    options.stopStreaming();
    options.clearTransientMessages();
    options.resetComposerState(true);
    setActiveConversationKey(conversationId);
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
    options.stopStreaming();
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
    options.stopStreaming();
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

  async function clearConversationContext() {
    const conversationId = activeConversationId.value;
    if (!conversationId) {
      return;
    }

    options.stopStreaming();
    options.clearTransientMessages();
    await clearAIChatConversationContextApi(conversationId);
    await loadConversationDetail(conversationId);
    options.notifySuccess('对话上下文已清除');
  }

  function confirmClearConversationContext() {
    options
      .confirmAction({
        content:
          '确认清除当前话题的上下文吗？现有消息会保留展示，后续回复将从分割线之后继续',
        icon: 'warning',
      })
      .then(async () => {
        await clearConversationContext();
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

    options.stopStreaming();

    await deleteAIChatMessageApi(currentConversationId, item.message_id);
    await fetchConversations(false);

    const stillExists = conversationSummaries.value.some(
      (conversation) => conversation.conversation_id === currentConversationId,
    );

    if (stillExists) {
      await loadConversationDetail(currentConversationId);
    } else if (conversationSummaries.value[0]) {
      await closeRenameModalIfMatched(currentConversationId);
      const nextConversationId = conversationSummaries.value[0].conversation_id;
      setActiveConversationKey(nextConversationId);
      await loadConversationDetail(nextConversationId);
    } else {
      await closeRenameModalIfMatched(currentConversationId);
      createNewConversation();
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
    clearConversationContext,
    clearMessages,
    confirmClearConversationContext,
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
    togglePinConversation,
    upsertConversationSummary,
  };
}
