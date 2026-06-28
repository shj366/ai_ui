<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { CommandList } from '#/plugins/ai/components/ui/command'
import { cn } from '#/plugins/ai/lib/utils'

type PromptInputCommandListProps = InstanceType<typeof CommandList>['$props']

interface Props extends /* @vue-ignore */ PromptInputCommandListProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <CommandList :class="cn(props.class)" v-bind="props" />
</template>
