import type { ComputedRef, Ref } from 'vue';

import type { ChatMessageItem } from '../../../runtime/message';

import { nextTick, ref, watch } from 'vue';

import {
  getMessageEventBlocks,
  getMessageTextContent,
} from '../../../runtime/message';

type ExpandablePanelState = {
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

  const thinkingPanelStates = ref<Record<string, ExpandablePanelState>>({});
  const eventPanelStates = ref<Record<string, ExpandablePanelState>>({});

  function getPanelKey(message: ChatMessageItem) {
    return message.id;
  }

  function getThinkingPanelKey(message: ChatMessageItem) {
    return getPanelKey(message);
  }

  function getEventPanelKey(message: ChatMessageItem) {
    return getPanelKey(message);
  }

  function getThinkingContent(message: ChatMessageItem) {
    return getMessageTextContent(message, 'reasoning');
  }

  function hasThinkingContent(message: ChatMessageItem) {
    return Boolean(getThinkingContent(message).trim());
  }

  function hasEventContent(message: ChatMessageItem) {
    return getMessageEventBlocks(message).length > 0;
  }

  function isThinkingExpanded(message: ChatMessageItem) {
    return Boolean(
      thinkingPanelStates.value[getThinkingPanelKey(message)]?.expanded,
    );
  }

  function isEventsExpanded(message: ChatMessageItem) {
    return Boolean(eventPanelStates.value[getEventPanelKey(message)]?.expanded);
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

  function setEventsExpanded(message: ChatMessageItem, expanded: boolean) {
    const key = getEventPanelKey(message);
    eventPanelStates.value = {
      ...eventPanelStates.value,
      [key]: {
        autoOpened: false,
        expanded,
        manualTouched: true,
      },
    };
  }

  function hasThinkingPanelStateChanged(
    previous: ExpandablePanelState | undefined,
    next: ExpandablePanelState,
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

  function resolveNextPanelStates(params: {
    getKey: (message: ChatMessageItem) => string;
    hasContent: (message: ChatMessageItem) => boolean;
    messages: ChatMessageItem[];
    previousStates: Record<string, ExpandablePanelState>;
  }) {
    const nextStates: Record<string, ExpandablePanelState> = {};
    let hasChanges = false;

    for (const message of params.messages) {
      if (!params.hasContent(message)) {
        continue;
      }

      const key = params.getKey(message);
      const previous = params.previousStates[key];
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

    const previousKeys = Object.keys(params.previousStates);
    const nextKeys = Object.keys(nextStates);
    return {
      changed: hasChanges || previousKeys.length !== nextKeys.length,
      states: nextStates,
    };
  }

  watch(
    displayMessages,
    (messages) => {
      const nextThinking = resolveNextPanelStates({
        getKey: getThinkingPanelKey,
        hasContent: hasThinkingContent,
        messages,
        previousStates: thinkingPanelStates.value,
      });
      const nextEvents = resolveNextPanelStates({
        getKey: getEventPanelKey,
        hasContent: hasEventContent,
        messages,
        previousStates: eventPanelStates.value,
      });

      if (nextThinking.changed) {
        thinkingPanelStates.value = nextThinking.states;
      }
      if (nextEvents.changed) {
        eventPanelStates.value = nextEvents.states;
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
    eventPanelStates,
    getThinkingContent,
    hasThinkingContent,
    isEventsExpanded,
    isThinkingExpanded,
    setEventsExpanded,
    setThinkingExpanded,
    thinkingPanelStates,
  };
}
