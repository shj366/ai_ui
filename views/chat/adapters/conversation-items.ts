import type { ConversationsProps } from '@antdv-next/x';
import type { MenuItemType } from 'antdv-next';

import type { AIChatConversationResult } from '../../../api/chat';

import { h } from 'vue';

import {
  IconifyIcon,
  MaterialSymbolsDelete,
  MaterialSymbolsEdit,
  Pin,
  PinOff,
} from '@vben/icons';

function renderConversationLabel(conversation: AIChatConversationResult) {
  return h('div', { class: 'min-w-0 pr-8' }, [
    h('div', { class: 'flex min-w-0 items-center gap-1.5' }, [
      h(
        'span',
        {
          class: 'min-w-0 flex-1 truncate text-[13px] font-medium leading-5',
          title: conversation.title,
        },
        conversation.title,
      ),
      conversation.is_pinned
        ? h(Pin, {
            class: 'size-3.5 shrink-0 text-muted-foreground',
          })
        : null,
    ]),
  ]);
}

export function buildConversationSidebarItems(
  conversations: AIChatConversationResult[],
): ConversationsProps['items'] {
  return conversations.map((conversation) => ({
    key: conversation.conversation_id,
    label: renderConversationLabel(conversation),
  }));
}

function getConversationMenuItems(
  conversation: AIChatConversationResult,
): MenuItemType[] {
  return [
    {
      icon: h(MaterialSymbolsEdit, { class: 'size-4' }),
      key: 'rename',
      label: '重命名',
    },
    {
      icon: h(conversation.is_pinned ? PinOff : Pin, { class: 'size-4' }),
      key: 'pin',
      label: conversation.is_pinned ? '取消置顶' : '置顶',
    },
    {
      type: 'divider',
    },
    {
      danger: true,
      icon: h(MaterialSymbolsDelete, { class: 'size-4' }),
      key: 'delete',
      label: '删除',
    },
  ] satisfies MenuItemType[];
}

export function createConversationSidebarMenu(options: {
  conversations: AIChatConversationResult[];
  onDelete: (conversation: AIChatConversationResult) => void;
  onPin: (conversation: AIChatConversationResult) => void;
  onRename: (conversation: AIChatConversationResult) => void;
}): ConversationsProps['menu'] {
  return (value) => {
    if (!value || 'type' in value) {
      return { items: [] };
    }

    const conversation = options.conversations.find(
      (item) => item.conversation_id === value.key,
    );
    if (!conversation) {
      return { items: [] };
    }

    return {
      items: getConversationMenuItems(conversation),
      trigger: () =>
        h(
          'span',
          {
            class:
              'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground',
            onClick: (event: Event) => {
              event.stopPropagation();
            },
          },
          [h(IconifyIcon, { class: 'size-4', icon: 'mdi:dots-horizontal' })],
        ),
      onClick: (info: { domEvent: Event; key: number | string }) => {
        info.domEvent.stopPropagation();

        switch (String(info.key)) {
          case 'delete': {
            options.onDelete(conversation);
            break;
          }
          case 'pin': {
            options.onPin(conversation);
            break;
          }
          case 'rename': {
            options.onRename(conversation);
            break;
          }
        }
      },
    };
  };
}
