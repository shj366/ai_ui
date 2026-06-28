<script setup lang="ts">
import type { HTMLAttributes, Ref } from 'vue';

import { useVModel } from '@vueuse/core';
import { provide } from 'vue';

import { cn } from '#/plugins/ai/lib/utils';

import { ChainOfThoughtContextKey } from './context';

interface ChainOfThoughtProps {
  class?: HTMLAttributes['class'];
  defaultOpen?: boolean;
  modelValue?: boolean;
}

const props = withDefaults(defineProps<ChainOfThoughtProps>(), {
  defaultOpen: false,
  modelValue: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const isOpen = useVModel(props, 'modelValue', emit, {
  defaultValue: props.defaultOpen,
  passive: true,
});

provide(ChainOfThoughtContextKey, isOpen as Ref<boolean>);
</script>

<template>
  <div
    :class="cn('not-prose max-w-prose space-y-4', props.class)"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
