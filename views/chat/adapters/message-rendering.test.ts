import type { ChatMessageItem } from '../../../runtime/message';
import type {
  AIChatEventMessageBlock,
  AIChatMessageBlock,
} from '../../../types/message';

import { describe, expect, it } from 'vitest';

import {
  createMessageEventRenderItems,
  getToolGroupState,
} from './message-event-groups';
import { createMessageProcessFoldPlan } from './message-process-fold';

function eventBlock(
  eventType: string,
  options: Partial<AIChatEventMessageBlock> = {},
): AIChatEventMessageBlock {
  return {
    event_key: options.event_key ?? eventType.toLowerCase(),
    event_type: eventType,
    status: options.status ?? 'success',
    summary: options.summary ?? eventType,
    title: options.title ?? eventType,
    type: 'event',
    ...options,
  };
}

function chatMessage(
  blocks: AIChatMessageBlock[],
  options: Partial<ChatMessageItem> = {},
): ChatMessageItem {
  return {
    blocks,
    conversation_id: 'conversation-1',
    created_time: '2026-06-28T10:00:00Z',
    id: 'assistant-1',
    message_id: 1,
    message_index: 1,
    message_type: 'normal',
    model_id: 'model',
    provider_id: 1,
    role: 'assistant',
    streaming: false,
    ...options,
  };
}

const showVisibleEvent = (
  _message: ChatMessageItem,
  block: AIChatEventMessageBlock,
) => block.event_type !== 'TEXT_MESSAGE_START';

describe('AI chat message rendering helpers', () => {
  it('only groups consecutive events from the same tool call', () => {
    const items = createMessageEventRenderItems([
      eventBlock('TOOL_CALL_START', {
        data: { toolCallId: 'search' },
        event_key: 'tool-call:search',
      }),
      eventBlock('STEP_STARTED', {
        event_key: 'step:read-context',
        summary: 'read-context',
      }),
      eventBlock('TOOL_CALL_RESULT', {
        data: { toolCallId: 'search' },
        event_key: 'tool-call:search',
      }),
    ]);

    expect(items.map((item) => item.type)).toEqual(['tool', 'event', 'tool']);
    expect(items[0]?.type === 'tool' ? items[0].group.events : []).toHaveLength(
      1,
    );
    expect(items[2]?.type === 'tool' ? items[2].group.events : []).toHaveLength(
      1,
    );
  });

  it('does not treat successful result payload message as an error', () => {
    const items = createMessageEventRenderItems([
      eventBlock('TOOL_CALL_RESULT', {
        data: {
          message: 'completed',
          toolCallId: 'search',
        },
        event_key: 'tool-call:search',
        status: 'success',
      }),
    ]);
    const group = items[0]?.type === 'tool' ? items[0].group : undefined;

    expect(group).toBeDefined();
    expect(getToolGroupState(group!)).toBe('output-available');
  });

  it('does not add a process fold for plain text', () => {
    const plan = createMessageProcessFoldPlan(
      chatMessage([{ text: 'Final answer.', type: 'text' }]),
      showVisibleEvent,
    );

    expect(plan).toBeNull();
  });

  it('keeps reasoning-only messages inline without a process fold', () => {
    const plan = createMessageProcessFoldPlan(
      chatMessage([
        { text: 'first thought', type: 'reasoning' },
        { text: 'second thought', type: 'reasoning' },
      ]),
      showVisibleEvent,
    );

    expect(plan).toBeNull();
  });

  it('keeps completed bare tool calls inline when there is no answer', () => {
    const plan = createMessageProcessFoldPlan(
      chatMessage([
        eventBlock('TOOL_CALL_START', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
        }),
        eventBlock('TOOL_CALL_RESULT', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
        }),
      ]),
      showVisibleEvent,
    );

    expect(plan).toBeNull();
  });

  it('folds tool calls and reasoning before a final answer', () => {
    const message = chatMessage(
      [
        { text: 'first thought', type: 'reasoning' },
        eventBlock('TOOL_CALL_START', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
          status: 'running',
        }),
        eventBlock('TOOL_CALL_RESULT', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
          status: 'success',
        }),
        { text: 'second thought', type: 'reasoning' },
        { text: 'Final answer.', type: 'text' },
      ],
      { streaming: true },
    );

    const plan = createMessageProcessFoldPlan(message, showVisibleEvent);

    expect(plan?.title).toBe('1 个工具调用 | 2 次思考');
    expect(plan?.blockIndexes).toEqual([0, 1, 2, 3]);
    expect(plan?.hasResult).toBe(true);
    expect(plan?.mode).toBe('with-result');
  });

  it('folds multiple reasoning and tool runs into one ordered process group', () => {
    const plan = createMessageProcessFoldPlan(
      chatMessage([
        { text: 'plan first tool', type: 'reasoning' },
        eventBlock('TOOL_CALL_START', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
        }),
        eventBlock('TOOL_CALL_RESULT', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
        }),
        { text: 'plan second tool', type: 'reasoning' },
        eventBlock('TOOL_CALL_START', {
          data: { toolCallId: 'read' },
          event_key: 'tool-call:read',
        }),
        eventBlock('TOOL_CALL_RESULT', {
          data: { toolCallId: 'read' },
          event_key: 'tool-call:read',
        }),
        { text: 'Final answer.', type: 'text' },
      ]),
      showVisibleEvent,
    );

    expect(plan?.title).toBe('2 个工具调用 | 2 次思考');
    expect(plan?.blockIndexes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plan?.mode).toBe('with-result');
  });

  it('folds completed tool calls when trailing reasoning exists without text', () => {
    const plan = createMessageProcessFoldPlan(
      chatMessage([
        eventBlock('TOOL_CALL_RESULT', {
          data: { toolCallId: 'search' },
          event_key: 'tool-call:search',
        }),
        { text: 'tail thought', type: 'reasoning' },
      ]),
      showVisibleEvent,
    );

    expect(plan?.title).toBe('1 个工具调用 | 1 次思考');
    expect(plan?.blockIndexes).toEqual([0, 1]);
    expect(plan?.mode).toBe('tail-reasoning');
  });

  it('folds streaming tool calls before any final answer arrives', () => {
    const plan = createMessageProcessFoldPlan(
      chatMessage(
        [
          eventBlock('TOOL_CALL_START', {
            data: { toolCallId: 'search' },
            event_key: 'tool-call:search',
            status: 'running',
          }),
        ],
        { streaming: true },
      ),
      showVisibleEvent,
    );

    expect(plan?.title).toBe('1 个工具调用');
    expect(plan?.blockIndexes).toEqual([0]);
    expect(plan?.mode).toBe('streaming');
  });
});
