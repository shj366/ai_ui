import type {
  ActivityDeltaEvent,
  ActivitySnapshotEvent,
  InputContentSource,
  ReasoningEncryptedValueEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StateDeltaEvent,
  StateSnapshotEvent,
  StepFinishedEvent,
  StepStartedEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from '@ag-ui/core';

import type { AGUIStreamEvent } from '../../types/ag-ui';
import type { AIChatMessageBlock } from '../../types/message';
import type { AIChatProviderMessage } from '../message';
import type { AGUIStreamAccumulator } from './runtime-state';

import {
  createAGUIBinaryFileBlock,
  createAGUIEventBlock,
  createAGUIInputSourceFileBlock,
  normalizeAGUIToolResultBlocks,
} from './block-mappers';
import {
  clearAGUIStreamAccumulator,
  clearThinkingState,
  createOrGetMessageState,
  createOrGetThinkingState,
  createOrGetToolCallState,
  createStreamMessage,
  getDeltaFromEvent,
  mapAGUIRole,
  resolveActivityType,
  resolveConversationId,
  resolveMessageId,
  resolveParentMessageId,
  resolveReasoningEntityId,
  resolveRunId,
  resolveStepName,
  resolveThreadId,
  resolveToolCallId,
  resolveToolCallName,
} from './runtime-state';
import {
  getEventText,
  resolveMetadataFilename,
  resolveTimestamp,
} from './utils';

type AGUIEventHandler = (
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) => AIChatProviderMessage | null;

function resolveCurrentMessageId(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  return resolveMessageId(event) ?? accumulator.currentMessageId ?? undefined;
}

function resolveCurrentReasoningMessageId(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  return (
    resolveMessageId(event) ??
    accumulator.currentReasoningMessageId ??
    accumulator.thinking?.messageId
  );
}

function resolveCurrentToolCallId(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  return resolveToolCallId(event) ?? accumulator.currentToolCallId ?? undefined;
}

function handleActivityDelta(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ActivityDeltaEvent;
  const activityType = resolveActivityType(current) ?? 'activity';
  const messageId = resolveMessageId(current) ?? 'activity';
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: {
          activityType,
          messageId,
          patch: current.patch,
          snapshot: undefined,
        },
        eventKey: `activity:${messageId}`,
        eventType: current.type,
        status: 'running',
        summary: `${activityType} · ${current.patch.length} 条补丁`,
        title: '活动增量',
      }),
    ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleActivitySnapshot(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ActivitySnapshotEvent;
  const activityType = resolveActivityType(current) ?? 'activity';
  const messageId = resolveMessageId(current) ?? 'activity';
  const blocks: AIChatMessageBlock[] = [];
  const files =
    current.content &&
    typeof current.content === 'object' &&
    'file' in current.content
      ? [current.content.file]
      : [];

  for (const file of files) {
    if (
      !file ||
      typeof file !== 'object' ||
      !('type' in file) ||
      typeof file.type !== 'string'
    ) {
      continue;
    }

    switch (file.type) {
      case 'audio':
      case 'document':
      case 'image':
      case 'video': {
        const source =
          'source' in file && file.source && typeof file.source === 'object'
            ? (file.source as InputContentSource)
            : null;

        blocks.push(
          createAGUIInputSourceFileBlock(
            file.type,
            source,
            'metadata' in file ? resolveMetadataFilename(file.metadata) : null,
          ),
        );
        break;
      }
      case 'binary': {
        const mimeType =
          typeof file.mimeType === 'string' ? file.mimeType : null;
        blocks.push(
          createAGUIBinaryFileBlock({
            data:
              'data' in file && typeof file.data === 'string'
                ? file.data
                : null,
            mimeType,
            name:
              'filename' in file && typeof file.filename === 'string'
                ? file.filename
                : null,
            url:
              'url' in file && typeof file.url === 'string' ? file.url : null,
          }),
        );
        break;
      }
    }
  }

  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    blocks.length > 0
      ? blocks
      : [
          createAGUIEventBlock({
            data: current.content,
            eventKey: `activity:${messageId}`,
            eventType: current.type,
            status: 'success',
            summary: activityType,
            title: '活动快照',
          }),
        ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleMessagesSnapshot(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: { messages: ('messages' in event ? event.messages : []) ?? [] },
        eventKey: 'messages-snapshot',
        eventType: event.type,
        status: 'success',
        summary: `${'messages' in event && Array.isArray(event.messages) ? event.messages.length : 0} 条消息`,
        title: '消息快照',
      }),
    ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleReasoningEncryptedValue(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ReasoningEncryptedValueEvent;
  const entityId = resolveReasoningEntityId(current);
  const state = createOrGetThinkingState(event, accumulator, entityId);
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `reasoning-encrypted:${entityId ?? 'unknown'}`,
        eventType: current.type,
        status: 'success',
        summary: current.subtype,
        title: '加密推理值',
      }),
    ],
    state.conversationId,
  );
}

function handleReasoningEnd(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const state = createOrGetThinkingState(event, accumulator);
  accumulator.currentReasoningMessageId = null;
  clearThinkingState(accumulator, resolveMessageId(event));
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: event,
        eventKey: `reasoning:${state.messageId ?? 'global'}`,
        eventType: event.type,
        status: 'success',
        summary: '推理结束',
        title: '推理结束',
      }),
    ],
    state.conversationId,
  );
}

function handleReasoningContent(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const messageId = resolveCurrentReasoningMessageId(event, accumulator);
  if (!messageId) {
    return null;
  }

  if (event.type === 'REASONING_MESSAGE_CHUNK' && !getDeltaFromEvent(event)) {
    accumulator.currentReasoningMessageId = null;
    clearThinkingState(accumulator, messageId);
    return null;
  }

  accumulator.currentReasoningMessageId = messageId;
  const state = createOrGetMessageState(
    messageId,
    event,
    accumulator,
    'assistant',
  );
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [{ text: getDeltaFromEvent(event), type: 'reasoning' }],
    state.conversationId,
  );
}

function handleReasoningMessageEnd(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const messageId = resolveMessageId(event);
  if (!messageId) {
    return null;
  }

  const state = createOrGetMessageState(
    messageId,
    event,
    accumulator,
    'assistant',
  );
  accumulator.currentReasoningMessageId = null;
  clearThinkingState(accumulator, messageId);
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: { messageId },
        eventKey: `reasoning-message:${messageId}`,
        eventType: event.type,
        status: 'success',
        summary: messageId,
        title: '推理结束',
      }),
    ],
    state.conversationId,
  );
}

function handleReasoningMessageStart(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const messageId = resolveMessageId(event);
  if (!messageId) {
    return null;
  }

  const state = createOrGetMessageState(
    messageId,
    event,
    accumulator,
    'assistant',
  );
  accumulator.currentReasoningMessageId = messageId;
  createOrGetThinkingState(event, accumulator, messageId);
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: { messageId },
        eventKey: `reasoning-message:${messageId}`,
        eventType: event.type,
        status: 'running',
        summary: messageId,
        title: '推理开始',
      }),
    ],
    state.conversationId,
  );
}

function handleReasoningStart(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const state = createOrGetThinkingState(event, accumulator);
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: event,
        eventKey: `reasoning:${state.messageId ?? 'global'}`,
        eventType: event.type,
        status: 'running',
        summary:
          'title' in event && typeof event.title === 'string'
            ? event.title
            : '推理中',
        title: '推理开始',
      }),
    ],
    state.conversationId,
  );
}

function handleRunError(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      {
        text: 'message' in event ? getEventText(event.message) : '',
        type: 'text',
      },
    ],
    resolveConversationId(event, accumulator) ?? null,
    { message_type: 'error' },
  );
}

function handleRunFinished(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as RunFinishedEvent;
  const runId = resolveRunId(current);
  const threadId = resolveThreadId(current);

  accumulator.currentRunId = runId ?? null;
  accumulator.currentThreadId = threadId ?? null;
  clearAGUIStreamAccumulator(accumulator);
  accumulator.currentThreadId = threadId ?? null;
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `run:${runId ?? 'unknown'}`,
        eventType: current.type,
        status: 'success',
        summary: runId ?? 'unknown',
        title: '运行完成',
      }),
    ],
    threadId ?? null,
  );
}

function handleRunStarted(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as RunStartedEvent;
  const runId = resolveRunId(current);
  const threadId = resolveThreadId(current);

  clearAGUIStreamAccumulator(accumulator);
  accumulator.currentRunId = runId ?? null;
  accumulator.currentThreadId = threadId ?? null;
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `run:${runId ?? 'unknown'}`,
        eventType: current.type,
        status: 'running',
        summary: runId ?? 'unknown',
        title: '运行开始',
      }),
    ],
    threadId ?? null,
  );
}

function handleStateDelta(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as StateDeltaEvent;
  accumulator.stateSnapshot = current.delta;
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: 'state',
        eventType: current.type,
        status: 'running',
        summary: '状态增量',
        title: '状态增量',
      }),
    ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleStateSnapshot(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as StateSnapshotEvent;
  accumulator.stateSnapshot = current.snapshot;
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: 'state',
        eventType: current.type,
        status: 'success',
        summary: '状态快照',
        title: '状态快照',
      }),
    ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleStepFinished(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as StepFinishedEvent;
  const stepName = resolveStepName(current) ?? 'step';
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `step:${stepName}`,
        eventType: current.type,
        status: 'success',
        summary: stepName,
        title: '步骤完成',
      }),
    ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleStepStarted(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as StepStartedEvent;
  const stepName = resolveStepName(current) ?? 'step';
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `step:${stepName}`,
        eventType: current.type,
        status: 'running',
        summary: stepName,
        title: '步骤开始',
      }),
    ],
    resolveConversationId(event, accumulator) ?? null,
  );
}

function handleTextContent(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const messageId = resolveCurrentMessageId(event, accumulator);
  if (!messageId) {
    return null;
  }
  const role =
    'role' in event && typeof event.role === 'string'
      ? mapAGUIRole(event.role)
      : undefined;
  const state = createOrGetMessageState(messageId, event, accumulator, role);
  accumulator.currentMessageId = messageId;
  return createStreamMessage(
    state.role,
    resolveTimestamp(event.timestamp, state.createdTime),
    [{ text: getDeltaFromEvent(event), type: 'text' }],
    state.conversationId,
  );
}

function handleTextMessageEnd(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const messageId = resolveMessageId(event);
  if (!messageId) {
    return null;
  }
  const state = createOrGetMessageState(messageId, event, accumulator);
  if (accumulator.currentMessageId === messageId) {
    accumulator.currentMessageId = null;
  }
  return createStreamMessage(
    state.role,
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: { messageId, role: state.role },
        eventKey: `text-message:${messageId}`,
        eventType: event.type,
        status: 'success',
        summary: messageId,
        title: '文本结束',
      }),
    ],
    state.conversationId,
  );
}

function handleTextMessageStart(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const messageId = resolveMessageId(event);
  if (!messageId) {
    return null;
  }
  const role =
    'role' in event && typeof event.role === 'string' ? event.role : undefined;
  const state = {
    conversationId: resolveConversationId(event, accumulator) ?? null,
    createdTime: resolveTimestamp(event.timestamp),
    role: mapAGUIRole(role),
  };
  accumulator.messages.set(messageId, state);
  accumulator.currentMessageId = messageId;
  return createStreamMessage(
    state.role,
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: { messageId, role: state.role },
        eventKey: `text-message:${messageId}`,
        eventType: event.type,
        status: 'running',
        summary: messageId,
        title: '文本开始',
      }),
    ],
    state.conversationId,
  );
}

function handleToolCallArgs(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ToolCallArgsEvent;
  const state = createOrGetToolCallState(
    event,
    accumulator,
    resolveCurrentToolCallId(current, accumulator),
  );
  if (!state) {
    return null;
  }
  accumulator.currentToolCallId = state.toolCallId;
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `tool-call:${state.toolCallId}`,
        eventType: current.type,
        status: 'running',
        summary: state.toolCallName ?? state.toolCallId,
        text: getDeltaFromEvent(current),
        title: '工具参数',
      }),
    ],
    state.conversationId,
  );
}

function handleToolCallEnd(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ToolCallEndEvent;
  const state = createOrGetToolCallState(
    event,
    accumulator,
    resolveToolCallId(current),
  );
  if (!state) {
    return null;
  }
  if (accumulator.currentToolCallId === state.toolCallId) {
    accumulator.currentToolCallId = null;
  }
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: current,
        eventKey: `tool-call:${state.toolCallId}`,
        eventType: current.type,
        status: 'success',
        summary: state.toolCallName ?? state.toolCallId,
        title: '工具调用结束',
      }),
    ],
    state.conversationId,
  );
}

function handleToolCallResult(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ToolCallResultEvent;
  const state = createOrGetToolCallState(
    event,
    accumulator,
    resolveToolCallId(current),
  );
  if (!state) {
    return null;
  }
  const blocks: AIChatMessageBlock[] = [];
  const content = current.content.trim();
  const toolResultBlocks = normalizeAGUIToolResultBlocks(content);
  blocks.push(...toolResultBlocks);
  blocks.unshift(
    createAGUIEventBlock({
      data: content
        ? {
            ...current,
            content: undefined,
            contentOmitted: true,
            contentPreview: content.slice(0, 2000),
            extractedFileCount: toolResultBlocks.length,
          }
        : current,
      eventKey: `tool-call:${state.toolCallId}`,
      eventType: current.type,
      status: 'success',
      summary: state.toolCallName ?? state.toolCallId,
      title: '工具结果',
    }),
  );
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp),
    blocks,
    state.conversationId,
  );
}

function handleToolCallStart(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
) {
  const current = event as ToolCallStartEvent;
  const toolCallId = resolveToolCallId(current);
  const toolCallName = resolveToolCallName(current);
  const parentMessageId = resolveParentMessageId(current);
  const state = createOrGetToolCallState(event, accumulator, toolCallId);
  if (!state) {
    return null;
  }
  accumulator.currentToolCallId = state.toolCallId;
  return createStreamMessage(
    'assistant',
    resolveTimestamp(event.timestamp, state.createdTime),
    [
      createAGUIEventBlock({
        data: { parentMessageId, toolCallId, toolCallName },
        eventKey: `tool-call:${toolCallId ?? 'unknown'}`,
        eventType: current.type,
        status: 'running',
        summary: toolCallName ?? state.toolCallId,
        title: '工具调用开始',
      }),
    ],
    state.conversationId,
  );
}

const AGUI_EVENT_HANDLERS: Record<string, AGUIEventHandler> = {
  ACTIVITY_DELTA: handleActivityDelta,
  ACTIVITY_SNAPSHOT: handleActivitySnapshot,
  MESSAGES_SNAPSHOT: handleMessagesSnapshot,
  REASONING_ENCRYPTED_VALUE: handleReasoningEncryptedValue,
  REASONING_END: handleReasoningEnd,
  REASONING_MESSAGE_CHUNK: handleReasoningContent,
  REASONING_MESSAGE_CONTENT: handleReasoningContent,
  REASONING_MESSAGE_END: handleReasoningMessageEnd,
  REASONING_MESSAGE_START: handleReasoningMessageStart,
  REASONING_START: handleReasoningStart,
  RUN_ERROR: handleRunError,
  RUN_FINISHED: handleRunFinished,
  RUN_STARTED: handleRunStarted,
  STATE_DELTA: handleStateDelta,
  STATE_SNAPSHOT: handleStateSnapshot,
  STEP_FINISHED: handleStepFinished,
  STEP_STARTED: handleStepStarted,
  TEXT_MESSAGE_CHUNK: handleTextContent,
  TEXT_MESSAGE_CONTENT: handleTextContent,
  TEXT_MESSAGE_END: handleTextMessageEnd,
  TEXT_MESSAGE_START: handleTextMessageStart,
  THINKING_END: handleReasoningEnd,
  THINKING_START: handleReasoningStart,
  THINKING_TEXT_MESSAGE_CONTENT: handleReasoningContent,
  THINKING_TEXT_MESSAGE_END: handleReasoningMessageEnd,
  THINKING_TEXT_MESSAGE_START: handleReasoningMessageStart,
  TOOL_CALL_ARGS: handleToolCallArgs,
  TOOL_CALL_CHUNK: handleToolCallArgs,
  TOOL_CALL_END: handleToolCallEnd,
  TOOL_CALL_RESULT: handleToolCallResult,
  TOOL_CALL_START: handleToolCallStart,
};

export function toAIChatMessageFromAGUIEvent(
  event: AGUIStreamEvent,
  accumulator: AGUIStreamAccumulator,
): AIChatProviderMessage | null {
  const handler = AGUI_EVENT_HANDLERS[event.type];
  return handler ? handler(event, accumulator) : null;
}
