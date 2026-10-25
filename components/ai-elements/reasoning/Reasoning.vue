<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { computed, provide, ref, watch } from 'vue';

import { Collapsible } from '#/plugins/ai/components/ui/collapsible';
import { cn } from '#/plugins/ai/lib/utils';

import { ReasoningKey } from './context';

interface Props {
  class?: HTMLAttributes['class'];
  isStreaming?: boolean;
  modelValue?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  duration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  class: undefined,
  isStreaming: false,
  defaultOpen: true,
  duration: undefined,
  modelValue: undefined,
  open: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue' | 'update:open', value: boolean): void;
  (e: 'update:duration', value: number): void;
}>();

const isOpen = ref(props.modelValue ?? props.open ?? props.defaultOpen);
const internalDuration = ref<number | undefined>(props.duration);
const isControlled = computed(
  () =>
    typeof props.modelValue === 'boolean' || typeof props.open === 'boolean',
);

watch(
  () => props.duration,
  (newVal) => {
    internalDuration.value = newVal;
  },
);

function updateDuration(val: number) {
  internalDuration.value = val;
  emit('update:duration', val);
}

function setIsOpen(value: boolean) {
  isOpen.value = value;
}

const hasAutoClosed = ref(false);
const startTime = ref<null | number>(null);

const MS_IN_S = 1000;
const AUTO_CLOSE_DELAY = 1000;

watch([() => props.modelValue, () => props.open], ([modelValue, open]) => {
  const nextOpen = modelValue ?? open;
  if (typeof nextOpen === 'boolean' && isOpen.value !== nextOpen) {
    isOpen.value = nextOpen;
  }
});

watch(isOpen, (value) => {
  emit('update:modelValue', value);
  emit('update:open', value);
});

watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming) {
      if (!isControlled.value) {
        isOpen.value = true;
        hasAutoClosed.value = false;
      }

      if (startTime.value === null && props.duration === undefined) {
        startTime.value = Date.now();
      }
    } else if (startTime.value !== null) {
      const calculatedDuration = Math.ceil(
        (Date.now() - startTime.value) / MS_IN_S,
      );
      updateDuration(calculatedDuration);
      startTime.value = null;
    }
  },
  { immediate: true },
);

watch(
  [() => props.isStreaming, isOpen, () => props.defaultOpen, hasAutoClosed],
  (_, __, onCleanup) => {
    if (
      !isControlled.value &&
      props.defaultOpen &&
      !props.isStreaming &&
      isOpen.value &&
      !hasAutoClosed.value
    ) {
      const timer = setTimeout(() => {
        isOpen.value = false;
        hasAutoClosed.value = true;
      }, AUTO_CLOSE_DELAY);

      onCleanup(() => clearTimeout(timer));
    }
  },
  { immediate: true },
);

provide(ReasoningKey, {
  isStreaming: computed(() => props.isStreaming),
  isOpen,
  setIsOpen,
  duration: computed(() => internalDuration.value),
});
</script>

<template>
  <Collapsible
    :open="isOpen"
    :class="cn('not-prose mb-4', props.class)"
    @update:open="setIsOpen"
  >
    <slot></slot>
  </Collapsible>
</template>
