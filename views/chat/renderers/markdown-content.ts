import type { BundledLanguage } from 'shiki';
import type { Component, PropType } from 'vue';

import type { ChatMessageItem } from '../../../runtime/message';
import type { SourcesProps } from '../components';

import { defineComponent, h } from 'vue';

import CodeBlock from '#/plugins/ai/components/ai-elements/code-block/CodeBlock.vue';
import CodeBlockActions from '#/plugins/ai/components/ai-elements/code-block/CodeBlockActions.vue';
import CodeBlockCopyButton from '#/plugins/ai/components/ai-elements/code-block/CodeBlockCopyButton.vue';
import CodeBlockHeader from '#/plugins/ai/components/ai-elements/code-block/CodeBlockHeader.vue';
import CodeBlockTitle from '#/plugins/ai/components/ai-elements/code-block/CodeBlockTitle.vue';
import Loader from '#/plugins/ai/components/ai-elements/loader/Loader.vue';
import MessageResponse from '#/plugins/ai/components/ai-elements/message/MessageResponse.vue';

const INLINE_BASE64_MARKER = ';base64,';
const MAX_MARKDOWN_RENDER_LENGTH = 160_000;
const STREAMING_MARKDOWN_SAFETY_LENGTH = 80_000;

export type MarkdownSourceItems = NonNullable<SourcesProps['items']>;

export interface MarkdownStreamingState {
  hasNextChunk: boolean;
}

type MarkdownStreamingInput = boolean | MarkdownStreamingState;

interface SafeMarkdownPayload {
  content: string;
  truncated: boolean;
}

const markdownRendererCache = new Map<
  boolean,
  ReturnType<typeof buildMarkdownContentRenderer>
>();

function getSafeMarkdownPayload(content: string): SafeMarkdownPayload {
  if (content.length <= MAX_MARKDOWN_RENDER_LENGTH) {
    return { content, truncated: false };
  }

  return {
    content: `${content.slice(0, MAX_MARKDOWN_RENDER_LENGTH)}\n\n> 内容过长，已截断以保持页面流畅。`,
    truncated: true,
  };
}

function normalizeMarkdownStreaming(
  streaming?: MarkdownStreamingInput,
): MarkdownStreamingState | undefined {
  if (streaming === undefined) {
    return undefined;
  }

  return typeof streaming === 'boolean'
    ? { hasNextChunk: streaming }
    : { hasNextChunk: Boolean(streaming.hasNextChunk) };
}

export function createAIReplyMarkdownStreaming(
  message: ChatMessageItem,
): MarkdownStreamingState | undefined {
  if (message.role !== 'assistant') {
    return undefined;
  }

  return { hasNextChunk: Boolean(message.streaming) };
}

export function isDataUrl(value?: string): value is string {
  return typeof value === 'string' && /^data:/iu.test(value);
}

export function getDataUrlInfo(value?: string) {
  if (!isDataUrl(value)) {
    return null;
  }

  const markerIndex = value.indexOf(INLINE_BASE64_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const mimeType = value.slice('data:'.length, markerIndex) || undefined;
  const base64Length = value.length - markerIndex - INLINE_BASE64_MARKER.length;
  let padding = 0;
  if (value.endsWith('==')) {
    padding = 2;
  } else if (value.endsWith('=')) {
    padding = 1;
  }

  return {
    byteSize: Math.max(0, Math.floor((base64Length * 3) / 4) - padding),
    mimeType,
  };
}

export function formatByteSize(byteSize?: number) {
  if (!byteSize || byteSize <= 0) {
    return '';
  }

  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

export function normalizeInlineSourceItems(
  sourceItems: MarkdownSourceItems,
): MarkdownSourceItems {
  return sourceItems.map((item, index) => ({
    ...item,
    key: item.key ?? item.url ?? index + 1,
    title: item.title || `来源 ${index + 1}`,
  }));
}

function normalizeCodeLanguage(language = 'text') {
  const normalized = language.trim().toLowerCase() || 'text';
  return normalized === 'mermaid' ? 'markdown' : normalized;
}

export function renderCodeBlock(content: string, language = 'text') {
  const normalizedLanguage = normalizeCodeLanguage(language);
  return h(
    CodeBlock,
    {
      code: content,
      language: normalizedLanguage as BundledLanguage,
    },
    () => [
      h(CodeBlockHeader, {}, () => [
        h(CodeBlockTitle, {}, () => language || 'text'),
        h(CodeBlockActions, {}, () => h(CodeBlockCopyButton)),
      ]),
    ],
  );
}

export function renderMermaidBlock(content: string) {
  return renderCodeBlock(content, 'mermaid');
}

function linkSourceReferences(
  content: string,
  sourceItems: MarkdownSourceItems,
) {
  if (sourceItems.length === 0) {
    return content;
  }

  const items = normalizeInlineSourceItems(sourceItems);
  return content.replaceAll(/\[(\d+)\](?!\()/gu, (match, value: string) => {
    const index = Number.parseInt(value, 10) - 1;
    const item = items[index];
    if (!item?.url) {
      return match;
    }
    return `[${value}](${item.url})`;
  });
}

function renderMarkdownSafetyNotice(content: string) {
  return h('div', { class: 'flex min-w-0 flex-col gap-2' }, [
    content.trim()
      ? h(MessageResponse, {
          class: 'text-sm leading-6',
          content: content.slice(0, 1200),
        })
      : null,
    h('div', { class: 'inline-flex items-center gap-2 text-xs text-muted-foreground' }, [
      h(Loader, { size: 14 }),
      '正在接收图片或大段内容，已暂停 Markdown 实时解析以避免浏览器卡死',
    ]),
  ]);
}

function buildMarkdownContentRenderer(isDark = false) {
  return defineComponent({
    name: isDark ? 'AIElementsMarkdownDark' : 'AIElementsMarkdown',
    props: {
      content: {
        default: '',
        type: String,
      },
      sourceItems: {
        default: () => [],
        type: Array as PropType<MarkdownSourceItems>,
      },
      streaming: {
        default: undefined,
        type: [Boolean, Object] as PropType<MarkdownStreamingInput>,
      },
    },
    setup(props) {
      return () => {
        const content = props.content ?? '';
        const streaming = normalizeMarkdownStreaming(props.streaming);
        const hasNextChunk = Boolean(streaming?.hasNextChunk);
        if (hasNextChunk && content.length > STREAMING_MARKDOWN_SAFETY_LENGTH) {
          return renderMarkdownSafetyNotice(content);
        }

        const payload = getSafeMarkdownPayload(content);
        const sourceItems = normalizeInlineSourceItems(props.sourceItems ?? []);
        const normalizedContent = linkSourceReferences(payload.content, sourceItems);
        const children = [
          h(MessageResponse, {
            class: 'ai-elements-markdown min-w-0 max-w-full text-sm leading-6 text-foreground',
            content: normalizedContent,
          }),
        ];

        if (hasNextChunk) {
          children.push(
            h('span', {
              'aria-hidden': 'true',
              class:
                'ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-primary align-baseline',
            }),
          );
        }

        if (payload.truncated) {
          children.push(
            h('div', { class: 'text-xs leading-5 text-muted-foreground' }, '内容过长，已截断以保持页面流畅'),
          );
        }

        return h(
          'div',
          {
            class: [
              'min-w-0 max-w-full space-y-3',
              isDark ? 'ai-elements-markdown--dark' : '',
            ],
          },
          children,
        );
      };
    },
  });
}

export function createMarkdownContentRenderer(isDark = false): Component {
  const cached = markdownRendererCache.get(isDark);
  if (cached) {
    return cached;
  }

  const renderer = buildMarkdownContentRenderer(isDark);
  markdownRendererCache.set(isDark, renderer);
  return renderer;
}
