<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { AIMcpParams, AIMcpResult } from '#/plugins/ai/api';

import { computed, ref } from 'vue';

import { Page, useVbenModal, VbenButton } from '@vben/common-ui';
import { MaterialSymbolsAdd } from '@vben/icons';
import { $t } from '@vben/locales';

import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createAIMcpApi,
  deleteAIMcpApi,
  getAIMcpListApi,
  updateAIMcpApi,
} from '#/plugins/ai/api';

import {
  formatArgsInput,
  formatEnvInput,
  formatHeadersInput,
  MCP_IMPORT_PLACEHOLDER,
  mcpSchema,
  parseArgsInput,
  parseEnvInput,
  parseHeadersInput,
  parseMcpImportJson,
  queryMcpSchema,
  useMcpColumns,
} from './data';

const formOptions: VbenFormProps = {
  collapsed: true,
  showCollapseButton: true,
  submitButtonOptions: {
    content: $t('common.form.query'),
  },
  schema: queryMcpSchema,
};

const gridOptions: VxeTableGridOptions<AIMcpResult> = {
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
  columns: useMcpColumns(onActionClick),
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues) => {
        return await getAIMcpListApi({
          page: page.currentPage,
          size: page.pageSize,
          ...formValues,
        });
      },
    },
  },
};

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

function onRefresh() {
  gridApi.query();
}

function onActionClick({ code, row }: OnActionClickParams<AIMcpResult>) {
  switch (code) {
    case 'delete': {
      deleteAIMcpApi(row.id).then(() => {
        message.success({
          content: $t('ui.actionMessage.deleteSuccess', [row.name]),
          key: 'action_process_msg',
        });
        onRefresh();
      });
      break;
    }
    case 'edit': {
      modalApi
        .setData({
          ...row,
          args: formatArgsInput(row.args),
          env: formatEnvInput(row.env),
          headers: formatHeadersInput(row.headers),
        })
        .open();
      break;
    }
  }
}

const [Form, formApi] = useVbenForm({
  layout: 'vertical',
  showDefaultActions: false,
  schema: mcpSchema,
});

const importJsonText = ref('');

const [ImportModal, importModalApi] = useVbenModal({
  class: 'w-1/3',
  destroyOnClose: true,
  async onConfirm() {
    let item: AIMcpParams;

    try {
      item = parseMcpImportJson(importJsonText.value);
    } catch (error) {
      message.error((error as Error).message);
      return;
    }

    importModalApi.lock();

    try {
      await createAIMcpApi(item);
      message.success('成功导入 1 个 MCP');
      await importModalApi.close();
      onRefresh();
    } finally {
      importModalApi.unlock();
    }
  },
  onOpenChange(isOpen) {
    if (isOpen) {
      importJsonText.value = '';
    }
  },
});

type AIMcpFormValues = Omit<AIMcpParams, 'args' | 'env' | 'headers'> & {
  args?: null | string;
  env?: null | string;
  headers?: null | string;
  id?: number;
};

const formData = ref<AIMcpFormValues>();

const modalTitle = computed(() => {
  return formData.value?.id
    ? $t('ui.actionTitle.edit', ['MCP'])
    : $t('ui.actionTitle.create', ['MCP']);
});

const [Modal, modalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }

    modalApi.lock();

    try {
      const data = await formApi.getValues<AIMcpFormValues>();
      const payload: AIMcpParams = {
        command: data.command.trim(),
        description: data.description?.trim() || undefined,
        env: parseEnvInput(data.env, '环境变量'),
        args: parseArgsInput(data.args),
        headers: parseHeadersInput(data.headers, '请求头'),
        include_instructions: Boolean(data.include_instructions),
        name: data.name,
        read_timeout: data.read_timeout,
        timeout: data.timeout,
        tool_prefix: data.tool_prefix?.trim() || undefined,
        type: data.type,
        url: data.url?.trim() || undefined,
      };

      await (formData.value?.id
        ? updateAIMcpApi(formData.value.id, payload)
        : createAIMcpApi(payload));
      message.success($t('ui.actionMessage.operationSuccess'));
      await modalApi.close();
      onRefresh();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen) {
    if (isOpen) {
      const data = modalApi.getData<AIMcpFormValues>();
      formApi.resetForm();
      if (data) {
        formData.value = data;
        formApi.setValues(data);
      } else {
        formData.value = undefined;
      }
    }
  },
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <VbenButton @click="() => modalApi.setData(null).open()">
          <MaterialSymbolsAdd class="size-5" />
          新增 MCP
        </VbenButton>
        <VbenButton
          class="ml-2"
          variant="outline"
          @click="importModalApi.setData(null).open()"
        >
          导入 JSON
        </VbenButton>
      </template>
    </Grid>
    <Modal content-class="px-4 py-4 md:px-5 md:py-5" :title="modalTitle">
      <Form />
    </Modal>
    <ImportModal
      content-class="px-4 py-4 md:px-5 md:py-5"
      title="从 JSON 导入 MCP"
    >
      <div class="flex flex-col gap-4">
        <a-alert show-icon type="info">
          <template #message>
            支持导入标准 MCP 配置 JSON，请从 MCP Servers 的介绍页面复制包含
            mcpServers 的配置 JSON，并粘贴到输入框中
          </template>
        </a-alert>
        <a-textarea
          v-model:value="importJsonText"
          :auto-size="{ minRows: 18, maxRows: 18 }"
          :placeholder="MCP_IMPORT_PLACEHOLDER"
        />
      </div>
    </ImportModal>
  </Page>
</template>
