<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { ScrollToBottomOptions } from 'vue-stick-to-bottom';

import { onBeforeUnmount, ref, watch } from 'vue';
import { StickToBottom } from 'vue-stick-to-bottom';

import { reactiveOmit } from '@vueuse/core';

import { cn } from '#/plugins/ai/lib/utils';

interface Props {
  ariaLabel?: string;
  class?: HTMLAttributes['class'];
  initial?: boolean | { damping?: number; mass?: number; stiffness?: number };
  resize?: 'instant' | { damping?: number; mass?: number; stiffness?: number };
  damping?: number;
  stiffness?: number;
  mass?: number;
  anchor?: 'auto' | 'none';
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: 'Conversation',
  class: undefined,
  initial: true,
  resize: undefined,
  damping: 0.7,
  stiffness: 0.05,
  mass: 1.25,
  anchor: 'none',
});
const emit = defineEmits<{
  scroll: [event: Event];
}>();
const delegatedProps = reactiveOmit(props, 'ariaLabel', 'class');
const stickToBottomRef = ref<InstanceType<typeof StickToBottom>>();
const scrollAreaClass = 'ai-conversation-scroll-area';
let removeScrollListener: (() => void) | undefined;
let boundScrollElement: HTMLElement | undefined;

function getExposedValue<T>(key: string) {
  const value = (stickToBottomRef.value as any)?.[key];
  return (value?.value ?? value) as T | undefined;
}

function getScrollElement() {
  return getExposedValue<HTMLElement>('scrollRef');
}

function handleScroll(event: Event) {
  emit('scroll', event);
}

function cleanupScrollListener() {
  removeScrollListener?.();
  removeScrollListener = undefined;
  boundScrollElement?.classList.remove(scrollAreaClass);
  boundScrollElement = undefined;
}

function bindScrollListener(element?: HTMLElement) {
  cleanupScrollListener();
  if (!element) {
    return;
  }

  element.addEventListener('scroll', handleScroll, { passive: true });
  element.classList.add(scrollAreaClass);
  boundScrollElement = element;
  removeScrollListener = () => {
    element.removeEventListener('scroll', handleScroll);
  };
}

watch(getScrollElement, bindScrollListener, { flush: 'post' });

onBeforeUnmount(cleanupScrollListener);

defineExpose({
  get scrollBoxNativeElement() {
    return getScrollElement();
  },
  scrollToBottom(options?: ScrollToBottomOptions) {
    return (stickToBottomRef.value as any)?.scrollToBottom?.(options);
  },
});
</script>

<template>
  <StickToBottom
    ref="stickToBottomRef"
    v-bind="delegatedProps"
    :aria-label="props.ariaLabel"
    :class="
      cn(
        'ai-conversation-scroll relative flex-1 overflow-y-hidden',
        props.class,
      )
    "
    role="log"
  >
    <slot></slot>
    <template #overlay="slotProps">
      <slot name="overlay" v-bind="slotProps"></slot>
    </template>
    <template #after="slotProps">
      <slot name="after" v-bind="slotProps"></slot>
    </template>
  </StickToBottom>
</template>

<style>
.ai-conversation-scroll-area {
  scrollbar-gutter: auto !important;
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}

.ai-conversation-scroll:hover .ai-conversation-scroll-area,
.ai-conversation-scroll:focus-within .ai-conversation-scroll-area {
  scrollbar-color: hsl(var(--border) / 70%) transparent;
}

.ai-conversation-scroll-area::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.ai-conversation-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.ai-conversation-scroll-area::-webkit-scrollbar-thumb {
  background-color: transparent;
  background-clip: content-box;
  border: 2px solid transparent;
  border-radius: 999px;
}

.ai-conversation-scroll:hover
  .ai-conversation-scroll-area::-webkit-scrollbar-thumb,
.ai-conversation-scroll:focus-within
  .ai-conversation-scroll-area::-webkit-scrollbar-thumb {
  background-color: hsl(var(--border) / 75%);
}

.ai-conversation-scroll-area::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 45%);
}
</style>
