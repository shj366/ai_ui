import type { AIChatEventMessageBlock } from '../types/message';
import type {
  AIChatRenderableBlock,
  AIChatRenderableEventItem,
  AIChatRenderableSourceItem,
} from '../types/render';
import type { ChatMessageItem } from './message';

import {
  getMessageEventBlocks,
  getMessageFileBlocks,
  getMessageTextContent,
  normalizeAIChatFileBlock,
} from './message';

type SourceItems = AIChatRenderableSourceItem[];

interface CreateRenderableBlocksOptions {
  getEventSourceItems?: (block: AIChatEventMessageBlock) => SourceItems;
  shouldSuppressEventBlock?: (
    message: ChatMessageItem,
    block: AIChatEventMessageBlock,
  ) => boolean;
}

const DATA_URL_PATTERN = /data:([\w.+-]+\/[\w.+-]+)?;base64,[\w+/=_-]+/giu;
const HTML_MEDIA_TAG_PATTERN =
  /<(audio|img|video)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\2[^>]*>/giu;
const HTML_SOURCE_TAG_PATTERN =
  /<source\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/giu;

function parseDataUrl(url: string) {
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
  const pattern = new RegExp(String.raw`\b${escapedName}\s*=\s*(["'])(.*?)\1`, 'iu');
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
  return /^https?:\/\//iu.test(url) || parseDataUrl(url) !== null;
}

function getSourceItemDedupeKey(item: AIChatRenderableSourceItem) {
  const title = item.title;
  return String(
    item.key ??
      item.url ??
      (typeof title === 'string' || typeof title === 'number' ? title : ''),
  );
}

function collectSourceItems(
  events: AIChatEventMessageBlock[],
  getEventSourceItems?: (block: AIChatEventMessageBlock) => SourceItems,
): SourceItems {
  if (!getEventSourceItems) {
    return [];
  }

  const items: SourceItems = [];
  const seen = new Set<string>();

  for (const block of events) {
    for (const item of getEventSourceItems(block)) {
      const dedupeKey = getSourceItemDedupeKey(item);
      if (!dedupeKey || seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      items.push({
        ...item,
        key: item.key ?? item.url ?? items.length + 1,
      });
    }
  }

  return items;
}

function toRenderableEventItem(
  block: AIChatEventMessageBlock,
  index: number,
): AIChatRenderableEventItem {
  return {
    data: block.data,
    eventKey: block.event_key,
    eventType: block.event_type,
    eventTypes: block.event_types,
    key: block.event_key || `${block.event_type}-${index}`,
    status: block.status,
    summary: block.summary,
    text: block.text,
    title: block.title,
  };
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
    const parsed = parseDataUrl(params.url);
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

  nextContent = nextContent.replaceAll(HTML_MEDIA_TAG_PATTERN, (tag, tagType) => {
    const src = getHtmlAttr(tag, 'src');
    if (!src) {
      return tag;
    }

    const normalizedTagType = String(tagType).toLowerCase();
    const shouldExtract =
      normalizedTagType === 'audio' ||
      normalizedTagType === 'video' ||
      parseDataUrl(src) !== null;
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
  });

  nextContent = nextContent.replaceAll(HTML_SOURCE_TAG_PATTERN, (tag, _, src) => {
    if (!isRenderableMediaUrl(src)) {
      return tag;
    }

    const mimeType = getHtmlAttr(tag, 'type');
    const name = addFile({ mimeType, tagType: null, url: src });
    return getInlineFileNotice(name);
  });

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

export function createDefaultRenderableBlocks(
  message: ChatMessageItem,
  options: CreateRenderableBlocksOptions = {},
): AIChatRenderableBlock[] {
  const blocks: AIChatRenderableBlock[] = [];
  const reasoningText = getMessageTextContent(message, 'reasoning');
  const text = getMessageTextContent(message, 'text');
  const allEvents = getMessageEventBlocks(message);
  const events = allEvents.filter(
    (block) => !options.shouldSuppressEventBlock?.(message, block),
  );
  const sourceItems = collectSourceItems(allEvents, options.getEventSourceItems);
  const inlineExtraction = extractMarkdownInlineFiles(text, message.id);
  const files = [...getMessageFileBlocks(message), ...inlineExtraction.files];
  const hasTextStarted = Boolean(text.trim());
  const isReasoningActive = Boolean(message.streaming && !hasTextStarted);

  if (reasoningText.trim()) {
    blocks.push({
      content: reasoningText,
      key: `${message.id}-reasoning`,
      title: isReasoningActive ? '思考中' : '思考完成',
      type: 'reasoning',
    });
  }

  if (events.length > 0) {
    blocks.push({
      items: events.map((event, index) =>
        toRenderableEventItem(event, index),
      ),
      key: `${message.id}-events`,
      type: 'events',
    });
  }

  if (inlineExtraction.content.trim()) {
    blocks.push({
      content: inlineExtraction.content,
      key: `${message.id}-markdown`,
      sourceItems,
      type: 'markdown',
    });
  }

  if (sourceItems.length > 0) {
    blocks.push({
      items: sourceItems,
      key: `${message.id}-sources`,
      title: `来源 ${sourceItems.length}`,
      type: 'sources',
    });
  }

  if (files.length > 0) {
    blocks.push({
      files,
      key: `${message.id}-files`,
      type: 'files',
    });
  }

  return blocks;
}
