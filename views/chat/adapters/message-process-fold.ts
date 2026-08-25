import type { ChatMessageItem } from '../../../runtime/message';
import type {
  AIChatEventMessageBlock,
  AIChatMessageBlock,
} from '../../../types/message';

import {
  createMessageEventRenderItems,
  isToolEventBlock,
} from './message-event-groups';

export interface MessageProcessFoldPlan {
  blockIndexes: number[];
  hasResult: boolean;
  mode: 'streaming' | 'tail-reasoning' | 'with-result';
  reasoningCount: number;
  title: string;
  toolCount: number;
}

export function isProcessMessageBlock(
  message: ChatMessageItem,
  block: AIChatMessageBlock,
  shouldShowEventBlock: (
    message: ChatMessageItem,
    block: AIChatEventMessageBlock,
  ) => boolean,
) {
  if (block.type === 'reasoning') {
    return Boolean(block.text.trim());
  }

  return block.type === 'event' && shouldShowEventBlock(message, block);
}

function isResultMessageBlock(block: AIChatMessageBlock) {
  if (block.type === 'text') {
    return Boolean(block.text.trim());
  }

  return block.type === 'file';
}

export function createMessageProcessFoldPlan(
  message: ChatMessageItem,
  shouldShowEventBlock: (
    message: ChatMessageItem,
    block: AIChatEventMessageBlock,
  ) => boolean,
): MessageProcessFoldPlan | null {
  if (message.role !== 'assistant') {
    return null;
  }

  const processBlocks: Array<{
    block: AIChatMessageBlock;
    index: number;
  }> = [];
  const events: AIChatEventMessageBlock[] = [];
  let lastToolBlockIndex = -1;

  message.blocks.forEach((block, index) => {
    if (!isProcessMessageBlock(message, block, shouldShowEventBlock)) {
      return;
    }

    processBlocks.push({ block, index });
    if (block.type === 'event') {
      events.push(block);
      if (isToolEventBlock(block)) {
        lastToolBlockIndex = index;
      }
    }
  });

  const toolCount = createMessageEventRenderItems(events).filter(
    (item) => item.type === 'tool',
  ).length;
  const reasoningCount = processBlocks.filter(
    ({ block }) => block.type === 'reasoning',
  ).length;

  if (processBlocks.length === 0 || toolCount === 0) {
    return null;
  }

  const hasResult = message.blocks.some(isResultMessageBlock);
  const hasTailReasoning =
    lastToolBlockIndex >= 0 &&
    processBlocks.some(
      ({ block, index }) =>
        block.type === 'reasoning' && index > lastToolBlockIndex,
    );
  const mode = hasResult
    ? 'with-result'
    : message.streaming
      ? 'streaming'
      : hasTailReasoning
        ? 'tail-reasoning'
        : undefined;

  if (!mode) {
    return null;
  }

  return {
    blockIndexes: processBlocks.map(({ index }) => index),
    hasResult,
    mode,
    reasoningCount,
    title: [
      toolCount > 0 ? `${toolCount} 个工具调用` : '',
      reasoningCount > 0 ? `${reasoningCount} 次思考` : '',
    ]
      .filter(Boolean)
      .join(' | '),
    toolCount,
  };
}
