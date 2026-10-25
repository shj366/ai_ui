<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { BookIcon } from '@lucide/vue';

import { cn } from '#/plugins/ai/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
  href: string;
  title: string;
}>();
</script>

<template>
  <a
    :class="cn('flex items-center gap-2', props.class)"
    :href="props.href"
    rel="noreferrer"
    target="_blank"
  >
    <!-- Default slot content -->
    <slot>
      <BookIcon class="h-4 w-4" />
      <span class="block font-medium">{{ props.title }}</span>
    </slot>
  </a>
</template>
