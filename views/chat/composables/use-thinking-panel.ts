import type { ComputedRef, Ref } from 'vue';

import type { ChatMessageItem } from '../../../runtime/message';

import { nextTick, ref, watch } from 'vue';

import { getMessageTextContent } from '../../../runtime/message';

type ThinkingPanelState = {
  autoOpened: boolean;
  expanded: boolean;
  manualTouched: boolean;
};

export interface UseThinkingPanelOptions {
  autoFollowMessageScroll: Ref<boolean>;
  displayMessages: ComputedRef<ChatMessageItem[]>;
  scrollToBottom: () => void;
}

export function useThinkingPanel(options: UseThinkingPanelOptions) {
  const { autoFollowMessageScroll, displayMessages, scrollToBottom } = options;

  const thinkingPanelStates = ref<Record<string, ThinkingPanelState>>({});

  function getThinkingPanelKey(message: ChatMessageItem) {
    return message.id;
  }

  function getThinkingContent(message: ChatMessageItem) {
    return getMessageTextContent(message, 'reasoning');
  }

  function hasThinkingContent(message: ChatMessageItem) {
    return Boolean(getThinkingContent(message).trim());
  }

  function isThinkingExpanded(message: ChatMessageItem) {
    return Boolean(
      thinkingPanelStates.value[getThinkingPanelKey(message)]?.expanded,
    );
  }

  function setThinkingExpanded(message: ChatMessageItem, expanded: boolean) {
    const key = getThinkingPanelKey(message);
    thinkingPanelStates.value = {
      ...thinkingPanelStates.value,
      [key]: {
        autoOpened: false,
        expanded,
        manualTouched: true,
      },
    };
  }

  function hasThinkingPanelStateChanged(
    previous: ThinkingPanelState | undefined,
    next: ThinkingPanelState,
  ) {
    if (!previous) {
      return true;
    }

    return (
      previous.autoOpened !== next.autoOpened ||
      previous.expanded !== next.expanded ||
      previous.manualTouched !== next.manualTouched
    );
  }

  watch(
    displayMessages,
    (messages) => {
      const nextStates: Record<string, ThinkingPanelState> = {};
      let hasChanges = false;

      for (const message of messages) {
        if (!hasThinkingContent(message)) {
          continue;
        }

        const key = getThinkingPanelKey(message);
        const previous = thinkingPanelStates.value[key];
        const hasTextStarted = Boolean(
          getMessageTextContent(message, 'text').trim(),
        );
        const shouldAutoExpand = Boolean(message.streaming && !hasTextStarted);

        if (previous?.manualTouched) {
          nextStates[key] = previous;
          continue;
        }

        if (shouldAutoExpand) {
          const nextState = {
            autoOpened: true,
            expanded: true,
            manualTouched: false,
          };
          hasChanges ||= hasThinkingPanelStateChanged(previous, nextState);
          nextStates[key] = nextState;
          continue;
        }

        if (previous?.autoOpened) {
          const nextState = {
            autoOpened: false,
            expanded: false,
            manualTouched: false,
          };
          hasChanges ||= hasThinkingPanelStateChanged(previous, nextState);
          nextStates[key] = nextState;
          continue;
        }

        if (previous) {
          nextStates[key] = previous;
        }
      }

      const previousKeys = Object.keys(thinkingPanelStates.value);
      const nextKeys = Object.keys(nextStates);
      if (hasChanges || previousKeys.length !== nextKeys.length) {
        thinkingPanelStates.value = nextStates;
      }

      if (messages.length > 0 && autoFollowMessageScroll.value) {
        nextTick(() => {
          scrollToBottom();
        });
      }
    },
    { immediate: true },
  );

  return {
    getThinkingContent,
    hasThinkingContent,
    isThinkingExpanded,
    setThinkingExpanded,
    thinkingPanelStates,
  };
}
