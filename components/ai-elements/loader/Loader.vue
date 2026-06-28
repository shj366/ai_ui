<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '#/plugins/ai/lib/utils'
import LoaderIcon from './LoaderIcon.vue'

interface Props {
  size?: number
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
})
</script>

<template>
  <div
    :class="cn('inline-flex animate-spin items-center justify-center', props.class)"
    aria-label="加载中"
    aria-live="polite"
    role="status"
    v-bind="$attrs"
  >
    <LoaderIcon :size="props.size" />
  </div>
</template>
