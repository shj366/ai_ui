import type { PropType, VNodeChild } from 'vue';

import { defineComponent } from 'vue';

export const VNodeRenderer = defineComponent({
  name: 'AIVNodeRenderer',
  props: {
    node: {
      default: null,
      type: null as unknown as PropType<VNodeChild>,
    },
  },
  setup(props) {
    return () => props.node;
  },
});
