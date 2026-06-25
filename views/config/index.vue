<script setup lang="ts">
import { h, nextTick, onActivated, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import SearchEngine from './search-engine.vue';

const activeKey = ref('0');

const searchEngineRef = ref();

const tabItems = [
  {
    icon: () =>
      h('span', { class: 'icon-[codicon--symbol-parameter] -mb-1 size-5' }),
    key: '0',
    label: '搜索引擎配置',
  },
];

async function fetchActiveConfig() {
  await nextTick();

  if (activeKey.value === '0' && searchEngineRef.value) {
    await searchEngineRef.value.fetchConfigList();
  }
}

onMounted(fetchActiveConfig);
onActivated(fetchActiveConfig);
</script>

<template>
  <Page auto-content-height>
    <a-card
      class="h-full overflow-y-auto rounded-[var(--radius)]"
      variant="borderless"
    >
      <a-tabs
        v-model:active-key="activeKey"
        animated
        class="h-full"
        tab-placement="start"
        :items="tabItems"
        :tab-bar-style="{ width: '16%' }"
      >
        <template #contentRender="{ item }">
          <SearchEngine v-if="item.key === '0'" ref="searchEngineRef" />
        </template>
      </a-tabs>
    </a-card>
  </Page>
</template>

<style lang="scss" scoped>
:deep(.ant-card-body) {
  height: 100%;
  min-height: 100%;
}
</style>
