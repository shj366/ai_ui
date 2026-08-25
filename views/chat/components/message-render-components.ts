import type { ActionsProps, FileCardProps, SourcesProps } from './types';

import type { PropType } from 'vue';

import { defineComponent, h } from 'vue';

import Attachment from '#/plugins/ai/components/ai-elements/attachments/Attachment.vue';
import AttachmentInfo from '#/plugins/ai/components/ai-elements/attachments/AttachmentInfo.vue';
import AttachmentPreview from '#/plugins/ai/components/ai-elements/attachments/AttachmentPreview.vue';
import Attachments from '#/plugins/ai/components/ai-elements/attachments/Attachments.vue';
import Loader from '#/plugins/ai/components/ai-elements/loader/Loader.vue';
import MessageAction from '#/plugins/ai/components/ai-elements/message/MessageAction.vue';
import MessageActions from '#/plugins/ai/components/ai-elements/message/MessageActions.vue';
import Reasoning from '#/plugins/ai/components/ai-elements/reasoning/Reasoning.vue';
import ReasoningContent from '#/plugins/ai/components/ai-elements/reasoning/ReasoningContent.vue';
import ReasoningTrigger from '#/plugins/ai/components/ai-elements/reasoning/ReasoningTrigger.vue';
import Source from '#/plugins/ai/components/ai-elements/sources/Source.vue';
import AISources from '#/plugins/ai/components/ai-elements/sources/Sources.vue';
import SourcesContent from '#/plugins/ai/components/ai-elements/sources/SourcesContent.vue';
import SourcesTrigger from '#/plugins/ai/components/ai-elements/sources/SourcesTrigger.vue';
import { VNodeRenderer } from './vnode-renderer';

function toAttachmentData(item: FileCardProps, index: number) {
  const fallbackMediaType =
    item.type === 'image'
      ? 'image/*'
      : item.type === 'audio'
        ? 'audio/*'
        : item.type === 'video'
          ? 'video/*'
          : 'application/octet-stream';

  return {
    filename: item.name || '附件',
    id: String(item.key ?? item.name ?? index),
    mediaType: item.mediaType || fallbackMediaType,
    type: 'file' as const,
    url: item.src || item.url || '',
  };
}

export const FileCardList = defineComponent({
  name: 'AIElementsFileCardList',
  props: {
    items: {
      default: () => [],
      type: Array as PropType<FileCardProps[]>,
    },
    overflow: {
      default: 'wrap',
      type: String,
    },
    size: {
      default: 'small',
      type: String,
    },
  },
  setup(props) {
    return () =>
      h(
        Attachments,
        { class: props.overflow === 'wrap' ? '' : 'overflow-x-auto', variant: 'list' },
        () =>
          props.items.map((item, index) =>
            h(
              Attachment,
              {
                class: item.onClick ? 'cursor-pointer' : undefined,
                key: item.key ?? item.name ?? index,
                data: toAttachmentData(item, index),
                onClick: item.onClick,
              },
              () => [
                item.loading ? h(Loader, { class: 'size-4' }) : h(AttachmentPreview),
                h(AttachmentInfo, { showMediaType: true }),
              ],
            ),
          ),
      );
  },
});

export const Sources = defineComponent({
  name: 'AIElementsSources',
  props: {
    activeKey: [Number, String],
    defaultExpanded: Boolean,
    expandIconPosition: String,
    inline: Boolean,
    items: {
      default: () => [],
      type: Array as PropType<NonNullable<SourcesProps['items']>>,
    },
    title: [Number, String],
  },
  setup(props) {
    return () => {
      const items = props.items ?? [];
      if (props.inline) {
        const active = items.find((item) => item.key === props.activeKey) ?? items[0];
        return active?.url
          ? h(Source, { href: active.url, title: String(props.title ?? active.title ?? active.url) }, () =>
              String(props.title ?? active.key ?? ''),
            )
          : h('sup', String(props.title ?? ''));
      }

      if (items.length === 0) {
        return null;
      }

      return h(AISources, { defaultOpen: props.defaultExpanded }, () => [
        h(SourcesTrigger, { count: items.length }, () => `来源 ${items.length}`),
        h(
          SourcesContent,
          {},
          () =>
            items.map((item, index) =>
              h(
                Source,
                {
                  key: item.key ?? item.url ?? index,
                  href: item.url || '#',
                  title: item.title || item.url || `来源 ${index + 1}`,
                },
                () => item.title || item.url || `来源 ${index + 1}`,
              ),
            ),
        ),
      ]);
    };
  },
});

export const Actions = defineComponent({
  name: 'AIElementsActions',
  props: {
    fadeIn: Boolean,
    items: {
      default: () => [],
      type: Array as PropType<NonNullable<ActionsProps['items']>>,
    },
  },
  setup(props) {
    return () =>
      h(MessageActions, {}, () =>
        props.items.map((item) =>
          h(
            MessageAction,
            {
              class: item.danger
                ? 'text-destructive hover:text-destructive focus-visible:ring-destructive/20'
                : undefined,
              key: item.key,
              label: item.label,
              tooltip: item.label,
              variant: 'ghost',
              onClick: item.onItemClick,
            },
            () => (item.actionRender ? item.actionRender() : item.icon ? h(VNodeRenderer, { node: item.icon }) : item.label),
          ),
        ),
      );
  },
});

export const ActionsCopy = defineComponent({
  name: 'AIElementsActionsCopy',
  props: {
    text: {
      default: '',
      type: String,
    },
  },
  setup(props) {
    return () =>
      h(
        MessageAction,
        {
          tooltip: '复制',
          onClick: () => navigator.clipboard?.writeText(props.text),
        },
        () => '复制',
      );
  },
});

export const Think = defineComponent({
  name: 'AIElementsThink',
  props: {
    content: {
      default: '',
      type: String,
    },
    expanded: Boolean,
    status: String,
  },
  emits: ['update:expanded'],
  setup(props, { emit }) {
    return () =>
      h(
        Reasoning,
        {
          defaultOpen: props.expanded,
          isStreaming: props.status === 'loading',
          open: props.expanded,
          'onUpdate:open': (value: boolean) => emit('update:expanded', value),
        },
        () => [
          h(ReasoningTrigger),
          h(ReasoningContent, { content: props.content }),
        ],
      );
  },
});
