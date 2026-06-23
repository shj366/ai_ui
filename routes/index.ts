import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    name: 'PluginAI',
    path: '/plugins/ai',
    redirect: '/plugins/ai/chat',
    meta: {
      title: $t('ai.menu'),
      icon: 'tabler:robot',
    },
  },
  {
    name: 'PluginAIChat',
    path: '/plugins/ai/chat',
    component: () => import('../views/chat/index.vue'),
    meta: {
      title: $t('ai.chat'),
      icon: 'ri:chat-ai-line',
    },
  },
  {
    name: 'PluginAIModelService',
    path: '/plugins/ai/model-service',
    component: () => import('../views/model-service/index.vue'),
    meta: {
      title: $t('ai.model'),
      icon: 'carbon:model-alt',
    },
  },
  {
    name: 'PluginAIMcp',
    path: '/plugins/ai/mcp',
    component: () => import('../views/mcp/index.vue'),
    meta: {
      title: $t('ai.mcp'),
      icon: 'simple-icons:modelcontextprotocol',
    },
  },
  {
    name: 'PluginAIQuickPhrase',
    path: '/plugins/ai/quick-phrase',
    component: () => import('../views/quick-phrase/index.vue'),
    meta: {
      title: $t('ai.quick_phrase'),
      icon: 'mdi:lightning-bolt-outline',
    },
  },
];

export default routes;
