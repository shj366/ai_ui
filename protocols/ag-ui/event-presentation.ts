import type { SourcesProps } from '@antdv-next/x';

import type { ChatMessageItem } from '#/plugins/ai/runtime/message';
import type { AIChatEventMessageBlock } from '#/plugins/ai/types/message';

import { getMessageTextContent } from '#/plugins/ai/runtime/message';

const TEXT_MESSAGE_EVENT_TYPES = new Set([
  'TEXT_MESSAGE_CHUNK',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'TEXT_MESSAGE_START',
]);

const REASONING_EVENT_TYPES = new Set([
  'REASONING_END',
  'REASONING_MESSAGE_CHUNK',
  'REASONING_MESSAGE_CONTENT',
  'REASONING_MESSAGE_END',
  'REASONING_MESSAGE_START',
  'REASONING_START',
  'THINKING_END',
  'THINKING_START',
  'THINKING_TEXT_MESSAGE_CONTENT',
  'THINKING_TEXT_MESSAGE_END',
  'THINKING_TEXT_MESSAGE_START',
]);

const MAX_SOURCE_STRING_LENGTH = 4096;

type SourceItems = NonNullable<SourcesProps['items']>;

function isExternalUrl(value: string) {
  if (value.length > MAX_SOURCE_STRING_LENGTH) {
    return false;
  }

  return /^https?:\/\//iu.test(value.trim());
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
    items.push({
      description:
        typeof record.description === 'string'
          ? record.description
          : (typeof record.snippet === 'string' ? record.snippet : undefined),
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

export function getAGUIEventSourceItems(
  block: AIChatEventMessageBlock,
): SourceItems {
  const items: SourceItems = [];
  extractSourceItems(block.data, items, new Set<string>());
  return items;
}

export function shouldSuppressAGUIEventBlock(
  message: ChatMessageItem,
  block: AIChatEventMessageBlock,
) {
  const eventType = block.event_type;
  const hasMainText = Boolean(getMessageTextContent(message, 'text').trim());
  const hasReasoning = Boolean(
    getMessageTextContent(message, 'reasoning').trim(),
  );

  if (hasMainText && TEXT_MESSAGE_EVENT_TYPES.has(eventType)) {
    return true;
  }

  if (hasReasoning && REASONING_EVENT_TYPES.has(eventType)) {
    return true;
  }

  return false;
}
