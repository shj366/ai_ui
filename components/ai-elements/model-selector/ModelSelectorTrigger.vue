<script setup lang="ts">
import { DialogTrigger } from '#/plugins/ai/components/ui/dialog'
</script>

<template>
  <DialogTrigger v-bind="$attrs">
    <slot />
  </DialogTrigger>
</template>
