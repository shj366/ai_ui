<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { Comment, computed, Text, toRef, useSlots } from 'vue';

import { InputGroupButton } from '#/plugins/ai/components/ui/input-group';
import { cn } from '#/plugins/ai/lib/utils';

type InputGroupButtonProps = InstanceType<typeof InputGroupButton>['$props'];

interface Props extends /* @vue-ignore */ InputGroupButtonProps {
  class?: HTMLAttributes['class'];
  variant?: InputGroupButtonProps['variant'];
  size?: InputGroupButtonProps['size'];
}

const props = withDefaults(defineProps<Props>(), {
  class: undefined,
  size: undefined,
  variant: 'ghost',
});

const slots = useSlots();

const computedSize = computed(() => {
  if (props.size !== undefined && props.size !== null) return props.size;

  const slotNodes = slots.default?.();

  if (!slotNodes) return 'icon-sm';

  const validChildren = slotNodes.filter((node) => {
    if (node.type === Comment) return false;
    if (node.type === Text && !node.children?.toString().trim()) return false;
    return true;
  });

  return validChildren.length > 1 ? 'sm' : 'icon-sm';
});

const variant = toRef(props, 'variant');

const { size, variant: _, class: __, ...restProps } = props;
</script>

<template>
  <InputGroupButton
    type="button"
    :size="computedSize"
    :class="cn($props.class)"
    :variant="variant"
    v-bind="restProps"
  >
    <slot></slot>
  </InputGroupButton>
</template>
