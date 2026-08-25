<script setup lang="ts">
import { Dialog } from '#/plugins/ai/components/ui/dialog'
</script>

<template>
  <Dialog v-bind="$attrs">
    <slot />
  </Dialog>
</template>
