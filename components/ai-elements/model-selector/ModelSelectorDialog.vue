<script setup lang="ts">
import { CommandDialog } from '#/plugins/ai/components/ui/command'
</script>

<template>
  <CommandDialog v-bind="$attrs">
    <slot />
  </CommandDialog>
</template>
