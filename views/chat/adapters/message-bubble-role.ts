import type {
  ActionsProps,
  BubbleItemType,
  BubbleListProps,
  BubbleProps,
  FileCardProps,
} from '@antdv-next/x';

import type { Component, VNodeChild } from 'vue';

import type {
  MarkdownSourceItems,
  MarkdownStreamingState,
} from '../renderers/markdown-content';

import type { AIChatProtocolDriver } from '#/plugins/ai/protocols';
import type { ChatMessageItem } from '#/plugins/ai/runtime/message';
import type { AIChatFileMessageBlock } from '#/plugins/ai/types/message';
import type {
  AIChatRenderableBlock,
  AIChatRenderableEventItem,
} from '#/plugins/ai/types/render';

import { h, resolveComponent } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Actions,
  ActionsCopy,
  FileCardList,
  Sources,
  Think,
} from '@antdv-next/x';

import {
  getMessageFileBlocks,
  getMessageTextContent,
  parseDateLabel,
} from '#/plugins/ai/runtime/message';

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
  return Boolean(
    message.streaming && !getMessageTextContent(message, 'text').trim(),
  );
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
  const previewableDataUrl = dataUrl && isPreviewableDataUrlFile(type, dataUrlInfo);
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

  if (item.text?.trim()) {
    children.push(
      h(MarkdownContent, {
        content: item.text,
      }),
    );
  }

  const dataPreview = renderDataPreview(item.data, '事件数据', isDark);
  if (dataPreview) {
    children.push(dataPreview);
  }

  if (item.eventTypes?.length) {
    children.push(
      h(
        'div',
        {
          class: 'flex flex-wrap gap-1 text-[11px] text-muted-foreground',
        },
        item.eventTypes.map((eventType) =>
          h(
            'span',
            {
              class:
                'rounded-full border border-border/70 bg-background px-2 py-0.5',
            },
            eventType,
          ),
        ),
      ),
    );
  }

  if (children.length === 0) {
    return null;
  }

  return h('div', { class: 'min-w-0 space-y-2' }, children);
}

function renderMessageEvents(
  block: Extract<AIChatRenderableBlock, { type: 'events' }>,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  isDark: boolean,
) {
  if (block.items.length === 0) {
    return null;
  }

  return h(
    'div',
    { key: block.key, class: 'min-w-0 max-w-full space-y-2' },
    block.items.map((item) =>
      h(
        'details',
        {
          class:
            'rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs',
          key: item.key,
          open: item.status === 'running' || item.status === 'error',
        },
        [
          h(
            'summary',
            {
              class:
                'cursor-pointer select-none font-medium text-muted-foreground',
            },
            [item.title, item.summary ? ` · ${item.summary}` : ''],
          ),
          h('div', { class: 'mt-2' }, [
            renderEventContent(item, MarkdownContent, isDark),
          ]),
        ],
      ),
    ),
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
        renderCodeBlock(block.content, block.language ?? 'text', options.isDark),
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

  return h(
    'div',
    { class: 'min-w-0 max-w-full space-y-3' },
    renderableBlocks
      .map((block) =>
        renderRenderableBlock(
          block,
          message,
          options,
          MarkdownContent,
          markdownStreaming,
        ),
      )
      .filter(Boolean),
  );
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
