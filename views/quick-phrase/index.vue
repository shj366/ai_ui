<script setup lang="ts">
import type { AIQuickPhraseParams, AIQuickPhraseResult } from '../../api';

import type { VbenFormProps } from '#/adapter/form';
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';

import { computed, ref } from 'vue';

import { Page, useVbenModal, VbenButton } from '@vben/common-ui';
import { MaterialSymbolsAdd } from '@vben/icons';
import { $t } from '@vben/locales';

import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';

import {
  createAIQuickPhraseApi,
  deleteAIQuickPhraseApi,
  getAIQuickPhraseListApi,
  updateAIQuickPhraseApi,
} from '../../api';
import {
  queryQuickPhraseSchema,
  quickPhraseSchema,
  useQuickPhraseColumns,
} from './data';

const formOptions: VbenFormProps = {
  collapsed: true,
  showCollapseButton: true,
  submitButtonOptions: {
    content: $t('common.form.query'),
  },
  schema: queryQuickPhraseSchema,
};

const gridOptions: VxeTableGridOptions<AIQuickPhraseResult> = {
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
  columns: useQuickPhraseColumns(onActionClick),
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues) => {
        return await getAIQuickPhraseListApi({
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

function onActionClick({
  code,
  row,
}: OnActionClickParams<AIQuickPhraseResult>) {
  switch (code) {
    case 'delete': {
      deleteAIQuickPhraseApi(row.id).then(() => {
        message.success({
          content: $t('ui.actionMessage.deleteSuccess', [row.title]),
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

const [Form, formApi] = useVbenForm({
  layout: 'vertical',
  showDefaultActions: false,
  schema: quickPhraseSchema,
});

const formData = ref<AIQuickPhraseResult>();

const modalTitle = computed(() => {
  return formData.value?.id
    ? $t('ui.actionTitle.edit', ['快捷短语'])
    : $t('ui.actionTitle.create', ['快捷短语']);
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
      const data = await formApi.getValues<AIQuickPhraseParams>();
      await (formData.value?.id
        ? updateAIQuickPhraseApi(formData.value.id, data)
        : createAIQuickPhraseApi(data));
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
      const data = modalApi.getData<AIQuickPhraseResult>();
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
          新增短语
        </VbenButton>
      </template>
    </Grid>
    <Modal content-class="px-4 py-4 md:px-5 md:py-5" :title="modalTitle">
      <Form />
    </Modal>
  </Page>
</template>
