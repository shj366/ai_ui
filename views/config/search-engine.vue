<script setup lang="ts">
import type { AIConfigResult } from '../../api';

import { ref } from 'vue';

import { VbenButton } from '@vben/common-ui';
import { MaterialSymbolsEdit } from '@vben/icons';
import { $t } from '@vben/locales';

import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';

import { getAllAIConfigApi, updateAIConfigApi } from '../../api';
import { searchEngineConfigSchema } from './data';

const [Form, formApi] = useVbenForm({
  commonConfig: {
    controlClass: 'w-full max-w-80',
    disabled: true,
    hideRequiredMark: true,
    labelClass: 'justify-start ml-2',
    labelWidth: 120,
  },
  schema: searchEngineConfigSchema,
  showDefaultActions: false,
});

const configData = ref<AIConfigResult[]>([]);
const editButtonShow = ref(true);
const loading = ref(false);
const saveLoading = ref(false);

function syncSchemaLabels(configs: AIConfigResult[]) {
  formApi.setState((prev) => {
    return {
      schema: prev.schema?.map((item) => {
        const matchedConfig = configs.find(
          (config) => config.key === item.fieldName,
        );
        if (!matchedConfig) {
          return item;
        }

        return {
          ...item,
          help: matchedConfig.remark || item.help,
          label: matchedConfig.name,
        };
      }),
    };
  });
}

function syncFormValues(configs: AIConfigResult[]) {
  const values = Object.fromEntries(
    configs.map((config) => [config.key, config.value]),
  );
  formApi.setValues(values);
}

async function fetchConfigList() {
  loading.value = true;
  try {
    const data = await getAllAIConfigApi();
    configData.value = data;
    syncSchemaLabels(data);
    syncFormValues(data);
  } finally {
    loading.value = false;
  }
}

function setEditing(editing: boolean) {
  editButtonShow.value = !editing;
  formApi.setState({ commonConfig: { disabled: !editing } });
}

async function saveSearchEngineConfig() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }

  const values = await formApi.getValues<Record<string, string>>();
  const nextConfigData = configData.value.map((config) => {
    if (!Object.prototype.hasOwnProperty.call(values, config.key)) {
      return config;
    }

    return {
      ...config,
      value: String(values[config.key] ?? ''),
    };
  });

  saveLoading.value = true;
  try {
    await updateAIConfigApi(nextConfigData);
    message.success($t('ui.actionMessage.operationSuccess'));
    setEditing(false);
    await fetchConfigList();
  } finally {
    saveLoading.value = false;
  }
}

async function cancelEdit() {
  setEditing(false);
  await fetchConfigList();
}

defineExpose({
  fetchConfigList,
});
</script>

<template>
  <a-spin :spinning="loading">
    <div>
      <Form />
      <VbenButton
        v-show="editButtonShow"
        class="ml-1.5 mt-3"
        @click="setEditing(true)"
      >
        <MaterialSymbolsEdit class="mr-1" />
        修改
      </VbenButton>
      <VbenButton
        v-show="!editButtonShow"
        class="ml-1.5 mt-3"
        :loading="saveLoading"
        @click="saveSearchEngineConfig"
      >
        <MaterialSymbolsEdit class="mr-1" />
        保存
      </VbenButton>
      <VbenButton
        v-show="!editButtonShow"
        class="ml-3 mt-3"
        :disabled="saveLoading"
        variant="outline"
        @click="cancelEdit"
      >
        <MaterialSymbolsEdit class="mr-1" />
        取消
      </VbenButton>
    </div>
  </a-spin>
</template>
