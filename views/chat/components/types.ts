import type { VNodeChild } from 'vue';

export interface AISourceItem {
  description?: string;
  key?: number | string;
  title?: string;
  url?: string;
}

export interface SourcesProps {
  activeKey?: number | string;
  defaultExpanded?: boolean;
  expandIconPosition?: 'end' | 'start';
  inline?: boolean;
  items?: AISourceItem[];
  title?: number | string;
}

export interface FileCardProps {
  audioProps?: Record<string, unknown>;
  byte?: number;
  description?: string;
  icon?: 'audio' | 'image' | 'video';
  imageProps?: Record<string, unknown>;
  key?: number | string;
  loading?: boolean;
  mediaType?: string;
  name?: string;
  onClick?: () => void;
  size?: 'default' | 'small';
  src?: string;
  type?: 'audio' | 'file' | 'image' | 'video';
  url?: string;
  videoProps?: Record<string, unknown>;
}

export interface ActionItem {
  actionRender?: () => VNodeChild;
  danger?: boolean;
  icon?: VNodeChild;
  key: number | string;
  label?: string;
  onItemClick?: () => void;
}

export interface ActionsProps {
  fadeIn?: boolean;
  items?: ActionItem[];
}

export interface ChatMessageCardProps {
  classes?: {
    content?: string;
    root?: string;
  };
}

export interface ChatMessageListItem {
  content?: VNodeChild;
  dividerProps?: {
    plain?: boolean;
  };
  extraInfo?: Record<string, unknown>;
  key: number | string;
  role: 'assistant' | 'divider' | 'user';
  streaming?: boolean;
}

export interface ChatMessageRoleRenderResult extends ChatMessageCardProps {
  editable?:
    | false
    | {
        cancelText?: string;
        editing?: boolean;
        okText?: string;
      };
  footer?: VNodeChild;
  footerPlacement?: 'outer-end' | 'outer-start';
  header?: VNodeChild;
  loading?: boolean;
  onEditCancel?: () => void;
  onEditConfirm?: (value: string) => void;
  onEditResend?: (value: string) => void;
  placement?: 'end' | 'start';
  shape?: string;
  streaming?: boolean;
  variant?: string;
}

export interface ChatMessageListProps {
  classes?: {
    scroll?: string;
  };
  items?: ChatMessageListItem[];
  onScroll?: (event: Event) => void;
  role?: {
    assistant?: (item: ChatMessageListItem) => ChatMessageRoleRenderResult;
    divider?: Record<string, unknown>;
    user?: (item: ChatMessageListItem) => ChatMessageRoleRenderResult;
  };
}

export interface PromptInputFooterInfo {
  components: Record<string, () => VNodeChild>;
}

export interface PromptInputProps {
  disabled?: boolean;
  footer?:
    | false
    | VNodeChild
    | ((defaultNode: VNodeChild, info: PromptInputFooterInfo) => VNodeChild);
  loading?: boolean;
  onCancel?: () => void;
  onChange?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onSubmit?: (message: string, slotConfig?: unknown, skill?: unknown) => unknown;
  placeholder?: string;
  value?: string;
}
