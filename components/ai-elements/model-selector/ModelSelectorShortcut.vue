<script setup lang="ts">
import { CommandShortcut } from '#/plugins/ai/components/ui/command'
</script>

<template>
  <CommandShortcut v-bind="$attrs">
    <slot />
  </CommandShortcut>
</template>
