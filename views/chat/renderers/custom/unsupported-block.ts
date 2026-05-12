import { defineComponent, h } from 'vue';

export const AIUnsupportedBlock = defineComponent({
  name: 'AIUnsupportedBlock',
  props: {
    reason: {
      default: '',
      type: String,
    },
    title: {
      default: '暂不支持的内容',
      type: String,
    },
  },
  setup(props) {
    return () =>
      h(
        'div',
        {
          class:
            'rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground',
        },
        [
          h('div', { class: 'font-medium' }, props.title),
          props.reason
            ? h('div', { class: 'mt-1 text-xs text-muted-foreground' }, props.reason)
            : null,
        ],
      );
  },
});
