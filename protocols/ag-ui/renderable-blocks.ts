import type { ChatMessageItem } from '#/plugins/ai/runtime/message';
import type { AIChatRenderableBlock } from '#/plugins/ai/types/render';

import { createDefaultRenderableBlocks } from '#/plugins/ai/runtime/renderable-blocks';

import {
  getAGUIEventSourceItems,
  shouldSuppressAGUIEventBlock,
} from './event-presentation';

export function getAGUIRenderableBlocks(
  message: ChatMessageItem,
): AIChatRenderableBlock[] {
  return createDefaultRenderableBlocks(message, {
    getEventSourceItems: getAGUIEventSourceItems,
    shouldSuppressEventBlock: shouldSuppressAGUIEventBlock,
  });
}
