import type {
  ActionsProps,
  ChatMessageListItem,
  ChatMessageListProps,
  SourcesProps,
} from '../components';

import type { Component, VNodeChild } from 'vue';

import type { AttachmentData } from '#/plugins/ai/components/ai-elements/attachments/types';
import type { ChatMessageItem } from '../../../runtime/message';
import type {
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
} from '../../../types/message';
import type { MarkdownSourceItems } from '../renderers/markdown-content';
import type { ToolEventGroup } from './message-event-groups';

import { h } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  AIImage,
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '#/plugins/ai/components/ai-elements';
import {
  Actions,
  ChatTask,
  ChatTaskContent,
  ChatTaskItem,
  ChatTaskTrigger,
  Sources,
  Think,
} from '../components';

import { resolveAIChatApiUrl } from '../../../api/chat';
import {
  getMessageEventBlocks,
  getMessageFileBlocks,
  getMessageTextContent,
  normalizeAIChatFileBlock,
  parseDateLabel,
} from '../../../runtime/message';
import {
  createAIReplyMarkdownStreaming,
  createMarkdownContentRenderer,
  getDataUrlInfo,
  isDataUrl,
  normalizeInlineSourceItems,
} from '../renderers/markdown-content';
import {
  ACTIVITY_EVENT_TYPES,
  createMessageEventRenderItems,
  createToolEventGroup,
  eventBlockHasAnyType,
  getLatestToolEventByType,
  getToolErrorText,
  getToolEventDisplayName,
  getToolGroupState,
  getToolPayload,
  hasToolError,
  hasToolPayload,
  isToolEventBlock,
  TOOL_CALL_ARG_EVENT_TYPES,
  TOOL_CALL_END_EVENT_TYPES,
  TOOL_CALL_EVENT_TYPES,
  TOOL_CALL_RESULT_EVENT_TYPES,
  TOOL_OUTPUT_AVAILABLE_EVENT_TYPES,
} from './message-event-groups';
import {
  createMessageProcessFoldPlan,
  type MessageProcessFoldPlan,
} from './message-process-fold';

export interface CreateChatMessageListRoleOptions {
  editingMessageIntent: 'resend' | 'save';
  isDark: boolean;
  isEditingMessage: (message: ChatMessageItem) => boolean;
  isThinkingExpanded: (message: ChatMessageItem, panelKey?: string) => boolean;
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
  getProviderLabel?: (providerId?: null | number) => string | undefined;
  selectedModelLabel?: string;
  selectedModelId?: null | string;
  selectedProviderId?: null | number;
  selectedProviderLabel?: string;
  setThinkingExpanded: (
    message: ChatMessageItem,
    expanded: boolean,
    panelKey?: string,
  ) => void;
}

const MAX_DATA_URL_PREVIEW_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_TEXT_PREVIEW_LENGTH = 4000;
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

function getMessageListItemMessage(item: ChatMessageListItem) {
  const message = item.extraInfo?.message;
  return message && typeof message === 'object'
    ? (message as ChatMessageItem)
    : undefined;
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

function getMessageProviderDisplayName(
  message: ChatMessageItem,
  options: Pick<
    CreateChatMessageListRoleOptions,
    | 'getProviderLabel'
    | 'selectedProviderId'
    | 'selectedProviderLabel'
  >,
) {
  if (message.role !== 'assistant') {
    return '';
  }

  if (message.provider_id !== null && message.provider_id !== undefined) {
    return (
      options.getProviderLabel?.(message.provider_id) ||
      (message.provider_id === options.selectedProviderId
        ? options.selectedProviderLabel
        : undefined) ||
      ''
    );
  }

  return options.selectedProviderLabel || '';
}

type MessageAttachmentKind = 'audio' | 'document' | 'image' | 'video';

interface MessageAttachmentRenderItem {
  data: AttachmentData;
  dataUrl: boolean;
  fileUrl?: string;
  key: string;
  title: string;
}

function isPreviewableDataUrlAttachment(
  type: MessageAttachmentKind,
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

function resolveFileRenderUrl(url?: null | string) {
  if (!url) {
    return undefined;
  }

  return resolveAIChatApiUrl(url);
}

function createAttachmentClickHandler(
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

function getAttachmentFallbackName(type: MessageAttachmentKind, index: number) {
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

function getMessageAttachmentKind(
  file: AIChatFileMessageBlock,
): MessageAttachmentKind {
  if (isImageFile(file)) {
    return 'image';
  }
  if (isAudioFile(file)) {
    return 'audio';
  }
  if (isVideoFile(file)) {
    return 'video';
  }
  return 'document';
}

function getAttachmentMediaType(
  file: AIChatFileMessageBlock,
  type: MessageAttachmentKind,
  dataUrlInfo?: null | ReturnType<typeof getDataUrlInfo>,
) {
  if (file.mime_type) {
    return file.mime_type;
  }
  if (dataUrlInfo?.mimeType) {
    return dataUrlInfo.mimeType;
  }

  switch (type) {
    case 'audio': {
      return 'audio/*';
    }
    case 'image': {
      return 'image/*';
    }
    case 'video': {
      return 'video/*';
    }
    default: {
      return 'application/octet-stream';
    }
  }
}

function toMessageAttachmentData(
  message: ChatMessageItem,
  file: AIChatFileMessageBlock,
  index: number,
): MessageAttachmentRenderItem {
  const type = getMessageAttachmentKind(file);
  const fileUrl = resolveFileRenderUrl(file.url);
  const dataUrlInfo = getDataUrlInfo(fileUrl);
  const dataUrl = Boolean(dataUrlInfo);
  const previewableDataUrl = isPreviewableDataUrlAttachment(type, dataUrlInfo);
  const title =
    file.name ||
    (fileUrl && !dataUrl ? fileUrl : getAttachmentFallbackName(type, index));
  const attachmentType = dataUrl && !previewableDataUrl ? 'document' : type;
  const mediaType =
    dataUrl && !previewableDataUrl
      ? 'application/octet-stream'
      : getAttachmentMediaType(file, attachmentType, dataUrlInfo);

  const data: AttachmentData = {
    filename: title,
    id: `${message.id}-file-${index}`,
    mediaType,
    type: 'file',
    url: fileUrl || '',
  };

  return {
    data,
    dataUrl,
    fileUrl,
    key: data.id,
    title,
  };
}

function renderMessageImage(file: AIChatFileMessageBlock, index: number) {
  const fileUrl = resolveFileRenderUrl(file.url);
  if (!fileUrl) {
    return null;
  }

  const dataUrlInfo = getDataUrlInfo(fileUrl);
  const title = file.name || getAttachmentFallbackName('image', index);
  const imageClass =
    'max-h-[420px] max-w-full rounded-xl border border-border/70 object-contain shadow-sm';
  const clickHandler = createAttachmentClickHandler(
    Boolean(dataUrlInfo),
    fileUrl,
    title,
  );

  const imageNode = h(AIImage as Component, {
    alt: title,
    base64: dataUrlInfo ? (fileUrl.split(';base64,')[1] ?? '') : undefined,
    class: imageClass,
    loading: 'lazy',
    mediaType: dataUrlInfo?.mimeType || file.mime_type || 'image/png',
    src: dataUrlInfo ? undefined : fileUrl,
  });

  return h(
    clickHandler ? 'button' : 'div',
    {
      key: `${title}-${index}`,
      class: 'block max-w-full overflow-hidden rounded-xl text-left',
      title,
      type: clickHandler ? 'button' : undefined,
      onClick: clickHandler,
    },
    [imageNode],
  );
}

function renderMessageAttachment(item: MessageAttachmentRenderItem) {
  const clickHandler = createAttachmentClickHandler(
    item.dataUrl,
    item.fileUrl,
    item.title,
  );

  return h(
    Attachment,
    {
      key: item.key,
      'aria-label': item.title,
      class: clickHandler ? 'cursor-pointer' : undefined,
      data: item.data,
      role: clickHandler ? 'button' : undefined,
      tabindex: clickHandler ? 0 : undefined,
      title: item.title,
      onClick: clickHandler,
      onKeydown: clickHandler
        ? (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
              return;
            }
            event.preventDefault();
            clickHandler();
          }
        : undefined,
    },
    () => [h(AttachmentPreview), h(AttachmentInfo)],
  );
}

function renderMessageFiles(
  message: ChatMessageItem,
  files: AIChatFileMessageBlock[],
  options: { key?: string; startIndex?: number } = {},
) {
  const visibleFiles = files.filter((file) => Boolean(file.url || file.name));

  if (visibleFiles.length === 0) {
    return null;
  }

  const key = options.key ?? 'files';
  const startIndex = options.startIndex ?? 0;
  const generatedImageFiles =
    message.role === 'assistant' ? visibleFiles.filter(isImageFile) : [];
  const attachmentFiles =
    message.role === 'assistant'
      ? visibleFiles.filter((file) => !isImageFile(file))
      : visibleFiles;
  const children: VNodeChild[] = [];

  if (generatedImageFiles.length > 0) {
    children.push(
      h(
        'div',
        {
          key: `${message.id}-${key}-images`,
          class: 'flex max-w-full flex-wrap items-start gap-2',
        },
        generatedImageFiles.map((file, index) =>
          renderMessageImage(file, startIndex + index),
        ),
      ),
    );
  }

  if (attachmentFiles.length > 0) {
    children.push(
      h(
        Attachments,
        {
          key: `${message.id}-${key}-attachments`,
          class: message.role === 'assistant' ? '!ml-0' : undefined,
          variant: 'grid',
        },
        () =>
          attachmentFiles.map((file, index) =>
            renderMessageAttachment(
              toMessageAttachmentData(message, file, startIndex + index),
            ),
          ),
      ),
    );
  }

  return h(
    'div',
    { key: `${message.id}-${key}`, class: 'max-w-full space-y-2' },
    children,
  );
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

function renderDataPreview(data: unknown, title: string): VNodeChild {
  if (data === undefined || data === null) {
    return null;
  }

  let content: string;
  try {
    content = JSON.stringify(data, null, 2);
  } catch {
    content = String(data);
  }

  if (!content) {
    return null;
  }

  return h(
    CodeBlock,
    {
      class: 'max-h-[360px]',
      code: content,
      language: 'json',
    },
    () => [
      h(CodeBlockHeader, {}, () => [
        h(CodeBlockTitle, {}, () => title || 'JSON'),
        h(CodeBlockActions, {}, () => h(CodeBlockCopyButton)),
      ]),
    ],
  );
}

function formatEventTextPreview(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

function renderEventTextPreview(text: string, title: string): VNodeChild {
  const content = formatEventTextPreview(text);
  if (!content) {
    return null;
  }

  const truncated =
    content.length > MAX_EVENT_TEXT_PREVIEW_LENGTH
      ? `${content.slice(0, MAX_EVENT_TEXT_PREVIEW_LENGTH)}\n\n内容过长，已截断以保持页面流畅。`
      : content;

  return h('div', { class: 'min-w-0 space-y-1.5' }, [
    h(
      'div',
      {
        class: 'text-[11px] font-medium leading-none text-muted-foreground',
      },
      title,
    ),
    h(
      'pre',
      {
        class:
          'max-h-[260px] max-w-full overflow-auto rounded-xl border border-border/70 bg-background/80 p-3 text-xs leading-5 text-foreground shadow-inner',
      },
      truncated,
    ),
  ]);
}

function renderEventContent(
  item: AIChatEventMessageBlock,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
): VNodeChild {
  const children: VNodeChild[] = [];
  const eventText = item.text?.trim() ?? '';

  if (item.status === 'error' && eventText) {
    children.push(
      h(MarkdownContent, {
        content: eventText,
      }),
    );
  }

  if (
    item.status !== 'error' &&
    eventText &&
    eventBlockHasAnyType(item, TOOL_CALL_ARG_EVENT_TYPES)
  ) {
    children.push(renderEventTextPreview(eventText, '工具参数'));
  }

  if (
    item.status !== 'error' &&
    eventText &&
    eventBlockHasAnyType(item, TOOL_CALL_RESULT_EVENT_TYPES)
  ) {
    children.push(renderEventTextPreview(eventText, '工具结果'));
  }

  const shouldPreviewEventData =
    item.status === 'error' ||
    (eventBlockHasAnyType(item, TOOL_CALL_RESULT_EVENT_TYPES) &&
      Boolean((item.data as { contentPreview?: unknown })?.contentPreview));
  const dataPreview = shouldPreviewEventData
    ? renderDataPreview(
        item.data,
        item.status === 'error' ? '错误详情' : '工具结果详情',
      )
    : null;
  if (dataPreview) {
    children.push(dataPreview);
  }

  if (children.length === 0) {
    return null;
  }

  return h('div', { class: 'min-w-0 space-y-2' }, children);
}

type EventStepStatus = 'abort' | 'error' | 'loading' | 'success' | 'wait';
type TaskStatus = 'active' | 'cancelled' | 'completed' | 'error' | 'pending';
function toEventStepStatus(
  status: AIChatEventMessageBlock['status'],
): EventStepStatus {
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
      return 'wait';
    }
  }
}

function toTaskStatus(status: EventStepStatus): TaskStatus {
  switch (status) {
    case 'abort': {
      return 'cancelled';
    }
    case 'error': {
      return 'error';
    }
    case 'loading': {
      return 'active';
    }
    case 'success': {
      return 'completed';
    }
    default: {
      return 'pending';
    }
  }
}

function renderToolGroupContent(group: ToolEventGroup) {
  const inputEvent = getLatestToolEventByType(group, TOOL_CALL_ARG_EVENT_TYPES);
  const outputEvent = getLatestToolEventByType(
    group,
    TOOL_OUTPUT_AVAILABLE_EVENT_TYPES,
  );
  let errorEvent: AIChatEventMessageBlock | undefined;
  for (let index = group.events.length - 1; index >= 0; index -= 1) {
    const event = group.events[index];
    if (event && hasToolError(event)) {
      errorEvent = event;
      break;
    }
  }
  const children: VNodeChild[] = [];

  if (inputEvent) {
    const inputPayload = getToolPayload(inputEvent);
    if (hasToolPayload(inputPayload)) {
      children.push(
        h(ToolInput as Component, {
          input: inputPayload,
        }),
      );
    }
  }

  if (errorEvent) {
    const errorText =
      getToolErrorText(errorEvent) || errorEvent.text || errorEvent.title;
    children.push(
      h(ToolOutput as Component, {
        errorText,
        output: undefined,
      }),
    );
  } else if (outputEvent) {
    const outputPayload = getToolPayload(outputEvent);
    children.push(
      h(ToolOutput as Component, {
        errorText: undefined,
        output: hasToolPayload(outputPayload) ? outputPayload : undefined,
      }),
    );
  }

  return children.length > 0 ? children : null;
}

function getToolGroupDisplayName(group: ToolEventGroup) {
  const namedEvent =
    group.events.find((event) => event.summary) ?? group.events[0];

  return namedEvent ? getToolEventDisplayName(namedEvent) : group.id;
}

function renderToolEventGroup(group: ToolEventGroup) {
  const state = getToolGroupState(group);
  const title = getToolGroupDisplayName(group);
  const content = renderToolGroupContent(group);

  return h(
    Tool,
    {
      class: 'mb-0',
      defaultOpen: false,
      key: group.key,
    },
    () => [
      h(ToolHeader as Component, {
        state,
        title,
        toolName: title,
        type: 'dynamic-tool',
      }),
      content ? h(ToolContent, {}, () => content) : null,
    ],
  );
}

function renderToolEvent(item: AIChatEventMessageBlock) {
  const group = createToolEventGroup(item);
  group.events.push(item);
  return renderToolEventGroup(group);
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

function renderEventStep(item: AIChatEventMessageBlock, content: VNodeChild) {
  if (isToolEventBlock(item)) {
    return renderToolEvent(item);
  }

  const status = toEventStepStatus(item.status);
  const title = getEventDisplayTitle(item);
  const description = getEventDisplayDescription(item);

  return h(
    ChatTask,
    {
      key: `${item.event_key || item.event_type}:${item.event_type}`,
      defaultOpen: item.status === 'running' || item.status === 'error',
    },
    () => [
      h(ChatTaskTrigger, {
        description:
          description && description !== title ? description : undefined,
        status: toTaskStatus(status),
        title,
      }),
      content
        ? h(ChatTaskContent, {}, () =>
            h(ChatTaskItem, { class: 'min-w-0 space-y-2' }, () => [content]),
          )
        : null,
    ],
  );
}

function renderMessageEvents(
  events: AIChatEventMessageBlock[],
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
) {
  if (events.length === 0) {
    return null;
  }

  const items = createMessageEventRenderItems(events);

  return h(
    'div',
    { class: 'not-prose my-3 flex min-w-0 max-w-full flex-col gap-3' },
    items.map((item) =>
      item.type === 'tool'
        ? renderToolEventGroup(item.group)
        : renderEventStep(
            item.event,
            renderEventContent(item.event, MarkdownContent),
          ),
    ),
  );
}

function isAssistantMessageLoading(message: ChatMessageItem) {
  if (message.role !== 'assistant' || !message.streaming) {
    return false;
  }

  return !(
    getMessageTextContent(message, 'text').trim() ||
    getMessageTextContent(message, 'reasoning').trim() ||
    getMessageFileBlocks(message).length > 0 ||
    getVisibleMessageEvents(message).length > 0
  );
}

function renderErrorMessageContent(
  content: string,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  streaming: ReturnType<typeof createAIReplyMarkdownStreaming>,
) {
  const displayContent = content.trim() || '当前请求没有返回可用内容';

  return h(MarkdownContent, {
    class: 'ai-message-error text-destructive',
    content: displayContent,
    role: 'alert',
    streaming,
  });
}

function renderReasoningBlock(
  message: ChatMessageItem,
  content: string,
  panelKey: string,
  options: Pick<
    CreateChatMessageListRoleOptions,
    'isThinkingExpanded' | 'setThinkingExpanded'
  >,
) {
  const thinkingActive = isThinkingActive(message);
  return h(Think, {
    content,
    key: `${message.id}-${panelKey}`,
    expanded: options.isThinkingExpanded(message, panelKey),
    status: thinkingActive ? 'loading' : undefined,
    'onUpdate:expanded': (expanded: boolean) => {
      options.setThinkingExpanded(message, expanded, panelKey);
    },
  });
}

function isProcessFoldLoading(
  message: ChatMessageItem,
  blockIndexes: number[],
) {
  if (!message.streaming) {
    return false;
  }

  return blockIndexes.some((index) => {
    const block = message.blocks[index];
    return block?.type === 'event' && block.status === 'running';
  }) || isThinkingActive(message);
}

function renderProcessFold(
  message: ChatMessageItem,
  plan: MessageProcessFoldPlan,
  MarkdownContent: ReturnType<typeof createMarkdownContentRenderer>,
  options: Pick<
    CreateChatMessageListRoleOptions,
    'isThinkingExpanded' | 'setThinkingExpanded'
  >,
) {
  const children: VNodeChild[] = [];
  let eventRun: AIChatEventMessageBlock[] = [];

  const flushEventRun = () => {
    if (eventRun.length === 0) {
      return;
    }

    const eventsNode = renderMessageEvents(eventRun, MarkdownContent);
    if (eventsNode) {
      children.push(eventsNode);
    }
    eventRun = [];
  };

  for (const index of plan.blockIndexes) {
    const block = message.blocks[index];
    if (!block) {
      continue;
    }

    if (block.type === 'event') {
      eventRun.push(block);
      continue;
    }

    flushEventRun();
    if (block.type === 'reasoning') {
      children.push(
        renderReasoningBlock(
          message,
          block.text,
          `reasoning-${index}`,
          options,
        ),
      );
    }
  }

  flushEventRun();

  const loading = isProcessFoldLoading(message, plan.blockIndexes);
  const title = loading
    ? `${plan.toolCount > 0 ? '正在调用工具' : '正在思考'} · ${plan.title}`
    : plan.title;

  return h(
    ChainOfThought,
    {
      key: `${message.id}-process`,
      defaultOpen: plan.mode === 'streaming' && !plan.hasResult,
    },
    () => [
      h(ChainOfThoughtHeader, {}, () => title),
      h(ChainOfThoughtContent, {}, () => children),
    ],
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

export function renderChatMessageContent(
  message: ChatMessageItem,
  options: Pick<
    CreateChatMessageListRoleOptions,
    'isDark' | 'isThinkingExpanded' | 'setThinkingExpanded'
  >,
): VNodeChild {
  const MarkdownContent = createMarkdownContentRenderer(options.isDark);
  const markdownStreaming = createAIReplyMarkdownStreaming(message);
  const text = getMessageTextContent(message, 'text');

  if (message.message_type === 'error') {
    return renderErrorMessageContent(text, MarkdownContent, markdownStreaming);
  }

  const allEvents = getMessageEventBlocks(message);
  const sourceItems = collectSourceItems(allEvents);
  const processFoldPlan = createMessageProcessFoldPlan(
    message,
    shouldShowEventBlock,
  );
  const foldedBlockIndexes = new Set(processFoldPlan?.blockIndexes ?? []);
  const children: VNodeChild[] = [];
  let eventRun: AIChatEventMessageBlock[] = [];
  let fileRun: AIChatFileMessageBlock[] = [];
  let fileRenderIndex = 0;

  const flushEventRun = () => {
    if (eventRun.length === 0) {
      return;
    }

    const eventsNode = renderMessageEvents(eventRun, MarkdownContent);
    if (eventsNode) {
      children.push(eventsNode);
    }
    eventRun = [];
  };

  const flushFileRun = () => {
    if (fileRun.length === 0) {
      return;
    }

    const filesNode = renderMessageFiles(message, fileRun, {
      key: `files-${children.length}`,
      startIndex: fileRenderIndex,
    });
    fileRenderIndex += fileRun.length;
    if (filesNode) {
      children.push(filesNode);
    }
    fileRun = [];
  };

  const renderTextBlock = (content: string, index: number) => {
    const inlineExtraction = extractMarkdownInlineFiles(
      content,
      `${message.id}-text-${index}`,
    );

    if (inlineExtraction.content.trim()) {
      children.push(
        h(MarkdownContent, {
          key: `${message.id}-markdown-${index}`,
          content: inlineExtraction.content,
          sourceItems,
          streaming: markdownStreaming,
        }),
      );
    }

    if (inlineExtraction.files.length > 0) {
      const filesNode = renderMessageFiles(message, inlineExtraction.files, {
        key: `${inlineExtraction.key}-files`,
        startIndex: fileRenderIndex,
      });
      fileRenderIndex += inlineExtraction.files.length;
      if (filesNode) {
        children.push(filesNode);
      }
    }
  };

  const processFoldStartIndex = processFoldPlan?.blockIndexes[0];

  message.blocks.forEach((block, index) => {
    if (processFoldPlan && processFoldStartIndex === index) {
      flushEventRun();
      flushFileRun();
      children.push(
        renderProcessFold(message, processFoldPlan, MarkdownContent, options),
      );
    }

    if (foldedBlockIndexes.has(index)) {
      return;
    }

    if (block.type === 'event') {
      flushFileRun();
      if (shouldShowEventBlock(message, block)) {
        eventRun.push(block);
      }
      return;
    }

    flushEventRun();

    if (block.type === 'file') {
      fileRun.push(block);
      return;
    }

    flushFileRun();

    if (block.type === 'reasoning') {
      if (block.text.trim()) {
        children.push(
          renderReasoningBlock(
            message,
            block.text,
            `reasoning-${index}`,
            options,
          ),
        );
      }
      return;
    }

    renderTextBlock(block.text, index);
  });

  flushEventRun();
  flushFileRun();

  const sourcesNode = renderInlineSourcePanel(sourceItems);
  if (sourcesNode) {
    children.push(
      h('div', { key: `${message.id}-sources`, class: 'min-w-0 max-w-full' }, [
        sourcesNode,
      ]),
    );
  }

  if (children.length === 0 && message.streaming) {
    return null;
  }

  return h('div', { class: 'min-w-0 max-w-full space-y-3' }, children);
}

function renderMessageHeader(
  message: ChatMessageItem,
  options: Pick<
    CreateChatMessageListRoleOptions,
    | 'getProviderLabel'
    | 'selectedModelId'
    | 'selectedModelLabel'
    | 'selectedProviderId'
    | 'selectedProviderLabel'
  > = {},
) {
  const displayName = getMessageDisplayName(
    message,
    options.selectedModelId ?? undefined,
    options.selectedModelLabel,
  );
  const providerName = getMessageProviderDisplayName(message, options);
  const title = providerName ? `${displayName} | ${providerName}` : displayName;

  return h(
    'div',
    {
      class: [
        'mb-2 min-w-0',
        message.role === 'user' ? 'text-right' : 'text-left',
      ],
    },
    [
      h(
        'div',
        {
          class:
            'truncate text-[15px] font-semibold leading-5 tracking-tight text-foreground/90',
          title,
        },
        title,
      ),
      h(
        'div',
        {
          class: 'mt-0.5 text-[10px] leading-4 text-muted-foreground/80',
        },
        parseDateLabel(message.created_time),
      ),
    ],
  );
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

function getMessageActionItems(
  message: ChatMessageItem,
  options: Pick<
    CreateChatMessageListRoleOptions,
    | 'onBeginEditMessage'
    | 'onConfirmDeleteMessage'
    | 'onRegenerateMessage'
    | 'onRegenerateUserMessage'
  >,
): ActionsProps['items'] {
  const items: ActionsProps['items'] = [
    {
      icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:content-copy' }),
      key: 'copy',
      label: '复制',
      onItemClick: () =>
        navigator.clipboard?.writeText(getMessageCopyText(message)),
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
        label: '编辑',
        onItemClick: () => options.onBeginEditMessage(message, 'save'),
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
    CreateChatMessageListRoleOptions,
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

export function createChatMessageListRole(
  options: CreateChatMessageListRoleOptions,
): ChatMessageListProps['role'] {
  return {
    assistant: (item) => {
      const message = getMessageListItemMessage(item);
      if (!message) {
        return {
          placement: 'start',
          shape: 'default',
          variant: 'outlined',
        };
      }

      return {
        editable: false,
        loading: isAssistantMessageLoading(message),
        footer: renderMessageFooter(message, options),
        footerPlacement: 'outer-start',
        header: renderMessageHeader(message, options),
        placement: 'start',
        shape: 'default',
        streaming: Boolean(message.streaming),
        variant: 'outlined',
      };
    },
    divider: {},
    user: (item) => {
      const message = getMessageListItemMessage(item);
      if (!message) {
        return {
          placement: 'end',
          shape: 'default',
          variant: 'outlined',
        };
      }

      return {
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
        onEditCancel: options.onCancelEditMessage,
        onEditConfirm: (value) =>
          options.editingMessageIntent === 'resend'
            ? options.onResendEditedMessage(String(value))
            : options.onSaveEditedMessage(String(value)),
        onEditResend: (value) => options.onResendEditedMessage(String(value)),
        onEditSave: (value) => options.onSaveEditedMessage(String(value)),
        placement: 'end',
        shape: 'default',
        variant: 'outlined',
      };
    },
  };
}
