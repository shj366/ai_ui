<script setup lang="ts">
import type { DynamicToolUIPart, ToolUIPart } from 'ai';

import type { HTMLAttributes } from 'vue';

import { computed } from 'vue';

import { ChevronDownIcon, WrenchIcon } from '@lucide/vue';

import { CollapsibleTrigger } from '#/plugins/ai/components/ui/collapsible';
import { cn } from '#/plugins/ai/lib/utils';

import StatusBadge from './ToolStatusBadge.vue';

type ToolHeaderProps = {
  class?: HTMLAttributes['class'];
  title?: string;
} & (
  | {
      state: DynamicToolUIPart['state'];
      toolName: string;
      type: DynamicToolUIPart['type'];
    }
  | { state: ToolUIPart['state']; toolName?: never; type: ToolUIPart['type'] }
);

const props = defineProps<ToolHeaderProps>();

const derivedName = computed(() =>
  props.type === 'dynamic-tool'
    ? props.toolName
    : props.type.split('-').slice(1).join('-'),
);
</script>

<template>
  <CollapsibleTrigger
    :class="
      cn('flex w-full items-center justify-between gap-4 p-3', props.class)
    "
    v-bind="$attrs"
  >
    <div class="flex items-center gap-2">
      <WrenchIcon class="size-4 text-muted-foreground" />
      <span class="font-medium text-sm">{{ props.title ?? derivedName }}</span>
      <StatusBadge :state="props.state" />
    </div>
    <ChevronDownIcon
      class="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
    />
  </CollapsibleTrigger>
</template>
