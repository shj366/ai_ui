<script setup lang="ts">
import type { AIModelResult, AIProviderResult } from '../../../api';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorShortcut,
  ModelSelectorTrigger,
} from '#/plugins/ai/components/ai-elements';

const props = defineProps<{
  disabled?: boolean;
  loading?: boolean;
  models: AIModelResult[];
  providers: AIProviderResult[];
  selectedModelId?: string;
  selectedProviderId?: number;
}>();

const emit = defineEmits<{
  (event: 'select-model', model: AIModelResult): void;
}>();

const open = ref(false);

const selectedProvider = computed(() =>
  props.providers.find((item) => item.id === props.selectedProviderId),
);

const selectedModel = computed(() =>
  props.models.find(
    (item) =>
      item.provider_id === props.selectedProviderId &&
      item.model_id === props.selectedModelId,
  ),
);

const triggerLabel = computed(() => {
  return selectedModel.value?.model_id ?? props.selectedModelId ?? '请选择模型';
});

const triggerTitle = computed(() => {
  const provider = selectedProvider.value?.name ?? '请选择供应商';
  return `${provider} / ${triggerLabel.value}`;
});

const enabledProviders = computed(() =>
  props.providers.filter((item) => Number(item.status) === 1),
);

const enabledModels = computed(() =>
  props.models.filter((item) => Number(item.status) === 1),
);

const providerModelGroups = computed(() =>
  enabledProviders.value
    .map((provider) => ({
      models: enabledModels.value.filter(
        (model) => model.provider_id === provider.id,
      ),
      provider,
    }))
    .filter((group) => group.models.length > 0),
);

function selectModel(model: AIModelResult) {
  emit('select-model', model);
  open.value = false;
}
</script>

<template>
  <ModelSelector v-model:open="open">
    <ModelSelectorTrigger as-child>
      <button
        class="ai-model-selector-trigger inline-flex h-8 min-w-0 max-w-[280px] items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabled"
        :title="triggerTitle"
        type="button"
      >
        <IconifyIcon class="size-4 shrink-0" icon="simple-icons:openai" />
        <span class="truncate">{{ triggerLabel }}</span>
        <IconifyIcon
          class="size-3.5 shrink-0 text-muted-foreground/80"
          icon="mdi:chevron-down"
        />
      </button>
    </ModelSelectorTrigger>

    <ModelSelectorContent title="选择 AI 模型">
      <ModelSelectorInput placeholder="搜索供应商或模型" />
      <ModelSelectorList>
        <ModelSelectorEmpty>
          暂无可用模型
        </ModelSelectorEmpty>

        <template
          v-for="(group, groupIndex) in providerModelGroups"
          :key="group.provider.id"
        >
          <ModelSelectorSeparator v-if="groupIndex > 0" />

          <ModelSelectorGroup :heading="group.provider.name">
            <ModelSelectorItem
              v-for="model in group.models"
              :key="model.id"
              class="gap-2"
              :value="`provider-${group.provider.name}-model-${model.model_id}`"
              @select="selectModel(model)"
            >
              <IconifyIcon
                class="size-4 shrink-0"
                :icon="
                  model.provider_id === selectedProviderId &&
                  model.model_id === selectedModelId
                    ? 'mdi:check-circle'
                    : 'mdi:cube-outline'
                "
              />
              <ModelSelectorName>
                {{ model.model_id }}
              </ModelSelectorName>
              <ModelSelectorShortcut
                v-if="
                  model.provider_id === selectedProviderId &&
                  model.model_id === selectedModelId
                "
              >
                已选
              </ModelSelectorShortcut>
            </ModelSelectorItem>
          </ModelSelectorGroup>
        </template>

        <div
          v-if="!loading && providerModelGroups.length === 0"
          class="px-3 py-2 text-xs text-muted-foreground"
        >
          暂无启用模型，请先在模型服务中同步或启用模型
        </div>

        <div
          v-if="loading"
          class="px-3 py-2 text-xs text-muted-foreground"
        >
          正在加载模型...
        </div>
      </ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelector>
</template>
