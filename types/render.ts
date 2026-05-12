import type { SourcesProps } from '@antdv-next/x';

import type {
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
} from './message';

export type AIChatRenderableSourceItem = NonNullable<
  SourcesProps['items']
>[number];

export type AIChatRenderableEventStatus =
  | 'abort'
  | 'error'
  | 'info'
  | 'running'
  | 'success'
  | 'warning';

export interface AIChatRenderableMarkdownBlock {
  content: string;
  key: string;
  sourceItems?: AIChatRenderableSourceItem[];
  type: 'markdown';
}

export interface AIChatRenderableReasoningBlock {
  content: string;
  key: string;
  title?: string;
  type: 'reasoning';
}

export interface AIChatRenderableFileBlock {
  files: AIChatFileMessageBlock[];
  key: string;
  type: 'files';
}

export interface AIChatRenderableSourcesBlock {
  items: AIChatRenderableSourceItem[];
  key: string;
  title?: string;
  type: 'sources';
}

export interface AIChatRenderableEventItem {
  data?: unknown;
  eventKey: string;
  eventType: string;
  eventTypes?: string[];
  key: string;
  status?: AIChatRenderableEventStatus;
  summary?: string;
  text?: string;
  title: string;
}

export interface AIChatRenderableEventsBlock {
  items: AIChatRenderableEventItem[];
  key: string;
  type: 'events';
}

export interface AIChatRenderableJsonBlock {
  data: unknown;
  key: string;
  title?: string;
  type: 'json';
}

export interface AIChatRenderableHtmlBlock {
  content: string;
  key: string;
  title?: string;
  type: 'html';
}

export interface AIChatRenderableCodeBlock {
  content: string;
  key: string;
  language?: string;
  title?: string;
  type: 'code';
}

export interface AIChatRenderableMermaidBlock {
  content: string;
  key: string;
  title?: string;
  type: 'mermaid';
}

export interface AIChatRenderableUnsupportedBlock {
  data?: unknown;
  key: string;
  reason?: string;
  title: string;
  type: 'unsupported';
}

export type AIChatRenderableBlock =
  | AIChatRenderableCodeBlock
  | AIChatRenderableEventsBlock
  | AIChatRenderableFileBlock
  | AIChatRenderableHtmlBlock
  | AIChatRenderableJsonBlock
  | AIChatRenderableMarkdownBlock
  | AIChatRenderableMermaidBlock
  | AIChatRenderableReasoningBlock
  | AIChatRenderableSourcesBlock
  | AIChatRenderableUnsupportedBlock;

export function isRenderableEventBlock(
  block: AIChatEventMessageBlock,
): block is AIChatEventMessageBlock {
  return block.type === 'event';
}
