<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectContent } from '#/plugins/ai/components/ui/select'
import { cn } from '#/plugins/ai/lib/utils'

type SelectContentProps = InstanceType<typeof SelectContent>['$props']

interface Props extends /* @vue-ignore */ SelectContentProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <SelectContent :class="cn(props.class)" v-bind="props">
    <slot />
  </SelectContent>
</template>
