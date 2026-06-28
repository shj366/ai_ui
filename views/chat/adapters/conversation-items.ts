import type { VNodeChild } from 'vue';

import type { AIChatConversationResult } from '../../../api/chat';

import { h } from 'vue';

import {
  IconifyIcon,
  MaterialSymbolsDelete,
  MaterialSymbolsEdit,
  Pin,
  PinOff,
} from '@vben/icons';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ConversationSidebarItem {
  conversation: AIChatConversationResult;
  group: string;
  isPinned: boolean;
  key: string;
  label: VNodeChild;
  title: string;
}

export interface ConversationSidebarCreation {
  disabled?: boolean;
  onClick?: () => void;
}

export interface ConversationSidebarMenuItem {
  danger?: boolean;
  icon?: VNodeChild;
  key: string;
  label: string;
  onClick: () => void;
  type?: 'divider';
}

export type ConversationSidebarMenu = (
  item: ConversationSidebarItem,
) => ConversationSidebarMenuItem[];

function renderConversationLabel(conversation: AIChatConversationResult) {
  return h('div', { class: 'min-w-0' }, [
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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getConversationTime(conversation: AIChatConversationResult) {
  const value = conversation.created_time;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function getConversationGroup(conversation: AIChatConversationResult) {
  if (conversation.is_pinned) {
    return '置顶';
  }

  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(getConversationTime(conversation));
  const diffDays = Math.floor((today.getTime() - target.getTime()) / DAY_MS);

  if (diffDays <= 0) {
    return '今天';
  }
  if (diffDays === 1) {
    return '昨天';
  }
  if (diffDays < 7) {
    return '近 7 天';
  }
  return '更早';
}

export function buildConversationSidebarItems(
  conversations: AIChatConversationResult[],
): ConversationSidebarItem[] {
  return conversations.map((conversation) => ({
    conversation,
    group: getConversationGroup(conversation),
    isPinned: Boolean(conversation.is_pinned),
    key: conversation.conversation_id,
    label: renderConversationLabel(conversation),
    title: conversation.title,
  }));
}

export function createConversationSidebarMenu(options: {
  conversations: AIChatConversationResult[];
  onDelete: (conversation: AIChatConversationResult) => void;
  onPin: (conversation: AIChatConversationResult) => void;
  onRename: (conversation: AIChatConversationResult) => void;
}): ConversationSidebarMenu {
  return (item) => {
    const conversation = options.conversations.find(
      (candidate) => candidate.conversation_id === item.key,
    );
    if (!conversation) {
      return [];
    }

    return [
      {
        icon: h(MaterialSymbolsEdit, { class: 'size-4' }),
        key: 'rename',
        label: '重命名',
        onClick: () => options.onRename(conversation),
      },
      {
        icon: h(conversation.is_pinned ? PinOff : Pin, { class: 'size-4' }),
        key: 'pin',
        label: conversation.is_pinned ? '取消置顶' : '置顶',
        onClick: () => options.onPin(conversation),
      },
      {
        key: 'divider',
        label: '',
        onClick: () => {},
        type: 'divider',
      },
      {
        danger: true,
        icon: h(MaterialSymbolsDelete, { class: 'size-4' }),
        key: 'delete',
        label: '删除',
        onClick: () => options.onDelete(conversation),
      },
    ];
  };
}

export function renderConversationMoreIcon() {
  return h(IconifyIcon, { class: 'size-4', icon: 'mdi:dots-horizontal' });
}
