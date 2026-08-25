<script setup lang="ts">
import {
  compareConversationGroups,
  type ConversationSidebarCreation,
  type ConversationSidebarItem,
  type ConversationSidebarMenu,
} from '../adapters/conversation-items';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { cn } from '@vben/utils';
import { useInfiniteScroll } from '@vueuse/core';

import { VNodeRenderer } from './vnode-renderer';

const props = defineProps<{
  activeKey?: string;
  creation: ConversationSidebarCreation;
  hasMore: boolean;
  items: ConversationSidebarItem[];
  loading: boolean;
  loadingMore: boolean;
  menu: ConversationSidebarMenu;
  onActiveChange: (key: string) => void;
  onLoadMore: () => void;
}>();

const scrollContainerRef = ref<HTMLElement>();

const groupedItems = computed(() => {
  const groups: Array<{ group: string; items: ConversationSidebarItem[] }> = [];
  const map = new Map<string, ConversationSidebarItem[]>();

  for (const item of props.items) {
    const bucket = map.get(item.group) ?? [];
    bucket.push(item);
    map.set(item.group, bucket);
  }

  for (const [group, items] of map) {
    groups.push({ group, items });
  }

  return groups.sort((left, right) =>
    compareConversationGroups(left.group, right.group),
  );
});

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

function selectItem(item: ConversationSidebarItem) {
  props.onActiveChange(item.key);
}
</script>

<template>
  <aside
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card"
  >
    <div class="border-b border-border p-3">
      <a-button
        block
        class="!rounded-xl"
        :disabled="creation.disabled"
        type="default"
        @click="creation.onClick?.()"
      >
        <template #icon>
          <IconifyIcon class="size-4" icon="mdi:message-plus-outline" />
        </template>
        新建对话
      </a-button>
    </div>

    <div ref="scrollContainerRef" class="min-h-0 flex-1 overflow-y-auto p-3">
      <a-spin v-if="loading && items.length === 0" class="block py-10" />
      <template v-else>
        <div v-if="items.length === 0" class="py-10 text-center text-sm text-muted-foreground">
          暂无话题
        </div>
        <div v-for="group in groupedItems" :key="group.group" class="not-first:mt-4">
          <div class="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            {{ group.group }}
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="item in group.items"
              :key="item.key"
              :class="cn(
                'group/item relative flex min-w-0 items-center rounded-xl px-3 py-2 pr-11 text-left transition',
                activeKey === item.key
                  ? 'bg-accent/80 text-foreground'
                  : 'text-foreground hover:bg-accent/55',
              )"
            >
              <span
                v-if="item.isGenerating"
                aria-hidden="true"
                class="ai-conversation-generating-glow"
              />
              <button
                class="min-w-0 flex-1 text-left"
                :title="item.title"
                type="button"
                @click="selectItem(item)"
              >
                <VNodeRenderer :node="item.label" />
              </button>
              <div
                class="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100"
              >
                <a-popover placement="rightTop" trigger="click">
                  <template #content>
                    <div class="w-36 py-1">
                      <template v-for="menuItem in menu(item)" :key="menuItem.key">
                        <a-divider v-if="menuItem.type === 'divider'" class="!my-1" />
                        <a-button
                          v-else
                          block
                          class="!flex !h-auto !items-center !justify-start !gap-2 !px-2 !py-1.5 !text-left !text-xs"
                          :danger="menuItem.danger"
                          type="text"
                          @click="menuItem.onClick"
                        >
                          <VNodeRenderer :node="menuItem.icon" />
                          <span>{{ menuItem.label }}</span>
                        </a-button>
                      </template>
                    </div>
                  </template>
                  <a-button
                    class="!inline-flex !size-7 !items-center !justify-center !text-muted-foreground hover:!bg-muted hover:!text-foreground"
                    shape="circle"
                    size="small"
                    type="text"
                    @click.stop
                  >
                    <template #icon>
                      <IconifyIcon class="size-4" icon="mdi:dots-horizontal" />
                    </template>
                  </a-button>
                </a-popover>
              </div>
            </div>
          </div>
        </div>
        <div v-if="loadingMore" class="flex justify-center py-3">
          <a-spin />
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.ai-conversation-generating-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: inherit;
  padding: 1px;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.ai-conversation-generating-glow::before {
  position: absolute;
  inset: -60%;
  content: '';
  background: conic-gradient(
    from 225deg,
    hsl(var(--primary)) 0deg,
    hsl(var(--primary) / 0.45) 28deg,
    transparent 82deg,
    transparent 360deg
  );
  animation: ai-conversation-orbit 2.4s linear infinite;
}

@keyframes ai-conversation-orbit {
  to {
    transform: rotate(1turn);
  }
}
</style>
