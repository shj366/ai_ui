import type {
  ActionsProps,
  BubbleItemType,
  BubbleListProps,
  BubbleProps,
  FileCardProps,
  ThoughtChainItemType,
} from '@antdv-next/x';

import type { Component, VNodeChild } from 'vue';

import type { AIChatProtocolDriver } from '../../../protocols';
import type { ChatMessageItem } from '../../../runtime/message';
import type {
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
} from '../../../types/message';
import type {
  AIChatRenderableBlock,
  AIChatRenderableEventItem,
} from '../../../types/render';
import type {
  MarkdownSourceItems,
  MarkdownStreamingState,
} from '../renderers/markdown-content';

import { h, resolveComponent } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Actions,
  ActionsCopy,
  FileCardList,
  Sources,
  Think,
  ThoughtChain,
} from '@antdv-next/x';

import {
  getMessageEventBlocks,
  getMessageFileBlocks,
  getMessageTextContent,
  parseDateLabel,
} from '../../../runtime/message';
import { AIJsonPreview } from '../renderers/custom/json-preview';
import { AIUnsupportedBlock } from '../renderers/custom/unsupported-block';
import {
  createAIReplyMarkdownStreaming,
  createMarkdownContentRenderer,
  formatByteSize,
  getDataUrlInfo,
  isDataUrl,
  normalizeInlineSourceItems,
  renderCodeBlock,
  renderMermaidBlock,
} from '../renderers/markdown-content';

export interface CreateChatBubbleListRoleOptions {
  editingMessageIntent: 'resend' | 'save';
  isDark: boolean;
  isEditingMessage: (message: ChatMessageItem) => boolean;
  isThinkingExpanded: (message: ChatMessageItem) => boolean;
  onBeginEditMessage: (
    message: ChatMessageItem,
    intent: 'resend' | 'save',
  ) => void;
  onCancelEditMessage: () => void;
  onConfirmDeleteMessage: (message: ChatMessageItem) => void;
  onRegenerateMessage: (message: ChatMessageItem) => void;
  onRegenerateUserMessage: (message: ChatMessageItem) => void;
  onResendEditedMessage: (content: string) => void;
  onSaveEditedMessage: (content: string) => void;
  protocolDriver: AIChatProtocolDriver;
  selectedModelLabel?: string;
  selectedModelId?: null | string;
  setThinkingExpanded: (message: ChatMessageItem, expanded: boolean) => void;
}

const MAX_DATA_URL_PREVIEW_BYTES = 8 * 1024 * 1024;
const REASONING_END_EVENT_TYPES = new Set([
  'REASONING_END',
  'REASONING_MESSAGE_END',
  'THINKING_END',
  'THINKING_TEXT_MESSAGE_END',
]);
const REASONING_RUNNING_EVENT_TYPES = new Set([
  'REASONING_MESSAGE_CHUNK',
  'REASONING_MESSAGE_CONTENT',
  'REASONING_MESSAGE_START',
  'REASONING_START',
  'THINKING_START',
  'THINKING_TEXT_MESSAGE_CONTENT',
  'THINKING_TEXT_MESSAGE_START',
]);
const TOOL_CALL_ARG_EVENT_TYPES = new Set([
  'TOOL_CALL_ARGS',
  'TOOL_CALL_CHUNK',
]);
const TOOL_CALL_END_EVENT_TYPES = new Set(['TOOL_CALL_END']);
const TOOL_CALL_EVENT_TYPES = new Set([
  'TOOL_CALL_ARGS',
  'TOOL_CALL_CHUNK',
  'TOOL_CALL_END',
  'TOOL_CALL_RESULT',
  'TOOL_CALL_START',
]);
const TOOL_CALL_RESULT_EVENT_TYPES = new Set(['TOOL_CALL_RESULT']);
const ACTIVITY_EVENT_TYPES = new Set(['ACTIVITY_DELTA', 'ACTIVITY_SNAPSHOT']);

function eventBlockHasAnyType(
  block: AIChatEventMessageBlock,
  eventTypes: Set<string>,
) {
  return [block.event_type, ...(block.event_types ?? [])].some((eventType) =>
    eventTypes.has(eventType),
  );
}

function getBubbleListMessage(item: BubbleItemType) {
  const message = item.extraInfo?.message;
  return message && typeof message === 'object'
    ? (message as ChatMessageItem)
    : undefined;
}

function getThinkingToggleLabel(message: ChatMessageItem) {
  if (isThinkingActive(message)) {
    return '思考中';
  }
  return '思考完成';
}

function isThinkingActive(message: ChatMessageItem) {
  if (
    !message.streaming ||
    !getMessageTextContent(message, 'reasoning').trim() ||
    getMessageTextContent(message, 'text').trim()
  ) {
    return false;
  }

  const events = getMessageEventBlocks(message);
  const hasReasoningEnd = events.some((event) =>
    eventBlockHasAnyType(event, REASONING_END_EVENT_TYPES),
  );
  if (hasReasoningEnd) {
    return false;
  }

  const hasRunningReasoningEvent = events.some(
    (event) =>
      event.status === 'running' &&
      ((event.event_types ?? []).some((type) =>
        REASONING_RUNNING_EVENT_TYPES.has(type),
      ) ||
        REASONING_RUNNING_EVENT_TYPES.has(event.event_type)),
  );

  return hasRunningReasoningEvent || !hasReasoningEnd;
}

function getReasoningMarkdownStreaming(
  message: ChatMessageItem,
  markdownStreaming?: MarkdownStreamingState,
) {
  if (!markdownStreaming) {
    return undefined;
  }

  if (isThinkingActive(message)) {
    return markdownStreaming;
  }

  return { hasNextChunk: false };
}

function getMessageDisplayName(
  message: ChatMessageItem,
  selectedModelId?: string,
  selectedModelLabel?: string,
) {
  if (message.role === 'user') {
    return '你';
  }

  return message.model_id || (selectedModelId ? selectedModelLabel : 'AI 助手');
}

function getFileTypeLabel(file: AIChatFileMessageBlock) {
  return [file.file_type || 'file', file.mime_type, file.source_type]
    .filter(Boolean)
    .join(' · ');
}

function getSafeFileTypeLabel(
  file: AIChatFileMessageBlock,
  dataUrlInfo?: null | ReturnType<typeof getDataUrlInfo>,
) {
  const meta = getFileTypeLabel(file);
  const sizeLabel = formatByteSize(dataUrlInfo?.byteSize);

  return [meta, sizeLabel].filter(Boolean).join(' · ');
}

function getDataUrlFileIcon(type: NonNullable<FileCardProps['type']>) {
  if (type === 'image' || type === 'audio' || type === 'video') {
    return type;
  }

  return undefined;
}

function isPreviewableDataUrlFile(
  type: NonNullable<FileCardProps['type']>,
  dataUrlInfo?: null | ReturnType<typeof getDataUrlInfo>,
) {
  if (!dataUrlInfo || dataUrlInfo.byteSize > MAX_DATA_URL_PREVIEW_BYTES) {
    return false;
  }

  if (dataUrlInfo.mimeType === 'image/svg+xml') {
    return false;
  }

  return type === 'image' || type === 'audio' || type === 'video';
}

function isImageFile(file: AIChatFileMessageBlock) {
  return (
    file.file_type === 'image' ||
    file.mime_type?.startsWith('image/') ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/iu.test(file.url || file.name || '')
  );
}

function isAudioFile(file: AIChatFileMessageBlock) {
  return file.file_type === 'audio' || file.mime_type?.startsWith('audio/');
}

function isVideoFile(file: AIChatFileMessageBlock) {
  return file.file_type === 'video' || file.mime_type?.startsWith('video/');
}

function downloadDataUrl(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'download';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function openExternalLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function createFileCardClickHandler(
  dataUrl: boolean,
  fileUrl: string | undefined,
  title: string,
) {
  if (dataUrl && fileUrl) {
    return () => downloadDataUrl(fileUrl, title);
  }

  if (fileUrl && !dataUrl) {
    return () => openExternalLink(fileUrl);
  }

  return undefined;
}

function getAttachmentFallbackName(
  type: NonNullable<FileCardProps['type']>,
  index: number,
) {
  let label: string;
  switch (type) {
    case 'audio': {
      label = '音频';
      break;
    }
    case 'image': {
      label = '图片';
      break;
    }
    case 'video': {
      label = '视频';
      break;
    }
    default: {
      label = '附件';
      break;
    }
  }

  return `${label} ${index + 1}`;
}

function getFileCardType(
  file: AIChatFileMessageBlock,
): NonNullable<FileCardProps['type']> {
  if (isImageFile(file)) {
    return 'image';
  }
  if (isAudioFile(file)) {
    return 'audio';
  }
  if (isVideoFile(file)) {
    return 'video';
  }
  return 'file';
}

function toMessageFileCard(
  message: ChatMessageItem,
  file: AIChatFileMessageBlock,
  index: number,
): FileCardProps {
  const type = getFileCardType(file);
  const fileUrl = typeof file.url === 'string' ? file.url : undefined;
  const dataUrlInfo = getDataUrlInfo(fileUrl);
  const dataUrl = Boolean(dataUrlInfo);
  const previewableDataUrl =
    dataUrl && isPreviewableDataUrlFile(type, dataUrlInfo);
  const shouldDeferMedia = Boolean(message.streaming && dataUrl);
  const title =
    file.name ||
    (fileUrl && !dataUrl ? fileUrl : getAttachmentFallbackName(type, index));
  const safeType = dataUrl && !previewableDataUrl ? 'file' : type;
  const meta = dataUrl
    ? [
        getSafeFileTypeLabel(file, dataUrlInfo),
        previewableDataUrl
          ? 'Base64 内容已作为附件预览'
          : 'Base64 内容点击下载',
      ]
        .filter(Boolean)
        .join(' · ')
    : getFileTypeLabel(file);

  return {
    audioProps:
      safeType === 'audio'
        ? { controls: true, preload: 'metadata' }
        : undefined,
    byte: dataUrlInfo?.byteSize,
    description: meta || undefined,
    icon: dataUrl ? getDataUrlFileIcon(type) : undefined,
    imageProps:
      safeType === 'image'
        ? {
            preview: {
              mask: '预览图片',
            },
          }
        : undefined,
    key: `${message.id}-file-${index}`,
    loading: shouldDeferMedia || undefined,
    name: title,
    onClick: createFileCardClickHandler(dataUrl, fileUrl, title),
    size: 'small',
    src:
      fileUrl && safeType !== 'file' && !shouldDeferMedia ? fileUrl : undefined,
    type: safeType,
    videoProps:
      safeType === 'video'
        ? { controls: true, preload: 'metadata' }
        : undefined,
  };
}

function renderMessageFiles(
  message: ChatMessageItem,
  files: AIChatFileMessageBlock[],
) {
  const visibleFiles = files.filter((file) => Boolean(file.url || file.name));

  if (visibleFiles.length === 0) {
    return null;
  }

  return h('div', { key: `${message.id}-files`, class: 'max-w-full' }, [
    h(FileCardList, {
      items: visibleFiles.map((file, index) =>
        toMessageFileCard(message, file, index),
      ),
      overflow: 'wrap',
      size: 'small',
    }),
  ]);
}

function renderInlineSourcePanel(sourceItems: MarkdownSourceItems) {
  if (sourceItems.length === 0) {
    return null;
  }

  return h(Sources, {
    defaultExpanded: sourceItems.length <= 3,
    expandIconPosition: 'end',
    items: normalizeInlineSourceItems(sourceItems),
    title: `来源 ${sourceItems.length}`,
  });
}

function renderDataPreview(
  data: unknown,
  title: string,
  isDark: boolean,
): VNodeChild {
  if (data === undefined || data === null) {
    return null;
  }

  return h(AIJsonPreview as Component, {
    data,
    isDark,
    title,
  });
}

function renderEventContent(
  item: AIChatRenderableEventItem,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  isDark: boolean,
): VNodeChild {
  const children: VNodeChild[] = [];

  if (item.status === 'error' && item.text?.trim()) {
    children.push(
      h(MarkdownContent, {
        content: item.text,
      }),
    );
  }

  const dataPreview =
    item.status === 'error'
      ? renderDataPreview(item.data, '错误详情', isDark)
      : null;
  if (dataPreview) {
    children.push(dataPreview);
  }

  if (children.length === 0) {
    return null;
  }

  return h('div', { class: 'min-w-0 space-y-2' }, children);
}

function eventItemHasAnyType(
  item: AIChatRenderableEventItem,
  eventTypes: Set<string>,
) {
  return [item.eventType, ...(item.eventTypes ?? [])].some((eventType) =>
    eventTypes.has(eventType),
  );
}

function toThoughtChainStatus(
  status: AIChatRenderableEventItem['status'],
): ThoughtChainItemType['status'] {
  switch (status) {
    case 'abort': {
      return 'abort';
    }
    case 'error': {
      return 'error';
    }
    case 'running': {
      return 'loading';
    }
    case 'success': {
      return 'success';
    }
    default: {
      return undefined;
    }
  }
}

function getEventDisplayTitle(item: AIChatRenderableEventItem) {
  switch (item.eventType) {
    case 'TOOL_CALL_ARGS':
    case 'TOOL_CALL_CHUNK': {
      return '传入工具参数';
    }
    case 'TOOL_CALL_END': {
      return '工具调用完成';
    }
    case 'TOOL_CALL_RESULT': {
      return '读取工具结果';
    }
    case 'TOOL_CALL_START': {
      return '调用工具';
    }
  }

  if (eventItemHasAnyType(item, TOOL_CALL_END_EVENT_TYPES)) {
    return '工具调用完成';
  }

  if (eventItemHasAnyType(item, TOOL_CALL_RESULT_EVENT_TYPES)) {
    return '读取工具结果';
  }

  if (eventItemHasAnyType(item, TOOL_CALL_ARG_EVENT_TYPES)) {
    return '传入工具参数';
  }

  if (eventItemHasAnyType(item, TOOL_CALL_EVENT_TYPES)) {
    return '调用工具';
  }

  if (eventItemHasAnyType(item, ACTIVITY_EVENT_TYPES)) {
    return '执行活动';
  }

  return item.title || '执行步骤';
}

function getEventDisplayDescription(item: AIChatRenderableEventItem) {
  return item.summary || item.title;
}

function buildThoughtChainItem(
  item: AIChatRenderableEventItem,
  title: string,
  status: ThoughtChainItemType['status'],
  content?: VNodeChild,
  keySuffix = '',
): ThoughtChainItemType {
  return {
    blink: status === 'loading',
    collapsible: Boolean(content),
    content,
    description: getEventDisplayDescription(item),
    key: keySuffix ? `${item.key}-${keySuffix}` : item.key,
    status,
    title,
  };
}

function getCompletedToolPhaseStatus(
  item: AIChatRenderableEventItem,
): ThoughtChainItemType['status'] {
  if (item.status === 'abort' || item.status === 'error') {
    return toThoughtChainStatus(item.status);
  }

  return 'success';
}

function getCurrentToolPhaseStatus(
  item: AIChatRenderableEventItem,
): ThoughtChainItemType['status'] {
  return toThoughtChainStatus(item.status) ?? 'success';
}

function renderToolCallThoughtItems(
  item: AIChatRenderableEventItem,
  content: VNodeChild,
) {
  const hasArgs = eventItemHasAnyType(item, TOOL_CALL_ARG_EVENT_TYPES);
  const hasResult = eventItemHasAnyType(item, TOOL_CALL_RESULT_EVENT_TYPES);
  const hasEnd = eventItemHasAnyType(item, TOOL_CALL_END_EVENT_TYPES);
  const currentStatus = getCurrentToolPhaseStatus(item);
  const completedStatus = getCompletedToolPhaseStatus(item);
  const items: ThoughtChainItemType[] = [];

  items.push(
    buildThoughtChainItem(
      item,
      '调用工具',
      hasArgs || hasResult || hasEnd ? 'success' : currentStatus,
      item.eventType === 'TOOL_CALL_START' ? content : undefined,
      'start',
    ),
  );

  if (hasArgs) {
    items.push(
      buildThoughtChainItem(
        item,
        '传入工具参数',
        hasResult || hasEnd ? 'success' : currentStatus,
        TOOL_CALL_ARG_EVENT_TYPES.has(item.eventType) ? content : undefined,
        'args',
      ),
    );
  }

  if (hasResult) {
    items.push(
      buildThoughtChainItem(
        item,
        '读取工具结果',
        hasEnd ? completedStatus : currentStatus,
        item.eventType === 'TOOL_CALL_RESULT' ? content : undefined,
        'result',
      ),
    );
  }

  if (hasEnd) {
    items.push(
      buildThoughtChainItem(
        item,
        '工具调用完成',
        completedStatus,
        item.eventType === 'TOOL_CALL_END' ? content : undefined,
        'end',
      ),
    );
  }

  return items;
}

function renderMessageEvents(
  block: Extract<AIChatRenderableBlock, { type: 'events' }>,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  isDark: boolean,
) {
  if (block.items.length === 0) {
    return null;
  }

  const thoughtItems = block.items.flatMap((item) => {
    const content = renderEventContent(item, MarkdownContent, isDark);
    const status = toThoughtChainStatus(item.status);

    if (eventItemHasAnyType(item, TOOL_CALL_EVENT_TYPES)) {
      return renderToolCallThoughtItems(item, content);
    }

    return [
      buildThoughtChainItem(item, getEventDisplayTitle(item), status, content),
    ];
  });

  const expandedKeys = thoughtItems
    .filter((item) => item.status === 'loading' || item.status === 'error')
    .map((item) => item.key)
    .filter((key): key is string => typeof key === 'string');

  return h(
    'div',
    {
      key: block.key,
      class:
        'min-w-0 max-w-full rounded-2xl border border-border/70 bg-muted/20 px-3 py-3',
    },
    [
      h(
        'div',
        {
          class: 'mb-2 text-xs font-medium leading-none text-muted-foreground',
        },
        '执行过程',
      ),
      h(ThoughtChain, {
        defaultExpandedKeys: expandedKeys,
        items: thoughtItems,
        line: 'dashed',
      }),
    ],
  );
}

function renderUnsupportedBlock(
  block: Extract<AIChatRenderableBlock, { type: 'unsupported' }>,
) {
  return h(AIUnsupportedBlock as Component, {
    key: block.key,
    reason: block.reason,
    title: block.title,
  });
}

function renderAssistantPending() {
  return h(
    'div',
    {
      class:
        'inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground',
    },
    [
      h('span', { class: 'size-1.5 animate-pulse rounded-full bg-current' }),
      h('span', {
        class: 'size-1.5 animate-pulse rounded-full bg-current delay-150',
      }),
      h('span', {
        class: 'size-1.5 animate-pulse rounded-full bg-current delay-300',
      }),
      h('span', '正在组织回复'),
    ],
  );
}

function renderRenderableBlock(
  block: AIChatRenderableBlock,
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    'isDark' | 'isThinkingExpanded' | 'setThinkingExpanded'
  >,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  markdownStreaming?: MarkdownStreamingState,
): VNodeChild {
  switch (block.type) {
    case 'code': {
      return h('div', { key: block.key }, [
        renderCodeBlock(
          block.content,
          block.language ?? 'text',
          options.isDark,
        ),
      ]);
    }
    case 'events': {
      return renderMessageEvents(block, MarkdownContent, options.isDark);
    }
    case 'files': {
      return renderMessageFiles(message, block.files);
    }
    case 'html':
    case 'markdown': {
      return h(MarkdownContent, {
        key: block.key,
        content: block.content,
        sourceItems: block.type === 'markdown' ? block.sourceItems : undefined,
        streaming: markdownStreaming,
      });
    }
    case 'json': {
      return h('div', { key: block.key }, [
        renderDataPreview(block.data, block.title ?? '数据', options.isDark),
      ]);
    }
    case 'mermaid': {
      return h('div', { key: block.key }, [
        renderMermaidBlock(block.content, options.isDark),
      ]);
    }
    case 'reasoning': {
      const thinkingActive = isThinkingActive(message);
      return h(
        Think,
        {
          blink: thinkingActive,
          expanded: options.isThinkingExpanded(message),
          loading: thinkingActive,
          title: block.title ?? getThinkingToggleLabel(message),
          'onUpdate:expanded': (expanded: boolean) => {
            options.setThinkingExpanded(message, expanded);
          },
        },
        () =>
          h(MarkdownContent, {
            content: block.content,
            streaming: getReasoningMarkdownStreaming(
              message,
              markdownStreaming,
            ),
          }),
      );
    }
    case 'sources': {
      return h(
        'div',
        { key: block.key, class: 'min-w-0 max-w-full' },
        [renderInlineSourcePanel(block.items)].filter(Boolean),
      );
    }
    case 'unsupported': {
      return renderUnsupportedBlock(block);
    }
  }
}

export function renderChatMessageBubbleContent(
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    'isDark' | 'isThinkingExpanded' | 'protocolDriver' | 'setThinkingExpanded'
  >,
): VNodeChild {
  const MarkdownContent = createMarkdownContentRenderer(options.isDark);
  const markdownStreaming = createAIReplyMarkdownStreaming(message);
  const text = getMessageTextContent(message, 'text');

  if (message.message_type === 'error') {
    return h('div', { class: 'min-w-0 max-w-full space-y-2' }, [
      h(
        'div',
        {
          class:
            'text-sm leading-6 whitespace-pre-wrap break-words text-destructive',
        },
        [
          h(MarkdownContent, {
            content: text,
            streaming: markdownStreaming,
          }),
        ],
      ),
    ]);
  }

  const renderableBlocks = options.protocolDriver.getRenderableBlocks(message);
  const hasMainText = Boolean(text.trim());

  if (renderableBlocks.length === 0 && message.streaming) {
    return h('div', { class: 'min-w-0 max-w-full' }, [
      renderAssistantPending(),
    ]);
  }

  const children = renderableBlocks
    .map((block) =>
      renderRenderableBlock(
        block,
        message,
        options,
        MarkdownContent,
        markdownStreaming,
      ),
    )
    .filter(Boolean);

  if (message.streaming && !hasMainText) {
    children.push(renderAssistantPending());
  }

  return h('div', { class: 'min-w-0 max-w-full space-y-3' }, children);
}

function renderMessageHeader(
  message: ChatMessageItem,
  selectedModelId?: string,
  selectedModelLabel?: string,
) {
  return h(
    'div',
    {
      class: [
        'mb-1.5 text-xs text-muted-foreground',
        message.role === 'user' ? 'text-right' : 'text-left',
      ],
    },
    h('div', undefined, [
      getMessageDisplayName(message, selectedModelId, selectedModelLabel),
      ' · ',
      parseDateLabel(message.created_time),
    ]),
  );
}

function renderMessageAvatar(message: ChatMessageItem): BubbleProps['avatar'] {
  const aAvatar = resolveComponent('a-avatar');
  return h(aAvatar, undefined, () => (message.role === 'user' ? '你' : 'AI'));
}

function getMessageCopyText(message: ChatMessageItem) {
  return [
    getMessageTextContent(message, 'text'),
    getMessageTextContent(message, 'reasoning'),
    ...getMessageFileBlocks(message).map((block) =>
      [block.name, block.url && !isDataUrl(block.url) ? block.url : undefined]
        .filter(Boolean)
        .join(' - '),
    ),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function renderCopyAction(message: ChatMessageItem) {
  return h(ActionsCopy, {
    text: getMessageCopyText(message),
  });
}

function getMessageActionItems(
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    | 'onBeginEditMessage'
    | 'onConfirmDeleteMessage'
    | 'onRegenerateMessage'
    | 'onRegenerateUserMessage'
  >,
): ActionsProps['items'] {
  const items: ActionsProps['items'] = [
    {
      actionRender: () => renderCopyAction(message),
      key: 'copy',
      label: '复制',
    },
  ];

  if (message.role === 'user') {
    items.push(
      {
        icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:refresh' }),
        key: 'regenerate',
        label: '重新生成',
        onItemClick: () => options.onRegenerateUserMessage(message),
      },
      {
        icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:pencil-outline' }),
        key: 'edit',
        label: '编辑保存',
        onItemClick: () => options.onBeginEditMessage(message, 'save'),
      },
      {
        icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:send-outline' }),
        key: 'edit-resend',
        label: '编辑重发',
        onItemClick: () => options.onBeginEditMessage(message, 'resend'),
      },
    );
  }

  if (message.role === 'assistant') {
    items.push({
      icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:refresh' }),
      key: 'retry',
      label: '重新生成',
      onItemClick: () => options.onRegenerateMessage(message),
    });
  }

  items.push({
    danger: true,
    icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:delete-outline' }),
    key: 'delete',
    label: '删除消息',
    onItemClick: () => options.onConfirmDeleteMessage(message),
  });

  return items;
}

function renderMessageFooter(
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    | 'onBeginEditMessage'
    | 'onConfirmDeleteMessage'
    | 'onRegenerateMessage'
    | 'onRegenerateUserMessage'
  >,
) {
  return h(Actions, {
    fadeIn: true,
    items: getMessageActionItems(message, options),
  });
}

export function createChatBubbleListRole(
  options: CreateChatBubbleListRoleOptions,
): BubbleListProps['role'] {
  return {
    assistant: (item) => {
      const message = getBubbleListMessage(item);
      if (!message) {
        return {
          class: 'mb-3.5',
          placement: 'start',
        };
      }

      return {
        avatar: renderMessageAvatar(message),
        class: 'mb-3.5',
        editable: false,
        footer: renderMessageFooter(message, options),
        footerPlacement: 'outer-start',
        header: renderMessageHeader(
          message,
          options.selectedModelId ?? undefined,
          options.selectedModelLabel,
        ),
        placement: 'start',
      };
    },
    divider: {
      class: 'mb-3.5 w-full',
    },
    user: (item) => {
      const message = getBubbleListMessage(item);
      if (!message) {
        return {
          class: 'mb-3.5',
          placement: 'end',
        };
      }

      return {
        avatar: renderMessageAvatar(message),
        class: 'mb-3.5',
        editable: options.isEditingMessage(message)
          ? {
              cancelText: '取消',
              editing: true,
              okText:
                options.editingMessageIntent === 'resend' ? '重发' : '保存',
            }
          : false,
        footer: renderMessageFooter(message, options),
        footerPlacement: 'outer-end',
        header: renderMessageHeader(message),
        onEditCancel: options.onCancelEditMessage,
        onEditConfirm: (value) =>
          options.editingMessageIntent === 'resend'
            ? options.onResendEditedMessage(String(value))
            : options.onSaveEditedMessage(String(value)),
        placement: 'end',
      };
    },
  };
}
