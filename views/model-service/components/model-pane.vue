<script setup lang="ts">
import type {
  AIBatchCreateModelsParams,
  AIModelParams,
  AIModelResult,
  AIProviderModelResult,
  AIProviderResult,
} from '../../../api';

import type { VbenFormProps } from '#/adapter/form';
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { PaginationResult } from '#/types';

import { computed, ref } from 'vue';

import { confirm, useVbenModal, VbenButton } from '@vben/common-ui';
import { MaterialSymbolsAdd } from '@vben/icons';
import { $t } from '@vben/locales';

import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';

import {
  batchCreateAIModelApi,
  createAIModelApi,
  deleteAIModelApi,
  getAIModelListApi,
  getAIProviderModelsApi,
  getAllAIModelApi,
  syncAIProviderModelsApi,
  updateAIModelApi,
} from '../../../api';
import { createModelSchema, queryModelSchema, useModelColumns } from '../data';

const props = defineProps<{
  provider?: AIProviderResult;
}>();

const EMPTY_PAGINATION: PaginationResult<AIModelResult> = {
  items: [],
  links: {},
  page: 1,
  size: 10,
  total: 0,
  total_pages: 0,
};

const formOptions: VbenFormProps = {
  collapsed: true,
  showCollapseButton: true,
  submitButtonOptions: {
    content: $t('common.form.query'),
  },
  schema: queryModelSchema,
};

const gridOptions: VxeTableGridOptions<AIModelResult> = {
  rowConfig: {
    keyField: 'id',
  },
  checkboxConfig: {
    highlight: true,
  },
  height: 'auto',
  exportConfig: {},
  printConfig: {},
  toolbarConfig: {
    custom: true,
    refresh: true,
    refreshOptions: {
      code: 'query',
    },
    zoom: true,
  },
  columns: useModelColumns(onActionClick),
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues) => {
        if (!props.provider) {
          return {
            ...EMPTY_PAGINATION,
            page: page.currentPage,
            size: page.pageSize,
          };
        }

        return await getAIModelListApi({
          ...formValues,
          provider_id: props.provider.id,
          page: page.currentPage,
          size: page.pageSize,
        });
      },
    },
  },
};

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const batchLoading = ref(false);
const batchKeyword = ref('');
const providerModels = ref<AIProviderModelResult[]>([]);
const existingModelIds = ref<string[]>([]);
const selectedProviderModelIds = ref<string[]>([]);

const existingModelIdSet = computed(() => new Set(existingModelIds.value));
const canSyncProviderModels = computed(() => {
  return Boolean(props.provider);
});
const filteredProviderModels = computed(() => {
  const keyword = batchKeyword.value.trim().toLowerCase();

  if (!keyword) {
    return providerModels.value;
  }

  return providerModels.value.filter((item) =>
    item.id.toLowerCase().includes(keyword),
  );
});
const selectableFilteredModelIds = computed(() => {
  return filteredProviderModels.value
    .filter((item) => !existingModelIdSet.value.has(item.id))
    .map((item) => item.id);
});
const selectableModelCount = computed(() => {
  return providerModels.value.filter(
    (item) => !existingModelIdSet.value.has(item.id),
  ).length;
});
const isAllFilteredSelected = computed(() => {
  const availableIds = selectableFilteredModelIds.value;
  return (
    availableIds.length > 0 &&
    availableIds.every((item) => selectedProviderModelIds.value.includes(item))
  );
});
const isPartiallyFilteredSelected = computed(() => {
  const availableIds = selectableFilteredModelIds.value;
  if (availableIds.length === 0) {
    return false;
  }

  const selectedCount = availableIds.filter((item) =>
    selectedProviderModelIds.value.includes(item),
  ).length;

  return selectedCount > 0 && selectedCount < availableIds.length;
});
const selectAllFiltered = computed({
  get: () => isAllFilteredSelected.value,
  set: (checked: boolean) => handleSelectAllFiltered(checked),
});

function onRefresh() {
  gridApi.query();
}

function onActionClick({ code, row }: OnActionClickParams<AIModelResult>) {
  switch (code) {
    case 'delete': {
      deleteAIModelApi([row.id]).then(() => {
        message.success({
          content: $t('ui.actionMessage.deleteSuccess', [row.model_id]),
          key: 'action_process_msg',
        });
        onRefresh();
      });
      break;
    }
    case 'edit': {
      modalApi.setData(row).open();
      break;
    }
  }
}

function isExistingModel(modelId: string) {
  return existingModelIdSet.value.has(modelId);
}

function resetBatchAddState() {
  batchKeyword.value = '';
  providerModels.value = [];
  existingModelIds.value = [];
  selectedProviderModelIds.value = [];
}

function handleSelectAllFiltered(checked: boolean) {
  const nextSelectedIds = new Set(selectedProviderModelIds.value);

  for (const modelId of selectableFilteredModelIds.value) {
    if (checked) {
      nextSelectedIds.add(modelId);
    } else {
      nextSelectedIds.delete(modelId);
    }
  }

  selectedProviderModelIds.value = [...nextSelectedIds];
}

async function syncModels() {
  if (!canSyncProviderModels.value || !props.provider) {
    return;
  }

  await syncAIProviderModelsApi(props.provider.id);
  message.success($t('ui.actionMessage.operationSuccess'));
  onRefresh();
}

function confirmSyncModels() {
  if (!canSyncProviderModels.value || !props.provider) {
    return;
  }

  confirm({
    content: '同步将覆盖当前模型列表，是否继续？',
    icon: 'warning',
  }).then(async () => {
    await syncModels();
  });
}

async function openBatchAddModal() {
  if (!props.provider || !canSyncProviderModels.value) {
    return;
  }

  resetBatchAddState();
  batchAddModalApi.open();
  batchLoading.value = true;

  try {
    const [remoteProviderModels, localModels] = await Promise.all([
      getAIProviderModelsApi(props.provider.id),
      getAllAIModelApi({ provider_id: props.provider.id }),
    ]);

    providerModels.value = remoteProviderModels;
    existingModelIds.value = localModels.map((item) => item.model_id);
  } finally {
    batchLoading.value = false;
  }
}

async function closeBatchAddModal() {
  await batchAddModalApi.close();
}

async function submitBatchAddModels() {
  if (!props.provider) {
    return;
  }

  if (selectedProviderModelIds.value.length === 0) {
    message.warning('请至少选择一个模型');
    return;
  }

  const providerId = props.provider.id;
  const payload: AIBatchCreateModelsParams = {
    items: selectedProviderModelIds.value.map((modelId) => ({
      model_id: modelId,
      provider_id: providerId,
      remark: null,
      status: 1,
    })),
  };

  batchAddModalApi.lock();

  try {
    await batchCreateAIModelApi(payload);
    message.success($t('ui.actionMessage.operationSuccess'));
    await closeBatchAddModal();
    onRefresh();
  } finally {
    batchAddModalApi.unlock();
  }
}

const [BatchAddModal, batchAddModalApi] = useVbenModal({
  class: 'w-[min(720px,92vw)]',
  closeOnClickModal: false,
  confirmText: '添加',
  destroyOnClose: true,
  onConfirm() {
    void submitBatchAddModels();
  },
  onOpenChange(isOpen) {
    if (!isOpen) {
      resetBatchAddState();
    }
  },
  title: '批量添加模型',
});

const [Form, formApi] = useVbenForm({
  layout: 'vertical',
  showDefaultActions: false,
  schema: createModelSchema(),
});

const formData = ref<AIModelResult>();

const modalTitle = computed(() => {
  return formData.value?.id
    ? $t('ui.actionTitle.edit', ['模型'])
    : $t('ui.actionTitle.create', ['模型']);
});

const [Modal, modalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    if (!props.provider) {
      return;
    }

    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }

    modalApi.lock();
    const values =
      await formApi.getValues<Omit<AIModelParams, 'provider_id'>>();
    const payload: AIModelParams = {
      ...values,
      provider_id: props.provider.id,
    };

    try {
      await (formData.value?.id
        ? updateAIModelApi(formData.value.id, payload)
        : createAIModelApi(payload));
      message.success($t('ui.actionMessage.operationSuccess'));
      await modalApi.close();
      onRefresh();
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }

    const data = modalApi.getData<AIModelResult>();
    formApi.resetForm();

    if (data) {
      formData.value = data;
      formApi.setValues(data);
    } else {
      formData.value = undefined;
    }
  },
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card"
  >
    <div
      v-if="!provider"
      class="flex min-h-[320px] flex-1 items-center justify-center"
    >
      <a-empty description="请先新增并选择供应商" />
    </div>

    <template v-else>
      <Grid>
        <template #toolbar-actions>
          <VbenButton @click="() => modalApi.setData(null).open()">
            <MaterialSymbolsAdd class="size-5" />
            新增模型
          </VbenButton>
          <VbenButton
            class="ml-2"
            v-if="canSyncProviderModels"
            variant="outline"
            @click="openBatchAddModal"
          >
            批量添加模型
          </VbenButton>
          <VbenButton
            class="ml-2"
            v-if="canSyncProviderModels"
            variant="outline"
            @click="confirmSyncModels"
          >
            同步模型
          </VbenButton>
        </template>
      </Grid>
      <BatchAddModal content-class="px-4 py-4 md:px-5 md:py-5">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-center">
            <a-input
              v-model:value="batchKeyword"
              allow-clear
              class="md:max-w-[320px]"
              placeholder="搜索模型 ID"
            />
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <a-checkbox
                :disabled="selectableFilteredModelIds.length === 0"
                :indeterminate="isPartiallyFilteredSelected"
                v-model:checked="selectAllFiltered"
              >
                选择当前筛选结果
              </a-checkbox>
              <span>可添加 {{ selectableModelCount }} 个</span>
              <span>已选择 {{ selectedProviderModelIds.length }} 个</span>
            </div>
          </div>

          <div
            class="min-h-[320px] rounded-xl border border-border bg-muted/20"
          >
            <div
              v-if="batchLoading"
              class="flex min-h-[320px] items-center justify-center"
            >
              <a-spin />
            </div>

            <div
              v-else-if="providerModels.length === 0"
              class="flex min-h-[320px] items-center justify-center"
            >
              <a-empty description="供应商暂无可用模型" />
            </div>

            <div
              v-else-if="filteredProviderModels.length === 0"
              class="flex min-h-[320px] items-center justify-center"
            >
              <a-empty description="没有匹配的模型" />
            </div>

            <a-checkbox-group
              v-else
              v-model:value="selectedProviderModelIds"
              class="block h-full w-full"
            >
              <div class="h-full w-full max-h-[420px] overflow-y-auto">
                <div class="w-full space-y-2 p-3">
                  <div
                    v-for="item in filteredProviderModels"
                    :key="item.id"
                    class="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors"
                    :class="
                      isExistingModel(item.id)
                        ? 'bg-muted/35 opacity-75'
                        : 'bg-card/70 hover:border-primary/40 hover:bg-accent/55'
                    "
                  >
                    <a-checkbox
                      :disabled="isExistingModel(item.id)"
                      :value="item.id"
                    >
                      <span class="break-all text-sm text-foreground">
                        {{ item.id }}
                      </span>
                    </a-checkbox>
                    <div class="flex shrink-0 items-center gap-2">
                      <a-tag v-if="isExistingModel(item.id)">已添加</a-tag>
                      <a-tag v-else color="blue">可添加</a-tag>
                    </div>
                  </div>
                </div>
              </div>
            </a-checkbox-group>
          </div>
        </div>
      </BatchAddModal>
      <Modal :title="modalTitle">
        <Form />
      </Modal>
    </template>
  </div>
</template>
