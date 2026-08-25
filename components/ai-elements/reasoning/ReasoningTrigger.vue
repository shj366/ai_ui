<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { BrainIcon, ChevronDownIcon } from '@lucide/vue'
import { CollapsibleTrigger } from '#/plugins/ai/components/ui/collapsible'
import { cn } from '#/plugins/ai/lib/utils'
import { computed } from 'vue'
import { Shimmer } from '../shimmer'
import { useReasoningContext } from './context'

interface Props {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

const { isStreaming, isOpen, duration } = useReasoningContext()

const thinkingMessage = computed(() => {
  if (isStreaming.value) {
    return 'thinking'
  }

  return typeof duration.value === 'number' && duration.value > 0
    ? 'duration_done'
    : 'default_done'
})
</script>

<template>
  <CollapsibleTrigger
    :class="cn(
      'flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground',
      props.class,
    )"
  >
    <slot>
      <BrainIcon class="size-4" />

      <template v-if="thinkingMessage === 'thinking'">
        <Shimmer :duration="1">
          正在思考...
        </Shimmer>
      </template>

      <template v-else-if="thinkingMessage === 'default_done'">
        <p>已深度思考</p>
      </template>

      <template v-else>
        <p>已深度思考（用时 {{ duration }} 秒）</p>
      </template>

      <ChevronDownIcon
        :class="cn(
          'size-4 transition-transform',
          isOpen ? 'rotate-180' : 'rotate-0',
        )"
      />
    </slot>
  </CollapsibleTrigger>
</template>
