<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { CommandSeparator } from '#/plugins/ai/components/ui/command'
import { cn } from '#/plugins/ai/lib/utils'

type PromptInputCommandSeparatorProps = InstanceType<typeof CommandSeparator>['$props']

interface Props extends /* @vue-ignore */ PromptInputCommandSeparatorProps {
  class?: HTMLAttributes['class']
}
const props = defineProps<Props>()
</script>

<template>
  <CommandSeparator :class="cn(props.class)" v-bind="props" />
</template>
