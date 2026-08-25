<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { cn } from '#/plugins/ai/lib/utils';

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    description?: string;
    label: string;
    status?: 'active' | 'complete' | 'pending';
  }>(),
  {
    description: undefined,
    status: 'complete',
  },
);

const statusStyles = {
  active: 'text-foreground',
  complete: 'text-muted-foreground',
  pending: 'text-muted-foreground/50',
};
</script>

<template>
  <div
    :class="
      cn(
        'flex gap-2 text-sm',
        statusStyles[props.status],
        'fade-in-0 slide-in-from-top-2 animate-in',
        props.class,
      )
    "
    v-bind="$attrs"
  >
    <div class="relative mt-0.5">
      <slot name="icon" />
      <div class="-mx-px absolute top-7 bottom-0 left-1/2 w-px bg-border" />
    </div>
    <div class="flex-1 space-y-2">
      <div>{{ props.label }}</div>
      <div v-if="props.description" class="text-muted-foreground text-xs">
        {{ props.description }}
      </div>
      <slot />
    </div>
  </div>
</template>
