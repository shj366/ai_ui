<script setup lang="ts">
import type {
  BubbleListProps,
  ConversationsProps,
  SenderProps,
  SuggestionItem,
} from '@antdv-next/x';

import type { VbenFormSchema } from '#/adapter/form';
import type {
  AIMcpResult,
  AIModelResult,
  AIProviderResult,
  AIQuickPhraseResult,
} from '#/plugins/ai/api';
import type {
  AIChatComposerParams,
  AIChatConversationResult,
} from '#/plugins/ai/api/chat';
import type {
  AIChatProviderMessage,
  ChatMessageItem,
} from '#/plugins/ai/runtime/message';
import type { AIChatProviderRequest } from '#/plugins/ai/runtime/use-chat-stream';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { ColPage, confirm, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import { BubbleList, Suggestion, Welcome } from '@antdv-next/x';
import { useClipboard } from '@vueuse/core';
import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import {
  getAllAIMcpApi,
  getAllAIModelApi,
  getAllAIProviderApi,
  getAllAIQuickPhraseApi,
} from '#/plugins/ai/api';
import {
  buildChatCompletionRequest,
  updateAIChatConversationApi,
  updateAIChatMessageApi,
} from '#/plugins/ai/api/chat';
import {
  createAIChatProtocolDriver,
  DEFAULT_AI_CHAT_PROTOCOL_NAME,
} from '#/plugins/ai/protocols';
import {
  buildTransientMessageItems,
  createProviderUserMessage,
  getMessageFileBlocks,
  getMessageTextContent,
  makeConversationTitle,
  mergeStreamMessage,
  parseDateLabel,
  parseJsonField,
  replaceMessageTextBlocks,
} from '#/plugins/ai/runtime/message';
import { useAIChatStream } from '#/plugins/ai/runtime/use-chat-stream';

import {
  buildConversationSidebarItems,
  createConversationSidebarMenu,
} from './adapters/conversation-items';
import {
  createChatBubbleListRole,
  renderChatMessageBubbleContent,
} from './adapters/message-bubble-role';
import ChatSender from './components/chat-sender.vue';
import ChatSettingsPanel from './components/chat-settings-panel.vue';
import ChatSidebar from './components/chat-sidebar.vue';
import { useChatScroll } from './composables/use-chat-scroll';
import { useChatSession } from './composables/use-chat-session';
import { useChatSettings } from './composables/use-chat-settings';
import { useSenderToolbar } from './composables/use-sender-toolbar';
import { useThinkingPanel } from './composables/use-thinking-panel';

const currentChatProtocol = createAIChatProtocolDriver(
  DEFAULT_AI_CHAT_PROTOCOL_NAME,
);
const currentChatProtocolName = currentChatProtocol.name;
const currentChatProtocolOptions = {
  protocolName: currentChatProtocolName,
} as const;

const { copy } = useClipboard({ legacy: true });
const { isDark } = usePreferences();
const prompt = ref('');
const draftConversationTitle = ref('新话题');
const selectedProviderId = ref<number>();
const selectedModelId = ref<string>();
const editingMessage = ref<ChatMessageItem>();
const editingMessageIntent = ref<'resend' | 'save'>('save');
const regeneratingMessageIndex = ref<number>();

const providers = ref<AIProviderResult[]>([]);
const models = ref<AIModelResult[]>([]);
const mcps = ref<AIMcpResult[]>([]);
const quickPhrases = ref<AIQuickPhraseResult[]>([]);

const resourcesLoading = ref(false);

const {
  autoFollowMessageScroll,
  handleMessageContainerScroll,
  scrollToBottom,
  scrollToTop,
} = useChatScroll();

const {
  abort: abortTransientRequest,
  chatProvider,
  isRequesting,
  messages: transientMessagesState,
  onRequest: onTransientRequest,
  setMessages: setTransientMessages,
  transientRequestError,
} = useAIChatStream({
  protocolName: currentChatProtocolOptions.protocolName,
});
const sending = computed(() => isRequesting.value);

function resetComposerState(clearPrompt = false) {
  editingMessage.value = undefined;
  regeneratingMessageIndex.value = undefined;
  if (clearPrompt) {
    prompt.value = '';
  }
}

function stopStreaming() {
  abortTransientRequest();
}

const renameConversationFormData = ref<AIChatConversationResult>();
const {
  activeConversation,
  activeConversationId,
  activeConversationDetail,
  activeMessages,
  conversationSummaries,
  confirmClearConversationContext,
  confirmClearMessages,
  confirmRemoveConversation,
  createNewConversation,
  deleteMessageChain,
  detailLoading,
  fetchConversations,
  hasMoreConversations,
  initializeSession,
  loadConversationDetail,
  loadMoreConversations,
  selectConversation,
  setActiveConversationKey,
  sidebarLoading,
  sidebarMoreLoading,
  togglePinConversation,
  upsertConversationSummary,
} = useChatSession({
  autoFollowMessageScroll,
  closeRenameConversationModal: () => renameConversationModalApi.close(),
  confirmAction: (options) => confirm(options),
  draftConversationTitle,
  notifySuccess: (content) => {
    message.success(content);
  },
  protocolName: currentChatProtocolOptions.protocolName,
  renameConversationFormData,
  resetComposerState,
  clearTransientMessages: () => {
    setTransientMessages([]);
  },
  scrollToBottom,
  scrollToTop,
  selectedModelId,
  selectedProviderId,
  stopStreaming,
  transientRequestError,
});

// Chat settings needs refs from useChatSession for its watchers
const {
  GENERATION_TYPE_OPTIONS,
  THINKING_OPTIONS,
  WEB_SEARCH_OPTIONS,
  enableBuiltinTools,
  extraBody,
  extraHeaders,
  frequencyPenalty,
  generationType,
  generationTypeButtonLabel,
  hasAdvancedSettings,
  logitBias,
  maxTokens,
  parallelToolCalls,
  presencePenalty,
  rememberConversationSessionConfig,
  resetModelSettings,
  seed,
  selectedMcpIds,
  stopSequences,
  temperature,
  thinking,
  thinkingButtonLabel,
  timeout,
  topP,
  webSearch,
  webSearchButtonLabel,
} = useChatSettings({
  activeConversationDetail,
  activeConversationId,
  selectedModelId,
  selectedProviderId,
});

const renameConversationSchema: VbenFormSchema[] = [
  {
    component: 'Input' as const,
    componentProps: {
      autofocus: true,
      placeholder: '请输入话题标题',
    },
    fieldName: 'title',
    label: '新话题',
    rules: 'required',
  },
];

let currentModelFetchId = 0;
let hasInitialized = false;

async function fetchProviders() {
  resourcesLoading.value = true;
  try {
    providers.value = await getAllAIProviderApi();
  } finally {
    resourcesLoading.value = false;
  }
}

async function fetchMcps() {
  mcps.value = await getAllAIMcpApi();
}

async function fetchModelsByProvider(providerId?: number) {
  const fetchId = ++currentModelFetchId;

  if (!providerId) {
    models.value = [];
    if (!activeConversationId.value) {
      selectedModelId.value = undefined;
    }
    return;
  }

  const data = await getAllAIModelApi({ provider_id: providerId });

  if (fetchId !== currentModelFetchId) {
    return;
  }

  models.value = data;

  if (!data.some((item) => item.model_id === selectedModelId.value)) {
    selectedModelId.value = undefined;
  }
}

async function fetchQuickPhrases() {
  quickPhrases.value = await getAllAIQuickPhraseApi();
}

async function refreshChatResources() {
  await Promise.all([
    fetchProviders(),
    fetchModelsByProvider(selectedProviderId.value),
    fetchMcps(),
    fetchQuickPhrases(),
  ]);
}

function beginEditMessage(
  item: ChatMessageItem,
  intent: 'resend' | 'save' = 'save',
) {
  if (
    item.role !== 'user' ||
    item.message_id === undefined ||
    item.message_id === null
  ) {
    return;
  }

  editingMessage.value = item;
  editingMessageIntent.value = intent;
  regeneratingMessageIndex.value = undefined;
}

function cancelEditMessage() {
  editingMessage.value = undefined;
  editingMessageIntent.value = 'save';
}

function isEditingMessage(item: ChatMessageItem) {
  return editingMessage.value?.id === item.id;
}

function updateMessageContent(target: ChatMessageItem, content: string) {
  activeMessages.value = activeMessages.value.map((item) =>
    item.id === target.id ? replaceMessageTextBlocks(item, content) : item,
  );
}

async function saveEditedMessage(content: string) {
  const trimmedContent = content.trim();
  const targetMessage = editingMessage.value;

  if (
    !targetMessage ||
    !targetMessage.conversation_id ||
    targetMessage.message_id === undefined ||
    targetMessage.message_id === null
  ) {
    return;
  }

  if (!trimmedContent) {
    message.warning('请输入消息内容');
    return;
  }

  await updateAIChatMessageApi(
    targetMessage.conversation_id,
    targetMessage.message_id,
    {
      content: trimmedContent,
    },
  );
  updateMessageContent(targetMessage, trimmedContent);
  cancelEditMessage();
  await loadConversationDetail(targetMessage.conversation_id);
  message.success('消息内容已保存');
}

async function resendEditedMessage(content: string) {
  const trimmedContent = content.trim();
  const targetMessage = editingMessage.value;

  if (
    !targetMessage ||
    targetMessage.message_id === undefined ||
    targetMessage.message_id === null
  ) {
    return;
  }

  if (!trimmedContent) {
    message.warning('请输入消息内容');
    return;
  }

  updateMessageContent(targetMessage, trimmedContent);
  if (targetMessage.conversation_id) {
    await updateAIChatMessageApi(
      targetMessage.conversation_id,
      targetMessage.message_id,
      {
        content: trimmedContent,
      },
    );
  }
  regeneratingMessageIndex.value = targetMessage.message_index;
  editingMessage.value = undefined;
  await submitChat(targetMessage.message_id, true, undefined, 'user');
}

async function regenerateUserMessage(item: ChatMessageItem) {
  if (
    item.role !== 'user' ||
    item.message_id === undefined ||
    item.message_id === null
  ) {
    return;
  }

  editingMessage.value = undefined;
  editingMessageIntent.value = 'save';
  regeneratingMessageIndex.value = item.message_index;
  await submitChat(item.message_id, true, undefined, 'user');
}

async function copyMessageContent(item: ChatMessageItem) {
  const sections = [
    getMessageTextContent(item, 'text'),
    getMessageTextContent(item, 'reasoning'),
    ...getMessageFileBlocks(item).map((block) =>
      [block.name, block.url].filter(Boolean).join(' - '),
    ),
  ].filter(Boolean);

  await copy(sections.join('\n\n'));
  message.success('消息内容已复制');
}

async function startRenameConversation(
  conversation?: AIChatConversationResult,
) {
  const targetConversation = conversation || activeConversation.value;
  if (!targetConversation) {
    return;
  }

  renameConversationModalApi.setData(targetConversation).open();
}

function resetRenameConversationState() {
  renameConversationFormData.value = undefined;
  renameConversationFormApi.resetForm();
}

async function submitRenameConversation() {
  const { valid } = await renameConversationFormApi.validate();
  if (!valid) {
    return;
  }

  const conversation = renameConversationFormData.value;
  const conversationId = conversation?.conversation_id;
  const { title: currentTitle = '' } =
    await renameConversationFormApi.getValues<{
      title?: string;
    }>();
  const title = currentTitle.trim();
  const updatedTime = new Date().toISOString();

  if (!conversationId || !conversation || !title) {
    message.error('请输入话题标题');
    return;
  }

  renameConversationModalApi.lock();
  try {
    await updateAIChatConversationApi(conversationId, { title });
    upsertConversationSummary({
      ...conversation,
      title,
      updated_time: updatedTime,
    });
    if (activeConversationDetail.value?.conversation_id === conversationId) {
      activeConversationDetail.value = {
        ...activeConversationDetail.value,
        title,
        updated_time: updatedTime,
      };
    }
    await renameConversationModalApi.close();
    message.success('话题标题已更新');
  } finally {
    renameConversationModalApi.unlock();
  }
}

async function regenerateMessage(item: ChatMessageItem) {
  if (
    item.role !== 'assistant' ||
    item.message_id === undefined ||
    item.message_id === null
  ) {
    return;
  }

  regeneratingMessageIndex.value = item.message_index;
  editingMessage.value = undefined;
  await submitChat(item.message_id, false, undefined, 'model');
}

async function submitChat(
  regenerateMessageId?: number,
  notifyInvalid = false,
  overridePromptText?: string,
  regenerateSource: 'model' | 'user' = 'model',
) {
  if (sending.value) {
    return;
  }

  if (!selectedProviderId.value || !selectedModelId.value) {
    if (notifyInvalid) {
      message.warning('请选择供应商和模型');
    }
    return;
  }

  const promptText =
    regenerateMessageId === undefined
      ? (overridePromptText ?? prompt.value).trim()
      : undefined;

  if (regenerateMessageId === undefined && !promptText) {
    if (notifyInvalid) {
      message.warning('请输入消息内容');
    }
    return;
  }

  const editingMessageIndex = editingMessage.value?.message_index;
  const editingMessageId = editingMessage.value?.message_id;
  const hasEditingMessageId =
    editingMessageId !== undefined && editingMessageId !== null;
  const submittedPromptText = promptText ?? '';

  if (editingMessage.value && !hasEditingMessageId) {
    message.warning('当前消息暂不可编辑，请刷新后重试');
    return;
  }
  let chatMode: AIChatComposerParams['mode'] = 'regenerate';
  if (regenerateMessageId === undefined) {
    chatMode = hasEditingMessageId ? 'edit' : 'create';
  }
  const submittedTitle =
    activeConversationId.value || !promptText
      ? draftConversationTitle.value
      : makeConversationTitle(promptText);

  let payload: AIChatComposerParams;
  try {
    payload = {
      conversation_id: activeConversationId.value,
      extra_body: extraBody.value.trim() || undefined,
      enable_builtin_tools: enableBuiltinTools.value,
      extra_headers: parseJsonField<Record<string, string>>(
        extraHeaders.value,
        '额外请求头',
        (value) =>
          value !== null && typeof value === 'object' && !Array.isArray(value),
      ),
      frequency_penalty: frequencyPenalty.value,
      logit_bias: parseJsonField<Record<string, number>>(
        logitBias.value,
        'Logit Bias',
        (value) =>
          value !== null && typeof value === 'object' && !Array.isArray(value),
      ),
      max_tokens: maxTokens.value,
      mcp_ids:
        selectedMcpIds.value.length > 0 ? selectedMcpIds.value : undefined,
      generation_type: generationType.value,
      model_id: selectedModelId.value,
      parallel_tool_calls: parallelToolCalls.value,
      presence_penalty: presencePenalty.value,
      provider_id: selectedProviderId.value,
      mode: chatMode,
      thinking: thinking.value,
      seed: seed.value,
      stop_sequences: parseJsonField<string[]>(
        stopSequences.value,
        '停止序列',
        Array.isArray,
      ),
      temperature: temperature.value,
      timeout: timeout.value,
      top_p: topP.value,
      web_search: webSearch.value,
      ...(chatMode === 'edit' && hasEditingMessageId
        ? {
            edit_message_id: editingMessageId,
            user_prompt: submittedPromptText,
          }
        : {}),
      ...(chatMode === 'create' ? { user_prompt: submittedPromptText } : {}),
      ...(chatMode === 'regenerate' && regenerateMessageId !== undefined
        ? { regenerate_message_id: regenerateMessageId }
        : {}),
    };
  } catch (error) {
    message.error((error as Error).message);
    return;
  }

  const targetConversationId = activeConversationId.value;
  if (regenerateMessageId !== undefined && !targetConversationId) {
    message.warning('当前会话不存在，无法重新生成');
    return;
  }
  const regenerateTargetMessageIndex = regeneratingMessageIndex.value;

  if (
    regenerateMessageId !== undefined &&
    regenerateTargetMessageIndex !== undefined
  ) {
    if (regenerateSource === 'user') {
      activeMessages.value = activeMessages.value.filter(
        (item) => item.message_index <= regenerateTargetMessageIndex,
      );
    } else {
      const regenerateTargetArrayIndex = activeMessages.value.findIndex(
        (item) =>
          item.role === 'assistant' &&
          item.message_index === regenerateTargetMessageIndex,
      );
      const preservedUserArrayIndex =
        regenerateTargetArrayIndex <= 0
          ? -1
          : ([...activeMessages.value.keys()]
              .slice(0, regenerateTargetArrayIndex)
              .toReversed()
              .find((index) => activeMessages.value[index]?.role === 'user') ??
            -1);

      activeMessages.value =
        preservedUserArrayIndex >= 0
          ? activeMessages.value.slice(0, preservedUserArrayIndex + 1)
          : [];
    }
  } else if (editingMessageIndex !== undefined) {
    activeMessages.value = activeMessages.value.filter(
      (item) => item.message_index < editingMessageIndex,
    );
  }

  if (!activeConversationId.value) {
    draftConversationTitle.value = submittedTitle;
  }
  autoFollowMessageScroll.value = true;
  const completionRequest = buildChatCompletionRequest(
    {
      conversationId: targetConversationId,
      history: activeMessages.value,
      params: payload,
      promptText:
        regenerateMessageId === undefined ? submittedPromptText : undefined,
    },
    {
      protocolName: currentChatProtocolOptions.protocolName,
    },
  );

  transientRequestError.value = null;
  setTransientMessages([]);

  if (regenerateMessageId === undefined || regenerateSource === 'user') {
    prompt.value = '';
  }

  const requestParams: AIChatProviderRequest =
    regenerateMessageId === undefined
      ? {
          body: completionRequest,
          localMessages: submittedPromptText
            ? [createProviderUserMessage(submittedPromptText)]
            : [],
          mode: 'create',
        }
      : {
          body: {
            conversationId:
              completionRequest.conversationId ?? targetConversationId,
            forwardedProps: completionRequest.forwardedProps,
          },
          conversationId: targetConversationId,
          localMessages: [],
          messageId: regenerateMessageId,
          mode:
            regenerateSource === 'user'
              ? 'regenerate-from-message'
              : 'regenerate-from-response',
        };

  onTransientRequest(requestParams);
  await chatProvider.request.asyncHandler;

  let streamedConversationId = targetConversationId;
  for (
    let index = transientMessagesState.value.length - 1;
    index >= 0;
    index -= 1
  ) {
    const conversationId =
      transientMessagesState.value[index]?.message.conversation_id;
    if (conversationId) {
      streamedConversationId = conversationId;
      break;
    }
  }

  const requestError = transientRequestError.value;

  if (requestError) {
    message.error(requestError);

    if (
      regenerateMessageId === undefined &&
      editingMessageIndex === undefined &&
      !activeConversationId.value
    ) {
      prompt.value = submittedPromptText;
    }

    if (streamedConversationId) {
      rememberConversationSessionConfig(streamedConversationId);
      setActiveConversationKey(streamedConversationId);
      await fetchConversations(false);
      await loadConversationDetail(streamedConversationId);
    }

    setTransientMessages([]);
  } else {
    await fetchConversations(false);

    if (streamedConversationId) {
      rememberConversationSessionConfig(streamedConversationId);
      setActiveConversationKey(streamedConversationId);
      await loadConversationDetail(streamedConversationId);
    } else if (conversationSummaries.value[0]) {
      setActiveConversationKey(conversationSummaries.value[0].conversation_id);
      await loadConversationDetail(
        conversationSummaries.value[0].conversation_id,
      );
    }

    setTransientMessages([]);
  }

  editingMessage.value = undefined;
  editingMessageIntent.value = 'save';
  regeneratingMessageIndex.value = undefined;
}

const transientMessages = computed<ChatMessageItem[]>(() => {
  const fallbackIndex = activeMessages.value.length;
  const mergedTransientMessages: Array<{
    message: AIChatProviderMessage;
    status: 'abort' | 'error' | 'loading' | 'local' | 'success' | 'updating';
  }> = [];

  for (const info of transientMessagesState.value) {
    const lastItem = mergedTransientMessages.at(-1);

    if (
      info.message.role === 'assistant' &&
      lastItem?.message.role === 'assistant'
    ) {
      lastItem.message = mergeStreamMessage(lastItem.message, info.message);
      lastItem.status = info.status;
      continue;
    }

    mergedTransientMessages.push({
      message: info.message,
      status: info.status,
    });
  }

  return mergedTransientMessages.flatMap((info, index) => {
    return buildTransientMessageItems(
      info.message,
      fallbackIndex + index,
      info.status,
    );
  });
});

const displayMessages = computed<ChatMessageItem[]>(() => {
  return [...activeMessages.value, ...transientMessages.value];
});

const { isThinkingExpanded, setThinkingExpanded } = useThinkingPanel({
  autoFollowMessageScroll,
  displayMessages,
  scrollToBottom,
});

const bubbleListItems = computed(() => {
  const items: BubbleListProps['items'] = [];

  for (const message of displayMessages.value) {
    const isEditing = isEditingMessage(message);

    items.push({
      content: isEditing
        ? getMessageTextContent(message)
        : renderChatMessageBubbleContent(message, {
            isDark: isDark.value,
            isThinkingExpanded,
            protocolDriver: currentChatProtocol,
            setThinkingExpanded,
          }),
      extraInfo: {
        message,
      },
      key: message.id,
      role: message.role === 'assistant' ? 'assistant' : 'user',
      streaming: Boolean(message.role === 'assistant' && message.streaming),
    });

    if (contextDividerAfterMessageId.value === message.id) {
      items.push({
        content: '已清除上下文',
        dividerProps: {
          plain: true,
        },
        key: `${message.id}-context-divider`,
        role: 'divider',
      });
    }
  }

  return items;
});

const enabledProviders = computed(() => {
  return providers.value.filter((item) => Number(item.status) === 1);
});

const enabledModels = computed(() => {
  return models.value.filter((item) => Number(item.status) === 1);
});

const providerOptions = computed(() => {
  const options = enabledProviders.value.map((item) => ({
    label: item.name,
    value: item.id,
  }));

  if (
    selectedProviderId.value &&
    !options.some((item) => item.value === selectedProviderId.value)
  ) {
    options.unshift({
      label: `供应商 #${selectedProviderId.value}`,
      value: selectedProviderId.value,
    });
  }

  return options;
});

const modelOptions = computed(() => {
  const options = enabledModels.value.map((item) => ({
    label: item.model_id,
    value: item.model_id,
  }));

  if (
    selectedModelId.value &&
    !options.some((item) => item.value === selectedModelId.value)
  ) {
    options.unshift({
      label: selectedModelId.value,
      value: selectedModelId.value,
    });
  }

  return options;
});

const activeConversationTitle = computed(() => {
  return (
    activeConversationDetail.value?.title ||
    activeConversation.value?.title ||
    draftConversationTitle.value
  );
});

const activeConversationSubtitle = computed(() => {
  if (!activeConversation.value) {
    return '';
  }

  return `创建于 ${parseDateLabel(activeConversation.value.created_time)}`;
});

const contextDividerAfterMessageId = computed(() => {
  const detail = activeConversationDetail.value;

  if (!detail?.context_cleared_time || activeMessages.value.length === 0) {
    return undefined;
  }

  const clearedAt = new Date(detail.context_cleared_time).getTime();

  if (!Number.isNaN(clearedAt)) {
    let dividerIndex = -1;

    for (const [index, item] of activeMessages.value.entries()) {
      const messageTime = new Date(item.created_time).getTime();

      if (Number.isNaN(messageTime) || messageTime <= clearedAt) {
        dividerIndex = index;
      }
    }

    if (dividerIndex >= 0) {
      return activeMessages.value[dividerIndex]?.id;
    }
  }

  if (
    detail.context_start_message_id !== null &&
    detail.context_start_message_id !== undefined
  ) {
    const anchorIndex = activeMessages.value.findIndex(
      (item) => item.message_id === detail.context_start_message_id,
    );

    if (anchorIndex !== -1) {
      return activeMessages.value[anchorIndex]?.id;
    }
  }

  return activeMessages.value[activeMessages.value.length - 1]?.id;
});

const selectedProviderLabel = computed(() => {
  return (
    providerOptions.value.find(
      (item) => item.value === selectedProviderId.value,
    )?.label || '请选择供应商'
  );
});

const selectedModelLabel = computed(() => {
  return (
    modelOptions.value.find((item) => item.value === selectedModelId.value)
      ?.label || '请选择模型'
  );
});

const selectedProviderModelLabel = computed(() => {
  return `${selectedProviderLabel.value} / ${selectedModelLabel.value}`;
});

const canClearMessages = computed(() => {
  return Boolean(activeConversationId.value && activeMessages.value.length > 0);
});

const canCreateNewConversation = computed(() => {
  return activeMessages.value.length > 0;
});

const composerHint = computed(() => {
  if (editingMessage.value?.message_index !== undefined) {
    return `正在编辑第 ${editingMessage.value.message_index + 1} 条用户消息`;
  }
  if (regeneratingMessageIndex.value !== undefined) {
    return `正在重新生成第 ${regeneratingMessageIndex.value + 1} 条 AI 回复`;
  }
  return '';
});

const senderAutoSize: NonNullable<SenderProps['autoSize']> = {
  maxRows: 6,
  minRows: 2,
};

const conversationItems = computed<ConversationsProps['items']>(() =>
  buildConversationSidebarItems(conversationSummaries.value),
);

const conversationCreation = computed<ConversationsProps['creation']>(() => ({
  disabled: sending.value || !canCreateNewConversation.value,
  onClick: createNewConversation,
}));

const conversationListMenu = computed<ConversationsProps['menu']>(() =>
  createConversationSidebarMenu({
    conversations: conversationSummaries.value,
    onDelete: confirmRemoveConversation,
    onPin: (conversation) => {
      void togglePinConversation(conversation);
    },
    onRename: (conversation) => {
      void startRenameConversation(conversation);
    },
  }),
);

function handleConversationActiveChange(value: number | string) {
  void selectConversation(String(value));
}

const suggestionItems = computed<SuggestionItem[]>(() => {
  return quickPhrases.value.map((item) => ({
    key: String(item.id),
    label: item.title,
    value: item.content,
  }));
});

function handleSuggestionSelect(value: string) {
  prompt.value = value;
}

function handleSenderSubmit(messageText: string) {
  void submitChat(undefined, true, messageText);
}

function handleSenderChange(value: string) {
  prompt.value = value;
}

function handleSenderChangeWithSuggestion(
  value: string,
  onTrigger: (info?: false | string) => void,
) {
  handleSenderChange(value);

  if (value === '/') {
    onTrigger('/');
    return;
  }

  if (!value) {
    onTrigger(false);
  }
}

function confirmDeleteMessage(item: ChatMessageItem) {
  confirm({
    content: `确认删除第 ${item.message_index + 1} 条消息吗？`,
    icon: 'warning',
  }).then(async () => {
    await deleteMessageChain(item);
  });
}

const bubbleListRole = computed<BubbleListProps['role']>(() =>
  createChatBubbleListRole({
    editingMessageIntent: editingMessageIntent.value,
    isDark: isDark.value,
    isEditingMessage,
    isThinkingExpanded,
    onBeginEditMessage: beginEditMessage,
    onCancelEditMessage: cancelEditMessage,
    onConfirmDeleteMessage: confirmDeleteMessage,
    onCopyMessage: copyMessageContent,
    onRegenerateMessage: regenerateMessage,
    onRegenerateUserMessage: regenerateUserMessage,
    onResendEditedMessage: resendEditedMessage,
    onSaveEditedMessage: saveEditedMessage,
    protocolDriver: currentChatProtocol,
    selectedModelId: selectedModelId.value,
    selectedModelLabel: selectedModelLabel.value,
    setThinkingExpanded,
  }),
);

const { fetchQuickPhrases: fetchQuickPhrasesFromToolbar, renderSenderFooter } =
  useSenderToolbar({
    activeConversationId: computed(() => activeConversationId.value),
    canClearMessages,
    canCreateNewConversation,
    composerHint,
    confirmClearConversationContext,
    confirmClearMessages,
    createNewConversation,
    enableBuiltinTools,
    generationType,
    generationTypeButtonLabel,
    GENERATION_TYPE_OPTIONS,
    hasAdvancedSettings,
    mcps,
    onOpenSettings: () => settingsModalApi.open(),
    prompt,
    selectedMcpIds,
    selectedModelId,
    selectedProviderId,
    sending,
    thinking,
    thinkingButtonLabel,
    THINKING_OPTIONS,
    webSearch,
    webSearchButtonLabel,
    WEB_SEARCH_OPTIONS,
  });

watch(
  selectedProviderId,
  async (providerId) => {
    await fetchModelsByProvider(providerId);
  },
  { immediate: true },
);

const [SettingsModal, settingsModalApi] = useVbenModal({
  class:
    'h-[min(78vh,760px)] w-[min(960px,92vw)] [overscroll-behavior:contain]',
  footer: true,
  onOpenChange(isOpen) {
    document.documentElement.style.overflow = isOpen ? 'hidden' : '';
    document.body.style.overflow = isOpen ? 'hidden' : '';
  },
  title: '参数设置',
});

const [RenameConversationForm, renameConversationFormApi] = useVbenForm({
  layout: 'vertical',
  showDefaultActions: false,
  schema: renameConversationSchema,
});

const [RenameConversationModal, renameConversationModalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    await submitRenameConversation();
  },
  onOpenChange(isOpen) {
    if (isOpen) {
      const data =
        renameConversationModalApi.getData<AIChatConversationResult>();
      renameConversationFormApi.resetForm();
      if (data) {
        renameConversationFormData.value = data;
        renameConversationFormApi.setValues({
          title: data.title,
        });
      } else {
        renameConversationFormData.value = undefined;
      }
      return;
    }

    if (!isOpen) {
      resetRenameConversationState();
    }
  },
  title: '重命名话题',
});

onMounted(async () => {
  await fetchProviders();
  await fetchMcps();
  await fetchQuickPhrasesFromToolbar();
  await initializeSession();

  hasInitialized = true;
});

onActivated(async () => {
  if (!hasInitialized) {
    return;
  }

  await refreshChatResources();
  await initializeSession();
});

onBeforeUnmount(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  abortTransientRequest();
});
</script>

<template>
  <ColPage auto-content-height :left-width="20" :right-width="80">
    <template #left>
      <ChatSidebar
        :active-key="activeConversationId"
        :creation="conversationCreation"
        :has-more="hasMoreConversations"
        :items="conversationItems || []"
        :loading="sidebarLoading"
        :loading-more="sidebarMoreLoading"
        :menu="conversationListMenu"
        :on-active-change="handleConversationActiveChange"
        :on-load-more="loadMoreConversations"
      />
    </template>

    <section
      class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card"
    >
      <div class="border-b border-border px-5 py-4 md:px-6">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center justify-between gap-4">
              <div class="inline-flex min-w-0 max-w-full items-center gap-2">
                <div
                  class="min-w-0 max-w-[220px] truncate text-[13px] font-semibold leading-7 text-foreground"
                  :title="activeConversationTitle"
                >
                  {{ activeConversationTitle }}
                </div>
                <IconifyIcon
                  class="size-3 shrink-0 text-muted-foreground"
                  icon="mdi:chevron-right"
                />
                <a-popover placement="bottomLeft" trigger="click">
                  <template #content>
                    <div class="w-[280px] space-y-3 text-popover-foreground">
                      <div>
                        <div class="mb-2 text-xs font-medium text-foreground">
                          供应商
                        </div>
                        <a-select
                          v-model:value="selectedProviderId"
                          class="w-full"
                          :disabled="sending || resourcesLoading"
                          :options="providerOptions"
                          placeholder="请选择供应商"
                        />
                      </div>
                      <div>
                        <div class="mb-2 text-xs font-medium text-foreground">
                          模型
                        </div>
                        <a-select
                          v-model:value="selectedModelId"
                          class="w-full"
                          :disabled="
                            sending ||
                            resourcesLoading ||
                            modelOptions.length === 0
                          "
                          :options="modelOptions"
                          placeholder="请选择模型"
                        />
                      </div>
                    </div>
                  </template>
                  <button
                    class="inline-flex min-w-0 max-w-[360px] items-center gap-1 rounded-md px-1 py-1 text-[13px] leading-7 text-foreground transition-colors hover:bg-accent/55"
                    :disabled="sending || resourcesLoading"
                    type="button"
                  >
                    <span class="truncate">{{
                      selectedProviderModelLabel
                    }}</span>
                    <IconifyIcon
                      class="size-3.5 shrink-0 text-muted-foreground"
                      icon="mdi:chevron-down"
                    />
                  </button>
                </a-popover>
              </div>
              <div
                class="min-w-0 flex-1 truncate text-right text-xs leading-tight text-muted-foreground"
                :title="activeConversationSubtitle"
              >
                {{ activeConversationSubtitle }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        class="flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 md:px-6 md:py-6"
        @scroll="handleMessageContainerScroll"
      >
        <div
          v-if="detailLoading"
          class="flex min-h-full items-center justify-center"
        >
          <a-spin />
        </div>
        <div
          v-else-if="displayMessages.length === 0"
          class="flex min-h-full items-center justify-center"
        >
          <div class="w-full max-w-[720px]">
            <Welcome
              :description="
                selectedProviderId && selectedModelId
                  ? `当前模型：${selectedProviderModelLabel}`
                  : '选择供应商和模型后开始对话'
              "
              title="你好，我是 FBA UI 智能助手"
            />
          </div>
        </div>
        <BubbleList
          v-else
          :items="bubbleListItems"
          :role="bubbleListRole"
          class="min-h-full"
        />
      </div>

      <Suggestion
        block
        :items="suggestionItems"
        @select="handleSuggestionSelect"
      >
        <template #default="{ onKeyDown, onTrigger }">
          <ChatSender
            :auto-size="senderAutoSize"
            :disabled="false"
            :footer="renderSenderFooter"
            :loading="sending"
            name="chat-message"
            :on-cancel="stopStreaming"
            :on-change="
              (value: string) =>
                handleSenderChangeWithSuggestion(String(value), onTrigger)
            "
            :on-key-down="onKeyDown"
            :on-submit="handleSenderSubmit"
            placeholder="在这里输入消息，按 Enter 发送"
            :suffix="false"
            :value="prompt"
          />
        </template>
      </Suggestion>
    </section>

    <SettingsModal :show-cancel-button="false" :show-confirm-button="false">
      <template #title>
        <span>参数设置</span>
      </template>
      <template #append-footer>
        <a-button danger type="primary" @click="resetModelSettings">
          重置
        </a-button>
      </template>
      <ChatSettingsPanel
        v-model:enable-builtin-tools="enableBuiltinTools"
        v-model:extra-body="extraBody"
        v-model:extra-headers="extraHeaders"
        v-model:frequency-penalty="frequencyPenalty"
        v-model:logit-bias="logitBias"
        v-model:max-tokens="maxTokens"
        v-model:parallel-tool-calls="parallelToolCalls"
        v-model:presence-penalty="presencePenalty"
        v-model:seed="seed"
        v-model:stop-sequences="stopSequences"
        v-model:temperature="temperature"
        v-model:timeout="timeout"
        v-model:top-p="topP"
      />
    </SettingsModal>

    <RenameConversationModal>
      <RenameConversationForm />
    </RenameConversationModal>
  </ColPage>
</template>
