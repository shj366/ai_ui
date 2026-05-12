import type {
  AIChatProviderMessage,
} from '../../runtime/message';

import type { AGUIStreamEvent } from '#/plugins/ai/types/ag-ui';
import type {
  AIChatMessage,
  AIChatMessageBlock,
} from '#/plugins/ai/types/message';

import { getRecordValue, resolveTimestamp } from './utils';

type AGUIStreamMessageState = {
  conversationId?: null | string;
  createdTime: string;
  role: AIChatMessage['role'];
};

type AGUIThinkingState = {
  conversationId?: null | string;
  createdTime: string;
  messageId?: string;
};

type AGUIToolCallState = {
  conversationId?: null | string;
  createdTime: string;
  parentMessageId?: string;
  toolCallId: string;
  toolCallName?: string;
};

export type AGUIStreamAccumulator = {
  buffer: string;
  currentMessageId?: null | string;
  currentReasoningMessageId?: null | string;
  currentRunId?: null | string;
  currentThreadId?: null | string;
  currentToolCallId?: null | string;
  messages: Map<string, AGUIStreamMessageState>;
  stateSnapshot?: unknown;
  thinking?: AGUIThinkingState;
  toolCalls: Map<string, AGUIToolCallState>;
};

export function mapAGUIRole(role?: unknown): AIChatMessage['role'] {
  return role === 'user' ? 'user' : 'assistant';
}

const resolveStringField = (key: string) => (event: AGUIStreamEvent) => {
  const value = getRecordValue(event, key);
  return typeof value === 'string' ? value : undefined;
};

export const resolveThreadId = resolveStringField('threadId');
export const resolveRunId = resolveStringField('runId');
export const resolveMessageId = resolveStringField('messageId');
export const resolveToolCallId = resolveStringField('toolCallId');
export const resolveToolCallName = resolveStringField('toolCallName');
export const resolveParentMessageId = resolveStringField('parentMessageId');
export const resolveActivityType = resolveStringField('activityType');
export const resolveStepName = resolveStringField('stepName');
export const resolveReasoningEntityId = resolveStringField('entityId');

export function resolveConversationId(
  event: AGUIStreamEvent,
  accumulator?: AGUIStreamAccumulator,
) {
  return resolveThreadId(event) ?? accumulator?.currentThreadId;
}

export function getDeltaFromEvent(event: AGUIStreamEvent) {
  return typeof event.delta === 'string' ? event.delta : '';
}

export function createOrGetMessageState(
  messageId: string,
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
  role?: AIChatMessage['role'],
) {
  const previousState = accumulator.messages.get(messageId);
  const state =
    previousState ??
    ({
      conversationId: resolveConversationId(event, accumulator) ?? null,
      createdTime: resolveTimestamp(event.timestamp),
      role: role ?? 'assistant',
    } satisfies AGUIStreamMessageState);

  if (!previousState) {
    accumulator.messages.set(messageId, state);
  }

  return state;
}

export function createOrGetThinkingState(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
  messageId?: string,
) {
  const nextMessageId = messageId ?? resolveMessageId(event);
  const state =
    accumulator.thinking &&
    (!nextMessageId || accumulator.thinking.messageId === nextMessageId)
      ? accumulator.thinking
      : ({
          conversationId: resolveConversationId(event, accumulator) ?? null,
          createdTime: resolveTimestamp(event.timestamp),
          messageId: nextMessageId,
        } satisfies AGUIThinkingState);

  accumulator.thinking = state;

  return state;
}

export function createOrGetToolCallState(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
  toolCallId?: string,
) {
  const nextToolCallId = toolCallId ?? resolveToolCallId(event);

  if (!nextToolCallId) {
    return undefined;
  }

  const previousState = accumulator.toolCalls.get(nextToolCallId);
  const state =
    previousState ??
    ({
      conversationId: resolveConversationId(event, accumulator) ?? null,
      createdTime: resolveTimestamp(event.timestamp),
      parentMessageId: resolveParentMessageId(event),
      toolCallId: nextToolCallId,
      toolCallName: resolveToolCallName(event),
    } satisfies AGUIToolCallState);

  accumulator.toolCalls.set(nextToolCallId, {
    ...state,
    conversationId: state.conversationId ?? resolveConversationId(event, accumulator) ?? null,
    parentMessageId: state.parentMessageId ?? resolveParentMessageId(event),
    toolCallName: state.toolCallName ?? resolveToolCallName(event),
  });

  return accumulator.toolCalls.get(nextToolCallId);
}

export function clearThinkingState(
  accumulator: AGUIStreamAccumulator,
  messageId?: string,
) {
  if (
    messageId &&
    accumulator.thinking?.messageId &&
    accumulator.thinking.messageId !== messageId
  ) {
    return;
  }

  accumulator.thinking = undefined;
}

export function createStreamMessage(
  role: AIChatMessage['role'],
  createdTime: string,
  blocks: AIChatMessageBlock[],
  conversationId?: null | string,
  overrides?: Partial<AIChatProviderMessage>,
): AIChatProviderMessage {
  return {
    blocks,
    conversation_id: conversationId ?? null,
    created_time: createdTime,
    message_type: 'normal',
    model_id: null,
    provider_id: null,
    role,
    ...overrides,
  };
}

export function createAGUIStreamAccumulator(): AGUIStreamAccumulator {
  return {
    buffer: '',
    currentMessageId: null,
    currentReasoningMessageId: null,
    currentRunId: null,
    currentThreadId: null,
    currentToolCallId: null,
    messages: new Map(),
    stateSnapshot: undefined,
    thinking: undefined,
    toolCalls: new Map(),
  };
}

export function clearAGUIStreamAccumulator(accumulator: AGUIStreamAccumulator) {
  accumulator.buffer = '';
  accumulator.currentMessageId = null;
  accumulator.currentReasoningMessageId = null;
  accumulator.currentRunId = null;
  accumulator.currentToolCallId = null;
  accumulator.messages.clear();
  accumulator.stateSnapshot = undefined;
  accumulator.thinking = undefined;
  accumulator.toolCalls.clear();
}
