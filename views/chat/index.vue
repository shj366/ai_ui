<script setup lang="ts">
import type { AIModelResult, AIProviderResult } from '../../api';
import type {
  AIChatComposerAttachment,
  AIChatComposerParams,
  AIChatConversationResult,
} from '../../api/chat';
import type {
  AIChatProviderMessage,
  ChatMessageItem,
} from '../../runtime/message';
import type { AIChatProviderRequest } from '../../runtime/use-chat-stream';
import type { AIChatFileMessageBlock } from '../../types/message';
import type {
  ConversationSidebarCreation,
  ConversationSidebarItem,
  ConversationSidebarMenu,
} from './adapters/conversation-items';

import type { VbenFormSchema } from '#/adapter/form';

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

import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import { ConversationEmptyState } from '#/plugins/ai/components/ai-elements';

import {
  getAIAssistantDefaultModelOptionalApi,
  getAllAIModelApi,
  getAllAIProviderApi,
} from '../../api';
import {
  buildChatCompletionRequest,
  updateAIChatConversationApi,
  updateAIChatMessageApi,
} from '../../api/chat';
import {
  buildTransientMessageItems,
  createProviderUserMessage,
  getMessageTextContent,
  makeConversationTitle,
  mergeStreamMessage,
  parseJsonField,
  replaceMessageTextBlocks,
} from '../../runtime/message';
import { useAIChatStream } from '../../runtime/use-chat-stream';
import {
  buildConversationSidebarItems,
  createConversationSidebarMenu,
} from './adapters/conversation-items';
import {
  createChatMessageListRole,
  hasRenderableChatMessage,
  renderChatMessageContent,
} from './adapters/message-rendering';
import { ChatConversationList } from './components';
import ChatModelSelector from './components/chat-model-selector.vue';
import ChatPromptInput from './components/chat-prompt-input.vue';
import ChatSettingsPanel from './components/chat-settings-panel.vue';
import ChatSidebar from './components/chat-sidebar.vue';
import { useChatScroll } from './composables/use-chat-scroll';
import { useChatSession } from './composables/use-chat-session';
import { useChatSettings } from './composables/use-chat-settings';
import { usePromptToolbar } from './composables/use-prompt-toolbar';
import { useThinkingPanel } from './composables/use-thinking-panel';

const { isDark } = usePreferences();
const prompt = ref('');
const draftConversationTitle = ref('新话题');
const selectedProviderId = ref<number>();
const selectedModelId = ref<string>();
const editingMessage = ref<ChatMessageItem>();
const editingMessageIntent = ref<'resend' | 'save'>('save');
const regeneratingMessageIndex = ref<number>();
const transientPlacement = ref<{
  insertIndex: number;
  replaceMessageIds: string[];
}>();
const messageListViewportVersion = ref(0);
const messageListScrollKey = ref('draft');

const providers = ref<AIProviderResult[]>([]);
const models = ref<AIModelResult[]>([]);

const resourcesLoading = ref(false);

const {
  autoFollowMessageScroll,
  handleMessageContainerScroll,
  isScrollRestored,
  scrollToBottom,
  scrollToBottomIfFollowing,
  scrollToTop,
  setMessageContainerRef,
} = useChatScroll({
  scrollKey: messageListScrollKey,
});

const {
  abort: abortTransientRequest,
  isRequesting,
  messages: transientMessagesState,
  onRequest: onTransientRequest,
  setMessages: setTransientMessages,
  transientRequestError,
} = useAIChatStream();
const sending = computed(() => isRequesting.value);

function resetComposerState(clearPrompt = false) {
  editingMessage.value = undefined;
  regeneratingMessageIndex.value = undefined;
  transientPlacement.value = undefined;
  if (clearPrompt) {
    prompt.value = '';
  }
}

function stopStreaming() {
  abortTransientRequest();
}

function resetMessageListViewport() {
  messageListViewportVersion.value += 1;
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
  syncConversationDetailMetadata,
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
  renameConversationFormData,
  resetComposerState,
  resetMessageListViewport,
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

watch(
  activeConversationId,
  (conversationId) => {
    messageListScrollKey.value = conversationId || 'draft';
  },
  { immediate: true, flush: 'sync' },
);

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
  imageAction,
  imageAspectRatio,
  imageBackground,
  imageInputFidelity,
  imageModel,
  imageModeration,
  imageOutputCompression,
  imageOutputFormat,
  imagePartialImages,
  imageQuality,
  imageSize,
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
  providers.value = await getAllAIProviderApi();
}

async function applyAssistantDefaultModel(options: { force?: boolean } = {}) {
  if (!options.force && selectedProviderId.value && selectedModelId.value) {
    return;
  }

  const defaultModel = await getAIAssistantDefaultModelOptionalApi();
  if (!defaultModel || Number(defaultModel.status) !== 1) {
    return;
  }

  selectedProviderId.value = defaultModel.provider_id;
  selectedModelId.value = defaultModel.model_id;
}

function getEnabledProviderIds(source = providers.value) {
  return source
    .filter((item) => Number(item.status) === 1)
    .map((item) => item.id);
}

async function fetchModelsByProviders(providerIds = getEnabledProviderIds()) {
  const fetchId = ++currentModelFetchId;

  if (providerIds.length === 0) {
    models.value = [];
    if (!activeConversationId.value) {
      selectedModelId.value = undefined;
    }
    return;
  }

  const data = (
    await Promise.all(
      providerIds.map((providerId) =>
        getAllAIModelApi({ provider_id: providerId }),
      ),
    )
  ).flat();

  if (fetchId !== currentModelFetchId) {
    return;
  }

  models.value = data;

  const selectedModelExists = data.some(
    (item) =>
      item.provider_id === selectedProviderId.value &&
      item.model_id === selectedModelId.value,
  );

  if (selectedModelId.value && !selectedModelExists) {
    selectedModelId.value = undefined;
  }
}

async function refreshChatResources() {
  resourcesLoading.value = true;
  try {
    await fetchProviders();
    await fetchModelsByProviders();
  } finally {
    resourcesLoading.value = false;
  }
}

function handleModelSelectorModelSelect(model: AIModelResult) {
  selectedProviderId.value = model.provider_id;
  selectedModelId.value = model.model_id;
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

function findActiveMessageIndex(target: {
  id?: string;
  message_id?: null | number;
  message_index?: number;
  role?: ChatMessageItem['role'];
}) {
  return activeMessages.value.findIndex((item) => {
    if (target.id && item.id === target.id) {
      return true;
    }

    if (
      target.message_id !== undefined &&
      target.message_id !== null &&
      item.message_id === target.message_id
    ) {
      return true;
    }

    return (
      target.message_index !== undefined &&
      item.message_index === target.message_index &&
      (!target.role || item.role === target.role)
    );
  });
}

function getImmediateAssistantResponseRange(userIndex: number) {
  const startIndex = Math.max(0, userIndex + 1);
  let endIndex = startIndex;

  while (endIndex < activeMessages.value.length) {
    const item = activeMessages.value[endIndex];
    if (!item || item.role === 'user') {
      break;
    }
    endIndex += 1;
  }

  return {
    insertIndex: startIndex,
    replaceMessageIds: activeMessages.value
      .slice(startIndex, endIndex)
      .filter((item) => item.role === 'assistant')
      .map((item) => item.id),
  };
}

function resolveTransientPlacement(params: {
  editingMessageId?: null | number;
  editingMessageIndex?: number;
  regenerateMessageId?: number;
  regenerateSource: 'model' | 'user';
  regenerateTargetMessageIndex?: number;
}) {
  if (params.regenerateMessageId !== undefined) {
    if (params.regenerateSource === 'user') {
      const userIndex = findActiveMessageIndex({
        message_id: params.regenerateMessageId,
        message_index: params.regenerateTargetMessageIndex,
        role: 'user',
      });
      return userIndex === -1
        ? undefined
        : getImmediateAssistantResponseRange(userIndex);
    }

    const assistantIndex = findActiveMessageIndex({
      message_id: params.regenerateMessageId,
      message_index: params.regenerateTargetMessageIndex,
      role: 'assistant',
    });
    const assistantMessage = activeMessages.value[assistantIndex];
    return assistantMessage
      ? {
          insertIndex: assistantIndex,
          replaceMessageIds: [assistantMessage.id],
        }
      : undefined;
  }

  if (
    params.editingMessageId !== undefined &&
    params.editingMessageId !== null
  ) {
    const userIndex = findActiveMessageIndex({
      message_id: params.editingMessageId,
      message_index: params.editingMessageIndex,
      role: 'user',
    });
    return userIndex === -1
      ? undefined
      : getImmediateAssistantResponseRange(userIndex);
  }
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

function createLocalAttachmentBlocks(
  attachments: AIChatComposerAttachment[],
): AIChatFileMessageBlock[] {
  return attachments.map((attachment) => {
    const mimeType = attachment.mime_type || 'application/octet-stream';
    return {
      file_type: attachment.file_type ?? null,
      mime_type: mimeType,
      name: attachment.name ?? null,
      source_type: attachment.source_type ?? null,
      type: 'file',
      url:
        attachment.url ??
        (attachment.data ? `data:${mimeType};base64,${attachment.data}` : null),
    };
  });
}

async function submitChat(
  regenerateMessageId?: number,
  notifyInvalid = false,
  overridePromptText?: string,
  regenerateSource: 'model' | 'user' = 'model',
  attachments: AIChatComposerAttachment[] = [],
) {
  if (sending.value) {
    return false;
  }

  if (!selectedProviderId.value || !selectedModelId.value) {
    if (notifyInvalid) {
      message.warning('请选择供应商和模型');
    }
    return false;
  }

  const promptText =
    regenerateMessageId === undefined
      ? (overridePromptText ?? prompt.value).trim()
      : undefined;
  const submittedAttachments =
    regenerateMessageId === undefined ? attachments : [];
  const hasInput = Boolean(promptText) || submittedAttachments.length > 0;

  if (regenerateMessageId === undefined && !hasInput) {
    if (notifyInvalid) {
      message.warning('请输入消息内容');
    }
    return false;
  }

  const editingMessageIndex = editingMessage.value?.message_index;
  const editingMessageId = editingMessage.value?.message_id;
  const hasEditingMessageId =
    editingMessageId !== undefined && editingMessageId !== null;
  const submittedPromptText = promptText ?? '';

  if (editingMessage.value && !hasEditingMessageId) {
    message.warning('当前消息暂不可编辑，请刷新后重试');
    return false;
  }
  let chatMode: AIChatComposerParams['mode'] = 'regenerate';
  if (regenerateMessageId === undefined) {
    chatMode = hasEditingMessageId ? 'edit' : 'create';
  }
  const submittedTitle = activeConversationId.value
    ? draftConversationTitle.value
    : makeConversationTitle(
        promptText || submittedAttachments[0]?.name || '附件消息',
      );

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
      image_action: imageAction.value,
      image_aspect_ratio: imageAspectRatio.value,
      image_background: imageBackground.value,
      image_input_fidelity: imageInputFidelity.value,
      image_model: imageModel.value.trim() || undefined,
      image_moderation: imageModeration.value,
      image_output_compression: imageOutputCompression.value,
      image_output_format: imageOutputFormat.value,
      image_partial_images: imagePartialImages.value,
      image_quality: imageQuality.value,
      image_size: imageSize.value,
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
          }
        : {}),
      ...(chatMode === 'regenerate' && regenerateMessageId !== undefined
        ? { regenerate_message_id: regenerateMessageId }
        : {}),
    };
  } catch (error) {
    message.error((error as Error).message);
    return false;
  }

  const targetConversationId = activeConversationId.value;
  if (regenerateMessageId !== undefined && !targetConversationId) {
    message.warning('当前会话不存在，无法重新生成');
    return false;
  }
  const regenerateTargetMessageIndex = regeneratingMessageIndex.value;
  const nextTransientPlacement = resolveTransientPlacement({
    editingMessageId,
    editingMessageIndex,
    regenerateMessageId,
    regenerateSource,
    regenerateTargetMessageIndex,
  });

  if (!activeConversationId.value) {
    draftConversationTitle.value = submittedTitle;
  }
  autoFollowMessageScroll.value = true;
  const completionRequest = buildChatCompletionRequest({
    attachments: submittedAttachments,
    conversationId: targetConversationId,
    params: payload,
    promptText:
      regenerateMessageId === undefined ? submittedPromptText : undefined,
  });

  transientRequestError.value = null;
  transientPlacement.value = nextTransientPlacement;
  setTransientMessages([]);

  if (regenerateMessageId === undefined || regenerateSource === 'user') {
    prompt.value = '';
  }

  const requestParams: AIChatProviderRequest =
    regenerateMessageId === undefined
      ? {
          body: completionRequest,
          localMessages: hasInput
            ? [
                createProviderUserMessage(
                  submittedPromptText,
                  undefined,
                  createLocalAttachmentBlocks(submittedAttachments),
                ),
              ]
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

  await onTransientRequest(requestParams);

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
      await syncCompletedConversationMetadata(streamedConversationId);
    }

    transientPlacement.value = undefined;
    setTransientMessages([]);
  } else {
    if (streamedConversationId) {
      rememberConversationSessionConfig(streamedConversationId);
      setActiveConversationKey(streamedConversationId);
      commitSuccessfulTransientMessages();
      setTransientMessages([]);
      await syncCompletedConversationMetadata(streamedConversationId);
    } else if (conversationSummaries.value[0]) {
      await fetchConversations(false);
      setActiveConversationKey(conversationSummaries.value[0].conversation_id);
      await loadConversationDetail(
        conversationSummaries.value[0].conversation_id,
      );
      setTransientMessages([]);
    } else {
      setTransientMessages([]);
    }
  }

  editingMessage.value = undefined;
  editingMessageIntent.value = 'save';
  regeneratingMessageIndex.value = undefined;
  transientPlacement.value = undefined;

  return !requestError;
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

function shouldRenderChatMessage(message: ChatMessageItem) {
  if (message.message_type === 'error') {
    return Boolean(getMessageTextContent(message, 'text').trim());
  }

  if (message.role === 'assistant' && message.streaming) {
    return true;
  }

  return hasRenderableChatMessage(message);
}

function commitSuccessfulTransientMessages() {
  const committedMessages = transientMessages.value
    .filter((message) => shouldRenderChatMessage(message))
    .map((message) => ({
      ...message,
      streaming: false,
    }));

  if (committedMessages.length === 0) {
    return;
  }

  const placement = transientPlacement.value;
  if (!placement) {
    activeMessages.value = [...activeMessages.value, ...committedMessages];
    return;
  }

  const replaceMessageIds = new Set(placement.replaceMessageIds);
  const nextMessages: ChatMessageItem[] = [];
  let hasInserted = false;

  activeMessages.value.forEach((message, index) => {
    if (!hasInserted && index === placement.insertIndex) {
      nextMessages.push(...committedMessages);
      hasInserted = true;
    }

    if (!replaceMessageIds.has(message.id)) {
      nextMessages.push(message);
    }
  });

  if (!hasInserted) {
    nextMessages.push(...committedMessages);
  }

  activeMessages.value = nextMessages;
}

async function syncCompletedConversationMetadata(conversationId: string) {
  try {
    await syncConversationDetailMetadata(conversationId);
  } catch {
    return undefined;
  }
}

const displayMessages = computed<ChatMessageItem[]>(() => {
  const renderableTransientMessages = transientMessages.value.filter(
    (message) => shouldRenderChatMessage(message),
  );
  const placement = transientPlacement.value;

  if (!placement || renderableTransientMessages.length === 0) {
    return [...activeMessages.value, ...renderableTransientMessages].filter(
      (message) => shouldRenderChatMessage(message),
    );
  }

  const replaceMessageIds = new Set(placement.replaceMessageIds);
  const messages: ChatMessageItem[] = [];
  let hasInserted = false;

  activeMessages.value.forEach((message, index) => {
    if (!hasInserted && index === placement.insertIndex) {
      messages.push(...renderableTransientMessages);
      hasInserted = true;
    }

    if (!replaceMessageIds.has(message.id)) {
      messages.push(message);
    }
  });

  if (!hasInserted) {
    messages.push(...renderableTransientMessages);
  }

  return messages.filter((message) => shouldRenderChatMessage(message));
});

const messageListRestoring = computed(
  () => displayMessages.value.length > 0 && !isScrollRestored.value,
);
const messageAreaLoading = computed(
  () => detailLoading.value || messageListRestoring.value,
);
const messageListClass = computed(() =>
  [
    'h-full min-h-0 max-h-full',
    messageListRestoring.value ? 'invisible' : '',
  ]
    .filter(Boolean)
    .join(' '),
);

watch(
  displayMessages,
  () => {
    scrollToBottomIfFollowing();
  },
  { flush: 'post' },
);

const { isThinkingExpanded, setThinkingExpanded } = useThinkingPanel({
  displayMessages,
});

const messageListItems = computed(() => {
  const items: import('./components').ChatMessageListProps['items'] = [];

  for (const message of displayMessages.value) {
    const isEditing = isEditingMessage(message);

    items.push({
      content: isEditing
        ? getMessageTextContent(message)
        : renderChatMessageContent(message, {
            isDark: isDark.value,
            isThinkingExpanded,
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

const selectedModelLabel = computed(() => {
  return (
    modelOptions.value.find((item) => item.value === selectedModelId.value)
      ?.label || '请选择模型'
  );
});

const selectedProviderLabel = computed(() => {
  return (
    enabledProviders.value.find((item) => item.id === selectedProviderId.value)
      ?.name || ''
  );
});

function getProviderLabel(providerId?: null | number) {
  if (providerId === null || providerId === undefined) {
    return undefined;
  }

  return providers.value.find((item) => item.id === providerId)?.name;
}

const canClearMessages = computed(() => {
  return Boolean(activeConversationId.value && activeMessages.value.length > 0);
});

const canCreateNewConversation = computed(() => {
  return activeMessages.value.length > 0;
});

const conversationItems = computed<ConversationSidebarItem[]>(() =>
  buildConversationSidebarItems(conversationSummaries.value),
);

const conversationCreation = computed<ConversationSidebarCreation>(() => ({
  disabled: sending.value || !canCreateNewConversation.value,
  onClick: createNewConversation,
}));

const conversationListMenu = computed<ConversationSidebarMenu>(() =>
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

function handlePromptInputSubmit(
  messageText: string,
  _slotConfig?: unknown,
  _skill?: unknown,
  attachments: AIChatComposerAttachment[] = [],
) {
  return submitChat(undefined, true, messageText, 'model', attachments);
}

function handlePromptInputChange(value: string) {
  prompt.value = value;
}

function confirmDeleteMessage(item: ChatMessageItem) {
  confirm({
    content: `确认删除第 ${item.message_index + 1} 条消息吗？`,
    icon: 'warning',
  }).then(async () => {
    await deleteMessageChain(item);
  });
}

const messageListRole = computed(() =>
  createChatMessageListRole({
    editingMessageIntent: editingMessageIntent.value,
    isDark: isDark.value,
    isEditingMessage,
    isThinkingExpanded,
    onBeginEditMessage: beginEditMessage,
    onCancelEditMessage: cancelEditMessage,
    onConfirmDeleteMessage: confirmDeleteMessage,
    onRegenerateMessage: regenerateMessage,
    onRegenerateUserMessage: regenerateUserMessage,
    onResendEditedMessage: resendEditedMessage,
    onSaveEditedMessage: saveEditedMessage,
    getProviderLabel,
    selectedModelId: selectedModelId.value,
    selectedModelLabel: selectedModelLabel.value,
    selectedProviderId: selectedProviderId.value,
    selectedProviderLabel: selectedProviderLabel.value,
    setThinkingExpanded,
  }),
);

const {
  fetchMcps: fetchMcpsFromToolbar,
  fetchQuickPhrases: fetchQuickPhrasesFromToolbar,
  renderPromptInputFooter,
} = usePromptToolbar({
  activeConversationId: computed(() => activeConversationId.value),
  canClearMessages,
  canCreateNewConversation,
  confirmClearConversationContext,
  confirmClearMessages,
  createNewConversation,
  enableBuiltinTools,
  generationType,
  generationTypeButtonLabel,
  GENERATION_TYPE_OPTIONS,
  hasAdvancedSettings,
  onOpenSettings: () => settingsModalApi.open(),
  onSelectQuickPhrase: (item) => {
    prompt.value = prompt.value.trim()
      ? `${prompt.value.trim()}\n${item.content}`
      : item.content;
  },
  selectedMcpIds,
  sending,
  thinking,
  thinkingButtonLabel,
  THINKING_OPTIONS,
  webSearch,
  webSearchButtonLabel,
  WEB_SEARCH_OPTIONS,
});

const [SettingsModal, settingsModalApi] = useVbenModal({
  class:
    'h-[min(78vh,760px)] w-[min(960px,92vw)] [overscroll-behavior:contain]',
  contentClass: 'flex h-0 min-h-0 overflow-hidden',
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
  await refreshChatResources();
  await applyAssistantDefaultModel({ force: true });
  await fetchMcpsFromToolbar();
  await fetchQuickPhrasesFromToolbar();
  await initializeSession();

  hasInitialized = true;
});

onActivated(async () => {
  if (!hasInitialized) {
    return;
  }

  await refreshChatResources();
  await fetchMcpsFromToolbar();
  await fetchQuickPhrasesFromToolbar();
  if (!activeConversationId.value && activeMessages.value.length === 0) {
    await initializeSession();
  }
  await applyAssistantDefaultModel({ force: true });
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

    <a-card
      :classes="{
        root: 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius)] bg-card',
        header: 'shrink-0 !border-b !border-border md:!px-6',
        body: 'flex min-h-0 flex-1 flex-col !p-0',
      }"
      variant="outlined"
    >
      <template #title>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <div
            class="min-w-0 max-w-[min(420px,48vw)] truncate text-[13px] font-semibold leading-7 text-foreground"
            :title="activeConversationTitle"
          >
            {{ activeConversationTitle }}
          </div>
          <ChatModelSelector
            class="shrink-0"
            :disabled="sending || resourcesLoading"
            :loading="resourcesLoading"
            :models="enabledModels"
            :providers="enabledProviders"
            :selected-model-id="selectedModelId"
            :selected-provider-id="selectedProviderId"
            @select-model="handleModelSelectorModelSelect"
          />
        </div>
      </template>

      <div class="relative min-h-0 flex-1">
        <div class="h-full overflow-hidden">
          <div
            v-if="!detailLoading && displayMessages.length === 0"
            class="flex min-h-full items-center justify-center"
          >
            <div class="w-full max-w-[720px]">
              <ConversationEmptyState
                :description="
                  selectedProviderId && selectedModelId
                    ? '可以直接提问、生成内容，或结合工具完成更复杂的任务'
                    : '先选择供应商和模型，然后开始你的第一个问题'
                "
                title="你好，我是 FBA AI"
              >
                <template #icon>
                  <div
                    class="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
                  >
                    <IconifyIcon
                      class="size-7"
                      icon="mdi:robot-happy-outline"
                    />
                  </div>
                </template>
              </ConversationEmptyState>
            </div>
          </div>
          <ChatConversationList
            v-else-if="displayMessages.length > 0"
            :key="`${activeConversationId || 'draft'}:${messageListViewportVersion}`"
            :ref="setMessageContainerRef"
            auto-scroll
            :classes="{
              scroll: 'md:pt-4',
            }"
            :items="messageListItems"
            :on-scroll="handleMessageContainerScroll"
            :role="messageListRole"
            :class="messageListClass"
          />
          <div
            v-if="messageAreaLoading"
            class="absolute inset-0 z-10 flex items-center justify-center bg-card"
          >
            <a-spin description="正在渲染消息..." />
          </div>
        </div>
      </div>

      <ChatPromptInput
        :disabled="false"
        :footer="renderPromptInputFooter"
        :loading="sending"
        name="chat-message"
        :on-cancel="stopStreaming"
        :on-change="handlePromptInputChange"
        :on-submit="handlePromptInputSubmit"
        placeholder="在这里输入消息，Enter 发送，Shift + Enter 换行"
        :suffix="false"
        :value="prompt"
      />
    </a-card>

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
        :generation-type="generationType"
        v-model:image-action="imageAction"
        v-model:image-aspect-ratio="imageAspectRatio"
        v-model:image-background="imageBackground"
        v-model:image-input-fidelity="imageInputFidelity"
        v-model:image-model="imageModel"
        v-model:image-moderation="imageModeration"
        v-model:image-output-compression="imageOutputCompression"
        v-model:image-output-format="imageOutputFormat"
        v-model:image-partial-images="imagePartialImages"
        v-model:image-quality="imageQuality"
        v-model:image-size="imageSize"
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

<style>
.ai-elements-markdown p {
  margin: 0;
}

.ai-elements-markdown h1,
.ai-elements-markdown h2,
.ai-elements-markdown h3,
.ai-elements-markdown h4,
.ai-elements-markdown h5,
.ai-elements-markdown h6 {
  margin: 0.6rem 0 0.35rem;
  font-weight: 700;
  line-height: 1.35;
}

.ai-elements-markdown ul,
.ai-elements-markdown ol {
  margin: 0.35rem 0;
  padding-left: 1.25rem;
}

.ai-elements-markdown li + li {
  margin-top: 0.2rem;
}

.ai-elements-markdown a {
  color: hsl(var(--primary));
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.ai-elements-markdown code {
  border-radius: 0.375rem;
  background: hsl(var(--muted));
  padding: 0.1rem 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92em;
}

.ai-elements-markdown blockquote {
  margin: 0.5rem 0;
  border-left: 3px solid hsl(var(--primary) / 0.45);
  background: hsl(var(--muted) / 0.35);
  padding: 0.5rem 0.75rem;
  color: hsl(var(--muted-foreground));
}

.ai-elements-markdown img {
  max-width: 100%;
  border-radius: 0.75rem;
}

.ai-message-error .ai-elements-markdown {
  color: hsl(var(--destructive));
}

.ai-message-error .ai-elements-markdown * {
  color: hsl(var(--destructive));
}
</style>
