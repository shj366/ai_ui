import type { InputContentSource } from '@ag-ui/core';

import type {
  AIChatAttachmentType,
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
  AIChatMessageBlock,
} from '../../types/message';

import {
  normalizeAIChatEventBlock,
  normalizeAIChatFileBlock,
  uniqueAIChatEventTypes,
} from '../message';
import { isRecord, parseDataUrl } from './utils';

function buildAGUIDataUrl(
  data?: null | string,
  mimeType?: null | string,
  fallbackMimeType?: null | string,
) {
  if (typeof data !== 'string') {
    return null;
  }

  const resolvedMimeType = mimeType ?? fallbackMimeType;
  if (!resolvedMimeType) {
    return null;
  }

  return `data:${resolvedMimeType};base64,${data}`;
}

export const AGUI_SYSTEM_MESSAGE_EVENT_TYPE = 'SYSTEM_MESSAGE';
export const AGUI_DEVELOPER_MESSAGE_EVENT_TYPE = 'DEVELOPER_MESSAGE';

function normalizeAGUIVisualEventType(type: string) {
  switch (type) {
    case 'THINKING_END': {
      return 'REASONING_END';
    }
    case 'THINKING_START': {
      return 'REASONING_START';
    }
    case 'THINKING_TEXT_MESSAGE_CONTENT': {
      return 'REASONING_MESSAGE_CONTENT';
    }
    case 'THINKING_TEXT_MESSAGE_END': {
      return 'REASONING_MESSAGE_END';
    }
    case 'THINKING_TEXT_MESSAGE_START': {
      return 'REASONING_MESSAGE_START';
    }
    default: {
      return type;
    }
  }
}

function getAGUIEventTypes(type: string, extras?: string[]) {
  const normalizedType = normalizeAGUIVisualEventType(type);
  return uniqueAIChatEventTypes(normalizedType, type, extras);
}

export function createAGUIEventBlock(params: {
  data?: unknown;
  eventKey: string;
  eventType: string;
  extraEventTypes?: string[];
  status?: AIChatEventMessageBlock['status'];
  summary?: string;
  text?: string;
  title: string;
}): AIChatEventMessageBlock {
  return normalizeAIChatEventBlock({
    data: params.data,
    event_key: params.eventKey,
    event_type: normalizeAGUIVisualEventType(params.eventType),
    event_types: getAGUIEventTypes(params.eventType, params.extraEventTypes),
    status: params.status,
    summary: params.summary,
    text: params.text,
    title: params.title,
    type: 'event',
  });
}

export function createAGUIInputSourceFileBlock(
  type: AIChatAttachmentType,
  source?: InputContentSource | null,
  name?: null | string,
  mimeType?: null | string,
): AIChatFileMessageBlock {
  const resolvedMimeType = mimeType ?? source?.mimeType ?? null;
  let sourceType: 'base64' | 'url' | null = null;
  if (source?.type === 'data') {
    sourceType = 'base64';
  } else if (source?.type === 'url') {
    sourceType = 'url';
  }

  return normalizeAIChatFileBlock({
    file_type: type,
    mime_type: resolvedMimeType,
    name: name ?? null,
    source_type: sourceType,
    type: 'file',
    url:
      source?.type === 'url'
        ? source.value
        : buildAGUIDataUrl(
            source?.type === 'data' ? source.value : null,
            resolvedMimeType,
            'application/octet-stream',
          ),
  });
}

export function createAGUIBinaryFileBlock(params: {
  data?: null | string;
  fileType?: AIChatAttachmentType | null;
  mimeType?: null | string;
  name?: null | string;
  url?: null | string;
  urlMimeTypeFallback?: null | string;
}): AIChatFileMessageBlock {
  let sourceType: 'base64' | 'url' | null = null;
  if (typeof params.data === 'string') {
    sourceType = 'base64';
  } else if (typeof params.url === 'string') {
    sourceType = 'url';
  }

  return normalizeAIChatFileBlock({
    file_type: params.fileType ?? null,
    mime_type: params.mimeType ?? null,
    name: params.name ?? null,
    source_type: sourceType,
    type: 'file',
    url:
      params.url ??
      buildAGUIDataUrl(
        params.data,
        params.mimeType,
        params.urlMimeTypeFallback,
      ),
  });
}

function getStringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function inferAttachmentType(
  fileType?: null | string,
  mimeType?: null | string,
): AIChatAttachmentType | null {
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

function expandToolResultValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [value];
  }

  for (const key of ['data', 'files', 'images', 'outputs', 'results']) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return [value];
}

function createToolResultFileBlock(
  value: unknown,
): AIChatFileMessageBlock | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return null;
    }

    const parsed = parseDataUrl(text);
    if (parsed) {
      return createAGUIBinaryFileBlock({
        fileType: inferAttachmentType(null, parsed.mimeType),
        mimeType: parsed.mimeType,
        url: text,
      });
    }

    if (/^https?:\/\//iu.test(text)) {
      return createAGUIBinaryFileBlock({ url: text });
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const rawUrl =
    getStringValue(value, 'url', 'href', 'sourceUrl', 'source_url') ??
    getStringValue(value, 'value');
  const dataUrl = rawUrl ? parseDataUrl(rawUrl) : null;
  const rawData = getStringValue(
    value,
    'b64_json',
    'base64',
    'base64Data',
    'base64_data',
    'data',
  );
  const dataAsUrl = rawData ? parseDataUrl(rawData) : null;
  const url = dataAsUrl ? rawData : rawUrl;
  const data = dataAsUrl || dataUrl ? null : rawData;
  const mimeType =
    getStringValue(
      value,
      'mimeType',
      'mime_type',
      'mediaType',
      'contentType',
    ) ??
    dataAsUrl?.mimeType ??
    dataUrl?.mimeType ??
    (rawData && !dataAsUrl ? 'image/png' : null);
  const rawFileType = getStringValue(value, 'fileType', 'file_type', 'type');
  const fileType = inferAttachmentType(rawFileType, mimeType);

  if (!url && !data) {
    return null;
  }

  return createAGUIBinaryFileBlock({
    data,
    fileType,
    mimeType,
    name: getStringValue(value, 'name', 'filename', 'fileName'),
    url,
    urlMimeTypeFallback: mimeType,
  });
}

export function normalizeAGUIToolResultBlocks(
  content: string,
): AIChatMessageBlock[] {
  const text = content.trim();
  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return expandToolResultValues(parsed)
      .map((value) => createToolResultFileBlock(value))
      .filter((block): block is AIChatFileMessageBlock => block !== null);
  } catch {
    const block = createToolResultFileBlock(text);
    return block ? [block] : [];
  }
}
