<script setup lang="ts">
import type { PromptInputFooterInfo } from './types';
import type { VNodeChild } from 'vue';

import { computed, defineComponent, h, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInput,
} from '#/plugins/ai/components/ai-elements';
import { VNodeRenderer } from './vnode-renderer';

const props = defineProps<{
  disabled?: boolean;
  expanded?: boolean;
  footer?:
    | false
    | VNodeChild
    | ((defaultNode: VNodeChild, info: PromptInputFooterInfo) => VNodeChild);
  loading?: boolean;
  name?: string;
  onCancel?: () => void;
  onChange?: (value: string) => void;
  onToggleExpanded?: () => void;
  placeholder?: string;
  value?: string;
}>();

const context = usePromptInput();

const textareaClass = computed(() =>
  props.expanded
    ? 'ai-prompt-textarea !h-[252px] !min-h-[252px] !max-h-[252px] ![field-sizing:fixed] overflow-y-auto !px-4 !pb-0 !pt-3 text-sm leading-6 placeholder:text-muted-foreground/55'
    : 'ai-prompt-textarea !h-[60px] !min-h-[60px] !max-h-[60px] ![field-sizing:fixed] overflow-y-auto !px-4 !pb-0 !pt-3 text-sm leading-6 placeholder:text-muted-foreground/55',
);

watch(
  () => props.value,
  (value) => {
    const nextValue = value ?? '';
    if (context.textInput.value !== nextValue) {
      context.setTextInput(nextValue);
    }
  },
  { immediate: true },
);

watch(
  () => context.textInput.value,
  (value) => {
    props.onChange?.(value);
  },
);

const AttachmentButton = defineComponent({
  name: 'ChatPromptAttachmentButton',
  setup() {
    return () =>
      h(PromptInputActionMenu, {}, () => [
        h(
          PromptInputActionMenuTrigger,
          {
            'aria-label': '附件',
            class: [
              'ai-prompt-tool-button !h-8 !w-8 !rounded-lg !bg-transparent !px-0 !text-muted-foreground !shadow-none hover:!bg-muted hover:!text-foreground',
              props.disabled ? 'pointer-events-none opacity-50' : undefined,
            ],
            title: '附件',
          },
          () => h(IconifyIcon, { class: 'size-4', icon: 'mdi:paperclip' }),
        ),
        h(PromptInputActionMenuContent, {}, () => [
          h(PromptInputActionAddAttachments, { label: '添加附件' }),
        ]),
      ]);
  },
});

const ExpandButton = defineComponent({
  name: 'ChatPromptExpandButton',
  setup() {
    return () =>
      h(
        PromptInputButton,
        {
          'aria-label': props.expanded ? '收起输入框' : '展开输入框',
          class:
            'ai-prompt-tool-button !h-8 !w-8 !rounded-lg !bg-transparent !text-muted-foreground hover:!bg-muted hover:!text-foreground',
          title: props.expanded ? '收起输入框' : '展开输入框',
          onClick: () => props.onToggleExpanded?.(),
        },
        () =>
          h(IconifyIcon, {
            class: 'size-4',
            icon: props.expanded
              ? 'mdi:arrow-collapse-vertical'
              : 'mdi:arrow-expand-vertical',
          }),
      );
  },
});

const defaultSubmitNode = computed<VNodeChild>(() =>
  props.loading
    ? h(
        PromptInputButton,
        {
          'aria-label': '停止',
          class:
            'ai-prompt-stop-button !h-9 !w-9 !rounded-xl !px-0 !shadow-sm',
          title: '停止',
          type: 'button',
          variant: 'destructive',
          onClick: () => props.onCancel?.(),
        },
        () => [
          h(IconifyIcon, {
            class: 'size-[18px]',
            icon: 'mdi:stop-circle-outline',
          }),
        ],
      )
    : h(
        PromptInputSubmit,
        {
          'aria-label': '发送',
          class:
            'ai-prompt-submit-button !h-9 !w-9 !rounded-xl !bg-primary !px-0 !text-primary-foreground !shadow-sm hover:!bg-primary/90 disabled:!bg-muted disabled:!text-muted-foreground disabled:!opacity-100',
          disabled:
            props.disabled ||
            (!context.textInput.value.trim() && context.files.value.length === 0),
          status: 'ready',
          title: '发送',
        },
        () => [
          h(IconifyIcon, { class: 'size-[18px]', icon: 'mdi:arrow-up' }),
        ],
      ),
);

const footerInfo = computed<PromptInputFooterInfo>(() => ({
  components: {
    AttachmentButton: () => h(AttachmentButton),
    ExpandButton: () => h(ExpandButton),
  },
}));

const footerNode = computed(() => {
  if (typeof props.footer === 'function') {
    return props.footer(defaultSubmitNode.value, footerInfo.value);
  }

  if (props.footer === false) {
    return defaultSubmitNode.value;
  }

  return props.footer || defaultSubmitNode.value;
});
</script>

<template>
  <PromptInputHeader
    v-if="context.files.value.length > 0"
    class="ai-prompt-attachments !border-0 !bg-transparent !px-3 !pb-1 !pt-3"
  >
    <Attachments class="max-h-24 overflow-y-auto pr-1" variant="inline">
      <Attachment
        v-for="item in context.files.value"
        :key="item.id"
        :data="item"
        class="!h-9 !rounded-xl !border-border/70 !bg-muted/35 !px-2 !text-xs !shadow-none hover:!bg-muted"
        @remove="context.removeFile(item.id)"
      >
        <AttachmentPreview class="!size-6 !rounded-lg !bg-background/80" />
        <AttachmentInfo class="max-w-40" />
        <AttachmentRemove class="opacity-70 hover:opacity-100" label="移除附件" />
      </Attachment>
    </Attachments>
  </PromptInputHeader>

  <PromptInputBody class="w-full">
    <PromptInputTextarea
      :class="textareaClass"
      :disabled="disabled"
      :name="name || 'chat-message'"
      :placeholder="placeholder"
    />
  </PromptInputBody>

  <PromptInputFooter
    class="ai-prompt-footer !border-0 !bg-transparent !px-3 !pb-3 !pt-1"
  >
    <PromptInputTools class="w-full min-w-0">
      <VNodeRenderer :node="footerNode" />
    </PromptInputTools>
  </PromptInputFooter>
</template>
