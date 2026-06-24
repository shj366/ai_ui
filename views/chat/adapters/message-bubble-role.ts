import type {
  ActionsProps,
  BubbleItemType,
  BubbleListProps,
  BubbleProps,
  FileCardProps,
  SourcesProps,
  ThoughtChainItemType,
} from '@antdv-next/x';

import type { Component, VNodeChild } from 'vue';

import type { ChatMessageItem } from '../../../runtime/message';
import type {
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
} from '../../../types/message';
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
  normalizeAIChatFileBlock,
  parseDateLabel,
} from '../../../runtime/message';
import { AIJsonPreview } from '../renderers/custom/json-preview';
import {
  createAIReplyMarkdownStreaming,
  createMarkdownContentRenderer,
  formatByteSize,
  getDataUrlInfo,
  isDataUrl,
  normalizeInlineSourceItems,
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

const TEXT_MESSAGE_EVENT_TYPES = new Set([
  'TEXT_MESSAGE_CHUNK',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'TEXT_MESSAGE_START',
]);
const INTERNAL_LIFECYCLE_EVENT_TYPES = new Set([
  'MESSAGES_SNAPSHOT',
  'REASONING_ENCRYPTED_VALUE',
  'REASONING_END',
  'REASONING_MESSAGE_END',
  'REASONING_MESSAGE_START',
  'REASONING_START',
  'RUN_FINISHED',
  'RUN_STARTED',
  'STATE_DELTA',
  'STATE_SNAPSHOT',
  'STEP_FINISHED',
  'STEP_STARTED',
  'TEXT_MESSAGE_END',
  'TEXT_MESSAGE_START',
  'THINKING_END',
  'THINKING_START',
  'THINKING_TEXT_MESSAGE_END',
  'THINKING_TEXT_MESSAGE_START',
]);
const DATA_URL_PATTERN = /data:([\w.+-]+\/[\w.+-]+)?;base64,[\w+/=_-]+/giu;
const HTML_MEDIA_TAG_PATTERN =
  /<(audio|img|video)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\2[^>]*>/giu;
const HTML_SOURCE_TAG_PATTERN =
  /<source\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/giu;
const MAX_SOURCE_STRING_LENGTH = 4096;

type SourceItems = NonNullable<SourcesProps['items']>;

function parseInlineDataUrl(url: string) {
  const match = /^data:([^;,]+)?;base64,([\s\S]+)$/iu.exec(url.trim());
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1] || 'application/octet-stream',
    value: match[2] ?? '',
  };
}

function getHtmlAttr(tag: string, name: string) {
  const escapedName = name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
  const pattern = new RegExp(
    String.raw`\b${escapedName}\s*=\s*(["'])(.*?)\1`,
    'iu',
  );
  return pattern.exec(tag)?.[2]?.trim() || null;
}

function inferRenderableFileType(
  fileType?: null | string,
  mimeType?: null | string,
) {
  if (
    fileType === 'audio' ||
    fileType === 'document' ||
    fileType === 'image' ||
    fileType === 'video'
  ) {
    return fileType;
  }
  if (mimeType?.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType?.startsWith('image/')) {
    return 'image';
  }
  if (mimeType?.startsWith('video/')) {
    return 'video';
  }
  if (mimeType) {
    return 'document';
  }
  return null;
}

function buildInlineFileName(
  type: null | string,
  mimeType: null | string,
  index: number,
  title?: null | string,
) {
  if (title?.trim()) {
    return title.trim();
  }

  let label: string;
  switch (type) {
    case 'audio': {
      label = '内联音频';
      break;
    }
    case 'image': {
      label = '内联图片';
      break;
    }
    case 'video': {
      label = '内联视频';
      break;
    }
    default: {
      label = '内联文件';
      break;
    }
  }

  const suffix = mimeType ? ` (${mimeType})` : '';
  return `${label} ${index + 1}${suffix}`;
}

function getInlineFileNotice(_name: string) {
  return '';
}

function isRenderableMediaUrl(url: string) {
  return /^https?:\/\//iu.test(url) || parseInlineDataUrl(url) !== null;
}

function isExternalUrl(value: string) {
  if (value.length > MAX_SOURCE_STRING_LENGTH) {
    return false;
  }

  return /^https?:\/\//iu.test(value.trim());
}

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

function extractSourceItems(
  value: unknown,
  items: SourceItems,
  seen: Set<string>,
  depth = 0,
) {
  if (depth > 3 || items.length >= 8 || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_SOURCE_STRING_LENGTH) {
      return;
    }

    const url = value.trim();
    if (!isExternalUrl(url) || seen.has(url)) {
      return;
    }
    seen.add(url);
    items.push({
      key: url,
      title: url,
      url,
    });
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractSourceItems(item, items, seen, depth + 1);
      if (items.length >= 8) {
        break;
      }
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  const candidateUrl =
    (typeof record.url === 'string' && record.url) ||
    (typeof record.sourceUrl === 'string' && record.sourceUrl) ||
    (typeof record.link === 'string' && record.link);

  if (candidateUrl && isExternalUrl(candidateUrl) && !seen.has(candidateUrl)) {
    seen.add(candidateUrl);
    let description: string | undefined;
    if (typeof record.description === 'string') {
      description = record.description;
    } else if (typeof record.snippet === 'string') {
      description = record.snippet;
    }

    items.push({
      description,
      key: candidateUrl,
      title:
        (typeof record.title === 'string' && record.title) ||
        (typeof record.label === 'string' && record.label) ||
        (typeof record.name === 'string' && record.name) ||
        candidateUrl,
      url: candidateUrl,
    });
  }

  for (const nested of Object.values(record)) {
    extractSourceItems(nested, items, seen, depth + 1);
    if (items.length >= 8) {
      break;
    }
  }
}

function collectSourceItems(events: AIChatEventMessageBlock[]): SourceItems {
  const items: SourceItems = [];
  const seen = new Set<string>();

  for (const event of events) {
    extractSourceItems(event.data, items, seen);
  }

  return items.map((item, index) => ({
    ...item,
    key: item.key ?? item.url ?? index + 1,
  }));
}

function shouldShowEventBlock(
  message: ChatMessageItem,
  block: AIChatEventMessageBlock,
) {
  const eventType = block.event_type;
  const hasMainText = Boolean(getMessageTextContent(message, 'text').trim());
  const hasReasoning = Boolean(
    getMessageTextContent(message, 'reasoning').trim(),
  );

  if (eventBlockHasAnyType(block, INTERNAL_LIFECYCLE_EVENT_TYPES)) {
    return false;
  }

  if (hasMainText && TEXT_MESSAGE_EVENT_TYPES.has(eventType)) {
    return false;
  }

  if (hasReasoning && eventBlockHasAnyType(block, REASONING_END_EVENT_TYPES)) {
    return false;
  }

  return true;
}

function getVisibleMessageEvents(message: ChatMessageItem) {
  return getMessageEventBlocks(message).filter((block) =>
    shouldShowEventBlock(message, block),
  );
}

function extractMarkdownInlineFiles(content: string, messageId: string) {
  const files = [] as ReturnType<typeof normalizeAIChatFileBlock>[];
  const seen = new Map<string, string>();

  function addFile(params: {
    mimeType?: null | string;
    name?: null | string;
    tagType?: null | string;
    url: string;
  }) {
    const parsed = parseInlineDataUrl(params.url);
    const mimeType = params.mimeType ?? parsed?.mimeType ?? null;
    const fileType = inferRenderableFileType(params.tagType, mimeType);
    const existing = seen.get(params.url);
    if (existing) {
      return existing;
    }

    const name = buildInlineFileName(
      fileType,
      mimeType,
      files.length,
      params.name,
    );
    seen.set(params.url, name);
    files.push(
      normalizeAIChatFileBlock({
        file_type: fileType,
        mime_type: mimeType,
        name,
        source_type: parsed ? 'base64' : 'url',
        type: 'file',
        url: params.url,
      }),
    );
    return name;
  }

  let nextContent = content.replaceAll(
    /!\[([^\]]*)\]\((data:[^)]+)\)/giu,
    (_, altText: string, url: string) => {
      const name = addFile({ name: altText, tagType: 'image', url });
      return getInlineFileNotice(name);
    },
  );

  nextContent = nextContent.replaceAll(
    HTML_MEDIA_TAG_PATTERN,
    (tag, tagType) => {
      const src = getHtmlAttr(tag, 'src');
      if (!src) {
        return tag;
      }

      const normalizedTagType = String(tagType).toLowerCase();
      const shouldExtract =
        normalizedTagType === 'audio' ||
        normalizedTagType === 'video' ||
        parseInlineDataUrl(src) !== null;
      if (!shouldExtract || !isRenderableMediaUrl(src)) {
        return tag;
      }

      const name = addFile({
        mimeType: getHtmlAttr(tag, 'type'),
        name: getHtmlAttr(tag, 'title') ?? getHtmlAttr(tag, 'alt'),
        tagType: normalizedTagType,
        url: src,
      });
      return getInlineFileNotice(name);
    },
  );

  nextContent = nextContent.replaceAll(
    HTML_SOURCE_TAG_PATTERN,
    (tag, _, src) => {
      if (!isRenderableMediaUrl(src)) {
        return tag;
      }

      const mimeType = getHtmlAttr(tag, 'type');
      const name = addFile({ mimeType, tagType: null, url: src });
      return getInlineFileNotice(name);
    },
  );

  nextContent = nextContent.replaceAll(DATA_URL_PATTERN, (url) => {
    const name = addFile({ url });
    return getInlineFileNotice(name);
  });

  return {
    content: nextContent,
    files,
    hasExtractedFiles: files.length > 0,
    key: `${messageId}-inline-files`,
  };
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
  item: AIChatEventMessageBlock,
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

function toThoughtChainStatus(
  status: AIChatEventMessageBlock['status'],
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

function getEventDisplayTitle(item: AIChatEventMessageBlock) {
  switch (item.event_type) {
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

  if (eventBlockHasAnyType(item, TOOL_CALL_END_EVENT_TYPES)) {
    return '工具调用完成';
  }

  if (eventBlockHasAnyType(item, TOOL_CALL_RESULT_EVENT_TYPES)) {
    return '读取工具结果';
  }

  if (eventBlockHasAnyType(item, TOOL_CALL_ARG_EVENT_TYPES)) {
    return '传入工具参数';
  }

  if (eventBlockHasAnyType(item, TOOL_CALL_EVENT_TYPES)) {
    return '调用工具';
  }

  if (eventBlockHasAnyType(item, ACTIVITY_EVENT_TYPES)) {
    return '执行活动';
  }

  return item.title || '执行步骤';
}

function getEventDisplayDescription(item: AIChatEventMessageBlock) {
  return item.summary || item.title;
}

function buildThoughtChainItem(
  item: AIChatEventMessageBlock,
  title: string,
  status: ThoughtChainItemType['status'],
  content?: VNodeChild,
  keySuffix = '',
): ThoughtChainItemType {
  const key = item.event_key || item.event_type;

  return {
    blink: status === 'loading',
    collapsible: Boolean(content),
    content,
    description: getEventDisplayDescription(item),
    key: keySuffix ? `${key}-${keySuffix}` : key,
    status,
    title,
  };
}

function getCompletedToolPhaseStatus(
  item: AIChatEventMessageBlock,
): ThoughtChainItemType['status'] {
  if (item.status === 'abort' || item.status === 'error') {
    return toThoughtChainStatus(item.status);
  }

  return 'success';
}

function getCurrentToolPhaseStatus(
  item: AIChatEventMessageBlock,
): ThoughtChainItemType['status'] {
  return toThoughtChainStatus(item.status) ?? 'success';
}

function renderToolCallThoughtItems(
  item: AIChatEventMessageBlock,
  content: VNodeChild,
) {
  const hasArgs = eventBlockHasAnyType(item, TOOL_CALL_ARG_EVENT_TYPES);
  const hasResult = eventBlockHasAnyType(item, TOOL_CALL_RESULT_EVENT_TYPES);
  const hasEnd = eventBlockHasAnyType(item, TOOL_CALL_END_EVENT_TYPES);
  const currentStatus = getCurrentToolPhaseStatus(item);
  const completedStatus = getCompletedToolPhaseStatus(item);
  const items: ThoughtChainItemType[] = [];

  items.push(
    buildThoughtChainItem(
      item,
      '调用工具',
      hasArgs || hasResult || hasEnd ? 'success' : currentStatus,
      item.event_type === 'TOOL_CALL_START' ? content : undefined,
      'start',
    ),
  );

  if (hasArgs) {
    items.push(
      buildThoughtChainItem(
        item,
        '传入工具参数',
        hasResult || hasEnd ? 'success' : currentStatus,
        TOOL_CALL_ARG_EVENT_TYPES.has(item.event_type) ? content : undefined,
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
        item.event_type === 'TOOL_CALL_RESULT' ? content : undefined,
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
        item.event_type === 'TOOL_CALL_END' ? content : undefined,
        'end',
      ),
    );
  }

  return items;
}

function renderMessageEvents(
  message: ChatMessageItem,
  events: AIChatEventMessageBlock[],
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  isDark: boolean,
) {
  if (events.length === 0) {
    return null;
  }

  const thoughtItems = events.flatMap((item) => {
    const content = renderEventContent(item, MarkdownContent, isDark);
    const status = toThoughtChainStatus(item.status);

    if (eventBlockHasAnyType(item, TOOL_CALL_EVENT_TYPES)) {
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
      key: `${message.id}-events`,
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

function renderReasoningBlock(
  message: ChatMessageItem,
  content: string,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    'isThinkingExpanded' | 'setThinkingExpanded'
  >,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  markdownStreaming?: MarkdownStreamingState,
) {
  const thinkingActive = isThinkingActive(message);
  return h(
    Think,
    {
      blink: thinkingActive,
      expanded: options.isThinkingExpanded(message),
      loading: thinkingActive,
      title: getThinkingToggleLabel(message),
      'onUpdate:expanded': (expanded: boolean) => {
        options.setThinkingExpanded(message, expanded);
      },
    },
    () =>
      h(MarkdownContent, {
        content,
        streaming: getReasoningMarkdownStreaming(message, markdownStreaming),
      }),
  );
}

export function hasRenderableChatMessage(message: ChatMessageItem) {
  if (message.message_type === 'error') {
    return Boolean(getMessageTextContent(message, 'text').trim());
  }

  if (message.role === 'assistant' && message.streaming) {
    return true;
  }

  return Boolean(
    getMessageTextContent(message, 'text').trim() ||
    getMessageTextContent(message, 'reasoning').trim() ||
    getMessageFileBlocks(message).length > 0 ||
    getVisibleMessageEvents(message).length > 0,
  );
}

export function renderChatMessageBubbleContent(
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    'isDark' | 'isThinkingExpanded' | 'setThinkingExpanded'
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

  const reasoningText = getMessageTextContent(message, 'reasoning');
  const visibleEvents = getVisibleMessageEvents(message);
  const allEvents = getMessageEventBlocks(message);
  const sourceItems = collectSourceItems(allEvents);
  const inlineExtraction = extractMarkdownInlineFiles(text, message.id);
  const files = [...getMessageFileBlocks(message), ...inlineExtraction.files];
  const hasMainText = Boolean(text.trim());
  const children: VNodeChild[] = [];

  if (reasoningText.trim()) {
    children.push(
      renderReasoningBlock(
        message,
        reasoningText,
        options,
        MarkdownContent,
        markdownStreaming,
      ),
    );
  }

  const eventsNode = renderMessageEvents(
    message,
    visibleEvents,
    MarkdownContent,
    options.isDark,
  );
  if (eventsNode) {
    children.push(eventsNode);
  }

  if (inlineExtraction.content.trim()) {
    children.push(
      h(MarkdownContent, {
        key: `${message.id}-markdown`,
        content: inlineExtraction.content,
        sourceItems,
        streaming: markdownStreaming,
      }),
    );
  }

  const sourcesNode = renderInlineSourcePanel(sourceItems);
  if (sourcesNode) {
    children.push(
      h('div', { key: `${message.id}-sources`, class: 'min-w-0 max-w-full' }, [
        sourcesNode,
      ]),
    );
  }

  const filesNode = renderMessageFiles(message, files);
  if (filesNode) {
    children.push(filesNode);
  }

  if (children.length === 0 && message.streaming) {
    return h('div', { class: 'min-w-0 max-w-full' }, [
      renderAssistantPending(),
    ]);
  }

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
