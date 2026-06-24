<script setup lang="ts">
import type { AIProviderResult } from '../../api';

import { computed, ref } from 'vue';

import { ColPage } from '@vben/common-ui';

import ModelPane from './components/model-pane.vue';
import ProviderPane from './components/provider-pane.vue';
import { pickActiveProviderId } from './data';

const providers = ref<AIProviderResult[]>([]);
const activeProviderId = ref<number>();

const activeProvider = computed(() => {
  return providers.value.find((item) => item.id === activeProviderId.value);
});

function handleProvidersChange(nextProviders: AIProviderResult[]) {
  providers.value = nextProviders;
  activeProviderId.value = pickActiveProviderId(
    nextProviders,
    activeProviderId.value,
  );
}

function handleProviderSelect(providerId: number) {
  activeProviderId.value = providerId;
}
</script>

<template>
  <ColPage
    auto-content-height
    content-class="h-full"
    :left-width="20"
    :resizable="false"
    :right-width="80"
  >
    <template #left>
      <div class="h-full">
        <ProviderPane
          :active-provider-id="activeProviderId"
          @providers-change="handleProvidersChange"
          @select="handleProviderSelect"
        />
      </div>
    </template>

    <ModelPane :key="activeProviderId ?? 'empty'" :provider="activeProvider" />
  </ColPage>
</template>
