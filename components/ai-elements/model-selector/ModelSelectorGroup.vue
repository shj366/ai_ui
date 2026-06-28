<script setup lang="ts">
import { CommandGroup } from '#/plugins/ai/components/ui/command'
</script>

<template>
  <CommandGroup v-bind="$attrs">
    <slot />
  </CommandGroup>
</template>
