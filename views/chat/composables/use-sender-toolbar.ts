import type { SenderProps } from '@antdv-next/x';

import type { Ref } from 'vue';

import type {
  AIChatComposerParams,
  AIMcpResult,
  AIQuickPhraseResult,
} from '../../../api';

import { h, ref, resolveComponent } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { getAllAIQuickPhraseApi } from '../../../api';

interface SenderToolbarOption {
  desc?: string;
  icon?: string;
  key: string;
  label: string;
  title?: string;
}

export interface UseSenderToolbarOptions {
  activeConversationId: Ref<string>;
  canClearMessages: Ref<boolean>;
  canCreateNewConversation: Ref<boolean>;
  composerHint: Ref<string>;
  confirmClearConversationContext: () => void;
  confirmClearMessages: () => void;
  createNewConversation: () => void;
  enableBuiltinTools: Ref<boolean>;
  generationType: Ref<string>;
  generationTypeButtonLabel: Ref<string>;
  GENERATION_TYPE_OPTIONS: Array<{
    desc: string;
    label: string;
    value: string;
  }>;
  hasAdvancedSettings: Ref<boolean>;
  mcps: Ref<AIMcpResult[]>;
  onOpenSettings: () => void;
  prompt: Ref<string>;
  selectedMcpIds: Ref<number[]>;
  selectedModelId: Ref<string | undefined>;
  selectedProviderId: Ref<number | undefined>;
  sending: Ref<boolean>;
  thinking: Ref<AIChatComposerParams['thinking']>;
  thinkingButtonLabel: Ref<string>;
  THINKING_OPTIONS: Array<{
    desc: string;
    key: string;
    label: string;
    value: AIChatComposerParams['thinking'];
  }>;
  webSearch: Ref<string>;
  webSearchButtonLabel: Ref<string>;
  WEB_SEARCH_OPTIONS: Array<{ desc: string; label: string; value: string }>;
}

export function useSenderToolbar(options: UseSenderToolbarOptions) {
  const aButton = resolveComponent('a-button');
  const aEmpty = resolveComponent('a-empty');
  const aFlex = resolveComponent('a-flex');
  const aPopover = resolveComponent('a-popover');
  const aSpin = resolveComponent('a-spin');
  const aTypographyText = resolveComponent('a-typography-text');
  const optionCardRadiusClass = '!rounded-[var(--radius)]';

  const {
    canClearMessages,
    canCreateNewConversation,
    composerHint,
    confirmClearConversationContext,
    confirmClearMessages,
    createNewConversation,
    generationType,
    generationTypeButtonLabel,
    GENERATION_TYPE_OPTIONS,
    hasAdvancedSettings,
    mcps,
    onOpenSettings,
    prompt,
    selectedMcpIds,
    selectedModelId,
    selectedProviderId,
    sending,
    thinking,
    thinkingButtonLabel,
    THINKING_OPTIONS,
    webSearch,
    webSearchButtonLabel,
    WEB_SEARCH_OPTIONS,
    activeConversationId,
  } = options;

  const quickPhrasePopoverOpen = ref(false);
  const quickPhrases = ref<AIQuickPhraseResult[]>([]);
  const quickPhraseLoading = ref(false);

  async function fetchQuickPhrases() {
    quickPhraseLoading.value = true;
    try {
      quickPhrases.value = await getAllAIQuickPhraseApi();
    } finally {
      quickPhraseLoading.value = false;
    }
  }

  function appendQuickPhrase(item: AIQuickPhraseResult) {
    prompt.value = prompt.value.trim()
      ? `${prompt.value.trim()}\n${item.content}`
      : item.content;
  }

  function handleQuickPhraseSelect(item: AIQuickPhraseResult) {
    appendQuickPhrase(item);
    quickPhrasePopoverOpen.value = false;
  }

  function handleQuickPhrasePopoverOpenChange(open: boolean) {
    quickPhrasePopoverOpen.value = open;
  }

  function isMcpSelected(mcpId: number) {
    return selectedMcpIds.value.includes(mcpId);
  }

  function toggleMcpSelection(mcpId: number) {
    selectedMcpIds.value = isMcpSelected(mcpId)
      ? selectedMcpIds.value.filter((id) => id !== mcpId)
      : [...selectedMcpIds.value, mcpId];
  }

  function renderFooterIconButton(opts: {
    disabled?: boolean;
    icon: string;
    onClick?: () => void;
    title: string;
  }) {
    return h(aButton, {
      disabled: opts.disabled,
      htmlType: 'button',
      icon: h(IconifyIcon, {
        icon: opts.icon,
      }),
      onClick: () => {
        opts.onClick?.();
      },
      shape: 'circle',
      size: 'small',
      title: opts.title,
      type: 'text',
    });
  }

  function renderPopoverContent(content: ReturnType<typeof h>, width: number) {
    return h(
      aFlex,
      {
        gap: 'small',
        style: { width: `${width}px` },
        vertical: true,
      },
      {
        default: () => [content],
      },
    );
  }

  function renderOptionLabel(item: { desc?: string; label: string }) {
    return h(
      aFlex,
      {
        gap: 2,
        style: { flex: 1, minWidth: 0 },
        vertical: true,
      },
      {
        default: () => [
          h(
            aTypographyText,
            {
              class: 'block max-w-full',
              ellipsis: { tooltip: item.label },
              strong: true,
              style: { fontSize: '12px', lineHeight: '16px' },
            },
            { default: () => item.label },
          ),
          item.desc
            ? h(
                aTypographyText,
                {
                  class: 'block max-w-full',
                  ellipsis: { tooltip: item.desc },
                  style: {
                    fontSize: '10px',
                    lineHeight: '14px',
                    maxWidth: '100%',
                  },
                  type: 'secondary',
                },
                { default: () => item.desc },
              )
            : null,
        ],
      },
    );
  }

  function renderOptionCard(
    params: SenderToolbarOption & {
      onClick: () => void;
      selected?: boolean;
    },
  ) {
    let icon = params.icon;
    if (params.selected === true) {
      icon = 'mdi:check-circle';
    } else if (params.selected === false) {
      icon = params.icon ?? 'mdi:circle-outline';
    }

    return h(
      aButton,
      {
        block: true,
        class: [
          '!flex !h-auto !items-start !justify-start !px-2.5 !py-1.5 !text-left !transition-colors',
          optionCardRadiusClass,
          params.selected
            ? '!border-primary/40 !bg-primary/10 !text-foreground shadow-sm'
            : '!border-border !bg-background hover:!border-primary/30 hover:!bg-accent/30',
        ],
        htmlType: 'button',
        key: params.key,
        onClick: params.onClick,
        title: params.title ?? `${params.label} ${params.desc ?? ''}`.trim(),
        type: 'default',
      },
      {
        default: () =>
          h(
            aFlex,
            { align: 'flex-start', gap: 'small', style: { width: '100%' } },
            {
              default: () => [
                icon
                  ? h(IconifyIcon, {
                      class: [
                        'mt-0.5 size-3.5 shrink-0',
                        params.selected
                          ? 'text-primary'
                          : 'text-muted-foreground/60',
                      ],
                      icon,
                    })
                  : null,
                renderOptionLabel(params),
              ],
            },
          ),
      },
    );
  }

  function renderOptionList(
    items: Array<
      SenderToolbarOption & {
        onClick: () => void;
        selected?: boolean;
      }
    >,
    maxHeight?: number | string,
  ) {
    return h(
      aFlex,
      {
        gap: 'small',
        style: maxHeight
          ? {
              maxHeight:
                typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
              overflowX: 'hidden',
              overflowY: 'auto',
              paddingRight: '2px',
            }
          : undefined,
        vertical: true,
      },
      {
        default: () => items.map((item) => renderOptionCard(item)),
      },
    );
  }

  function renderSelectableOptionsContent(params: {
    activeKey?: string;
    items: SenderToolbarOption[];
    onSelect: (key: string) => void;
    width?: number;
  }) {
    return renderPopoverContent(
      renderOptionList(
        params.items.map((item) => ({
          ...item,
          onClick: () => {
            params.onSelect(item.key);
          },
          selected: item.key === params.activeKey,
        })),
      ),
      params.width ?? 320,
    );
  }

  function renderThinkingPopoverContent() {
    const activeOption = THINKING_OPTIONS.find(
      (item) => item.value === thinking.value,
    );
    return renderSelectableOptionsContent({
      activeKey: activeOption?.key,
      items: THINKING_OPTIONS.map((item) => ({
        desc: item.desc,
        key: item.key,
        label: item.label,
      })),
      onSelect: (key) => {
        thinking.value = THINKING_OPTIONS.find(
          (item) => item.key === key,
        )?.value;
      },
    });
  }

  function renderGenerationPopoverContent() {
    return renderSelectableOptionsContent({
      activeKey: generationType.value,
      items: GENERATION_TYPE_OPTIONS.map((item) => ({
        desc: item.desc,
        key: item.value,
        label: item.label,
      })),
      onSelect: (key) => {
        generationType.value = key;
      },
    });
  }

  function renderWebSearchPopoverContent() {
    return renderSelectableOptionsContent({
      activeKey: webSearch.value,
      items: WEB_SEARCH_OPTIONS.map((item) => ({
        desc: item.desc,
        key: item.value,
        label: item.label,
      })),
      onSelect: (key) => {
        webSearch.value = key;
      },
    });
  }

  function getMcpDescription(item: AIMcpResult) {
    return item.description || item.command || item.url || `MCP #${item.id}`;
  }

  function renderMcpPopoverContent() {
    const content =
      mcps.value.length === 0
        ? h(aEmpty, {
            description: '暂无可用 MCP',
            image: null,
          })
        : renderOptionList(
            mcps.value.map((item) => ({
              desc: getMcpDescription(item),
              key: String(item.id),
              label: item.name,
              onClick: () => {
                toggleMcpSelection(item.id);
              },
              selected: isMcpSelected(item.id),
            })),
            'min(320px, 60vh)',
          );

    return renderPopoverContent(content, 320);
  }

  function renderQuickPhrasePopoverContent() {
    let quickPhraseContent;
    if (quickPhraseLoading.value) {
      quickPhraseContent = h(aSpin, { size: 'small' });
    } else if (quickPhrases.value.length === 0) {
      quickPhraseContent = h(aEmpty, {
        description: '暂无快捷短语',
        image: null,
      });
    } else {
      quickPhraseContent = renderOptionList(
        quickPhrases.value.map((item) => ({
          icon: 'mdi:lightning-bolt-outline',
          key: String(item.id),
          label: item.title,
          title: `${item.title} ${item.content}`.trim(),
          onClick: () => {
            handleQuickPhraseSelect(item);
          },
        })),
        'min(320px, 60vh)',
      );
    }

    return renderPopoverContent(quickPhraseContent, 320);
  }

  const renderSenderFooter: NonNullable<SenderProps['footer']> = (_, info) => {
    const { LoadingButton, SendButton } = info.components;
    const thinkingButtonTitle = `思考：${thinkingButtonLabel.value}`;

    return h(
      aFlex,
      {
        align: 'center',
        gap: 'small',
        justify: 'space-between',
        vertical: false,
        wrap: 'wrap',
      },
      {
        default: () => [
          h(
            aFlex,
            {
              align: 'center',
              gap: 'middle',
              wrap: 'wrap',
            },
            {
              default: () => [
                renderFooterIconButton({
                  disabled: sending.value || !canCreateNewConversation.value,
                  icon: 'mdi:message-plus-outline',
                  onClick: createNewConversation,
                  title: '新建话题',
                }),
                h(
                  aPopover,
                  { placement: 'topLeft', title: '生成类型', trigger: 'click' },
                  {
                    content: () => renderGenerationPopoverContent(),
                    default: () =>
                      renderFooterIconButton({
                        disabled: sending.value,
                        icon:
                          generationType.value === 'image'
                            ? 'mdi:image'
                            : 'mdi:image-outline',
                        title: `生成类型：${generationTypeButtonLabel.value}`,
                      }),
                  },
                ),
                h(
                  aPopover,
                  { placement: 'topLeft', title: '思考链', trigger: 'click' },
                  {
                    content: () => renderThinkingPopoverContent(),
                    default: () =>
                      renderFooterIconButton({
                        disabled: sending.value,
                        icon: 'mdi:head-lightbulb-outline',
                        title: thinkingButtonTitle,
                      }),
                  },
                ),
                h(
                  aPopover,
                  { placement: 'topLeft', title: '联网搜索', trigger: 'click' },
                  {
                    content: () => renderWebSearchPopoverContent(),
                    default: () =>
                      renderFooterIconButton({
                        disabled: sending.value,
                        icon: 'mdi:web',
                        title: `联网搜索：${webSearchButtonLabel.value}`,
                      }),
                  },
                ),
                h(
                  aPopover,
                  {
                    align: { overflow: { adjustX: false, adjustY: true } },
                    placement: 'topLeft',
                    title: '选择 MCP',
                    trigger: 'click',
                  },
                  {
                    content: () => renderMcpPopoverContent(),
                    default: () =>
                      renderFooterIconButton({
                        disabled: sending.value,
                        icon: 'simple-icons:modelcontextprotocol',
                        title:
                          selectedMcpIds.value.length > 0
                            ? `已选择 ${selectedMcpIds.value.length} 个 MCP`
                            : '选择 MCP',
                      }),
                  },
                ),
                h(
                  aPopover,
                  {
                    align: { overflow: { adjustX: false, adjustY: true } },
                    onOpenChange: handleQuickPhrasePopoverOpenChange,
                    open: quickPhrasePopoverOpen.value,
                    placement: 'topLeft',
                    title: '快捷短语',
                    trigger: 'click',
                  },
                  {
                    content: () => renderQuickPhrasePopoverContent(),
                    default: () =>
                      renderFooterIconButton({
                        disabled: sending.value,
                        icon: 'mdi:lightning-bolt-outline',
                        title: '快捷短语',
                      }),
                  },
                ),
                renderFooterIconButton({
                  disabled: sending.value,
                  icon: 'mdi:cog-outline',
                  onClick: () => {
                    onOpenSettings();
                  },
                  title: hasAdvancedSettings.value
                    ? '参数设置（已调整）'
                    : '参数设置',
                }),
                renderFooterIconButton({
                  disabled: !canClearMessages.value,
                  icon: 'mdi:eraser-variant',
                  onClick: () => {
                    confirmClearMessages();
                  },
                  title: '清空消息',
                }),
                renderFooterIconButton({
                  disabled: sending.value || !activeConversationId.value,
                  icon: 'mdi:broom',
                  onClick: () => {
                    confirmClearConversationContext();
                  },
                  title: '清除上下文',
                }),
              ],
            },
          ),
          h(
            aFlex,
            {
              align: 'center',
              class: 'w-full md:w-auto',
              gap: 'small',
              justify: 'flex-end',
              wrap: 'wrap',
            },
            {
              default: () => [
                composerHint.value
                  ? h(
                      'span',
                      {
                        class:
                          'inline-flex max-w-full whitespace-pre-wrap text-left text-xs leading-5 text-muted-foreground',
                      },
                      composerHint.value,
                    )
                  : null,
                sending.value
                  ? h(LoadingButton, {
                      type: 'default',
                    })
                  : h(SendButton, {
                      disabled:
                        !selectedProviderId.value ||
                        !selectedModelId.value ||
                        !prompt.value.trim(),
                      icon: h(IconifyIcon, {
                        class: 'size-4',
                        icon: 'mdi:send',
                      }),
                      shape: 'default',
                      type: 'text',
                    }),
              ],
            },
          ),
        ],
      },
    );
  };

  return {
    fetchQuickPhrases,
    handleQuickPhrasePopoverOpenChange,
    quickPhrasePopoverOpen,
    quickPhrases,
    renderSenderFooter,
  };
}
