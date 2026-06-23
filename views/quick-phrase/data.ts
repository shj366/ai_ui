import type { AIQuickPhraseResult } from '../../api';

import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export const queryQuickPhraseSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'content',
    label: '短语内容',
  },
];

export function useQuickPhraseColumns(
  onActionClick?: OnActionClickFn<AIQuickPhraseResult>,
): VxeGridProps['columns'] {
  return [
    {
      field: 'seq',
      title: $t('common.table.id'),
      type: 'seq',
      width: 50,
    },
    { field: 'title', title: '短语标题', width: 180, align: 'left' },
    { field: 'content', title: '短语内容', align: 'left' },
    { field: 'sort', title: '排序', width: 100 },
    {
      field: 'created_time',
      title: $t('common.table.created_time'),
      width: 168,
    },
    {
      field: 'updated_time',
      title: $t('common.table.updated_time'),
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

export const quickPhraseSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'title',
    label: '短语标题',
    rules: 'required',
  },
  {
    component: 'Textarea',
    componentProps: {
      autoSize: { minRows: 4, maxRows: 8 },
    },
    fieldName: 'content',
    label: '短语内容',
    rules: 'required',
  },
  {
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision: 0,
      step: 1,
    },
    defaultValue: 0,
    fieldName: 'sort',
    label: '排序',
  },
];
