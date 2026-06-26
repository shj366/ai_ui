<script setup lang="ts">
import type { AttachmentsProps, SenderProps, SenderRef } from '@antdv-next/x';
import type { Attachment } from '@antdv-next/x/dist/attachments/index';

import type { VNodeChild } from 'vue';

import {
  computed,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  resolveComponent,
  shallowRef,
  useAttrs,
} from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Attachments, Sender, SenderHeader } from '@antdv-next/x';

defineOptions({
  inheritAttrs: false,
});

const props =
  defineProps<
    Pick<
      SenderProps,
      'footer' | 'onCancel' | 'onChange' | 'onKeyDown' | 'onSubmit'
    >
  >();
const rootRef = ref<HTMLElement>();
const senderRef = ref<SenderRef>();
const attrs = useAttrs();
const aBadge = resolveComponent('a-badge');
const aButton = resolveComponent('a-button');
const aTooltip = resolveComponent('a-tooltip');
const attachmentsOpen = ref(false);
const expanded = ref(false);
const attachmentItems = shallowRef<Attachment[]>([]);

const senderAutoSize = computed<NonNullable<SenderProps['autoSize']>>(() =>
  expanded.value ? { maxRows: 15, minRows: 15 } : { maxRows: 2, minRows: 2 },
);

const attachmentPlaceholder: AttachmentsProps['placeholder'] = (type) =>
  type === 'drop'
    ? { title: '释放文件添加附件' }
    : {
        description: '支持图片、音视频、文档等上下文附件',
        title: '点击或拖拽添加附件',
      };

const senderAttrs = computed<Partial<SenderProps>>(() => {
  const {
    class: _class,
    footer: _footer,
    onCancel: _onCancel,
    onChange: _onChange,
    onKeyDown: _onKeyDown,
    onSubmit: _onSubmit,
    style: _style,
    ...rest
  } = attrs;
  return rest as Partial<SenderProps>;
});

function syncSenderTextareaAttrs() {
  const textarea = rootRef.value?.querySelector('textarea');
  if (!textarea) {
    return;
  }

  textarea.setAttribute('id', 'chat-message-input');
  textarea.setAttribute('name', 'chat-message');
}

async function updateSenderTextareaAttrs() {
  await nextTick();
  syncSenderTextareaAttrs();
}

function revokeAttachmentUrl(item: Attachment) {
  if (typeof item.url === 'string' && item.url.startsWith('blob:')) {
    URL.revokeObjectURL(item.url);
  }
}

function handleAttachmentChange(info: {
  file: Attachment;
  fileList: Attachment[];
}) {
  attachmentItems.value = info.fileList.map((item) => {
    if (
      item.uid === info.file.uid &&
      info.file.status !== 'removed' &&
      item.originFileObj
    ) {
      revokeAttachmentUrl(item);
      return {
        ...item,
        url: URL.createObjectURL(item.originFileObj),
      };
    }

    return item;
  });
}

function handleAttachmentRemove(file: Attachment) {
  revokeAttachmentUrl(file);
  return true;
}

function clearAttachments() {
  for (const item of attachmentItems.value) {
    revokeAttachmentUrl(item);
  }
  attachmentItems.value = [];
}

function toggleAttachments() {
  attachmentsOpen.value = !attachmentsOpen.value;
}

function toggleExpanded() {
  expanded.value = !expanded.value;
  void updateSenderTextareaAttrs();
}

function handleKeyDown(event: KeyboardEvent) {
  const isPlainShiftEnter =
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey;

  if (isPlainShiftEnter) {
    return;
  }

  return props.onKeyDown?.(event);
}

const handleChange: NonNullable<SenderProps['onChange']> = (...args) => {
  props.onChange?.(...args);
};

function handleCancel() {
  props.onCancel?.();
}

const handleSubmit: NonNullable<SenderProps['onSubmit']> = (...args) => {
  props.onSubmit?.(...args);
  clearAttachments();
  attachmentsOpen.value = false;
};

function renderFooterIconButton(options: {
  active?: boolean;
  disabled?: boolean;
  icon: string;
  onClick: () => void;
  title: string;
}) {
  return h(
    aTooltip,
    { title: options.title },
    {
      default: () =>
        h(aButton, {
          class: options.active ? '!bg-accent !text-foreground' : undefined,
          disabled: options.disabled,
          htmlType: 'button',
          icon: h(IconifyIcon, {
            class: 'size-4',
            icon: options.icon,
          }),
          onClick: options.onClick,
          shape: 'circle',
          size: 'small',
          type: 'text',
        }),
    },
  );
}

function renderAttachmentButton() {
  return h(
    aBadge,
    { dot: attachmentItems.value.length > 0 && !attachmentsOpen.value },
    {
      default: () =>
        renderFooterIconButton({
          active: attachmentsOpen.value,
          icon: 'mdi:paperclip',
          onClick: toggleAttachments,
          title: '附件',
        }),
    },
  );
}

function renderExpandButton() {
  return renderFooterIconButton({
    active: expanded.value,
    icon: expanded.value
      ? 'mdi:arrow-collapse-vertical'
      : 'mdi:arrow-expand-vertical',
    onClick: toggleExpanded,
    title: expanded.value ? '收起输入框' : '展开输入框',
  });
}

const renderSenderFooter: NonNullable<SenderProps['footer']> = (
  defaultNode,
  info,
) => {
  const footer = props.footer;
  let originFooter: VNodeChild = null;
  const enhancedInfo = {
    ...info,
    components: {
      ...info.components,
      AttachmentButton: () => renderAttachmentButton(),
      ExpandButton: () => renderExpandButton(),
    },
  };

  if (typeof footer === 'function') {
    originFooter = footer(defaultNode, enhancedInfo);
  } else if (footer !== false) {
    originFooter = footer as VNodeChild;
  }

  return originFooter;
};

onMounted(() => {
  void updateSenderTextareaAttrs();
});

onUpdated(() => {
  void updateSenderTextareaAttrs();
});

onBeforeUnmount(() => {
  clearAttachments();
});
</script>

<template>
  <div ref="rootRef" class="bg-card px-4 pb-4 pt-2">
    <Sender
      ref="senderRef"
      v-bind="senderAttrs"
      :auto-size="senderAutoSize"
      :footer="renderSenderFooter"
      :on-cancel="handleCancel"
      :on-change="handleChange"
      :on-key-down="handleKeyDown"
      :on-submit="handleSubmit"
      submit-type="enter"
      :class-names="{
        content: '!pb-0',
        root: 'shadow-sm',
        input: 'max-h-[var(--chat-sender-input-max-height)] overflow-y-auto',
      }"
      :style="{
        '--chat-sender-input-max-height': expanded ? '360px' : '64px',
      }"
    >
      <template #header>
        <SenderHeader
          title="附件"
          :open="attachmentsOpen"
          :on-open-change="(value: boolean) => (attachmentsOpen = value)"
          :styles="{ content: { padding: 0 } }"
        >
          <Attachments
            accept="image/*,audio/*,video/*,.csv,.doc,.docx,.json,.md,.pdf,.txt,.xlsx"
            :before-upload="() => false"
            :get-drop-container="() => senderRef?.nativeElement"
            :items="attachmentItems"
            multiple
            :on-remove="handleAttachmentRemove"
            overflow="wrap"
            :placeholder="attachmentPlaceholder"
            @change="handleAttachmentChange"
          >
            <template #placeholder-icon>
              <IconifyIcon
                class="size-6 text-muted-foreground"
                icon="mdi:cloud-upload-outline"
              />
            </template>
          </Attachments>
        </SenderHeader>
      </template>
    </Sender>
  </div>
</template>
