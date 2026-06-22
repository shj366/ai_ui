<script setup lang="ts">
import type { ConversationsProps } from '@antdv-next/x';

import { ref } from 'vue';

import { Conversations } from '@antdv-next/x';
import { useInfiniteScroll } from '@vueuse/core';

const props = defineProps<{
  activeKey?: string;
  creation: ConversationsProps['creation'];
  hasMore: boolean;
  items: NonNullable<ConversationsProps['items']>;
  loading: boolean;
  loadingMore: boolean;
  menu: ConversationsProps['menu'];
  onActiveChange: NonNullable<ConversationsProps['onActiveChange']>;
  onLoadMore: () => void;
}>();

const scrollContainerRef = ref<HTMLElement>();

useInfiniteScroll(
  scrollContainerRef,
  async () => {
    await props.onLoadMore();
  },
  {
    canLoadMore: () => props.hasMore && !props.loading && !props.loadingMore,
    distance: 64,
  },
);
</script>

<template>
  <aside
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card"
  >
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto p-3">
      <a-spin v-if="loading && items.length === 0" class="block py-10" />
      <template v-else>
        <Conversations
          :active-key="activeKey"
          :creation="creation"
          :items="items"
          :menu="menu"
          :on-active-change="onActiveChange"
        />
        <div v-if="loadingMore" class="flex justify-center py-3">
          <a-spin />
        </div>
      </template>
    </div>
  </aside>
</template>
