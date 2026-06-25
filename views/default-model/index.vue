<script setup lang="ts">
import type {
  AIDefaultModelParams,
  AIDefaultModelResult,
  AIModelResult,
  AIProviderResult,
} from '../../api';

import { computed, onActivated, onMounted, ref, watch } from 'vue';

import { Page, VbenButton } from '@vben/common-ui';

import { message } from 'antdv-next';

import {
  getAIAssistantDefaultModelOptionalApi,
  getAllAIModelApi,
  getAllAIProviderApi,
  updateAIAssistantDefaultModelApi,
} from '../../api';
import { getProviderTypeLabel } from '../model-service/data';

const providers = ref<AIProviderResult[]>([]);
const models = ref<AIModelResult[]>([]);
const selectedProviderId = ref<number>();
const selectedModelId = ref<string>();
const loading = ref(false);
const modelsLoading = ref(false);
const saving = ref(false);

let currentModelFetchId = 0;
let hasInitialized = false;

const enabledProviders = computed(() => {
  return providers.value.filter((item) => Number(item.status) === 1);
});

const enabledModels = computed(() => {
  return models.value.filter((item) => Number(item.status) === 1);
});

const providerOptions = computed(() => {
  return enabledProviders.value.map((item) => ({
    label: `${item.name} · ${getProviderTypeLabel(item.type)}`,
    value: item.id,
  }));
});

const modelOptions = computed(() => {
  return enabledModels.value.map((item) => ({
    label: item.model_id,
    value: item.model_id,
  }));
});

function applyDefaultModel(model: AIDefaultModelResult) {
  selectedProviderId.value = model.provider_id;
  selectedModelId.value = model.model_id;
}

async function fetchProviders() {
  providers.value = await getAllAIProviderApi();
}

async function fetchDefaultModel() {
  const model = await getAIAssistantDefaultModelOptionalApi();
  if (model) {
    applyDefaultModel(model);
    return;
  }

  selectedProviderId.value = undefined;
  selectedModelId.value = undefined;
}

async function fetchModelsByProvider(providerId?: number) {
  const fetchId = ++currentModelFetchId;

  if (!providerId) {
    models.value = [];
    selectedModelId.value = undefined;
    return;
  }

  modelsLoading.value = true;
  try {
    const data = await getAllAIModelApi({ provider_id: providerId });

    if (fetchId !== currentModelFetchId) {
      return;
    }

    models.value = data;

    if (
      selectedModelId.value &&
      !enabledModels.value.some(
        (item) => item.model_id === selectedModelId.value,
      )
    ) {
      selectedModelId.value = undefined;
    }
  } finally {
    if (fetchId === currentModelFetchId) {
      modelsLoading.value = false;
    }
  }
}

async function refreshPage() {
  loading.value = true;
  try {
    await fetchProviders();
    await fetchDefaultModel();
    await fetchModelsByProvider(selectedProviderId.value);
  } finally {
    loading.value = false;
  }
}

async function submitDefaultModel() {
  if (!selectedProviderId.value || !selectedModelId.value) {
    message.warning('请选择供应商和模型');
    return;
  }

  const payload: AIDefaultModelParams = {
    model_id: selectedModelId.value,
    provider_id: selectedProviderId.value,
    status: 1,
  };

  saving.value = true;
  try {
    await updateAIAssistantDefaultModelApi(payload);
    message.success('默认助手模型已更新');
    const model = await getAIAssistantDefaultModelOptionalApi();
    if (model) {
      applyDefaultModel(model);
    }
  } finally {
    saving.value = false;
  }
}

watch(
  selectedProviderId,
  async (providerId) => {
    await fetchModelsByProvider(providerId);
  },
  { immediate: true },
);

onMounted(async () => {
  await refreshPage();
  hasInitialized = true;
});

onActivated(async () => {
  if (!hasInitialized) {
    return;
  }

  await refreshPage();
});
</script>

<template>
  <Page auto-content-height>
    <div class="flex h-full flex-col gap-4">
      <a-card :loading="loading" title="默认助手模型">
        <div class="flex flex-col gap-4">
          <a-alert show-icon type="info">
            <template #message>
              默认助手模型会作为 AI Chat
              的初始供应商与模型，已进入历史会话后仍以会话自身模型为准
            </template>
          </a-alert>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <div class="mb-2 text-sm font-medium text-foreground">供应商</div>
              <a-select
                v-model:value="selectedProviderId"
                class="w-full"
                :disabled="saving"
                :options="providerOptions"
                placeholder="请选择供应商"
              />
            </div>
            <div>
              <div class="mb-2 text-sm font-medium text-foreground">模型</div>
              <a-select
                v-model:value="selectedModelId"
                class="w-full"
                :disabled="saving || !selectedProviderId"
                :loading="modelsLoading"
                :options="modelOptions"
                placeholder="请选择模型"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <VbenButton
              :loading="saving"
              type="primary"
              @click="submitDefaultModel"
            >
              保存默认模型
            </VbenButton>
          </div>
        </div>
      </a-card>
    </div>
  </Page>
</template>
