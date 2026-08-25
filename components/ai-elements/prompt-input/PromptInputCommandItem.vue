<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { CommandItem } from '#/plugins/ai/components/ui/command'
import { cn } from '#/plugins/ai/lib/utils'

type PromptInputCommandItemProps = InstanceType<typeof CommandItem>['$props']

interface Props extends /* @vue-ignore */ PromptInputCommandItemProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <CommandItem v-bind="props" :class="cn(props.class)">
    <slot />
  </CommandItem>
</template>
