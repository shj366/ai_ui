<script setup lang="ts">
import type {
  ChatMessageListItem,
  ChatMessageListProps,
  ChatMessageRoleRenderResult,
} from './types';
import type { VNodeChild } from 'vue';

import { computed, h, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import Conversation from '#/plugins/ai/components/ai-elements/conversation/Conversation.vue';
import ConversationContent from '#/plugins/ai/components/ai-elements/conversation/ConversationContent.vue';
import ConversationScrollButton from '#/plugins/ai/components/ai-elements/conversation/ConversationScrollButton.vue';
import Loader from '#/plugins/ai/components/ai-elements/loader/Loader.vue';
import Message from '#/plugins/ai/components/ai-elements/message/Message.vue';
import MessageAction from '#/plugins/ai/components/ai-elements/message/MessageAction.vue';
import MessageAvatar from '#/plugins/ai/components/ai-elements/message/MessageAvatar.vue';
import MessageContent from '#/plugins/ai/components/ai-elements/message/MessageContent.vue';
import MessageToolbar from '#/plugins/ai/components/ai-elements/message/MessageToolbar.vue';
import Shimmer from '#/plugins/ai/components/ai-elements/shimmer/Shimmer.vue';
import { cn } from '#/plugins/ai/lib/utils';
import { VNodeRenderer } from './vnode-renderer';

const props = withDefaults(
  defineProps<{
    autoScroll?: boolean;
    class?: string;
    classes?: ChatMessageListProps['classes'];
    items?: ChatMessageListItem[];
    onScroll?: ChatMessageListProps['onScroll'];
    role?: ChatMessageListProps['role'];
  }>(),
  {
    items: () => [],
  },
);

const conversationRef = ref<{
  scrollToBottom?: (options?: unknown) => Promise<boolean> | boolean;
  scrollBoxNativeElement?: HTMLElement;
}>();
const editDrafts = ref<Record<string, string>>({});

const conversationClass = computed(() =>
  cn('h-full min-h-0 max-h-full', props.class),
);
const contentClass = computed(() =>
  cn(
    'min-h-full justify-end gap-9 px-3 pb-8 pt-4 sm:px-5 md:pt-6',
    props.classes?.scroll,
  ),
);
const latestMessageActionKey = computed(() => {
  for (let index = props.items.length - 1; index >= 0; index -= 1) {
    const item = props.items[index];
    if (item && item.role !== 'divider') {
      return getItemKey(item);
    }
  }
  return undefined;
});

function getItemKey(item: ChatMessageListItem) {
  return String(item.key);
}

function getRoleConfig(item: ChatMessageListItem): ChatMessageRoleRenderResult {
  if (item.role === 'assistant') {
    return props.role?.assistant?.(item) ?? { placement: 'start' };
  }
  if (item.role === 'user') {
    return props.role?.user?.(item) ?? { placement: 'end' };
  }
  return {};
}

function getTextContent(content: VNodeChild) {
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'number') {
    return String(content);
  }
  return '';
}

function ensureDraft(item: ChatMessageListItem) {
  const key = getItemKey(item);
  if (!(key in editDrafts.value)) {
    editDrafts.value = {
      ...editDrafts.value,
      [key]: getTextContent(item.content),
    };
  }
  return editDrafts.value[key] ?? '';
}

function setDraft(item: ChatMessageListItem, value: string) {
  editDrafts.value = {
    ...editDrafts.value,
    [getItemKey(item)]: value,
  };
}

function syncEditableTextareaHeight(element: HTMLTextAreaElement, value: string) {
  Object.assign(element.style, getEditableTextareaStyle(value));
}

function renderDivider(item: ChatMessageListItem) {
  return h('div', { key: item.key, class: 'flex items-center gap-3 py-2' }, [
    h('span', { class: 'h-px flex-1 bg-border' }),
    h('span', { class: 'text-xs text-muted-foreground' }, [item.content]),
    h('span', { class: 'h-px flex-1 bg-border' }),
  ]);
}

function renderLoading() {
  return h(
    'div',
    { class: 'inline-flex items-center gap-2 text-muted-foreground' },
    [
      h(Loader, { class: 'text-muted-foreground/80', size: 14 }),
      h(Shimmer, { as: 'span', class: 'text-sm', duration: 1.6 }, () =>
        '正在回复...',
      ),
    ],
  );
}

function getDraft(item: ChatMessageListItem) {
  return editDrafts.value[getItemKey(item)] ?? '';
}

function getEditableTextareaStyle(value: string) {
  const normalizedValue = value || '';
  const lineCount = normalizedValue
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 64)), 0);
  const rows = Math.min(10, Math.max(2, lineCount));

  return {
    height: `${rows * 24 + 24}px`,
  };
}

function confirmEdit(
  item: ChatMessageListItem,
  handler?: (value: string) => void,
) {
  handler?.(getDraft(item));
}

function renderEditableIconButton(options: {
  class?: string;
  icon: string;
  iconClass?: string;
  onClick?: () => void;
  tooltip: string;
}) {
  return h(
    MessageAction,
    {
      class: options.class,
      label: options.tooltip,
      size: 'icon-sm',
      tooltip: options.tooltip,
      variant: 'ghost',
      onClick: options.onClick,
    },
    () =>
      h(IconifyIcon, {
        class: cn('size-4', options.iconClass),
        icon: options.icon,
      }),
  );
}

function handleEditableKeydown(
  event: KeyboardEvent,
  item: ChatMessageListItem,
  config: ChatMessageRoleRenderResult,
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    config.onEditCancel?.();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    confirmEdit(item, config.onEditResend ?? config.onEditConfirm);
  }
}

function focusEditableTextarea(element: Element | null) {
  if (!(element instanceof HTMLTextAreaElement)) {
    return;
  }

  requestAnimationFrame(() => {
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
    element.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    });
  });
}

function renderEditable(
  item: ChatMessageListItem,
  config: ChatMessageRoleRenderResult,
) {
  const draft = ensureDraft(item);
  return h(
    'div',
    {
      class:
        'w-full overflow-hidden rounded-lg border border-border/70 bg-secondary shadow-sm',
    },
    [
      h('textarea', {
        'aria-label': '编辑消息',
        class:
          'block min-h-[72px] max-h-[264px] w-full resize-y overflow-y-auto border-0 bg-transparent px-3.5 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0',
        rows: 2,
        style: getEditableTextareaStyle(draft),
        value: draft,
        onInput: (event: Event) => {
          const target = event.target as HTMLTextAreaElement;
          setDraft(item, target.value);
          syncEditableTextareaHeight(target, target.value);
        },
        onKeydown: (event: KeyboardEvent) =>
          handleEditableKeydown(event, item, config),
        onVnodeMounted: (vnode) =>
          focusEditableTextarea(vnode.el as Element | null),
      }),
      h(
        'div',
        {
          class:
            'flex h-11 items-center justify-end border-t border-border/60 bg-muted/35 px-3',
        },
        [
          h('div', { class: 'flex items-center gap-1.5' }, [
            renderEditableIconButton({
              class:
                'rounded-md text-muted-foreground shadow-none hover:bg-muted hover:text-foreground',
              icon: 'mdi:close',
              onClick: config.onEditCancel,
              tooltip:
                config.editable && typeof config.editable === 'object'
                  ? config.editable.cancelText || '取消'
                  : '取消',
            }),
            renderEditableIconButton({
              class:
                'rounded-md text-primary hover:bg-primary/10 hover:text-primary',
              icon: 'mdi:send-outline',
              onClick: () =>
                confirmEdit(item, config.onEditResend ?? config.onEditConfirm),
              tooltip: '重新发送',
            }),
          ]),
        ],
      ),
    ],
  );
}

function renderMessageAvatar(item: ChatMessageListItem) {
  const isUser = item.role === 'user';

  return h(MessageAvatar, {
    class: cn(
      'mt-0.5 size-9 rounded-lg border shadow-sm ring-0',
      '[&_[data-slot=avatar-fallback]]:!rounded-lg [&_[data-slot=avatar-fallback]]:text-xs [&_[data-slot=avatar-fallback]]:font-semibold',
      isUser
        ? 'border-border/70 bg-secondary text-foreground [&_[data-slot=avatar-fallback]]:bg-secondary [&_[data-slot=avatar-fallback]]:text-foreground'
        : 'border-primary/20 bg-primary/10 text-primary [&_[data-slot=avatar-fallback]]:bg-primary/10 [&_[data-slot=avatar-fallback]]:text-primary',
    ),
    name: isUser ? '我' : 'AI',
    src: '',
  });
}

function renderMessage(item: ChatMessageListItem) {
  const config = getRoleConfig(item);
  const isUser = item.role === 'user';
  const showFooterByDefault = getItemKey(item) === latestMessageActionKey.value;
  const editing = Boolean(
    config.editable &&
      typeof config.editable === 'object' &&
      config.editable.editing,
  );

  return h(
    Message,
    {
      key: item.key,
      class: cn(
        editing
          ? 'w-full !max-w-[min(820px,92%)]'
          : 'max-w-[min(920px,92%)]',
        config.classes?.root,
      ),
      from: isUser ? 'user' : 'assistant',
    },
    () => [
      !isUser ? renderMessageAvatar(item) : null,
      h(
        'div',
        {
          class: cn(
            'relative flex min-w-0 flex-col gap-1.5',
            isUser ? 'items-end' : 'items-start',
            editing && 'w-full',
          ),
        },
        [
          config.header && !editing
            ? h('div', { class: isUser ? 'text-right' : 'text-left' }, [
                config.header,
              ])
            : null,
          h(
            MessageContent,
            {
              class: cn(
                'min-w-0',
                editing && '!w-full !rounded-none !bg-transparent !p-0',
                config.classes?.content,
              ),
            },
            () => [
              editing
                ? renderEditable(item, config)
                : config.loading
                  ? renderLoading()
                  : h(VNodeRenderer, { node: item.content }),
            ],
          ),
          config.footer && !editing
            ? h('div', {
                'aria-hidden': 'true',
                class: 'absolute left-0 right-0 top-full h-2',
              })
            : null,
          config.footer && !editing
            ? h(
                MessageToolbar,
                {
                  class: cn(
                    'absolute top-full z-10 mt-1 min-w-max transition-opacity duration-150 ease-out',
                    isUser ? 'right-0 justify-end' : 'left-0 justify-start',
                    showFooterByDefault
                      ? 'pointer-events-auto opacity-100'
                      : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                  ),
                },
                () => [config.footer],
              )
            : null,
        ],
      ),
      isUser ? renderMessageAvatar(item) : null,
    ],
  );
}

const renderedItems = computed(() =>
  props.items.map((item) =>
    h(
      'div',
      {
        key: getItemKey(item),
        class: 'min-w-0',
        'data-chat-message-key': getItemKey(item),
      },
      [item.role === 'divider' ? renderDivider(item) : renderMessage(item)],
    ),
  ),
);

function handleScroll(event: Event) {
  props.onScroll?.(event);
}

defineExpose({
  get scrollBoxNativeElement() {
    return conversationRef.value?.scrollBoxNativeElement;
  },
});
</script>

<template>
  <Conversation
    ref="conversationRef"
    :class="conversationClass"
    :initial="props.autoScroll ? 'instant' : false"
    @scroll="handleScroll"
  >
    <ConversationContent :class="contentClass">
      <VNodeRenderer :node="renderedItems" />
      <div aria-hidden="true" class="h-px w-full" data-chat-bottom-sentinel />
    </ConversationContent>

    <template #overlay>
      <ConversationScrollButton class="z-10 shadow-lg backdrop-blur" />
    </template>
  </Conversation>
</template>
