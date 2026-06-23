import type { Ref } from 'vue';

import type {
  AIChatComposerParams,
  AIChatConversationDetail,
} from '../../../api/chat';

import { computed, ref, watch } from 'vue';

type ChatGenerationType = NonNullable<AIChatComposerParams['generation_type']>;
type ChatImageActionType = AIChatComposerParams['image_action'];
type ChatImageAspectRatioType = AIChatComposerParams['image_aspect_ratio'];
type ChatImageBackgroundType = AIChatComposerParams['image_background'];
type ChatImageInputFidelityType = AIChatComposerParams['image_input_fidelity'];
type ChatImageModerationType = AIChatComposerParams['image_moderation'];
type ChatImageOutputFormatType = AIChatComposerParams['image_output_format'];
type ChatImageQualityType = AIChatComposerParams['image_quality'];
type ChatImageSizeType = AIChatComposerParams['image_size'];
type ChatThinkingValue = AIChatComposerParams['thinking'];
type ChatWebSearchType = NonNullable<AIChatComposerParams['web_search']>;
interface ChatSessionScopedConfig {
  enableBuiltinTools: boolean;
  generationType: ChatGenerationType;
  modelId?: string;
  parallelToolCalls: boolean;
  providerId?: number;
  selectedMcpIds: number[];
  thinking: ChatThinkingValue;
  webSearch: ChatWebSearchType;
}

const DEFAULT_CHAT_SESSION_SCOPED_CONFIG: Omit<
  ChatSessionScopedConfig,
  'modelId' | 'providerId'
> = {
  enableBuiltinTools: true,
  generationType: 'text',
  parallelToolCalls: true,
  selectedMcpIds: [],
  thinking: undefined,
  webSearch: 'off',
};

const GENERATION_TYPE_OPTIONS: Array<{
  desc: string;
  label: string;
  value: ChatGenerationType;
}> = [
  { desc: '常规对话与文本生成', label: '文本', value: 'text' },
  { desc: '让模型直接生成图片结果', label: '图片', value: 'image' },
];

const WEB_SEARCH_OPTIONS: Array<{
  desc: string;
  label: string;
  value: ChatWebSearchType;
}> = [
  { desc: '不主动启用搜索工具', label: '关闭联网', value: 'off' },
  { desc: '优先使用模型内置搜索能力', label: '内置搜索', value: 'builtin' },
  { desc: '使用 Exa 作为搜索来源', label: 'Exa', value: 'exa' },
  { desc: '使用 Tavily 作为搜索来源', label: 'Tavily', value: 'tavily' },
  {
    desc: '使用 DuckDuckGo 作为搜索来源',
    label: 'DuckDuckGo',
    value: 'duckduckgo',
  },
];

const THINKING_OPTIONS: Array<{
  desc: string;
  key: string;
  label: string;
  value: ChatThinkingValue;
}> = [
  {
    desc: '沿用模型默认思考行为',
    key: 'default',
    label: '默认',
    value: undefined,
  },
  { desc: '显式关闭思考', key: 'off', label: '关闭', value: false },
  {
    desc: '最轻量的思考强度',
    key: 'minimal',
    label: 'minimal',
    value: 'minimal',
  },
  { desc: '较低思考强度', key: 'low', label: 'low', value: 'low' },
  { desc: '平衡型思考强度', key: 'medium', label: 'medium', value: 'medium' },
  { desc: '较高思考强度', key: 'high', label: 'high', value: 'high' },
  { desc: '最高思考强度', key: 'xhigh', label: 'xhigh', value: 'xhigh' },
];

export interface UseChatSettingsOptions {
  activeConversationDetail: Ref<AIChatConversationDetail | undefined>;
  activeConversationId: Ref<string>;
  selectedModelId: Ref<string | undefined>;
  selectedProviderId: Ref<number | undefined>;
}

export function useChatSettings(options: UseChatSettingsOptions) {
  const {
    activeConversationDetail,
    activeConversationId,
    selectedModelId,
    selectedProviderId,
  } = options;

  const maxTokens = ref<number>();
  const temperature = ref(1);
  const topP = ref<number>();
  const timeout = ref<number>();
  const seed = ref<number>();
  const presencePenalty = ref<number>();
  const frequencyPenalty = ref<number>();
  const generationType = ref<ChatGenerationType>('text');
  const imageAction = ref<ChatImageActionType>(undefined);
  const imageAspectRatio = ref<ChatImageAspectRatioType>(undefined);
  const imageBackground = ref<ChatImageBackgroundType>(undefined);
  const imageInputFidelity = ref<ChatImageInputFidelityType>(undefined);
  const imageModel = ref('');
  const imageModeration = ref<ChatImageModerationType>(undefined);
  const imageOutputCompression = ref<number>();
  const imageOutputFormat = ref<ChatImageOutputFormatType>(undefined);
  const imagePartialImages = ref<number>();
  const imageQuality = ref<ChatImageQualityType>(undefined);
  const imageSize = ref<ChatImageSizeType>(undefined);
  const parallelToolCalls = ref(true);
  const thinking = ref<ChatThinkingValue>(undefined);
  const enableBuiltinTools = ref(true);
  const selectedMcpIds = ref<number[]>([]);
  const webSearch = ref<ChatWebSearchType>('off');
  const stopSequences = ref('');
  const extraHeaders = ref('');
  const extraBody = ref('');
  const logitBias = ref('');
  const conversationSessionConfigs = ref<
    Record<string, ChatSessionScopedConfig>
  >({});

  function resetGenerationSettings() {
    maxTokens.value = undefined;
    temperature.value = 1;
    topP.value = undefined;
    timeout.value = undefined;
  }

  function resetBehaviorSettings() {
    seed.value = undefined;
    presencePenalty.value = undefined;
    frequencyPenalty.value = undefined;
  }

  function resetImageSettings() {
    imageAction.value = undefined;
    imageAspectRatio.value = undefined;
    imageBackground.value = undefined;
    imageInputFidelity.value = undefined;
    imageModel.value = '';
    imageModeration.value = undefined;
    imageOutputCompression.value = undefined;
    imageOutputFormat.value = undefined;
    imagePartialImages.value = undefined;
    imageQuality.value = undefined;
    imageSize.value = undefined;
  }

  function resetToolingSettings() {
    parallelToolCalls.value = true;
    enableBuiltinTools.value = true;
  }

  function resetPassthroughSettings() {
    stopSequences.value = '';
    extraHeaders.value = '';
    extraBody.value = '';
    logitBias.value = '';
  }

  function resetModelSettings() {
    resetGenerationSettings();
    resetBehaviorSettings();
    resetImageSettings();
    resetToolingSettings();
    resetPassthroughSettings();
  }

  function buildCurrentChatSessionScopedConfig(): ChatSessionScopedConfig {
    return {
      enableBuiltinTools: enableBuiltinTools.value,
      generationType: generationType.value,
      modelId: selectedModelId.value,
      parallelToolCalls: parallelToolCalls.value,
      providerId: selectedProviderId.value,
      selectedMcpIds: [...selectedMcpIds.value],
      thinking: thinking.value,
      webSearch: webSearch.value,
    };
  }

  function applyChatSessionScopedConfig(
    config: Partial<ChatSessionScopedConfig>,
    opts: { preserveProviderModel?: boolean } = {},
  ) {
    if (!opts.preserveProviderModel) {
      selectedProviderId.value = config.providerId;
      selectedModelId.value = config.modelId;
    }

    generationType.value =
      config.generationType ??
      DEFAULT_CHAT_SESSION_SCOPED_CONFIG.generationType;
    parallelToolCalls.value =
      config.parallelToolCalls ??
      DEFAULT_CHAT_SESSION_SCOPED_CONFIG.parallelToolCalls;
    thinking.value =
      config.thinking ?? DEFAULT_CHAT_SESSION_SCOPED_CONFIG.thinking;
    enableBuiltinTools.value =
      config.enableBuiltinTools ??
      DEFAULT_CHAT_SESSION_SCOPED_CONFIG.enableBuiltinTools;
    selectedMcpIds.value = [...(config.selectedMcpIds ?? [])];
    webSearch.value =
      config.webSearch ?? DEFAULT_CHAT_SESSION_SCOPED_CONFIG.webSearch;
  }

  function rememberConversationSessionConfig(conversationId?: null | string) {
    if (!conversationId) {
      return;
    }

    conversationSessionConfigs.value = {
      ...conversationSessionConfigs.value,
      [conversationId]: buildCurrentChatSessionScopedConfig(),
    };
  }

  function hasGenerationSettingsChanged() {
    return Boolean(
      maxTokens.value !== undefined ||
      temperature.value !== 1 ||
      topP.value !== undefined ||
      timeout.value !== undefined,
    );
  }

  function hasBehaviorSettingsChanged() {
    return Boolean(
      seed.value !== undefined ||
      presencePenalty.value !== undefined ||
      frequencyPenalty.value !== undefined,
    );
  }

  function hasImageSettingsChanged() {
    return Boolean(
      imageAction.value !== undefined ||
      imageAspectRatio.value !== undefined ||
      imageBackground.value !== undefined ||
      imageInputFidelity.value !== undefined ||
      imageModel.value.trim() ||
      imageModeration.value !== undefined ||
      imageOutputCompression.value !== undefined ||
      imageOutputFormat.value !== undefined ||
      imagePartialImages.value !== undefined ||
      imageQuality.value !== undefined ||
      imageSize.value !== undefined,
    );
  }

  function hasToolingSettingsChanged() {
    return Boolean(
      parallelToolCalls.value !== true || enableBuiltinTools.value !== true,
    );
  }

  function hasPassthroughSettingsChanged() {
    return Boolean(
      stopSequences.value.trim() ||
      extraHeaders.value.trim() ||
      extraBody.value.trim() ||
      logitBias.value.trim(),
    );
  }

  const hasAdvancedSettings = computed(() => {
    return Boolean(
      hasGenerationSettingsChanged() ||
      hasBehaviorSettingsChanged() ||
      hasImageSettingsChanged() ||
      hasToolingSettingsChanged() ||
      hasPassthroughSettingsChanged(),
    );
  });

  const webSearchButtonLabel = computed(() => {
    const activeOption = WEB_SEARCH_OPTIONS.find(
      (item) => item.value === webSearch.value,
    );
    return activeOption?.label || '联网搜索';
  });

  const generationTypeButtonLabel = computed(() => {
    const activeOption = GENERATION_TYPE_OPTIONS.find(
      (item) => item.value === generationType.value,
    );
    return activeOption?.label || '文本';
  });

  const thinkingButtonLabel = computed(() => {
    const activeOption = THINKING_OPTIONS.find(
      (item) => item.value === thinking.value,
    );
    return activeOption?.label || '默认';
  });

  watch(activeConversationId, (conversationId, previousConversationId) => {
    if (previousConversationId) {
      rememberConversationSessionConfig(previousConversationId);
    }

    if (!conversationId) {
      applyChatSessionScopedConfig(DEFAULT_CHAT_SESSION_SCOPED_CONFIG, {
        preserveProviderModel: true,
      });
      return;
    }

    const config = conversationSessionConfigs.value[conversationId];
    if (!config) {
      applyChatSessionScopedConfig(DEFAULT_CHAT_SESSION_SCOPED_CONFIG, {
        preserveProviderModel: true,
      });
      return;
    }

    applyChatSessionScopedConfig(config);
  });

  watch(activeConversationDetail, (detail) => {
    if (!detail) {
      return;
    }

    const config = conversationSessionConfigs.value[detail.conversation_id];
    if (!config) {
      return;
    }

    applyChatSessionScopedConfig(config);
  });

  return {
    DEFAULT_CHAT_SESSION_SCOPED_CONFIG,
    GENERATION_TYPE_OPTIONS,
    THINKING_OPTIONS,
    WEB_SEARCH_OPTIONS,
    conversationSessionConfigs,
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
  };
}
