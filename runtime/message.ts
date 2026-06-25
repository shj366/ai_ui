import type {
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
  AIChatMessage,
  AIChatMessageBlock,
  AIChatMessageDetail,
  AIChatReasoningMessageBlock,
  AIChatTextMessageBlock,
} from '../types/message';

export function uniqueAIChatEventTypes(
  ...values: Array<Array<null | string | undefined> | null | string | undefined>
) {
  const result: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && !result.includes(item)) {
          result.push(item);
        }
      }
      continue;
    }
    if (value && !result.includes(value)) {
      result.push(value);
    }
  }
  return result;
}

export function normalizeAIChatEventBlock(
  block: AIChatEventMessageBlock,
): AIChatEventMessageBlock {
  return {
    data: block.data,
    event_key: block.event_key,
    event_type: block.event_type,
    event_types: uniqueAIChatEventTypes(
      block.event_types ?? [],
      block.event_type,
    ),
    status: block.status ?? 'info',
    summary: block.summary ?? '',
    text: block.text ?? '',
    title: block.title,
    type: 'event',
  };
}

export function normalizeAIChatFileBlock(
  block: AIChatFileMessageBlock,
): AIChatFileMessageBlock {
  return {
    file_type: block.file_type ?? null,
    mime_type: block.mime_type ?? null,
    name: block.name ?? null,
    source_type: block.source_type ?? null,
    type: 'file',
    url: block.url ?? null,
  };
}

export function normalizeAIChatTextLikeBlock<
  T extends AIChatReasoningMessageBlock | AIChatTextMessageBlock,
>(block: T): T {
  return { text: block.text ?? '', type: block.type } as T;
}

function normalizeAIChatMessageBlock(
  block: AIChatMessageBlock,
): AIChatMessageBlock {
  if (block.type === 'event') {
    return normalizeAIChatEventBlock(block);
  }
  if (block.type === 'file') {
    return normalizeAIChatFileBlock(block);
  }
  return normalizeAIChatTextLikeBlock(block);
}

export type ChatMessageItem = AIChatMessageDetail & {
  id: string;
  streaming?: boolean;
};

export interface AIChatProviderMessage {
  blocks: AIChatMessageBlock[];
  conversation_id?: null | string;
  created_time: string;
  message_id?: null | string;
  message_type: AIChatMessage['message_type'];
  model_id?: null | string;
  provider_id?: null | number;
  role: AIChatMessage['role'];
}

export type ChatTransientStatus =
  | 'abort'
  | 'error'
  | 'loading'
  | 'local'
  | 'success'
  | 'updating';

export function buildMessageId(seedValue?: null | number | string) {
  return `${seedValue ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeConversationTitle(text: string) {
  return text.replaceAll(/\s+/gu, ' ').trim().slice(0, 24) || '新话题';
}

export function parseDateLabel(value?: null | string, withDate = true) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: withDate ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    month: withDate ? '2-digit' : undefined,
  }).format(date);
}

export function parseJsonField<T>(
  raw: string,
  label: string,
  validator?: (value: T) => boolean,
) {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }

  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} 必须是合法 JSON`);
  }

  if (validator && !validator(parsed)) {
    throw new Error(`${label} 格式不正确`);
  }

  return parsed;
}

export function mergeModelContent(previous: string, incoming: string) {
  if (!previous) {
    return incoming;
  }
  if (!incoming) {
    return previous;
  }
  if (incoming.startsWith(previous)) {
    return incoming;
  }
  return `${previous}${incoming}`;
}

export function createTextBlock(text = ''): AIChatTextMessageBlock {
  return {
    text,
    type: 'text',
  };
}

export function getBlocksByType<T extends AIChatMessageBlock['type']>(
  message: Pick<AIChatMessage, 'blocks'>,
  type: T,
): Array<Extract<AIChatMessageBlock, { type: T }>> {
  return (message.blocks ?? []).filter(
    (block): block is Extract<AIChatMessageBlock, { type: T }> =>
      block.type === type,
  );
}

export function getMessageTextContent(
  message: Pick<AIChatMessage, 'blocks'>,
  type: 'reasoning' | 'text' = 'text',
) {
  return getBlocksByType(message, type)
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n\n');
}

export function getMessageFileBlocks(message: Pick<AIChatMessage, 'blocks'>) {
  return getBlocksByType(message, 'file');
}

export function getMessageEventBlocks(message: Pick<AIChatMessage, 'blocks'>) {
  return getBlocksByType(message, 'event');
}

export function replaceMessageTextBlocks(
  message: ChatMessageItem,
  content: string,
): ChatMessageItem {
  const nextBlocks = [
    ...getBlocksByType(message, 'event'),
    ...getBlocksByType(message, 'file'),
    ...getBlocksByType(message, 'reasoning'),
    createTextBlock(content),
  ];

  return {
    ...message,
    blocks: nextBlocks,
  };
}

export function normalizeMessage(
  item: AIChatMessage | AIChatMessageDetail,
  fallbackIndex: number,
  activeConversationId?: null | string,
): ChatMessageItem {
  return {
    blocks: (item.blocks ?? []).map((block) =>
      normalizeAIChatMessageBlock(block),
    ),
    conversation_id: item.conversation_id ?? activeConversationId ?? null,
    created_time: item.created_time,
    id: buildMessageId(
      item.message_id ?? item.message_index ?? `${item.role}-${fallbackIndex}`,
    ),
    message_id: item.message_id ?? null,
    message_index: item.message_index ?? fallbackIndex,
    message_type: item.message_type ?? 'normal',
    model_id: item.model_id ?? null,
    provider_id: item.provider_id ?? null,
    role: item.role,
    streaming: false,
  };
}

export function createProviderSeedMessage(
  createdTime = new Date().toISOString(),
): AIChatProviderMessage {
  return {
    blocks: [],
    created_time: createdTime,
    message_type: 'normal',
    role: 'assistant',
  };
}

export function createProviderUserMessage(
  content: string,
  createdTime = new Date().toISOString(),
): AIChatProviderMessage {
  return {
    blocks: [createTextBlock(content)],
    created_time: createdTime,
    message_type: 'normal',
    role: 'user',
  };
}

function normalizeProviderMessage(
  message: AIChatProviderMessage,
  fallbackIndex: number,
): ChatMessageItem[] {
  const item = normalizeMessage(
    {
      blocks: message.blocks,
      conversation_id: message.conversation_id,
      created_time: message.created_time,
      message_id: null,
      message_type: message.message_type,
      model_id: message.model_id ?? null,
      provider_id: message.provider_id ?? null,
      role: message.role,
    },
    fallbackIndex,
    message.conversation_id,
  );

  item.id = `${message.message_id ?? `provider-${fallbackIndex}`}-${message.role}`;
  return [item];
}

function hasReasoningBlocks(message: Pick<AIChatMessage, 'blocks'>) {
  return getBlocksByType(message, 'reasoning').length > 0;
}

function shouldMergeAssistantMessages(
  current: ChatMessageItem | undefined,
  incoming: ChatMessageItem,
) {
  if (
    !current ||
    current.role !== 'assistant' ||
    incoming.role !== 'assistant'
  ) {
    return false;
  }

  if (current.message_type === 'error' || incoming.message_type === 'error') {
    return false;
  }

  if (!hasReasoningBlocks(current) && !hasReasoningBlocks(incoming)) {
    return false;
  }

  if (
    current.conversation_id &&
    incoming.conversation_id &&
    current.conversation_id !== incoming.conversation_id
  ) {
    return false;
  }

  if (
    current.model_id &&
    incoming.model_id &&
    current.model_id !== incoming.model_id
  ) {
    return false;
  }

  if (
    current.provider_id !== null &&
    current.provider_id !== undefined &&
    incoming.provider_id !== null &&
    incoming.provider_id !== undefined &&
    current.provider_id !== incoming.provider_id
  ) {
    return false;
  }

  return true;
}

function mergeChatMessageItems(
  current: ChatMessageItem,
  incoming: ChatMessageItem,
): ChatMessageItem {
  return {
    ...incoming,
    blocks: mergeMessageBlocks(current.blocks ?? [], incoming.blocks ?? []),
    conversation_id:
      incoming.conversation_id ?? current.conversation_id ?? null,
    created_time: current.created_time || incoming.created_time,
    id: incoming.id || current.id,
    message_id: incoming.message_id ?? current.message_id ?? null,
    message_index: incoming.message_index ?? current.message_index,
    message_type: incoming.message_type ?? current.message_type ?? 'normal',
    model_id: incoming.model_id ?? current.model_id ?? null,
    provider_id: incoming.provider_id ?? current.provider_id ?? null,
    role: incoming.role,
    streaming: Boolean(current.streaming || incoming.streaming),
  };
}

export function mergeAdjacentAssistantMessages(messages: ChatMessageItem[]) {
  const merged: ChatMessageItem[] = [];

  for (const message of messages) {
    const current = merged.at(-1);

    if (!current || !shouldMergeAssistantMessages(current, message)) {
      merged.push(message);
      continue;
    }

    merged[merged.length - 1] = mergeChatMessageItems(current, message);
  }

  return merged;
}

function getBlockMergeKey(block: AIChatMessageBlock) {
  if (block.type === 'event') {
    return `event:${block.event_key}`;
  }

  if (block.type === 'file') {
    return `file:${block.file_type ?? ''}:${block.name ?? ''}:${block.url ?? ''}`;
  }

  return block.type;
}

export function mergeMessageBlocks(
  currentBlocks: AIChatMessageBlock[],
  incomingBlocks: AIChatMessageBlock[],
) {
  const merged = currentBlocks.map((block) =>
    normalizeAIChatMessageBlock(block),
  );

  for (const incoming of incomingBlocks.map((block) =>
    normalizeAIChatMessageBlock(block),
  )) {
    const index = merged.findIndex(
      (block) => getBlockMergeKey(block) === getBlockMergeKey(incoming),
    );

    if (incoming.type === 'event') {
      if (index === -1) {
        merged.push(incoming);
      } else {
        const previous = merged[index] as AIChatEventMessageBlock;
        merged[index] = normalizeAIChatEventBlock({
          ...previous,
          ...incoming,
          data: incoming.data ?? previous.data,
          event_type: incoming.event_type,
          event_types: uniqueAIChatEventTypes(
            previous.event_types ?? [previous.event_type],
            incoming.event_types ?? [incoming.event_type],
            incoming.event_type,
          ),
          status: incoming.status ?? previous.status,
          summary: incoming.summary ?? previous.summary,
          text: mergeModelContent(previous.text ?? '', incoming.text ?? ''),
          title: incoming.title || previous.title,
          type: 'event',
        });
      }
      continue;
    }

    if (incoming.type === 'file') {
      if (index === -1) {
        merged.push(incoming);
      } else {
        merged[index] = normalizeAIChatFileBlock({
          ...(merged[index] as AIChatFileMessageBlock),
          ...incoming,
        });
      }
      continue;
    }

    if (index === -1) {
      merged.push(incoming);
      continue;
    }

    const previous = merged[index] as
      | AIChatReasoningMessageBlock
      | AIChatTextMessageBlock;
    merged[index] = normalizeAIChatTextLikeBlock({
      ...previous,
      text: mergeModelContent(previous.text ?? '', incoming.text ?? ''),
      type: incoming.type,
    });
  }

  return merged;
}

export function mergeStreamMessage(
  current: AIChatProviderMessage | undefined,
  incoming: AIChatProviderMessage,
): AIChatProviderMessage {
  return {
    ...incoming,
    blocks: mergeMessageBlocks(current?.blocks ?? [], incoming.blocks),
    conversation_id:
      incoming.conversation_id ?? current?.conversation_id ?? null,
    created_time:
      incoming.created_time ||
      current?.created_time ||
      new Date().toISOString(),
    message_id: incoming.message_id ?? current?.message_id,
    message_type: incoming.message_type ?? current?.message_type ?? 'normal',
    model_id: incoming.model_id ?? current?.model_id ?? null,
    provider_id: incoming.provider_id ?? current?.provider_id ?? null,
  };
}

export function providerMessageToChatMessage(
  originMessage: AIChatProviderMessage | undefined,
  incoming: AIChatProviderMessage,
): AIChatProviderMessage {
  if (incoming.role === 'assistant') {
    return mergeStreamMessage(originMessage, incoming);
  }

  return incoming;
}

function resolveTransientEventBlockStatus(
  block: AIChatEventMessageBlock,
  status: ChatTransientStatus,
): AIChatEventMessageBlock['status'] {
  const currentStatus = block.status ?? 'info';

  if (currentStatus !== 'running' && currentStatus !== 'info') {
    return currentStatus;
  }

  switch (status) {
    case 'abort': {
      return 'abort';
    }
    case 'error': {
      return 'error';
    }
    case 'success': {
      return 'success';
    }
    default: {
      return currentStatus;
    }
  }
}

function applyTransientEventBlockStatus(
  item: ChatMessageItem,
  status: ChatTransientStatus,
): ChatMessageItem {
  if (item.role !== 'assistant') {
    return item;
  }

  return {
    ...item,
    blocks: item.blocks.map((block) => {
      if (block.type !== 'event') {
        return block;
      }

      return normalizeAIChatEventBlock({
        ...block,
        status: resolveTransientEventBlockStatus(block, status),
      });
    }),
  };
}

export function buildTransientMessageItems(
  providerMessage: AIChatProviderMessage | undefined,
  fallbackIndex: number,
  status: ChatTransientStatus,
) {
  if (!providerMessage) {
    return [];
  }

  return normalizeProviderMessage(providerMessage, fallbackIndex).map(
    (item) => {
      const nextItem = applyTransientEventBlockStatus(item, status);

      return {
        ...nextItem,
        streaming:
          nextItem.role === 'assistant' &&
          (status === 'loading' || status === 'updating'),
      };
    },
  );
}
