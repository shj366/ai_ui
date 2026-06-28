<script setup lang="ts">
import type { PromptInputFooterInfo } from './types';
import type { VNodeChild } from 'vue';

import type { AIChatComposerAttachment } from '../../../api/chat';

import { ref } from 'vue';

import { message } from 'antdv-next';

import { inferAIChatAttachmentType } from '../../../api/chat';
import { PromptInput } from '#/plugins/ai/components/ai-elements';
import ChatPromptInputContent from './chat-prompt-input-content.vue';

defineOptions({
  inheritAttrs: false,
});

type ChatPromptInputSubmit = (
  message: string,
  slotConfig: unknown,
  skill: unknown,
  attachments: AIChatComposerAttachment[],
) => Promise<unknown> | unknown;

interface ChatPromptInputProps {
  disabled?: boolean;
  footer?:
    | false
    | VNodeChild
    | ((defaultNode: VNodeChild, info: PromptInputFooterInfo) => VNodeChild);
  loading?: boolean;
  name?: string;
  onCancel?: () => void;
  onChange?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onSubmit?: ChatPromptInputSubmit;
  placeholder?: string;
  suffix?: boolean;
  value?: string;
}

const props = defineProps<ChatPromptInputProps>();

const accept = 'image/*,audio/*,video/*,.csv,.doc,.docx,.json,.md,.pdf,.txt,.xlsx';
const expanded = ref(false);

function parseDataUrl(url?: string) {
  const match = /^data:([^;,]+)?;base64,([\s\S]+)$/iu.exec(url?.trim() ?? '');
  if (!match) {
    return null;
  }
  return {
    data: match[2] ?? '',
    mimeType: match[1] || 'application/octet-stream',
  };
}

function toSubmitAttachments(files: any[]): AIChatComposerAttachment[] {
  return files.map((item) => {
    const parsed = parseDataUrl(item.url);
    const name = item.filename || item.file?.name || 'attachment';
    const mimeType = parsed?.mimeType || item.mediaType || item.file?.type || 'application/octet-stream';
    return {
      data: parsed?.data || item.url || '',
      file_type: inferAIChatAttachmentType(name, mimeType),
      id: item.id,
      mime_type: mimeType,
      name,
      size: item.file?.size || item.size || 0,
      source_type: parsed ? 'base64' : 'url',
    };
  });
}

async function handlePromptSubmit(payload: { files: any[]; text: string }) {
  const attachments = toSubmitAttachments(payload.files || []);
  return await props.onSubmit?.(payload.text, undefined, undefined, attachments);
}

function handlePromptError(error: { message: string }) {
  message.error(error.message || '附件处理失败');
}
</script>

<template>
  <div class="bg-card px-3 pb-3 sm:px-5 sm:pb-5">
    <PromptInput
      :accept="accept"
      class="ai-prompt-input w-full [&_[data-slot=input-group]]:!rounded-2xl [&_[data-slot=input-group]]:!bg-background/95 [&_[data-slot=input-group]]:!shadow-[0_16px_40px_-28px_rgb(15_23_42_/_0.55)] [&_[data-slot=input-group]]:backdrop-blur"
      :initial-input="value"
      :max-files="12"
      multiple
      @error="handlePromptError"
      @submit="handlePromptSubmit"
    >
      <ChatPromptInputContent
        :disabled="disabled"
        :expanded="expanded"
        :footer="footer"
        :loading="loading"
        :name="name"
        :on-cancel="onCancel"
        :on-change="onChange"
        :on-toggle-expanded="() => (expanded = !expanded)"
        :placeholder="placeholder"
        :value="value"
      />
    </PromptInput>
  </div>
</template>
