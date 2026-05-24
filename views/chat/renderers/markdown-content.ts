import type { SourcesProps } from '@antdv-next/x';

import type {
  Component,
  FunctionalComponent,
  PropType,
  VNodeArrayChildren,
} from 'vue';

import type { ChatMessageItem } from '#/plugins/ai/runtime/message';

import { defineComponent, h } from 'vue';

import { CodeHighlighter, Mermaid, Sources } from '@antdv-next/x';
import { XMarkdown } from '@antdv-next/x-markdown';
import Latex from '@antdv-next/x-markdown/plugins/Latex';
import { Skeleton } from 'antdv-next';

import '@antdv-next/x-markdown/style.css';
import '@antdv-next/x-markdown/themes/light.css';
import '@antdv-next/x-markdown/themes/dark.css';

const MARKDOWN_STREAM_FALLBACK_COMPONENT = 'incomplete-markdown-fragment';
const MARKDOWN_INCOMPLETE_IMAGE_COMPONENT = 'incomplete-image';
const MARKDOWN_INCOMPLETE_LINK_COMPONENT = 'incomplete-link';
const MARKDOWN_INCOMPLETE_TABLE_COMPONENT = 'incomplete-table';
const MARKDOWN_INCOMPLETE_HTML_COMPONENT = 'incomplete-html';
const MARKDOWN_INCOMPLETE_EMPHASIS_COMPONENT = 'incomplete-emphasis';
const MARKDOWN_INCOMPLETE_INLINE_CODE_COMPONENT = 'incomplete-inline-code';
const INLINE_DATA_IMAGE_MARKER = 'data:image/';
const INLINE_BASE64_MARKER = ';base64,';
const MAX_HIGHLIGHTED_CODE_LENGTH = 60_000;
const MAX_MARKDOWN_RENDER_LENGTH = 160_000;
const MAX_MARKDOWN_DATA_IMAGE_BYTES = 8 * 1024 * 1024;
const STREAMING_MARKDOWN_SAFETY_LENGTH = 80_000;
const MARKDOWN_CONFIG = {
  breaks: true,
  extensions: Latex(),
  gfm: true,
};

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

function extractMarkdownSlotText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractMarkdownSlotText(item)).join('');
  }

  if (value && typeof value === 'object' && 'children' in value) {
    return extractMarkdownSlotText((value as { children?: unknown }).children);
  }

  return '';
}

function decodeIncompleteMarkdownRaw(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getSafeMarkdownMediaSource(value: unknown) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (isSafeMarkdownDataImage(source)) {
    return source;
  }

  if (
    !source ||
    source.length > 2048 ||
    isDataUrl(source) ||
    /^javascript:/iu.test(source)
  ) {
    return '';
  }

  return source;
}

function getSafeMarkdownHref(value: unknown) {
  const href = typeof value === 'string' ? value.trim() : '';
  if (
    !href ||
    href.length > 4096 ||
    isDataUrl(href) ||
    /^(?:javascript|vbscript):/iu.test(href)
  ) {
    return '';
  }

  return href;
}

function getMarkdownCodeLanguage(attrs: Record<string, unknown>) {
  const dataLang =
    typeof attrs['data-lang'] === 'string' ? attrs['data-lang'] : '';
  const dataLangCamel =
    typeof attrs.dataLang === 'string' ? attrs.dataLang : '';
  const lang = typeof attrs.lang === 'string' ? attrs.lang : '';
  const className = typeof attrs.class === 'string' ? attrs.class : '';
  const classLang =
    className.match(/(?:^|\s)language-([^\s]+)/u)?.[1] ??
    className.match(/(?:^|\s)lang-([^\s]+)/u)?.[1] ??
    '';

  return (dataLang || dataLangCamel || lang || classLang || 'text')
    .trim()
    .toLowerCase();
}

function getMarkdownBooleanAttr(
  attrs: Record<string, unknown>,
  ...keys: string[]
) {
  return keys.some((key) => attrs[key] === true || attrs[key] === 'true');
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
  const byteSize = Math.max(0, Math.floor((base64Length * 3) / 4) - padding);

  return {
    byteSize,
    mimeType,
  };
}

function isSafeMarkdownDataImage(value: string) {
  if (!/^data:image\/(?!svg\+xml)[\w.+-]+;base64,/iu.test(value)) {
    return false;
  }

  const info = getDataUrlInfo(value);
  return Boolean(info && info.byteSize <= MAX_MARKDOWN_DATA_IMAGE_BYTES);
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

function getSafeMarkdownPayload(content: string): SafeMarkdownPayload {
  if (content.length <= MAX_MARKDOWN_RENDER_LENGTH) {
    return {
      content,
      truncated: false,
    };
  }

  return {
    content: `${content.slice(0, MAX_MARKDOWN_RENDER_LENGTH)}\n\n> 内容过长，已截断以保持页面流畅。`,
    truncated: true,
  };
}

function shouldUseStreamingMarkdownFallback(content: string) {
  return content.length > STREAMING_MARKDOWN_SAFETY_LENGTH;
}

function normalizeMarkdownStreaming(
  streaming?: MarkdownStreamingInput,
): MarkdownStreamingState | undefined {
  if (streaming === undefined) {
    return undefined;
  }

  if (typeof streaming === 'boolean') {
    return {
      hasNextChunk: streaming,
    };
  }

  return {
    hasNextChunk: Boolean(streaming.hasNextChunk),
  };
}

export function createAIReplyMarkdownStreaming(
  message: ChatMessageItem,
): MarkdownStreamingState | undefined {
  if (message.role !== 'assistant') {
    return undefined;
  }

  return {
    hasNextChunk: Boolean(message.streaming),
  };
}

export function renderCodeBlock(
  content: string,
  language = 'text',
  isDark = false,
) {
  if (content.length > MAX_HIGHLIGHTED_CODE_LENGTH) {
    return renderPlainCodeBlock(
      `${content.slice(0, MAX_HIGHLIGHTED_CODE_LENGTH)}\n\n/* 内容过长，已截断以保持页面流畅。 */`,
      language,
    );
  }

  return h('div', { class: 'min-w-0 w-full max-w-full overflow-hidden' }, [
    h(CodeHighlighter, {
      content,
      language,
      showThemeToggle: false,
      theme: isDark ? 'dark' : 'light',
    }),
  ]);
}

function renderPlainCodeBlock(content: string, language = 'text') {
  return h(
    'pre',
    {
      class:
        'max-h-[420px] max-w-full overflow-auto rounded-xl bg-muted p-3 text-xs leading-5 text-foreground',
    },
    [h('code', { class: `language-${language}` }, content)],
  );
}

export function renderMermaidBlock(content: string, isDark = false) {
  if (content.length > MAX_HIGHLIGHTED_CODE_LENGTH) {
    return renderPlainCodeBlock(content, 'mermaid');
  }

  return h('div', { class: 'max-w-full overflow-x-auto' }, [
    h(Mermaid, {
      codeHighlighterProps: {
        showThemeToggle: false,
        theme: isDark ? 'dark' : 'light',
      },
      content,
    }),
  ]);
}

function renderMarkdownSafetyNotice(content: string) {
  const markerIndex = content.indexOf(INLINE_DATA_IMAGE_MARKER);
  const preview =
    markerIndex > 0
      ? content.slice(0, Math.min(markerIndex, 1200)).trim()
      : content.slice(0, 1200).trim();

  return h('div', { class: 'space-y-2' }, [
    preview
      ? h(
          'div',
          {
            class:
              'text-sm leading-6 whitespace-pre-wrap break-words text-foreground/90',
          },
          preview,
        )
      : null,
    h(
      'div',
      {
        class:
          'rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2 text-xs leading-5 text-muted-foreground',
      },
      '正在接收图片或大段内容，已暂停 Markdown 实时解析以避免浏览器卡死。',
    ),
  ]);
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

function createMarkdownSupComponent(sourceItems: MarkdownSourceItems) {
  const normalizedItems = normalizeInlineSourceItems(sourceItems);
  const MarkdownSupSources: FunctionalComponent = (_, { slots }) => {
    const title = extractMarkdownSlotText(slots.default?.()).trim();
    const sourceIndex = Number.parseInt(title || '0', 10) - 1;
    const activeItem =
      normalizedItems[sourceIndex] ??
      normalizedItems.find((item) => String(item.key) === title);

    if (!activeItem) {
      return h(
        'sup',
        {
          class:
            'mx-0.5 rounded bg-primary/10 px-1 text-[0.72em] font-semibold text-primary',
        },
        slots.default?.() as undefined | VNodeArrayChildren,
      );
    }

    return h(Sources, {
      activeKey: activeItem.key,
      inline: true,
      items: normalizedItems,
      title: title || activeItem.key,
    });
  };

  return MarkdownSupSources;
}

function buildMarkdownContentRenderer(isDark = false) {
  const markdownClassName = [
    'x-markdown',
    isDark ? 'x-markdown-dark' : 'x-markdown-light',
    'min-w-0 max-w-full',
  ].join(' ');

  const MarkdownPre: FunctionalComponent = (_, { slots }) => {
    return h(
      'div',
      { class: 'max-w-full overflow-x-auto' },
      (slots.default?.() as undefined | VNodeArrayChildren) ?? undefined,
    );
  };

  const IncompleteMarkdownFragment: FunctionalComponent = (_, { attrs }) => {
    const content = decodeIncompleteMarkdownRaw(attrs['data-raw']);
    if (!content) {
      return null;
    }

    return h(
      'span',
      {
        class: 'whitespace-pre-wrap break-words text-foreground/80',
      },
      content,
    );
  };

  const IncompleteImage: FunctionalComponent = () => {
    return h(Skeleton.Image, {
      active: true,
      style: {
        height: '60px',
        width: '60px',
      },
    });
  };

  const IncompleteLink: FunctionalComponent = (_, { attrs }) => {
    const text = decodeIncompleteMarkdownRaw(attrs['data-raw']);
    const linkTextMatch = text.match(/^\[([^\]]*)\]/u);
    const displayText = linkTextMatch ? linkTextMatch[1] : text.slice(1);

    return h(
      'a',
      {
        class: 'text-primary underline underline-offset-4',
        href: '#',
        style: { pointerEvents: 'none' },
      },
      displayText,
    );
  };

  const IncompleteTable: FunctionalComponent = () => {
    return h(Skeleton.Node, {
      active: true,
      style: {
        width: '160px',
      },
    });
  };

  const IncompleteHtml: FunctionalComponent = () => {
    return h(Skeleton.Node, {
      active: true,
      style: {
        height: '120px',
        width: 'min(383px, 100%)',
      },
    });
  };

  const IncompleteEmphasis: FunctionalComponent = (_, { attrs }) => {
    const text = decodeIncompleteMarkdownRaw(attrs['data-raw']);
    const match = text.match(/^([*_]{1,3})([^*_]*)/u);
    if (!match?.[2]) {
      return null;
    }

    const symbols = match[1] ?? '';
    const content = match[2] ?? '';
    if (symbols.length === 1) {
      return h('em', content);
    }
    if (symbols.length === 2) {
      return h('strong', content);
    }
    return h('em', [h('strong', content)]);
  };

  const IncompleteInlineCode: FunctionalComponent = (_, { attrs }) => {
    const text = decodeIncompleteMarkdownRaw(attrs['data-raw']);
    if (!text) {
      return null;
    }

    return h(
      'code',
      {
        class:
          'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground',
      },
      text.slice(1),
    );
  };

  const MarkdownCode: FunctionalComponent = (_, { attrs, slots }) => {
    const content = extractMarkdownSlotText(slots.default?.());
    const language = getMarkdownCodeLanguage(attrs);
    const isBlock = getMarkdownBooleanAttr(
      attrs,
      'data-block',
      'dataBlock',
      'block',
    );
    const streamStatus = attrs.streamStatus;

    if (!isBlock) {
      return h(
        'code',
        {
          class:
            'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground',
        },
        slots.default?.() as undefined | VNodeArrayChildren,
      );
    }

    if (streamStatus === 'loading') {
      return renderPlainCodeBlock(content, language);
    }

    if (language === 'mermaid') {
      return renderMermaidBlock(content, isDark);
    }

    return renderCodeBlock(content, language, isDark);
  };

  const MarkdownImage: FunctionalComponent = (_, { attrs }) => {
    const src = getSafeMarkdownMediaSource(attrs.src);
    if (
      !src ||
      src.startsWith('about:blank#generated-image') ||
      isDataUrl(src)
    ) {
      return null;
    }

    return h('img', {
      ...attrs,
      class: ['max-w-full rounded-xl', attrs.class].filter(Boolean).join(' '),
      decoding: 'async',
      loading: 'lazy',
      src,
    });
  };

  const MarkdownAnchor: FunctionalComponent = (_, { attrs, slots }) => {
    const href = getSafeMarkdownHref(attrs.href);
    if (!href) {
      return h(
        'span',
        {
          class: ['font-medium text-foreground', attrs.class]
            .filter(Boolean)
            .join(' '),
        },
        slots.default?.() as undefined | VNodeArrayChildren,
      );
    }

    return h(
      'a',
      {
        ...attrs,
        class: [
          'font-medium text-primary underline underline-offset-4 hover:text-primary/80',
          attrs.class,
        ]
          .filter(Boolean)
          .join(' '),
        href,
        rel: 'noopener noreferrer',
        target: '_blank',
      },
      slots.default?.() as undefined | VNodeArrayChildren,
    );
  };

  const MarkdownBlockquote: FunctionalComponent = (_, { slots }) => {
    return h(
      'blockquote',
      {
        class:
          'my-3 border-l-4 border-primary/40 bg-muted/35 py-2 pl-4 pr-3 text-muted-foreground',
      },
      slots.default?.() as undefined | VNodeArrayChildren,
    );
  };

  const MarkdownTable: FunctionalComponent = (_, { slots }) => {
    return h(
      'div',
      {
        class:
          'my-3 max-w-full overflow-x-auto rounded-xl border border-border/70',
      },
      [
        h(
          'table',
          { class: 'min-w-full border-collapse text-sm' },
          slots.default?.() as undefined | VNodeArrayChildren,
        ),
      ],
    );
  };

  const MarkdownSupFallback: FunctionalComponent = (_, { slots }) => {
    return h(
      'sup',
      {
        class:
          'mx-0.5 rounded bg-primary/10 px-1 text-[0.72em] font-semibold text-primary',
      },
      slots.default?.() as undefined | VNodeArrayChildren,
    );
  };

  const baseMarkdownComponents: Record<string, Component> = {
    [MARKDOWN_STREAM_FALLBACK_COMPONENT]: IncompleteMarkdownFragment,
    [MARKDOWN_INCOMPLETE_IMAGE_COMPONENT]: IncompleteImage,
    [MARKDOWN_INCOMPLETE_LINK_COMPONENT]: IncompleteLink,
    [MARKDOWN_INCOMPLETE_TABLE_COMPONENT]: IncompleteTable,
    [MARKDOWN_INCOMPLETE_HTML_COMPONENT]: IncompleteHtml,
    [MARKDOWN_INCOMPLETE_EMPHASIS_COMPONENT]: IncompleteEmphasis,
    [MARKDOWN_INCOMPLETE_INLINE_CODE_COMPONENT]: IncompleteInlineCode,
    a: MarkdownAnchor,
    blockquote: MarkdownBlockquote,
    code: MarkdownCode,
    img: MarkdownImage,
    pre: MarkdownPre,
    sup: MarkdownSupFallback,
    table: MarkdownTable,
  };

  return defineComponent({
    name: isDark ? 'AIReplyMarkdownContentDark' : 'AIReplyMarkdownContent',
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
        if (hasNextChunk && shouldUseStreamingMarkdownFallback(content)) {
          return renderMarkdownSafetyNotice(content);
        }

        const payload = getSafeMarkdownPayload(content);
        const sourceItems = props.sourceItems ?? [];
        const components =
          sourceItems.length > 0
            ? {
                ...baseMarkdownComponents,
                sup: createMarkdownSupComponent(sourceItems),
              }
            : baseMarkdownComponents;

        const markdownNode = h(XMarkdown, {
          className: markdownClassName,
          components,
          config: MARKDOWN_CONFIG,
          content: payload.content,
          escapeRawHtml: false,
          openLinksInNewTab: true,
          paragraphTag: 'div',
          ...(streaming
            ? {
                streaming: {
                  animationConfig: {
                    easing: 'linear',
                    fadeDuration: 80,
                  },
                  enableAnimation: true,
                  hasNextChunk,
                  incompleteMarkdownComponentMap: {
                    emphasis: MARKDOWN_INCOMPLETE_EMPHASIS_COMPONENT,
                    html: MARKDOWN_INCOMPLETE_HTML_COMPONENT,
                    image: MARKDOWN_INCOMPLETE_IMAGE_COMPONENT,
                    'inline-code': MARKDOWN_INCOMPLETE_INLINE_CODE_COMPONENT,
                    link: MARKDOWN_INCOMPLETE_LINK_COMPONENT,
                    list: MARKDOWN_STREAM_FALLBACK_COMPONENT,
                    table: MARKDOWN_INCOMPLETE_TABLE_COMPONENT,
                  },
                  ...(hasNextChunk ? { tail: { content: '▋' } } : {}),
                },
              }
            : {}),
        });

        if (!payload.truncated) {
          return markdownNode;
        }

        return h(
          'div',
          { class: 'min-w-0 max-w-full space-y-3' },
          [
            markdownNode,
            h(
              'div',
              {
                class:
                  'rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground',
              },
              '内容过长，已截断以保持页面流畅。',
            ),
          ].filter(Boolean),
        );
      };
    },
  });
}

export function createMarkdownContentRenderer(isDark = false) {
  const cached = markdownRendererCache.get(isDark);
  if (cached) {
    return cached;
  }

  const renderer = buildMarkdownContentRenderer(isDark);
  markdownRendererCache.set(isDark, renderer);
  return renderer;
}
