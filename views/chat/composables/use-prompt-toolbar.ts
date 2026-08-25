import type { PromptInputProps } from '../components';

import type { Ref, VNodeChild } from 'vue';

import type { AIQuickPhraseResult } from '../../../api';

import { h, ref, resolveComponent } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { getAllAIQuickPhraseApi } from '../../../api';
import { PromptInputButton } from '#/plugins/ai/components/ai-elements';

type PromptInputFooterRender = Extract<
  NonNullable<PromptInputProps['footer']>,
  (...args: any[]) => any
>;

type PromptInputFooterComponents =
  Parameters<PromptInputFooterRender>[1]['components'] & {
    AttachmentButton?: () => VNodeChild;
    ExpandButton?: () => VNodeChild;
  };

export interface UsePromptToolbarOptions {
  canClearMessages: Ref<boolean>;
  canCreateNewConversation: Ref<boolean>;
  confirmClearMessages: () => void;
  createNewConversation: () => void;
  onSelectQuickPhrase: (item: AIQuickPhraseResult) => void;
}

export function usePromptToolbar(options: UsePromptToolbarOptions) {
  const {
    canClearMessages,
    canCreateNewConversation,
    confirmClearMessages,
    createNewConversation,
    onSelectQuickPhrase,
  } = options;
  const aButton = resolveComponent('a-button');
  const aEmpty = resolveComponent('a-empty');
  const aPopover = resolveComponent('a-popover');
  const aSpin = resolveComponent('a-spin');
  const quickPhrases = ref<AIQuickPhraseResult[]>([]);
  const quickPhraseLoading = ref(false);
  const quickPhraseOpen = ref(false);

  async function fetchQuickPhrases() {
    quickPhraseLoading.value = true;
    try {
      quickPhrases.value = await getAllAIQuickPhraseApi();
    } finally {
      quickPhraseLoading.value = false;
    }
  }

  function renderQuickPhraseContent() {
    if (quickPhraseLoading.value) {
      return h(aSpin, { size: 'small' });
    }
    if (quickPhrases.value.length === 0) {
      return h(aEmpty, { description: '暂无快捷短语', image: null });
    }
    return h(
      'div',
      { class: 'flex max-h-[min(320px,60vh)] w-[280px] flex-col gap-1 overflow-y-auto' },
      quickPhrases.value.map((item) =>
        h(
          aButton,
          {
            block: true,
            class: '!flex !h-auto !justify-start !text-left',
            htmlType: 'button',
            title: item.content,
            type: 'text',
            onClick: () => {
              onSelectQuickPhrase(item);
              quickPhraseOpen.value = false;
            },
          },
          { default: () => item.title },
        ),
      ),
    );
  }

  function renderIconButton(opts: {
    disabled?: boolean;
    icon: string;
    title: string;
    onClick?: () => void;
  }) {
    return h(
      PromptInputButton,
      {
        'aria-label': opts.title,
        class:
          'ai-prompt-tool-button !h-8 !w-8 !rounded-lg !px-0 !text-muted-foreground !bg-transparent !shadow-none hover:!bg-muted hover:!text-foreground',
        disabled: opts.disabled,
        title: opts.title,
        type: 'button',
        onClick: opts.onClick,
      },
      () => h(IconifyIcon, { class: 'size-4 shrink-0', icon: opts.icon }),
    );
  }

  const renderPromptInputFooter: NonNullable<PromptInputProps['footer']> = (
    defaultNode,
    info,
  ) => {
    const { AttachmentButton, ExpandButton } =
      info.components as PromptInputFooterComponents;

    return h(
      'div',
      {
        class:
          'ai-prompt-footer-layout flex w-full items-end justify-between gap-2',
      },
      [
        h(
          'div',
          { class: 'flex min-w-0 flex-1 flex-wrap items-center gap-1' },
          [
            renderIconButton({
              disabled: !canCreateNewConversation.value,
              icon: 'mdi:message-plus-outline',
              title: '新建对话',
              onClick: createNewConversation,
            }),
            AttachmentButton ? h(AttachmentButton) : null,
            ExpandButton ? h(ExpandButton) : null,
            h(
              aPopover,
              {
                onOpenChange: (open: boolean) => {
                  quickPhraseOpen.value = open;
                },
                open: quickPhraseOpen.value,
                placement: 'topLeft',
                title: '快捷短语',
                trigger: 'click',
              },
              {
                content: () => renderQuickPhraseContent(),
                default: () =>
                  renderIconButton({
                    icon: 'mdi:lightning-bolt-outline',
                    title: '快捷短语',
                  }),
              },
            ),
            renderIconButton({
              disabled: !canClearMessages.value,
              icon: 'mdi:eraser-variant',
              title: '清空消息',
              onClick: confirmClearMessages,
            }),
          ],
        ),
        h(
          'div',
          { class: 'ml-auto flex shrink-0 items-center justify-end pb-0.5' },
          [defaultNode],
        ),
      ],
    );
  };

  return { fetchQuickPhrases, renderPromptInputFooter };
}
