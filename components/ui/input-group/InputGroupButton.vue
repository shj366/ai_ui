<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import type { InputGroupButtonVariants } from '.';

import type { ButtonVariants } from '#/plugins/ai/components/ui/button';

import { Button } from '#/plugins/ai/components/ui/button';
import { cn } from '#/plugins/ai/lib/utils';

import { inputGroupButtonVariants } from '.';

interface InputGroupButtonProps {
  variant?: ButtonVariants['variant'];
  size?: InputGroupButtonVariants['size'];
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<InputGroupButtonProps>(), {
  class: undefined,
  size: 'xs',
  variant: 'ghost',
});
</script>

<template>
  <Button
    :data-size="props.size"
    :variant="props.variant"
    :class="cn(inputGroupButtonVariants({ size: props.size }), props.class)"
  >
    <slot></slot>
  </Button>
</template>
