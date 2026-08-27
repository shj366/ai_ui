<script setup lang="ts">
import type {
  AIDefaultModelResult,
  AIModelResult,
  AIProviderModelOptionResult,
} from '../../api';
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

import { getAIModelOptionsApi } from '../../api';
import {
  buildChatCompletionRequest,
  buildChatRegenerateRequest,
  stopAIChatConversationApi,
  updateAIChatConversationApi,
} from '../../api/chat';
import {
  buildTransientMessageItems,
  createProviderUserMessage,
  getMessageTextContent,
  makeConversationTitle,
  mergeStreamMessage,
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
import ChatSidebar from './components/chat-sidebar.vue';
import { useChatAttachmentDownloads } from './composables/use-chat-attachment-downloads';
import { useChatScroll } from './composables/use-chat-scroll';
import { useChatSession } from './composables/use-chat-session';
import { useChatSettings } from './composables/use-chat-settings';
import { usePromptToolbar } from './composables/use-prompt-toolbar';
import { normalizeAIModelOptions } from './model-options';

const { isDark } = usePreferences();
const prompt = ref('');
const promptDrafts = ref<Record<string, string>>({});
const draftConversationTitle = ref('新话题');
const selectedProviderId = ref<number>();
const selectedModelId = ref<string>();
const editingMessage = ref<ChatMessageItem>();
const regeneratingMessageIndex = ref<number>();
interface TransientPlacement {
  insertIndex: number;
  replaceMessageIds: string[];
}

const transientPlacements = ref<Record<string, TransientPlacement>>({});
const messageListViewportVersion = ref(0);
const messageListScrollKey = ref('draft');

const providers = ref<AIProviderModelOptionResult[]>([]);
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

const { executeAttachmentDownloads } = useChatAttachmentDownloads();


const {
  abort: abortTransientRequest,
  detachAll,
  isConversationRequesting,
  isRequesting,
  messages: transientMessagesState,
  onRequest: onTransientRequest,
  setMessages: setTransientMessages,
  setViewedConversationId,
  transientRequestError,
} = useAIChatStream();
const stoppingConversationIds = ref<Set<string>>(new Set());

function isConversationBusy(conversationId?: string) {
  if (!conversationId) {
    return isConversationRequesting(conversationId);
  }
  return (
    isConversationRequesting(conversationId) ||
    stoppingConversationIds.value.has(conversationId)
  );
}

function getComposerDraftKey(conversationId?: string) {
  return conversationId || 'draft';
}

function writePromptDraft(conversationId: string | undefined, value: string) {
  const key = getComposerDraftKey(conversationId);
  if (!value) {
    if (!(key in promptDrafts.value)) {
      return;
    }
    const nextDrafts = { ...promptDrafts.value };
    delete nextDrafts[key];
    promptDrafts.value = nextDrafts;
    return;
  }
  promptDrafts.value = {
    ...promptDrafts.value,
    [key]: value,
  };
}

function restorePromptDraft(conversationId?: string) {
  prompt.value = promptDrafts.value[getComposerDraftKey(conversationId)] ?? '';
}

function resetComposerState(_clearPrompt = false) {
  editingMessage.value = undefined;
  regeneratingMessageIndex.value = undefined;
}

const stopTargetConversationId = ref('');

function setConversationStopping(conversationId: string, stopping: boolean) {
  const nextIds = new Set(stoppingConversationIds.value);
  if (stopping) {
    nextIds.add(conversationId);
  } else {
    nextIds.delete(conversationId);
  }
  stoppingConversationIds.value = nextIds;
}

async function stopStreaming(conversationId?: string) {
  const targetId = conversationId || stopTargetConversationId.value;
  if (!targetId || stoppingConversationIds.value.has(targetId)) {
    return;
  }
  abortTransientRequest(targetId);
  setConversationStopping(targetId, true);
  try {
    await stopAIChatConversationApi(targetId);
  } finally {
    setConversationStopping(targetId, false);
  }
}

function handleStopStreaming() {
  void stopStreaming().catch((error) => {
    message.error((error as Error).message);
  });
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
  confirmClearMessages,
  confirmRemoveConversation,
  createNewConversation,
  deleteMessageChain,
  detailLoading,
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
  isConversationRequesting: isConversationBusy,
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

const sending = computed(
  () =>
    isRequesting.value ||
    stoppingConversationIds.value.has(activeConversationId.value),
);

watch(
  activeConversationId,
  (conversationId, previousId) => {
    if (previousId !== undefined && previousId !== conversationId) {
      writePromptDraft(previousId, prompt.value);
    }
    restorePromptDraft(conversationId);
    messageListScrollKey.value = conversationId || 'draft';
    stopTargetConversationId.value = conversationId;
    setViewedConversationId(conversationId);
  },
  { immediate: true, flush: 'sync' },
);

const activeTransientPlacement = computed(
  () => transientPlacements.value[activeConversationId.value],
);

function setTransientPlacement(
  conversationId: string,
  placement?: TransientPlacement,
) {
  const nextPlacements = { ...transientPlacements.value };
  if (placement) {
    nextPlacements[conversationId] = placement;
  } else {
    transientPlacements.value = Object.fromEntries(
      Object.entries(nextPlacements).filter(([key]) => key !== conversationId),
    );
    return;
  }
  transientPlacements.value = nextPlacements;
}

let generatingPollTimer: ReturnType<typeof setInterval> | undefined;

watch([activeConversationId, activeConversationDetail, sending], () => {
  if (generatingPollTimer) {
    clearInterval(generatingPollTimer);
    generatingPollTimer = undefined;
  }
  const conversationId = activeConversationId.value;
  if (
    !conversationId ||
    isConversationBusy(conversationId) ||
    !activeConversationDetail.value?.is_generating
  ) {
    return;
  }
  generatingPollTimer = setInterval(() => {
    void loadConversationDetail(conversationId, {
      scrollToBottom: false,
      showLoading: false,
    });
  }, 2000);
});

const { rememberConversationSessionConfig } = useChatSettings({
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

let hasInitialized = false;

function applyAssistantDefaultModel(
  defaultModel?: AIDefaultModelResult | null,
) {
  if (selectedProviderId.value && selectedModelId.value) {
    return;
  }

  if (!defaultModel || Number(defaultModel.status) !== 1) {
    return;
  }

  selectedProviderId.value = defaultModel.provider_id;
  selectedModelId.value = defaultModel.model_id;
}

function selectedModelExists(data: AIModelResult[]) {
  return data.some(
    (item) =>
      item.provider_id === selectedProviderId.value &&
      item.model_id === selectedModelId.value,
  );
}

async function refreshChatResources() {
  resourcesLoading.value = true;
  try {
    const data = normalizeAIModelOptions(await getAIModelOptionsApi());

    providers.value = data.providers;
    models.value = data.models;

    if (selectedModelId.value && !selectedModelExists(data.models)) {
      selectedProviderId.value = undefined;
      selectedModelId.value = undefined;
    }

    applyAssistantDefaultModel(data.defaultModel);
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    resourcesLoading.value = false;
  }
}

function handleModelSelectorModelSelect(model: AIModelResult) {
  selectedProviderId.value = model.provider_id;
  selectedModelId.value = model.model_id;
}

function getLastUserMessage() {
  for (let index = activeMessages.value.length - 1; index >= 0; index -= 1) {
    const item = activeMessages.value[index];
    if (
      item?.role === 'user' &&
      item.message_id !== undefined &&
      item.message_id !== null
    ) {
      return item;
    }
  }
  return undefined;
}

function canResendLastUserMessage(item: ChatMessageItem) {
  const lastUserMessage = getLastUserMessage();
  return (
    !sending.value &&
    lastUserMessage !== undefined &&
    item.id === lastUserMessage.id
  );
}

function beginEditMessage(item: ChatMessageItem) {
  if (!canResendLastUserMessage(item)) {
    return;
  }

  editingMessage.value = item;
  regeneratingMessageIndex.value = undefined;
}

function cancelEditMessage() {
  editingMessage.value = undefined;
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
  regenerateTargetMessageIndex?: number;
}) {
  if (params.regenerateMessageId !== undefined) {
    const userIndex = findActiveMessageIndex({
      message_id: params.regenerateMessageId,
      message_index: params.regenerateTargetMessageIndex,
      role: 'user',
    });
    return userIndex === -1
      ? undefined
      : getImmediateAssistantResponseRange(userIndex);
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

async function resendEditedMessage(content: string) {
  const trimmedContent = content.trim();
  const targetMessage = editingMessage.value;

  if (
    !targetMessage ||
    targetMessage.message_id === undefined ||
    targetMessage.message_id === null ||
    !canResendLastUserMessage(targetMessage)
  ) {
    return;
  }

  if (!trimmedContent) {
    message.warning('请输入消息内容');
    return;
  }

  updateMessageContent(targetMessage, trimmedContent);
  regeneratingMessageIndex.value = targetMessage.message_index;
  editingMessage.value = undefined;
  await submitChat(targetMessage.message_id, true, trimmedContent);
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
  attachments: AIChatComposerAttachment[] = [],
) {
  if (isConversationBusy(activeConversationId.value)) {
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
      model_id: selectedModelId.value,
      provider_id: selectedProviderId.value,
      mode: chatMode,
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

  const sourceConversationId = activeConversationId.value;
  const targetConversationId =
    sourceConversationId ||
    (globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const existingSummary = conversationSummaries.value.find(
    (item) => item.conversation_id === targetConversationId,
  );
  if (!sourceConversationId) {
    setActiveConversationKey(targetConversationId);
    draftConversationTitle.value = submittedTitle;
  }
  upsertConversationSummary({
    conversation_id: targetConversationId,
    created_time: existingSummary?.created_time ?? new Date().toISOString(),
    id: existingSummary?.id ?? Date.now(),
    is_generating: true,
    is_pinned: existingSummary?.is_pinned ?? false,
    title: existingSummary?.title || submittedTitle,
    updated_time: new Date().toISOString(),
  });
  if (regenerateMessageId !== undefined && !targetConversationId) {
    message.warning('当前会话不存在，无法重新生成');
    return false;
  }
  const regenerateTargetMessageIndex = regeneratingMessageIndex.value;
  const nextTransientPlacement = resolveTransientPlacement({
    editingMessageId,
    editingMessageIndex,
    regenerateMessageId,
    regenerateTargetMessageIndex,
  });

  autoFollowMessageScroll.value = true;
  transientRequestError.value = null;
  setTransientPlacement(targetConversationId, nextTransientPlacement);
  setTransientMessages([]);

  if (regenerateMessageId === undefined) {
    writePromptDraft(sourceConversationId, '');
    prompt.value = '';
  }

  const requestParams: AIChatProviderRequest =
    regenerateMessageId === undefined
      ? {
          body: buildChatCompletionRequest({
            attachments: submittedAttachments,
            conversationId: targetConversationId,
            params: payload,
            promptText: submittedPromptText,
          }),
          conversationId: targetConversationId,
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
          body: buildChatRegenerateRequest({
            content: overridePromptText,
            conversationId: targetConversationId,
            params: payload,
          }),
          conversationId: targetConversationId,
          localMessages: [],
          messageId: regenerateMessageId,
          mode: 'regenerate-from-message',
        };

  void finalizeChatRequest({
    editingMessageIndex,
    regenerateMessageId,
    requestConversationId: targetConversationId,
    requestPromise: onTransientRequest(requestParams),
    submittedPromptText,
  });
  return true;
}

async function finalizeChatRequest(params: {
  editingMessageIndex?: number;
  regenerateMessageId?: number;
  requestConversationId: string;
  requestPromise: Promise<'completed' | 'detached' | 'failed' | 'ignored'>;
  submittedPromptText: string;
}) {
  const requestOutcome = await params.requestPromise;
  const stillViewing =
    activeConversationId.value === params.requestConversationId;
  const requestError = stillViewing ? transientRequestError.value : null;

  if (requestError) {
    message.error(requestError);
    if (
      params.regenerateMessageId === undefined &&
      params.editingMessageIndex === undefined
    ) {
      writePromptDraft(params.requestConversationId, params.submittedPromptText);
      if (stillViewing) {
        prompt.value = params.submittedPromptText;
      }
    }
  }

  rememberConversationSessionConfig(params.requestConversationId);
  const currentSummary = conversationSummaries.value.find(
    (item) => item.conversation_id === params.requestConversationId,
  );
  if (currentSummary) {
    upsertConversationSummary({
      ...currentSummary,
      is_generating: isConversationBusy(params.requestConversationId),
    });
  }
  if (stillViewing) {
    if (requestOutcome === 'completed' && !requestError) {
      const committedMessages = commitSuccessfulTransientMessages();
      void executeAttachmentDownloads(committedMessages);
    }
    setTransientMessages([]);
    await syncCompletedConversationMetadata(params.requestConversationId);
    editingMessage.value = undefined;
    regeneratingMessageIndex.value = undefined;
  } else {
    void syncCompletedConversationMetadata(params.requestConversationId);
  }
  setTransientPlacement(params.requestConversationId, undefined);
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

function commitSuccessfulTransientMessages(): ChatMessageItem[] {
  const committedMessages = transientMessages.value
    .filter((message) => shouldRenderChatMessage(message))
    .map((message) => ({
      ...message,
      streaming: false,
    }));

  if (committedMessages.length === 0) {
    return [];
  }

  const placement = activeTransientPlacement.value;
  if (!placement) {
    activeMessages.value = [...activeMessages.value, ...committedMessages];
    return committedMessages;
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
  return committedMessages;
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
  const placement = activeTransientPlacement.value;

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
  () => detailLoading.value && displayMessages.value.length === 0,
);
const messageListClass = computed(() =>
  ['h-full min-h-0 max-h-full', messageListRestoring.value ? 'invisible' : '']
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

const isThinkingExpanded = () => false;
const setThinkingExpanded = () => {};

const messageListItems = computed(() => {
  const items: import('./components').ChatMessageListProps['items'] = [];

  for (const message of displayMessages.value) {
    const isEditing = isEditingMessage(message);

    items.push({
      content: isEditing
        ? getMessageTextContent(message)
          : renderChatMessageContent(message, {
              isDark: isDark.value,
            }),
      extraInfo: {
        message,
      },
      key: message.id,
      role: message.role === 'assistant' ? 'assistant' : 'user',
      streaming: Boolean(message.role === 'assistant' && message.streaming),
    });
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
  return Boolean(
    activeConversationId.value ||
      activeMessages.value.length > 0 ||
      transientMessages.value.length > 0,
  );
});

const conversationItems = computed<ConversationSidebarItem[]>(() =>
  buildConversationSidebarItems(
    conversationSummaries.value.map((item) => ({
      ...item,
      is_generating: isConversationBusy(item.conversation_id),
    })),
  ),
);

const conversationCreation = computed<ConversationSidebarCreation>(() => ({
  disabled: !canCreateNewConversation.value,
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
  return submitChat(undefined, true, messageText, attachments);
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
    canResendLastUserMessage,
    isDark: isDark.value,
    isEditingMessage,
    isThinkingExpanded,
    onBeginEditMessage: beginEditMessage,
    onCancelEditMessage: cancelEditMessage,
    onConfirmDeleteMessage: confirmDeleteMessage,
    onResendEditedMessage: resendEditedMessage,
    getProviderLabel,
    selectedModelId: selectedModelId.value,
    selectedModelLabel: selectedModelLabel.value,
    selectedProviderId: selectedProviderId.value,
    selectedProviderLabel: selectedProviderLabel.value,
    setThinkingExpanded,
  }),
);

const {
  fetchQuickPhrases: fetchQuickPhrasesFromToolbar,
  renderPromptInputFooter,
} = usePromptToolbar({
  canClearMessages,
  canCreateNewConversation,
  confirmClearMessages,
  createNewConversation,
  onSelectQuickPhrase: (item) => {
    prompt.value = prompt.value.trim()
      ? `${prompt.value.trim()}\n${item.content}`
      : item.content;
  },
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
  await fetchQuickPhrasesFromToolbar();
  await initializeSession();

  hasInitialized = true;
});

onActivated(async () => {
  if (!hasInitialized) {
    return;
  }

  await refreshChatResources();
  await fetchQuickPhrasesFromToolbar();
  if (!activeConversationId.value && activeMessages.value.length === 0) {
    await initializeSession();
  }
});

onBeforeUnmount(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  if (generatingPollTimer) {
    clearInterval(generatingPollTimer);
  }
  detachAll();
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
        :on-cancel="handleStopStreaming"
        :on-change="handlePromptInputChange"
        :on-submit="handlePromptInputSubmit"
        placeholder="在这里输入消息，Enter 发送，Shift + Enter 换行"
        :suffix="false"
        :value="prompt"
      />
    </a-card>

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
