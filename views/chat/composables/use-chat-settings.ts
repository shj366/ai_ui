import { ref, watch } from 'vue';
import type { Ref } from 'vue';

import type { AIChatConversationDetail } from '../../../api/chat';

interface ChatSessionModelConfig {
  modelId?: string;
  providerId?: number;
}

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
  const conversationSessionConfigs = ref<Record<string, ChatSessionModelConfig>>({});

  function rememberConversationSessionConfig(conversationId?: null | string) {
    if (!conversationId) {
      return;
    }
    conversationSessionConfigs.value = {
      ...conversationSessionConfigs.value,
      [conversationId]: {
        modelId: selectedModelId.value,
        providerId: selectedProviderId.value,
      },
    };
  }

  function applyConversationModelConfig(config?: ChatSessionModelConfig) {
    selectedProviderId.value = config?.providerId;
    selectedModelId.value = config?.modelId;
  }

  watch(activeConversationId, (conversationId, previousConversationId) => {
    if (previousConversationId) {
      rememberConversationSessionConfig(previousConversationId);
    }
    if (!conversationId) {
      return;
    }
    applyConversationModelConfig(conversationSessionConfigs.value[conversationId]);
  });

  watch(activeConversationDetail, (detail) => {
    if (!detail) {
      return;
    }
    applyConversationModelConfig(conversationSessionConfigs.value[detail.conversation_id]);
  });

  return { rememberConversationSessionConfig };
}
