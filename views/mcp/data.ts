import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeGridProps } from '#/adapter/vxe-table';
import type { AIMcpParams, AIMcpResult } from '#/plugins/ai/api';

import { $t } from '@vben/locales';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const MCP_TYPE_OPTIONS = [
  { label: 'stdio', value: 0 },
  { label: 'sse', value: 1 },
  { label: 'streamable_http', value: 2 },
];

export const MCP_TYPE_TAG_OPTIONS = [
  { color: 'default', label: 'stdio', value: 0 },
  { color: 'processing', label: 'sse', value: 1 },
  { color: 'success', label: 'streamable_http', value: 2 },
];

const MCP_TYPE_NAME_MAP = {
  stdio: 0,
  sse: 1,
  http: 2,
  'streamable-http': 2,
  streamablehttp: 2,
  streamable_http: 2,
} as const;

const MCP_IMPORT_DEMOS = [
  {
    description: 'Example JSON (stdio)',
    label: 'stdio',
    value: JSON.stringify(
      {
        mcpServers: {
          'stdio-server-example': {
            command: 'npx',
            args: ['-y', 'mcp-server-example'],
          },
        },
      },
      null,
      2,
    ),
  },
  {
    description: 'Example JSON (sse)',
    label: 'sse',
    value: JSON.stringify(
      {
        mcpServers: {
          'sse-server-example': {
            type: 'sse',
            url: 'http://localhost:3000',
          },
        },
      },
      null,
      2,
    ),
  },
  {
    description: 'Example JSON (streamableHttp)',
    label: 'streamableHttp',
    value: JSON.stringify(
      {
        mcpServers: {
          'streamable-http-example': {
            type: 'streamableHttp',
            url: 'http://localhost:3001',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer your-token',
            },
            toolPrefix: 'demo',
            includeInstructions: true,
          },
        },
      },
      null,
      2,
    ),
  },
] as const;

export const MCP_IMPORT_PLACEHOLDER = MCP_IMPORT_DEMOS.map((item) => {
  return [`${item.description}:`, ...item.value.split('\n')]
    .map((line) => {
      return `// ${line}`;
    })
    .join('\n');
}).join('\n\n');

export const queryMcpSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: 'MCP 名称',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: MCP_TYPE_OPTIONS,
    },
    fieldName: 'type',
    label: 'MCP 类型',
  },
];

export function useMcpColumns(
  onActionClick?: OnActionClickFn<AIMcpResult>,
): VxeGridProps['columns'] {
  return [
    {
      field: 'seq',
      title: $t('common.table.id'),
      type: 'seq',
      width: 50,
    },
    { field: 'name', title: 'MCP 名称', width: 160 },
    {
      field: 'type',
      title: 'MCP 类型',
      cellRender: {
        name: 'CellTag',
        options: MCP_TYPE_TAG_OPTIONS,
      },
      width: 140,
    },
    { field: 'description', title: '描述', align: 'left' },
    { field: 'url', title: '端点链接', align: 'left' },
    { field: 'command', title: '命令', align: 'left' },
    { field: 'tool_prefix', title: '工具前缀', width: 120 },
    {
      field: 'include_instructions',
      title: '注入说明',
      width: 100,
      formatter({ cellValue }) {
        return cellValue ? '是' : '否';
      },
    },
    { field: 'timeout', title: '初始化超时(s)', width: 120 },
    { field: 'read_timeout', title: '读取超时(s)', width: 120 },
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

export const mcpSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: 'MCP 名称',
    rules: 'required',
  },
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: MCP_TYPE_OPTIONS,
      optionType: 'button',
    },
    defaultValue: 0,
    fieldName: 'type',
    label: 'MCP 类型',
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'url',
    label: '端点链接',
    dependencies: {
      show: (values) => values?.type !== 0,
      triggerFields: ['type'],
    },
  },
  {
    component: 'Input',
    fieldName: 'command',
    label: '启动命令',
    rules: 'required',
  },
  {
    component: 'Textarea',
    componentProps: {
      autoSize: { minRows: 4, maxRows: 10 },
      placeholder:
        'Authorization=Bearer your-token\nContent-Type=application/json',
    },
    fieldName: 'headers',
    help: '格式为 KEY=VALUE，每行一个',
    label: '请求头',
    dependencies: {
      show: (values) => values?.type !== 0,
      triggerFields: ['type'],
    },
  },
  {
    component: 'Textarea',
    componentProps: {
      autoSize: { minRows: 4, maxRows: 10 },
      placeholder: '--config\n--verbose',
    },
    fieldName: 'args',
    help: '每行一个参数',
    label: '命令参数',
    dependencies: {
      show: (values) => values?.type === 0,
      triggerFields: ['type'],
    },
  },
  {
    component: 'Textarea',
    componentProps: {
      autoSize: { minRows: 4, maxRows: 10 },
      placeholder: 'OPENAI_API_KEY=sk-xxx\nOPENAI_BASE_URL=https://example.com',
    },
    fieldName: 'env',
    help: '格式为 KEY=VALUE，每行一个',
    label: '环境变量',
    dependencies: {
      show: (values) => values?.type === 0,
      triggerFields: ['type'],
    },
  },
  {
    component: 'Input',
    componentProps: {
      placeholder: '例如 server_name',
    },
    fieldName: 'tool_prefix',
    help: '可选；用于避免多个 MCP 的工具名称冲突',
    label: '工具名称前缀',
  },
  {
    component: 'Switch',
    defaultValue: false,
    fieldName: 'include_instructions',
    help: '开启后会把 MCP 服务说明注入到模型上下文',
    label: '注入 MCP 服务说明',
  },
  {
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      step: 0.5,
    },
    defaultValue: 5,
    fieldName: 'timeout',
    label: '初始化超时(s)',
  },
  {
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      step: 1,
    },
    defaultValue: 300,
    fieldName: 'read_timeout',
    label: '读取超时(s)',
  },
  {
    component: 'Textarea',
    fieldName: 'description',
    label: '描述',
  },
];

export function formatArgsInput(value?: null | string[]) {
  if (!value || value.length === 0) {
    return '';
  }

  return value.join('\n');
}

export function parseArgsInput(value: null | string | undefined) {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }

  return text
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatEnvInput(value?: null | Record<string, any>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  return Object.entries(value)
    .map(([key, itemValue]) => `${key}=${itemValue ?? ''}`)
    .join('\n');
}

export function parseEnvInput(value: null | string | undefined, label: string) {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`${label} 必须是 KEY=VALUE 格式，每行一个`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const envValue = line.slice(separatorIndex + 1).trim();

    if (!key) {
      throw new Error(`${label} 的 KEY 不能为空`);
    }

    result[key] = envValue;
  }

  return result;
}

export function formatHeadersInput(value?: null | Record<string, any>) {
  return formatEnvInput(value);
}

export function parseHeadersInput(
  value: null | string | undefined,
  label: string,
) {
  return parseEnvInput(value, label);
}

export function parseMcpImportJson(value: string): AIMcpParams {
  const text = value.trim();
  if (!text) {
    throw new Error('请输入 JSON 内容');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式不正确');
  }

  if (!isRecord(parsed)) {
    throw new Error('请输入标准 MCP 配置 JSON 对象');
  }

  if (!isRecord(parsed.mcpServers)) {
    throw new Error('请粘贴包含 mcpServers 的标准 MCP 配置 JSON');
  }

  const servers = Object.entries(parsed.mcpServers);
  if (servers.length === 0) {
    throw new Error('mcpServers 不能为空对象');
  }

  if (servers.length !== 1) {
    throw new Error(
      '当前仅支持导入单个 MCP，请确保 mcpServers 中只包含一项配置',
    );
  }

  const firstServer = servers[0];
  if (!firstServer) {
    throw new Error('mcpServers 不能为空对象');
  }

  const [serverName, item] = firstServer;
  if (!isRecord(item)) {
    throw new Error('服务器配置必须是 JSON 对象');
  }

  const name = serverName.trim();
  if (!name) {
    throw new Error('服务器名称不能为空');
  }

  const command =
    typeof item.command === 'string' && item.command.trim()
      ? item.command.trim()
      : undefined;
  const url =
    typeof item.url === 'string' && item.url.trim()
      ? item.url.trim()
      : undefined;

  let type: number | undefined;
  if (command) {
    type = 0;
  } else if (url) {
    const transportValue = item.transportType ?? item.type ?? item.transport;
    if (typeof transportValue === 'string') {
      const normalizedTransport = transportValue
        .trim()
        .toLowerCase()
        .replaceAll(/\s+/gu, '_');
      if (normalizedTransport in MCP_TYPE_NAME_MAP) {
        type =
          MCP_TYPE_NAME_MAP[
            normalizedTransport as keyof typeof MCP_TYPE_NAME_MAP
          ];
      }
    }

    if (type !== 1 && type !== 2) {
      type = /\/sse(?:[/?#]|$)/u.test(url) ? 1 : 2;
    }
  }

  if (type === undefined) {
    throw new Error(`MCP ${name} 必须至少包含 command 或 url`);
  }

  let args: string[] | undefined;
  if (item.args !== null && item.args !== undefined && item.args !== '') {
    if (
      !Array.isArray(item.args) ||
      item.args.some((arg) => typeof arg !== 'string')
    ) {
      throw new Error(`MCP ${name} 的 args 必须是字符串数组`);
    }

    args = item.args.map((arg) => arg.trim()).filter(Boolean);
    if (args.length === 0) {
      args = undefined;
    }
  }

  let env: Record<string, string> | undefined;
  if (item.env !== null && item.env !== undefined && item.env !== '') {
    if (!isRecord(item.env)) {
      throw new Error(`MCP ${name} 的 env 必须是 JSON 对象`);
    }

    env = Object.fromEntries(
      Object.entries(item.env).map(([key, itemValue]) => [
        key,
        String(itemValue ?? ''),
      ]),
    );
  }

  let headers: Record<string, string> | undefined;
  if (
    item.headers !== null &&
    item.headers !== undefined &&
    item.headers !== ''
  ) {
    if (!isRecord(item.headers)) {
      throw new Error(`MCP ${name} 的 headers 必须是 JSON 对象`);
    }

    headers = Object.fromEntries(
      Object.entries(item.headers).map(([key, itemValue]) => [
        key,
        String(itemValue ?? ''),
      ]),
    );
  }

  const description =
    typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : undefined;

  const rawToolPrefix = item.tool_prefix ?? item.toolPrefix;
  const toolPrefix =
    typeof rawToolPrefix === 'string' && rawToolPrefix.trim()
      ? rawToolPrefix.trim()
      : undefined;

  const rawIncludeInstructions =
    item.include_instructions ?? item.includeInstructions;
  if (
    rawIncludeInstructions !== null &&
    rawIncludeInstructions !== undefined &&
    typeof rawIncludeInstructions !== 'boolean'
  ) {
    throw new Error(`MCP ${name} 的 include_instructions 必须是布尔值`);
  }

  const timeout = item.timeout;
  if (
    timeout !== null &&
    timeout !== undefined &&
    timeout !== '' &&
    (typeof timeout !== 'number' || Number.isNaN(timeout) || timeout < 0)
  ) {
    throw new Error(`MCP ${name} 的 timeout 必须是大于等于 0 的数字`);
  }

  const readTimeout = item.read_timeout;
  if (
    readTimeout !== null &&
    readTimeout !== undefined &&
    readTimeout !== '' &&
    (typeof readTimeout !== 'number' ||
      Number.isNaN(readTimeout) ||
      readTimeout < 0)
  ) {
    throw new Error(`MCP ${name} 的 read_timeout 必须是大于等于 0 的数字`);
  }

  return {
    args,
    command: command ?? '',
    description,
    env,
    headers,
    include_instructions:
      typeof rawIncludeInstructions === 'boolean'
        ? rawIncludeInstructions
        : undefined,
    name,
    read_timeout: typeof readTimeout === 'number' ? readTimeout : undefined,
    timeout: typeof timeout === 'number' ? timeout : undefined,
    tool_prefix: toolPrefix,
    type,
    url,
  };
}
