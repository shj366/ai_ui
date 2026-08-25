import type { HTMLAttributes, PropType } from 'vue';

import { defineComponent, h } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { ChevronDownIcon } from '@radix-icons/vue';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/plugins/ai/components/ui/collapsible';
import { cn } from '#/plugins/ai/lib/utils';

export type ChatTaskStatus =
  | 'active'
  | 'cancelled'
  | 'completed'
  | 'error'
  | 'pending';

const classProp = null as unknown as PropType<HTMLAttributes['class']>;

function getStatusIcon(status: ChatTaskStatus) {
  if (status === 'active') {
    return 'mdi:loading';
  }
  if (status === 'completed') {
    return 'mdi:check-circle-outline';
  }
  if (status === 'error') {
    return 'mdi:alert-circle-outline';
  }
  if (status === 'cancelled') {
    return 'mdi:stop-circle-outline';
  }
  return 'mdi:circle-outline';
}

export const ChatTask = defineComponent({
  name: 'ChatTask',
  props: {
    class: classProp,
    defaultOpen: {
      default: true,
      type: Boolean,
    },
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        Collapsible,
        {
          ...attrs,
          class: cn('group/task', props.class),
          defaultOpen: props.defaultOpen,
        },
        slots,
      );
  },
});

export const ChatTaskContent = defineComponent({
  name: 'ChatTaskContent',
  props: {
    class: classProp,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        CollapsibleContent,
        {
          ...attrs,
          class: cn(
            'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1',
            'data-[state=open]:slide-in-from-top-1 text-popover-foreground outline-none',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            props.class,
          ),
        },
        () =>
          h(
            'div',
            { class: 'mt-3 space-y-2 border-l-2 border-muted pl-4' },
            slots.default?.(),
          ),
      );
  },
});

export const ChatTaskItem = defineComponent({
  name: 'ChatTaskItem',
  props: {
    class: classProp,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'div',
        {
          ...attrs,
          class: cn('min-w-0 text-sm text-muted-foreground leading-6', props.class),
        },
        slots.default?.(),
      );
  },
});

export const ChatTaskItemFile = defineComponent({
  name: 'ChatTaskItemFile',
  props: {
    class: classProp,
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'div',
        {
          ...attrs,
          class: cn(
            'inline-flex max-w-full items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-foreground text-xs',
            props.class,
          ),
        },
        () => h('span', { class: 'truncate' }, slots.default?.()),
      );
  },
});

export const ChatTaskTrigger = defineComponent({
  name: 'ChatTaskTrigger',
  props: {
    class: classProp,
    description: {
      default: undefined,
      type: String,
    },
    status: {
      default: 'pending',
      type: String as PropType<ChatTaskStatus>,
    },
    title: {
      required: true,
      type: String,
    },
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        CollapsibleTrigger,
        {
          asChild: true,
          class: cn('group', props.class),
        },
        {
          default: () =>
            slots.default?.() ?? [
              h(
                'div',
                {
                  ...attrs,
                  class:
                    'flex w-full cursor-pointer items-center justify-between gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground',
                },
                [
                  h('div', { class: 'flex min-w-0 items-center gap-2' }, [
                    h(IconifyIcon, {
                      class: cn(
                        'size-4 shrink-0 text-muted-foreground',
                        props.status === 'active' && 'animate-spin text-primary',
                        props.status === 'error' && 'text-amber-500',
                      ),
                      icon: getStatusIcon(props.status),
                    }),
                    h('div', { class: 'min-w-0' }, [
                      h('p', { class: 'truncate text-sm' }, props.title),
                      props.description
                        ? h(
                            'p',
                            { class: 'truncate text-muted-foreground/80 text-xs' },
                            props.description,
                          )
                        : null,
                    ]),
                  ]),
                  h(ChevronDownIcon, {
                    class:
                      'size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/task:rotate-180',
                  }),
                ],
              ),
            ],
        },
      );
  },
});
