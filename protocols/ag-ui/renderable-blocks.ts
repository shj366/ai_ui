import type { ChatMessageItem } from '../../runtime/message';
import type { AIChatRenderableBlock } from '../../types/render';

import { createDefaultRenderableBlocks } from '../../runtime/renderable-blocks';
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
