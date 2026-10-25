<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { provide, ref } from 'vue';

import { Collapsible } from '#/plugins/ai/components/ui/collapsible';
import { cn } from '#/plugins/ai/lib/utils';

interface TaskProps {
  defaultOpen?: boolean;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<TaskProps>(), {
  class: undefined,
  defaultOpen: true,
});

const isOpen = ref(props.defaultOpen);

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

provide('isOpen', isOpen);
provide('toggle', toggleOpen);
</script>

<template>
  <Collapsible
    :default-open="isOpen"
    :class="cn(props.class)"
    as-child
    v-bind="$attrs"
  >
    <slot :is-open="isOpen" :toggle="toggleOpen"></slot>
  </Collapsible>
</template>
