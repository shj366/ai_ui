import type {
  ActionsProps,
  BubbleItemType,
  BubbleListProps,
  BubbleProps,
  FileCardProps,
} from '@antdv-next/x';

import type { FunctionalComponent, VNodeArrayChildren, VNodeChild } from 'vue';

import type { AIChatProtocolDriver } from '#/plugins/ai/protocols';
import type { ChatMessageItem } from '#/plugins/ai/runtime/message';
import type {
  AIChatEventMessageBlock,
  AIChatFileMessageBlock,
} from '#/plugins/ai/types/message';

import { h, resolveComponent } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Actions,
  CodeHighlighter,
  FileCardList,
  Mermaid,
  Sources,
  Think,
} from '@antdv-next/x';
import { XMarkdown } from '@antdv-next/x-markdown';

import {
  getMessageEventBlocks,
  getMessageFileBlocks,
  getMessageTextContent,
  parseDateLabel,
} from '#/plugins/ai/runtime/message';

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
  onCopyMessage: (message: ChatMessageItem) => void;
  onRegenerateMessage: (message: ChatMessageItem) => void;
  onRegenerateUserMessage: (message: ChatMessageItem) => void;
  onResendEditedMessage: (content: string) => void;
  onSaveEditedMessage: (content: string) => void;
  protocolDriver: AIChatProtocolDriver;
  selectedModelLabel?: string;
  selectedModelId?: null | string;
  setThinkingExpanded: (message: ChatMessageItem, expanded: boolean) => void;
}

const MARKDOWN_STREAM_FALLBACK_COMPONENT = 'incomplete-markdown-fragment';

function getBubbleListMessage(item: BubbleItemType) {
  const message = item.extraInfo?.message;
  return message && typeof message === 'object'
    ? (message as ChatMessageItem)
    : undefined;
}

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

function getThinkingContent(message: ChatMessageItem) {
  return getMessageTextContent(message, 'reasoning');
}

function getThinkingToggleLabel(message: ChatMessageItem) {
  if (message.streaming) {
    return '思考中';
  }
  return '思考完成';
}

function getVisibleEventBlocks(
  message: ChatMessageItem,
  protocolDriver: AIChatProtocolDriver,
) {
  return getMessageEventBlocks(message).filter(
    (block) => !protocolDriver.shouldSuppressEventBlock(message, block),
  );
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

function isMessageBubbleLoading(
  message: ChatMessageItem,
  _protocolDriver: AIChatProtocolDriver,
) {
  if (message.role !== 'assistant' || !message.streaming) {
    return false;
  }

  if (getThinkingContent(message).trim()) {
    return false;
  }

  if (getMessageTextContent(message, 'text').trim()) {
    return false;
  }

  if (getMessageFileBlocks(message).length > 0) {
    return false;
  }

  return true;
}

function formatJsonCodeBlock(content: string) {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function renderCodeBlock(content: string, language = 'text', isDark = false) {
  return h('div', { class: 'min-w-0 w-full max-w-full overflow-hidden' }, [
    h(CodeHighlighter, {
      content,
      language,
      showThemeToggle: false,
      theme: isDark ? 'dark' : 'light',
    }),
  ]);
}

function renderMermaidBlock(content: string, isDark = false) {
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

function createMarkdownContentRenderer(isDark = false) {
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

  const MarkdownCode: FunctionalComponent = (_, { attrs, slots }) => {
    const content = extractMarkdownSlotText(slots.default?.());
    const language = String(attrs['data-lang'] ?? 'text').toLowerCase();
    const isBlock = attrs['data-block'] === 'true';

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

    if (language === 'mermaid') {
      return renderMermaidBlock(content, isDark);
    }

    return renderCodeBlock(content, language, isDark);
  };

  return function MarkdownContent(props: {
    content?: string;
    streaming?: boolean;
  }) {
    return h(XMarkdown, {
      components: {
        [MARKDOWN_STREAM_FALLBACK_COMPONENT]: IncompleteMarkdownFragment,
        code: MarkdownCode,
        pre: MarkdownPre,
      },
      config: {
        breaks: true,
        gfm: true,
      },
      content: props.content ?? '',
      openLinksInNewTab: true,
      ...(props.streaming
        ? {
            streaming: {
              enableAnimation: false,
              hasNextChunk: true,
              incompleteMarkdownComponentMap: {
                emphasis: MARKDOWN_STREAM_FALLBACK_COMPONENT,
                html: MARKDOWN_STREAM_FALLBACK_COMPONENT,
                image: MARKDOWN_STREAM_FALLBACK_COMPONENT,
                'inline-code': MARKDOWN_STREAM_FALLBACK_COMPONENT,
                link: MARKDOWN_STREAM_FALLBACK_COMPONENT,
                list: MARKDOWN_STREAM_FALLBACK_COMPONENT,
                table: MARKDOWN_STREAM_FALLBACK_COMPONENT,
              },
              tail: true,
            },
          }
        : {}),
    });
  };
}

function getFileTypeLabel(file: AIChatFileMessageBlock) {
  return [file.file_type || 'file', file.mime_type, file.source_type]
    .filter(Boolean)
    .join(' · ');
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

function openExternalLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
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
  const title = file.name || file.url || '附件';
  const meta = getFileTypeLabel(file);
  const type = getFileCardType(file);
  const fileUrl = typeof file.url === 'string' ? file.url : undefined;

  return {
    audioProps:
      type === 'audio' ? { controls: true, preload: 'metadata' } : undefined,
    description: meta || undefined,
    imageProps: type === 'image' ? { preview: true } : undefined,
    key: `${message.id}-file-${index}`,
    name: title,
    onClick: fileUrl ? () => openExternalLink(fileUrl) : undefined,
    size: 'small',
    src: fileUrl && type !== 'file' ? fileUrl : undefined,
    type,
    videoProps:
      type === 'video' ? { controls: true, preload: 'metadata' } : undefined,
  };
}

function renderMessageFiles(
  message: ChatMessageItem,
  files: AIChatFileMessageBlock[],
) {
  if (files.length === 0) {
    return null;
  }

  return h('div', { key: `${message.id}-files`, class: 'max-w-full' }, [
    h(FileCardList, {
      items: files.map((file, index) =>
        toMessageFileCard(message, file, index),
      ),
      overflow: 'wrap',
      size: 'small',
    }),
  ]);
}

function renderEventText(params: {
  eventType: AIChatEventMessageBlock['event_type'];
  isDark: boolean;
  message: ChatMessageItem;
  protocolDriver: AIChatProtocolDriver;
  text: string;
}) {
  if (!params.text.trim()) {
    return null;
  }

  if (
    params.protocolDriver.shouldRenderEventTextAsCode(
      params.text,
      params.eventType,
    )
  ) {
    return renderCodeBlock(
      formatJsonCodeBlock(params.text),
      'json',
      params.isDark,
    );
  }

  const MarkdownContent = createMarkdownContentRenderer(params.isDark);
  return h(MarkdownContent, {
    content: params.text,
    streaming: Boolean(params.message.streaming),
  });
}

function renderEventContent(params: {
  block: AIChatEventMessageBlock;
  isDark: boolean;
  message: ChatMessageItem;
  protocolDriver: AIChatProtocolDriver;
}) {
  const detail = params.protocolDriver.buildEventPresentation(params.block);
  const sections = detail.sections
    .map((section) => {
      switch (section.kind) {
        case 'raw-payload': {
          if (!section.text || section.secondary) {
            return null;
          }

          return renderCodeBlock(
            section.text,
            section.language || 'json',
            params.isDark,
          );
        }
        case 'sources': {
          return section.items && section.items.length > 0
            ? h(Sources, {
                defaultExpanded: section.items.length <= 3,
                items: section.items,
                title: `来源 ${section.items.length}`,
              })
            : null;
        }
        case 'text': {
          return section.text
            ? renderEventText({
                eventType: params.block.event_type,
                isDark: params.isDark,
                message: params.message,
                protocolDriver: params.protocolDriver,
                text: section.text,
              })
            : null;
        }
        default: {
          return null;
        }
      }
    })
    .filter(Boolean);

  if (sections.length === 0) {
    return undefined;
  }

  if (sections.length === 1) {
    return sections[0];
  }

  return h('div', { class: 'space-y-3' }, sections);
}

function normalizeReferenceText(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[`*_#[\]()<>|]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

function pushReferenceTerm(terms: Set<string>, value: unknown) {
  if (typeof value !== 'string') {
    return;
  }

  const normalized = normalizeReferenceText(value);
  if (!normalized || normalized.length < 2) {
    return;
  }

  terms.add(normalized);

  if (/^https?:\/\//iu.test(value.trim())) {
    try {
      const url = new URL(value.trim());
      const hostTerm = normalizeReferenceText(
        url.hostname.replace(/^www\./iu, ''),
      );
      if (hostTerm.length >= 2) {
        terms.add(hostTerm);
      }
    } catch {
      // Ignore invalid urls in event payloads.
    }
  }
}

function collectEventDataReferenceTerms(
  value: unknown,
  terms: Set<string>,
  depth = 0,
) {
  if (depth > 2 || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    pushReferenceTerm(terms, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 8)) {
      collectEventDataReferenceTerms(item, terms, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  for (const nested of Object.values(value as Record<string, unknown>).slice(
    0,
    10,
  )) {
    collectEventDataReferenceTerms(nested, terms, depth + 1);
  }
}

function getEventReferenceTerms(
  block: AIChatEventMessageBlock,
  detail: ReturnType<AIChatProtocolDriver['buildEventPresentation']>,
) {
  const terms = new Set<string>();

  pushReferenceTerm(terms, block.title);
  pushReferenceTerm(terms, block.summary);
  pushReferenceTerm(terms, detail.title);
  pushReferenceTerm(terms, detail.description);
  collectEventDataReferenceTerms(block.data, terms);

  for (const section of detail.sections) {
    if (section.kind === 'sources' && section.items) {
      for (const item of section.items) {
        pushReferenceTerm(terms, item.title);
        pushReferenceTerm(terms, item.description);
        pushReferenceTerm(terms, item.url);
      }
      continue;
    }

    if (section.kind === 'text') {
      pushReferenceTerm(terms, section.text);
    }
  }

  return [...terms];
}

function isSearchEventReferenced(messageText: string) {
  const normalized = normalizeReferenceText(messageText);
  return [
    '来源',
    '参考',
    '资料',
    '搜索',
    '检索',
    '网页',
    '链接',
    'link',
    'reference',
    'search',
    'source',
    'sources',
  ].some((term) => normalized.includes(term));
}

function isEventReferencedInMessage(
  messageText: string,
  block: AIChatEventMessageBlock,
  detail: ReturnType<AIChatProtocolDriver['buildEventPresentation']>,
) {
  const normalizedMessageText = normalizeReferenceText(messageText);
  if (!normalizedMessageText) {
    return false;
  }

  if (detail.isSearchEvent && isSearchEventReferenced(normalizedMessageText)) {
    return true;
  }

  return getEventReferenceTerms(block, detail).some((term) =>
    normalizedMessageText.includes(term),
  );
}

function renderInlineEventCard(params: {
  block: AIChatEventMessageBlock;
  content: VNodeChild;
  detail: ReturnType<AIChatProtocolDriver['buildEventPresentation']>;
  index: number;
  message: ChatMessageItem;
}) {
  const key = `${params.message.id}-event-${params.block.event_key}-${params.index}`;

  return h(
    'section',
    {
      key,
      class: [
        'min-w-0 max-w-full overflow-hidden rounded-2xl border p-3',
        params.detail.isSearchEvent
          ? 'border-primary/20 bg-primary/[0.04]'
          : 'border-border/70 bg-muted/25',
      ].join(' '),
    },
    [
      params.detail.title
        ? h(
            'div',
            {
              class:
                'text-xs leading-5 font-medium break-words text-foreground/90',
            },
            params.detail.title,
          )
        : null,
      params.detail.description
        ? h(
            'div',
            {
              class: 'mt-1 text-xs leading-5 break-words text-muted-foreground',
            },
            params.detail.description,
          )
        : null,
      h(
        'div',
        {
          class: [
            'min-w-0 max-w-full',
            params.detail.title || params.detail.description ? 'mt-3' : '',
          ]
            .filter(Boolean)
            .join(' '),
        },
        [params.content],
      ),
    ].filter(Boolean),
  );
}

function renderReferencedEventCards(params: {
  events: AIChatEventMessageBlock[];
  isDark: boolean;
  message: ChatMessageItem;
  protocolDriver: AIChatProtocolDriver;
}) {
  const messageText = getMessageTextContent(params.message, 'text');
  if (!messageText.trim() || params.events.length === 0) {
    return null;
  }

  const cards = params.events
    .map((block, index) => {
      const detail = params.protocolDriver.buildEventPresentation(block);
      const content = renderEventContent({
        block,
        isDark: params.isDark,
        message: params.message,
        protocolDriver: params.protocolDriver,
      });

      if (!content || !isEventReferencedInMessage(messageText, block, detail)) {
        return null;
      }

      return renderInlineEventCard({
        block,
        content,
        detail,
        index,
        message: params.message,
      });
    })
    .filter(Boolean);

  if (cards.length === 0) {
    return null;
  }

  return h(
    'div',
    {
      class: 'min-w-0 max-w-full space-y-3',
    },
    cards,
  );
}

export function renderChatMessageBubbleContent(
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    'isDark' | 'isThinkingExpanded' | 'protocolDriver' | 'setThinkingExpanded'
  >,
): VNodeChild {
  const MarkdownContent = createMarkdownContentRenderer(options.isDark);
  const reasoningText = getThinkingContent(message);
  const text = getMessageTextContent(message, 'text');
  const events = getVisibleEventBlocks(message, options.protocolDriver);
  const referencedEventCards = renderReferencedEventCards({
    events,
    isDark: options.isDark,
    message,
    protocolDriver: options.protocolDriver,
  });
  const files = getMessageFileBlocks(message);

  if (message.message_type === 'error') {
    return h('div', { class: 'min-w-0 max-w-full space-y-2' }, [
      h(
        'div',
        {
          class:
            'text-sm leading-6 whitespace-pre-wrap break-words text-destructive',
        },
        text || '生成失败',
      ),
      message.conversation_id
        ? h(
            'div',
            {
              class:
                'border-t border-destructive/20 pt-2 text-xs leading-5 whitespace-pre-wrap break-all text-destructive/80',
            },
            ['对话 ID: ', message.conversation_id],
          )
        : null,
      referencedEventCards
        ? h('div', { class: 'border-t border-destructive/15 pt-3' }, [
            referencedEventCards,
          ])
        : null,
    ]);
  }

  return h(
    'div',
    { class: 'min-w-0 max-w-full space-y-3' },
    [
      reasoningText
        ? h(
            Think,
            {
              blink: Boolean(message.streaming),
              expanded: options.isThinkingExpanded(message),
              loading: Boolean(message.streaming),
              title: getThinkingToggleLabel(message),
              'onUpdate:expanded': (expanded: boolean) => {
                options.setThinkingExpanded(message, expanded);
              },
            },
            () =>
              h(MarkdownContent, {
                content: reasoningText,
                streaming: Boolean(message.streaming),
              }),
          )
        : null,
      text
        ? h(MarkdownContent, {
            content: text,
            streaming: Boolean(message.streaming),
          })
        : null,
      referencedEventCards
        ? h(
            'div',
            {
              class: [
                'min-w-0 max-w-full',
                reasoningText || text ? 'border-t border-border/60 pt-3' : '',
              ]
                .filter(Boolean)
                .join(' '),
            },
            [referencedEventCards],
          )
        : null,
      renderMessageFiles(message, files),
    ].filter(Boolean),
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

function getMessageActionItems(
  message: ChatMessageItem,
  options: Pick<
    CreateChatBubbleListRoleOptions,
    | 'onBeginEditMessage'
    | 'onConfirmDeleteMessage'
    | 'onCopyMessage'
    | 'onRegenerateMessage'
    | 'onRegenerateUserMessage'
  >,
): ActionsProps['items'] {
  const items: ActionsProps['items'] = [
    {
      icon: h(IconifyIcon, { class: 'size-3.5', icon: 'mdi:content-copy' }),
      key: 'copy',
      label: '复制',
      onItemClick: () => options.onCopyMessage(message),
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
    | 'onCopyMessage'
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
        loading: isMessageBubbleLoading(message, options.protocolDriver),
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
        loading: isMessageBubbleLoading(message, options.protocolDriver),
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
