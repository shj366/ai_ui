<script setup lang="ts">
import type { AttachmentsProps, SenderProps, SenderRef } from '@antdv-next/x';
import type { Attachment } from '@antdv-next/x/dist/attachments/index';

import type { VNodeChild } from 'vue';

import type { AIChatComposerAttachment } from '../../../api/chat';

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
import { message } from 'antdv-next';

import { upload_file } from '#/api/core/upload';

import {
  inferAIChatAttachmentType,
  resolveAIChatApiUrl,
} from '../../../api/chat';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  Omit<
    Pick<SenderProps, 'footer' | 'onCancel' | 'onChange' | 'onKeyDown'>,
    'onSubmit'
  > & {
    onSubmit?: ChatSenderSubmit;
  }
>();
type SenderSubmitArgs = Parameters<NonNullable<SenderProps['onSubmit']>>;
type ChatSenderSubmit = (
  message: SenderSubmitArgs[0],
  slotConfig: SenderSubmitArgs[1],
  skill: SenderSubmitArgs[2],
  attachments: AIChatComposerAttachment[],
) => Promise<unknown> | unknown;

const rootRef = ref<HTMLElement>();
const senderRef = ref<SenderRef>();
const attrs = useAttrs();
const aBadge = resolveComponent('a-badge');
const aButton = resolveComponent('a-button');
const aTooltip = resolveComponent('a-tooltip');
const attachmentsOpen = ref(false);
const expanded = ref(false);
const attachmentItems = shallowRef<Attachment[]>([]);
const attachmentUploadTasks = new Map<string, Promise<void>>();
const preparingAttachments = ref(false);

const senderAutoSize = computed<NonNullable<SenderProps['autoSize']>>(() =>
  expanded.value ? { maxRows: 15, minRows: 15 } : { maxRows: 2, minRows: 2 },
);

const senderLoading = computed(
  () => Boolean(senderAttrs.value.loading) || preparingAttachments.value,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function resolveUploadedUrl(value: unknown): null | string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveUploadedUrl(item);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of [
    'url',
    'file_url',
    'fileUrl',
    'full_url',
    'fullUrl',
    'src',
    'path',
    'file_path',
    'filePath',
  ]) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return resolveUploadedUrl(value.data);
}

function getAttachmentResponseUrl(item: Attachment) {
  const url = resolveUploadedUrl(item.response);
  return url ? resolveAIChatApiUrl(url) : null;
}

function handleAttachmentChange(info: {
  file: Attachment;
  fileList: Attachment[];
}) {
  attachmentItems.value = info.fileList.map((item) => {
    const uploadedUrl = getAttachmentResponseUrl(item);
    if (uploadedUrl) {
      revokeAttachmentUrl(item);
      return {
        ...item,
        url: uploadedUrl,
      };
    }

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

const handleAttachmentUpload: NonNullable<AttachmentsProps['customRequest']> = (
  options,
) => {
  const rawFile = options.file;

  if (!(rawFile instanceof File)) {
    options.onError?.(new Error('无法读取附件文件'));
    return;
  }

  const uid =
    typeof rawFile === 'object' && 'uid' in rawFile
      ? String(rawFile.uid)
      : `${rawFile.name}-${rawFile.lastModified}`;
  const task = new Promise<void>((resolve) => {
    void upload_file({
      file: rawFile,
      onError: (error) => {
        options.onError?.(error);
        resolve();
      },
      onProgress: (progress) => {
        options.onProgress?.(progress);
      },
      onSuccess: (data, file) => {
        options.onSuccess?.(data, file);
        resolve();
      },
    });
  }).finally(() => {
    attachmentUploadTasks.delete(uid);
  });

  attachmentUploadTasks.set(uid, task);
};

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

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('附件读取失败'));
    });
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',').pop() || '' : result);
    });
    reader.readAsDataURL(file);
  });
}

function getAttachmentMimeType(item: Attachment, file?: File | null) {
  return item.type || file?.type || 'application/octet-stream';
}

function getAttachmentName(item: Attachment, file?: File | null) {
  return item.name || file?.name || 'attachment';
}

function getAttachmentUploadTask(item: Attachment) {
  const fileUid =
    item.originFileObj && 'uid' in item.originFileObj
      ? String(item.originFileObj.uid)
      : item.uid;

  return attachmentUploadTasks.get(fileUid);
}

async function waitForAttachmentUploads(items: Attachment[]) {
  const tasks = items
    .map((item) => getAttachmentUploadTask(item))
    .filter(Boolean);

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

async function createSubmitAttachment(
  item: Attachment,
): Promise<AIChatComposerAttachment | null> {
  if (item.status === 'removed') {
    return null;
  }

  const file = item.originFileObj ?? null;
  const name = getAttachmentName(item, file);
  const mimeType = getAttachmentMimeType(item, file);
  const uploadedUrl = getAttachmentResponseUrl(item);
  const stableUrl =
    uploadedUrl ??
    (typeof item.url === 'string' && !item.url.startsWith('blob:')
      ? item.url
      : null);

  if (stableUrl) {
    return {
      file_type: inferAIChatAttachmentType(name, mimeType),
      id: item.uid,
      mime_type: mimeType,
      name,
      size: item.size ?? file?.size ?? null,
      source_type: 'url',
      url: stableUrl,
    };
  }

  if (!file) {
    return null;
  }

  return {
    data: await readFileAsBase64(file),
    file_type: inferAIChatAttachmentType(name, mimeType),
    id: item.uid,
    mime_type: mimeType,
    name,
    size: item.size ?? file.size ?? null,
    source_type: 'base64',
  };
}

async function createSubmitAttachments() {
  const items = attachmentItems.value.filter(
    (item) => item.status !== 'removed',
  );

  await waitForAttachmentUploads(items);

  const attachments = await Promise.all(
    items.map((item) => createSubmitAttachment(item)),
  );

  return attachments.filter(
    (attachment): attachment is AIChatComposerAttachment => attachment !== null,
  );
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

const handleSubmit: NonNullable<SenderProps['onSubmit']> = async (...args) => {
  if (preparingAttachments.value) {
    return;
  }

  preparingAttachments.value = true;
  try {
    const attachments = await createSubmitAttachments();
    const shouldClear = await props.onSubmit?.(
      args[0],
      args[1],
      args[2],
      attachments,
    );

    if (shouldClear !== false) {
      clearAttachments();
      attachmentsOpen.value = false;
    }
  } catch (error) {
    message.error((error as Error).message || '附件处理失败');
  } finally {
    preparingAttachments.value = false;
  }
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
      :loading="senderLoading"
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
            :custom-request="handleAttachmentUpload"
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
