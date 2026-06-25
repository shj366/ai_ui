import type { VbenFormSchema } from '#/adapter/form';

import { DictEnum, getDictOptions } from '#/utils/dict';

export const searchEngineConfigSchema: VbenFormSchema[] = [
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: getDictOptions(DictEnum.SYS_STATUS, { asString: true }),
      optionType: 'button',
    },
    defaultValue: '1',
    fieldName: 'AI_CONFIG_STATUS',
    help: '停用后将使用后端本地配置',
    label: '状态',
    rules: 'required',
  },
  {
    component: 'InputPassword',
    fieldName: 'AI_EXA_API_KEY',
    help: '用于 AI 联网搜索的 Exa API Key',
    label: 'Exa API Key',
  },
  {
    component: 'InputPassword',
    fieldName: 'AI_TAVILY_API_KEY',
    help: '用于 AI 联网搜索的 Tavily API Key',
    label: 'Tavily API Key',
  },
];
