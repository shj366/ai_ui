import type { PropType } from 'vue';

import { computed, defineComponent, h } from 'vue';

import { CodeHighlighter } from '@antdv-next/x';

const MAX_RENDERABLE_DATA_LENGTH = 60_000;

function stringifyData(data: unknown) {
  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data, null, 2) ?? String(data);
  } catch {
    return String(data);
  }
}

export const AIJsonPreview = defineComponent({
  name: 'AIJsonPreview',
  props: {
    data: {
      default: undefined,
      type: null as unknown as PropType<unknown>,
    },
    defaultOpen: {
      default: undefined,
      type: Boolean as PropType<boolean | undefined>,
    },
    isDark: {
      default: false,
      type: Boolean,
    },
    title: {
      default: '数据',
      type: String,
    },
  },
  setup(props) {
    const content = computed(() => {
      const rawContent = stringifyData(props.data);
      if (rawContent.length <= MAX_RENDERABLE_DATA_LENGTH) {
        return rawContent;
      }

      return `${rawContent.slice(0, MAX_RENDERABLE_DATA_LENGTH)}\n\n/* 数据过长，已截断以保持页面流畅。 */`;
    });

    return () => {
      if (!content.value.trim()) {
        return null;
      }

      const language = typeof props.data === 'string' ? 'text' : 'json';
      const open = props.defaultOpen ?? content.value.length <= 1600;

      return h(
        'details',
        {
          class:
            'group rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs',
          open,
        },
        [
          h(
            'summary',
            {
              class:
                'cursor-pointer select-none font-medium text-muted-foreground group-open:mb-2',
            },
            props.title,
          ),
          h('div', { class: 'min-w-0 w-full max-w-full overflow-hidden' }, [
            h(CodeHighlighter, {
              content: content.value,
              language,
              showThemeToggle: false,
              theme: props.isDark ? 'dark' : 'light',
            }),
          ]),
        ],
      );
    };
  },
});
