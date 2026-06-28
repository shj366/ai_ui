<script setup lang="ts">
import { CommandEmpty } from '#/plugins/ai/components/ui/command'
</script>

<template>
  <CommandEmpty v-bind="$attrs">
    <slot />
  </CommandEmpty>
</template>
