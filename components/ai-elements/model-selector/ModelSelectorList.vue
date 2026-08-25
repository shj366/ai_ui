<script setup lang="ts">
import { CommandList } from '#/plugins/ai/components/ui/command'
</script>

<template>
  <CommandList v-bind="$attrs">
    <slot />
  </CommandList>
</template>
