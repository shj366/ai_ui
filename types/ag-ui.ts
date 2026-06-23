import type {
  ActivityMessage,
  AGUIEvent,
  AssistantMessage,
  DeveloperMessage,
  Message,
  MessagesSnapshotEvent,
  ReasoningMessage,
  SystemMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from '@ag-ui/core';

import type { AIMessageType } from './message';

interface AGUIMessageMetadata {
  content?: unknown;
  conversationId?: null | string;
  createdTime?: null | string;
  encryptedValue?: null | string;
  messageIndex?: null | number;
  messageType?: AIMessageType | null;
  modelId?: null | string;
  persistedMessageId?: null | number;
  providerId?: null | number;
}

export type AGUIToolCall = ToolCall;

export type AGUIUserMessage = AGUIMessageMetadata & UserMessage;

export type AGUIAssistantMessage = AGUIMessageMetadata & AssistantMessage;

export type AGUIReasoningMessage = AGUIMessageMetadata & ReasoningMessage;

export type AGUIToolMessage = AGUIMessageMetadata & ToolMessage;

export type AGUISystemMessage = AGUIMessageMetadata & SystemMessage;
export type AGUIDeveloperMessage = AGUIMessageMetadata & DeveloperMessage;

export type AGUIActivityMessage = ActivityMessage & AGUIMessageMetadata;

export type AGUIConversationMessage = AGUIMessageMetadata & Message;

export type AGUIMessagesSnapshotEvent = Omit<
  MessagesSnapshotEvent,
  'messages' | 'rawEvent'
> & {
  messages: AGUIConversationMessage[];
  rawEvent?: null | string;
};

export type AGUIStreamEvent = AGUIEvent;
