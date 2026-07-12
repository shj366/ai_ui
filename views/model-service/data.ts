import type { AIModelResult, AIProviderResult } from '../../api';

import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

import { DictEnum, getDictOptions } from '#/utils/dict';

export const PROVIDER_TYPE_OPTIONS = [
  { label: 'OpenAI', value: 0 },
  { label: 'Anthropic', value: 1 },
  { label: 'Google', value: 2 },
  { label: 'xAI', value: 3 },
  { label: 'OpenRouter', value: 4 },
  { label: 'OpenAI Responses', value: 5 },
];

export function pickActiveProviderId(
  providers: AIProviderResult[],
  currentId?: number,
): number | undefined {
  if (providers.length === 0) {
    return undefined;
  }
  if (currentId && providers.some((item) => item.id === currentId)) {
    return currentId;
  }
  return providers[0]?.id;
}

export function getProviderTypeLabel(type: number) {
  return (
    PROVIDER_TYPE_OPTIONS.find((item) => item.value === type)?.label ??
    `Type ${type}`
  );
}

export function useModelColumns(
  onActionClick?: OnActionClickFn<AIModelResult>,
): VxeGridProps['columns'] {
  return [
    {
      field: 'seq',
      title: $t('common.table.id'),
      type: 'seq',
      width: 50,
    },
    { field: 'model_id', title: '模型 ID', align: 'left' },
    {
      field: 'context_max_part_chars',
      title: '单段最大字符数',
      width: 140,
      formatter({ cellValue }) {
        return cellValue ?? '不限制';
      },
    },
    {
      field: 'context_max_messages',
      title: '最大消息数',
      width: 120,
      formatter({ cellValue }) {
        return cellValue ?? '不限制';
      },
    },
    {
      field: 'context_keep_messages',
      title: '保留消息数',
      width: 120,
    },
    {
      field: 'context_max_tokens',
      title: '最大 Token',
      width: 120,
      formatter({ cellValue }) {
        return cellValue ?? '关闭';
      },
    },
    {
      field: 'status',
      title: '状态',
      cellRender: {
        name: 'CellTag',
      },
      width: 100,
    },
    {
      field: 'remark',
      title: $t('common.table.mark'),
      align: 'left',
    },
    {
      field: 'created_time',
      title: $t('common.table.created_time'),
      width: 168,
    },
    {
      field: 'operation',
      title: $t('common.table.operation'),
      align: 'center',
      fixed: 'right',
      width: 140,
      cellRender: {
        attrs: {
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: ['edit', 'delete'],
      },
    },
  ];
}

export function createProviderSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: '供应商名称',
      rules: 'required',
    },
    {
      component: 'Select',
      componentProps: {
        class: 'w-full',
        options: PROVIDER_TYPE_OPTIONS,
      },
      defaultValue: 0,
      fieldName: 'type',
      label: '供应商类型',
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'api_host',
      label: 'API Host',
      rules: 'required',
    },
    {
      component: 'InputPassword',
      fieldName: 'api_key',
      label: 'API Key',
      rules: 'required',
    },
    {
      component: 'RadioGroup',
      componentProps: {
        buttonStyle: 'solid',
        options: getDictOptions(DictEnum.SYS_STATUS),
        optionType: 'button',
      },
      defaultValue: 1,
      fieldName: 'status',
      label: '状态',
      rules: 'required',
    },
    {
      component: 'Textarea',
      fieldName: 'remark',
      label: '备注',
    },
  ];
}

export function createModelSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'model_id',
      label: '模型 ID',
      rules: 'required',
    },
    {
      component: 'RadioGroup',
      componentProps: {
        buttonStyle: 'solid',
        options: getDictOptions(DictEnum.SYS_STATUS),
        optionType: 'button',
      },
      defaultValue: 1,
      fieldName: 'status',
      label: '状态',
      rules: 'required',
    },
    {
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 1,
        precision: 0,
      },
      fieldName: 'context_max_part_chars',
      help: '单段模型响应或工具参数超过此字符数时裁剪中间内容，留空表示不裁剪',
      label: '单段最大字符数',
    },
    {
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 1,
        precision: 0,
      },
      fieldName: 'context_max_messages',
      help: '达到此消息数量时裁剪较早消息，留空表示不裁剪',
      label: '最大上下文消息数',
    },
    {
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
      },
      defaultValue: 60,
      fieldName: 'context_keep_messages',
      help: '裁剪后保留的最近消息数量，首条用户消息和完整工具调用链会额外保留',
      label: '裁剪保留消息数',
    },
    {
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 1,
        precision: 0,
      },
      fieldName: 'context_max_tokens',
      help: '用于上下文容量告警，留空表示关闭告警',
      label: '最大上下文 Token',
    },
    {
      component: 'Textarea',
      fieldName: 'remark',
      label: '备注',
    },
  ];
}

export const modelSchema = createModelSchema();

export const queryModelSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'model_id',
    label: '模型 ID',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: getDictOptions(DictEnum.SYS_STATUS),
    },
    fieldName: 'status',
    label: '状态',
  },
];
