import type { PromptInputProps } from '../components';

import type { Ref, VNodeChild } from 'vue';

import type {
  AIChatComposerParams,
  AIMcpResult,
  AIQuickPhraseResult,
} from '../../../api';

import { h, ref, resolveComponent } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { getAllAIMcpApi, getAllAIQuickPhraseApi } from '../../../api';
import { PromptInputButton } from '#/plugins/ai/components/ai-elements';

interface PromptToolbarOption {
  desc?: string;
  icon?: string;
  key: string;
  label: string;
  title?: string;
}

type PromptInputFooterRender = Extract<
  NonNullable<PromptInputProps['footer']>,
  (...args: any[]) => any
>;

type PromptInputFooterComponents =
  Parameters<PromptInputFooterRender>[1]['components'] & {
    AttachmentButton?: () => VNodeChild;
    ExpandButton?: () => VNodeChild;
    ModelSelector?: () => VNodeChild;
  };

export interface UsePromptToolbarOptions {
  canClearMessages: Ref<boolean>;
  canCreateNewConversation: Ref<boolean>;
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
  onOpenSettings: () => void;
  onSelectQuickPhrase: (item: AIQuickPhraseResult) => void;
  selectedMcpIds: Ref<number[]>;
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

export function usePromptToolbar(options: UsePromptToolbarOptions) {
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
    confirmClearMessages,
    createNewConversation,
    generationType,
    generationTypeButtonLabel,
    GENERATION_TYPE_OPTIONS,
    hasAdvancedSettings,
    onOpenSettings,
    onSelectQuickPhrase,
    selectedMcpIds,
    sending,
    thinking,
    thinkingButtonLabel,
    THINKING_OPTIONS,
    webSearch,
    webSearchButtonLabel,
    WEB_SEARCH_OPTIONS,
  } = options;

  const mcps = ref<AIMcpResult[]>([]);
  const mcpLoading = ref(false);
  const quickPhrasePopoverOpen = ref(false);
  const quickPhrases = ref<AIQuickPhraseResult[]>([]);
  const quickPhraseLoading = ref(false);

  async function fetchMcps() {
    mcpLoading.value = true;
    try {
      mcps.value = await getAllAIMcpApi();
    } finally {
      mcpLoading.value = false;
    }
  }

  async function fetchQuickPhrases() {
    quickPhraseLoading.value = true;
    try {
      quickPhrases.value = await getAllAIQuickPhraseApi();
    } finally {
      quickPhraseLoading.value = false;
    }
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
    active?: boolean;
    class?: string;
    disabled?: boolean;
    icon: string;
    label?: string;
    onClick?: () => void;
    title: string;
  }) {
    return h(
      PromptInputButton,
      {
        class: [
          'ai-prompt-tool-button !h-8 !w-8 !rounded-lg !px-0 !text-muted-foreground',
          '!bg-transparent !shadow-none hover:!bg-muted hover:!text-foreground',
          opts.active
            ? '!bg-primary/10 !text-primary hover:!bg-primary/15 hover:!text-primary'
            : undefined,
          opts.class,
        ],
        'aria-label': opts.title,
        disabled: opts.disabled,
        title: opts.title,
        type: 'button',
        onClick: () => {
          opts.onClick?.();
        },
      },
      () => h(IconifyIcon, { class: 'size-4 shrink-0', icon: opts.icon }),
    );
  }

  function renderAdvancedMenuItem(opts: {
    disabled?: boolean;
    icon: string;
    label: string;
    onClick?: () => void;
    suffix?: string;
    title?: string;
  }) {
    return h(
      aButton,
      {
        block: true,
        class:
          '!flex !h-10 !items-center !justify-start !gap-2 !rounded-xl !border-0 !bg-transparent !px-3 !text-left hover:!bg-accent',
        disabled: opts.disabled,
        htmlType: 'button',
        onClick: opts.onClick,
        title: opts.title ?? opts.label,
        type: 'text',
      },
      {
        default: () => [
          h(IconifyIcon, {
            class: 'size-4 shrink-0 text-muted-foreground',
            icon: opts.icon,
          }),
          h('span', { class: 'min-w-0 flex-1 truncate text-sm' }, opts.label),
          opts.suffix
            ? h(
                'span',
                { class: 'max-w-[96px] truncate text-xs text-muted-foreground' },
                opts.suffix,
              )
            : null,
        ],
      },
    );
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
    params: PromptToolbarOption & {
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
      PromptToolbarOption & {
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
    items: PromptToolbarOption[];
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

  function handleQuickPhraseSelect(item: AIQuickPhraseResult) {
    onSelectQuickPhrase(item);
    quickPhrasePopoverOpen.value = false;
  }

  function handleQuickPhrasePopoverOpenChange(open: boolean) {
    quickPhrasePopoverOpen.value = open;
  }

  function renderMcpPopoverContent() {
    let content;
    if (mcpLoading.value) {
      content = h(aSpin, { size: 'small' });
    } else if (mcps.value.length === 0) {
      content = h(aEmpty, {
        description: '暂无可用 MCP',
        image: null,
      });
    } else {
      content = renderOptionList(
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
    }

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

  function renderAdvancedPanelContent(ExpandButton?: () => VNodeChild) {
    return h(
      'div',
      { class: 'flex w-[280px] flex-col gap-1 rounded-2xl p-1' },
      [
        renderAdvancedMenuItem({
          disabled: sending.value || !canCreateNewConversation.value,
          icon: 'mdi:message-plus-outline',
          label: '新建对话',
          onClick: createNewConversation,
        }),
        h(
          aPopover,
          { placement: 'leftTop', title: '生成类型', trigger: 'click' },
          {
            content: () => renderGenerationPopoverContent(),
            default: () =>
              renderAdvancedMenuItem({
                disabled: sending.value,
                icon:
                  generationType.value === 'image'
                    ? 'mdi:image'
                    : 'mdi:image-outline',
                label: '生成类型',
                suffix: generationTypeButtonLabel.value,
              }),
          },
        ),
        h(
          aPopover,
          { placement: 'leftTop', title: '思考强度', trigger: 'click' },
          {
            content: () => renderThinkingPopoverContent(),
            default: () =>
              renderAdvancedMenuItem({
                disabled: sending.value,
                icon: 'mdi:head-lightbulb-outline',
                label: '思考强度',
                suffix: thinkingButtonLabel.value,
              }),
          },
        ),
        h(
          aPopover,
          {
            align: { overflow: { adjustX: false, adjustY: true } },
            placement: 'leftTop',
            title: '选择 MCP',
            trigger: 'click',
          },
          {
            content: () => renderMcpPopoverContent(),
            default: () =>
              renderAdvancedMenuItem({
                disabled: sending.value,
                icon: 'simple-icons:modelcontextprotocol',
                label: 'MCP',
                suffix:
                  selectedMcpIds.value.length > 0
                    ? `${selectedMcpIds.value.length} 个`
                    : '未选择',
              }),
          },
        ),
        h(
          aPopover,
          {
            align: { overflow: { adjustX: false, adjustY: true } },
            onOpenChange: handleQuickPhrasePopoverOpenChange,
            open: quickPhrasePopoverOpen.value,
            placement: 'leftTop',
            title: '快捷短语',
            trigger: 'click',
          },
          {
            content: () => renderQuickPhrasePopoverContent(),
            default: () =>
              renderAdvancedMenuItem({
                disabled: sending.value,
                icon: 'mdi:lightning-bolt-outline',
                label: '快捷短语',
              }),
          },
        ),
        renderAdvancedMenuItem({
          disabled: sending.value,
          icon: 'mdi:cog-outline',
          label: hasAdvancedSettings.value ? '参数设置（已调整）' : '参数设置',
          onClick: () => {
            onOpenSettings();
          },
        }),
        ExpandButton
          ? h(
              'div',
              { class: 'flex items-center rounded-xl px-3 py-1.5' },
              [
                h(IconifyIcon, {
                  class: 'mr-2 size-4 shrink-0 text-muted-foreground',
                  icon: 'mdi:arrow-expand-vertical',
                }),
                h('span', { class: 'min-w-0 flex-1 truncate text-sm' }, '展开输入框'),
                h(ExpandButton),
              ],
            )
          : null,
        h('div', { class: 'my-1 h-px bg-border/70' }),
        renderAdvancedMenuItem({
          disabled: !canClearMessages.value,
          icon: 'mdi:eraser-variant',
          label: '清空消息',
          onClick: () => {
            confirmClearMessages();
          },
        }),
      ],
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
          {
            class:
              'flex min-w-0 flex-1 flex-wrap items-center gap-1',
          },
          [
            renderFooterIconButton({
              disabled: sending.value || !canCreateNewConversation.value,
              icon: 'mdi:message-plus-outline',
              label: '新对话',
              onClick: createNewConversation,
              title: '新建对话',
            }),
            AttachmentButton ? h(AttachmentButton) : null,
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
                    label: generationTypeButtonLabel.value,
                    title: `生成类型：${generationTypeButtonLabel.value}`,
                  }),
              },
            ),
            h(
              aPopover,
              { placement: 'topLeft', title: '思考强度', trigger: 'click' },
              {
                content: () => renderThinkingPopoverContent(),
                default: () =>
                  renderFooterIconButton({
                    disabled: sending.value,
                    icon: 'mdi:head-lightbulb-outline',
                    label: thinkingButtonLabel.value,
                    title: `思考强度：${thinkingButtonLabel.value}`,
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
                    active: webSearch.value !== 'off',
                    disabled: sending.value,
                    icon: 'mdi:web',
                    label: webSearchButtonLabel.value,
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
                    active: selectedMcpIds.value.length > 0,
                    disabled: sending.value,
                    icon: 'simple-icons:modelcontextprotocol',
                    label:
                      selectedMcpIds.value.length > 0
                        ? `MCP ${selectedMcpIds.value.length}`
                        : 'MCP',
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
                    label: '短语',
                    title: '快捷短语',
                  }),
              },
            ),
            renderFooterIconButton({
              active: hasAdvancedSettings.value,
              disabled: sending.value,
              icon: 'mdi:cog-outline',
              label: hasAdvancedSettings.value ? '参数*' : '参数',
              onClick: () => {
                onOpenSettings();
              },
              title: hasAdvancedSettings.value ? '参数设置（已调整）' : '参数设置',
            }),
            ExpandButton ? h(ExpandButton) : null,
            renderFooterIconButton({
              class: 'hidden sm:!inline-flex',
              disabled: !canClearMessages.value,
              icon: 'mdi:eraser-variant',
              onClick: () => {
                confirmClearMessages();
              },
              title: '清空消息',
            }),
            h(
              aPopover,
              {
                overlayClassName: 'ai-prompt-advanced-popover',
                placement: 'topLeft',
                trigger: 'click',
              },
              {
                content: () => renderAdvancedPanelContent(ExpandButton),
                default: () =>
                  renderFooterIconButton({
                    class: 'sm:!hidden',
                    icon: 'mdi:dots-horizontal',
                    title: '更多功能',
                  }),
              },
            ),
          ],
        ),
        h(
          'div',
          {
            class: 'ml-auto flex shrink-0 items-center justify-end pb-0.5',
          },
          [defaultNode],
        ),
      ],
    );
  };

  return {
    fetchMcps,
    fetchQuickPhrases,
    renderPromptInputFooter,
  };
}
