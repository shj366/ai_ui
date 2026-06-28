<script setup lang="ts">
import type { Experimental_GeneratedImage } from 'ai'
import type { HTMLAttributes } from 'vue'
import { cn } from '#/plugins/ai/lib/utils'
import { computed } from 'vue'

interface Props extends Partial<Experimental_GeneratedImage> {
  alt?: string
  class?: HTMLAttributes['class']
  src?: string
}

const props = defineProps<Props>()

const classes = computed(() => cn(
  'h-auto max-w-full overflow-hidden rounded-md',
  props.class,
))

const src = computed(() => props.src || `data:${props.mediaType};base64,${props.base64}`)
</script>

<template>
  <img
    :alt="props.alt"
    :class="classes"
    :src="src"
    v-bind="$attrs"
  >
</template>
