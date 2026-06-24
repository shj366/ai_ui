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
