import type {
  AIChatEventMessageBlock,
  AIChatMessageBlock,
} from '../types/message';

import { describe, expect, it } from 'vitest';

import {
  type ChatMessageItem,
  getBlocksByType,
  getMessageTextContent,
  mergeAdjacentAssistantMessagesInOrder,
  mergeMessageBlocks,
} from './message';

function assistantMessage(
  index: number,
  blocks: AIChatMessageBlock[],
  options: {
    messageId?: null | number;
    messageIndex?: number;
  } = {},
): ChatMessageItem {
  const messageId = options.messageId === undefined ? index : options.messageId;

  return {
    blocks,
    conversation_id: 'conversation-1',
    created_time: `2026-06-27T16:13:${index.toString().padStart(2, '0')}Z`,
    id: `assistant-${index}`,
    message_id: messageId,
    message_index: options.messageIndex ?? index,
    message_type: 'normal',
    model_id: 'mimo-v2.5',
    provider_id: 4,
    role: 'assistant',
    streaming: false,
  };
}

function eventBlock(eventKey: string): AIChatEventMessageBlock {
  return {
    event_key: eventKey,
    event_type: 'TOOL_CALL_START',
    status: 'success',
    summary: eventKey,
    title: 'Tool event',
    type: 'event',
  };
}

describe('AI chat message merging', () => {
  it('keeps multiple reasoning runs in one assistant turn renderable', () => {
    const merged = mergeAdjacentAssistantMessagesInOrder([
      assistantMessage(
        1,
        [{ text: 'search retail gold prices', type: 'reasoning' }],
        { messageId: 1, messageIndex: 1 },
      ),
      assistantMessage(2, [eventBlock('tool-call:prices:start')], {
        messageId: 1,
        messageIndex: 1,
      }),
      assistantMessage(3, [eventBlock('tool-result:prices')], {
        messageId: 1,
        messageIndex: 1,
      }),
      assistantMessage(
        4,
        [{ text: 'search international gold trend', type: 'reasoning' }],
        { messageId: 1, messageIndex: 1 },
      ),
      assistantMessage(5, [eventBlock('tool-call:trend:start')], {
        messageId: 1,
        messageIndex: 1,
      }),
      assistantMessage(6, [eventBlock('tool-result:trend')], {
        messageId: 1,
        messageIndex: 1,
      }),
      assistantMessage(
        7,
        [{ text: 'combine macro signals', type: 'reasoning' }],
        { messageId: 1, messageIndex: 1 },
      ),
      assistantMessage(
        8,
        [{ text: 'Gold buying needs current market data.', type: 'text' }],
        { messageId: 1, messageIndex: 1 },
      ),
    ]);

    expect(merged).toHaveLength(1);
    const visibleMessage = merged[0]!;
    expect(getBlocksByType(visibleMessage, 'reasoning')).toHaveLength(3);
    expect(getBlocksByType(visibleMessage, 'event')).toHaveLength(4);
    expect(getMessageTextContent(visibleMessage, 'text')).toBe(
      'Gold buying needs current market data.',
    );
    expect(
      getBlocksByType(visibleMessage, 'reasoning').map((block) => block.text),
    ).toEqual([
      'search retail gold prices',
      'search international gold trend',
      'combine macro signals',
    ]);
  });

  it('does not merge assistant fragments from different persisted messages', () => {
    const merged = mergeAdjacentAssistantMessagesInOrder([
      assistantMessage(1, [
        { text: 'first message reasoning', type: 'reasoning' },
      ]),
      assistantMessage(2, [
        { text: 'Second assistant response.', type: 'text' },
      ]),
    ]);

    expect(merged).toHaveLength(2);
    expect(getMessageTextContent(merged[0]!, 'reasoning')).toBe(
      'first message reasoning',
    );
    expect(getMessageTextContent(merged[1]!, 'text')).toBe(
      'Second assistant response.',
    );
  });

  it('falls back to message index when persisted message id is missing', () => {
    const merged = mergeAdjacentAssistantMessagesInOrder([
      assistantMessage(
        1,
        [{ text: 'reasoning without persisted id', type: 'reasoning' }],
        { messageId: null, messageIndex: 3 },
      ),
      assistantMessage(
        2,
        [{ text: 'Final answer without persisted id.', type: 'text' }],
        { messageId: null, messageIndex: 3 },
      ),
    ]);

    expect(merged).toHaveLength(1);
    expect(getMessageTextContent(merged[0]!, 'reasoning')).toBe(
      'reasoning without persisted id',
    );
    expect(getMessageTextContent(merged[0]!, 'text')).toBe(
      'Final answer without persisted id.',
    );
  });

  it('keeps one assistant turn together when text surrounds tool events', () => {
    const merged = mergeAdjacentAssistantMessagesInOrder([
      assistantMessage(1, [{ text: 'I will check that now.', type: 'text' }], {
        messageId: 10,
        messageIndex: 10,
      }),
      assistantMessage(2, [eventBlock('tool-call:search:start')], {
        messageId: 10,
        messageIndex: 10,
      }),
      assistantMessage(3, [{ text: 'The result is ready.', type: 'text' }], {
        messageId: 10,
        messageIndex: 10,
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.blocks.map((block) => block.type)).toEqual([
      'text',
      'event',
      'text',
    ]);
    expect(getMessageTextContent(merged[0]!)).toBe(
      ['I will check that now.', 'The result is ready.'].join('\n\n'),
    );
  });

  it('keeps streaming reasoning chunks as deltas', () => {
    const merged = mergeMessageBlocks(
      [{ text: 'search retail', type: 'reasoning' }],
      [{ text: ' gold prices', type: 'reasoning' }],
    );

    expect(getBlocksByType({ blocks: merged }, 'reasoning')).toEqual([
      { text: 'search retail gold prices', type: 'reasoning' },
    ]);
  });
});
