import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const BOTTOM_THRESHOLD = 96;
const PROGRAMMATIC_SCROLL_LOCK_MS = 160;

interface UseChatScrollOptions {
  reverse?: boolean;
}

function getMessageListScrollElement(element: unknown) {
  if (!element || typeof element !== 'object') {
    return undefined;
  }

  return (element as { scrollBoxNativeElement?: HTMLElement }).scrollBoxNativeElement;
}

export function useChatScroll(options: UseChatScrollOptions = {}) {
  const messageContainerRef = ref<HTMLElement>();
  const autoFollowMessageScroll = ref(true);
  const hasScrollableMessages = ref(false);
  const showScrollToBottom = computed(
    () => hasScrollableMessages.value && !autoFollowMessageScroll.value,
  );

  let contentResizeObserver: ResizeObserver | undefined;
  let contentMutationObserver: MutationObserver | undefined;
  let scheduledScrollFrame: number | undefined;
  let programmaticScrollUntil = 0;

  function getBottomDistance(container: HTMLElement) {
    if (options.reverse) {
      return Math.abs(container.scrollTop);
    }

    return (
      container.scrollHeight - container.scrollTop - container.clientHeight
    );
  }

  function setMessageContainerRef(element: unknown) {
    messageContainerRef.value =
      element instanceof HTMLElement
        ? element
        : getMessageListScrollElement(element);
  }

  function updateScrollableState() {
    const container = messageContainerRef.value;
    hasScrollableMessages.value = Boolean(
      container && container.scrollHeight > container.clientHeight + 1,
    );
  }

  function isMessageContainerNearBottom(threshold = BOTTOM_THRESHOLD) {
    const container = messageContainerRef.value;
    if (!container) {
      return true;
    }

    return getBottomDistance(container) <= threshold;
  }

  function syncAutoFollowMessageScroll() {
    updateScrollableState();
    autoFollowMessageScroll.value = isMessageContainerNearBottom();
  }

  function handleMessageContainerScroll() {
    updateScrollableState();

    if (performance.now() < programmaticScrollUntil) {
      autoFollowMessageScroll.value = isMessageContainerNearBottom();
      return;
    }

    syncAutoFollowMessageScroll();
  }

  function cancelScheduledScroll() {
    if (scheduledScrollFrame === undefined) {
      return;
    }

    cancelAnimationFrame(scheduledScrollFrame);
    scheduledScrollFrame = undefined;
  }

  function setScrollTopToBottom(container: HTMLElement) {
    programmaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_LOCK_MS;
    container.scrollTop = options.reverse ? 0 : container.scrollHeight;
    updateScrollableState();
  }

  function scheduleScrollToBottom(force = false, remainingAttempts = 2) {
    cancelScheduledScroll();

    scheduledScrollFrame = requestAnimationFrame(() => {
      scheduledScrollFrame = undefined;
      const container = messageContainerRef.value;
      if (!container) {
        if (force && remainingAttempts > 0) {
          scheduleScrollToBottom(force, remainingAttempts - 1);
        }
        return;
      }
      if (!force && !autoFollowMessageScroll.value) {
        return;
      }

      setScrollTopToBottom(container);
      requestAnimationFrame(() => {
        const nextContainer = messageContainerRef.value;
        if (!nextContainer) {
          if (force && remainingAttempts > 0) {
            scheduleScrollToBottom(force, remainingAttempts - 1);
          }
          return;
        }
        if (!force && !autoFollowMessageScroll.value) {
          return;
        }
        setScrollTopToBottom(nextContainer);
        if (force && remainingAttempts > 0) {
          scheduleScrollToBottom(force, remainingAttempts - 1);
        }
      });
    });
  }

  function scrollToBottom(force = false) {
    if (force) {
      autoFollowMessageScroll.value = true;
    }

    nextTick(() => {
      scheduleScrollToBottom(force);
    });
  }

  function scrollToBottomIfFollowing() {
    scrollToBottom(false);
  }

  function resumeAutoFollowMessageScroll() {
    scrollToBottom(true);
  }

  function scrollToTop() {
    nextTick(() => {
      const container = messageContainerRef.value;
      if (!container) {
        return;
      }

      programmaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_LOCK_MS;
      container.scrollTo({
        top: options.reverse ? -container.scrollHeight : 0,
      });
      updateScrollableState();
      autoFollowMessageScroll.value = false;
    });
  }

  function disposeObservers() {
    contentResizeObserver?.disconnect();
    contentMutationObserver?.disconnect();
    contentResizeObserver = undefined;
    contentMutationObserver = undefined;
  }

  function observeMessageContent(container: HTMLElement) {
    disposeObservers();

    contentResizeObserver = new ResizeObserver(() => {
      updateScrollableState();
      if (autoFollowMessageScroll.value) {
        scheduleScrollToBottom();
      }
    });

    const observeResizeTargets = () => {
      contentResizeObserver?.disconnect();
      contentResizeObserver?.observe(container);
      if (container.firstElementChild) {
        contentResizeObserver?.observe(container.firstElementChild);
      }
      for (const child of [...container.children]) {
        contentResizeObserver?.observe(child);
      }
    };

    observeResizeTargets();
    contentMutationObserver = new MutationObserver(() => {
      observeResizeTargets();
      updateScrollableState();
      if (autoFollowMessageScroll.value) {
        scheduleScrollToBottom();
      }
    });
    contentMutationObserver.observe(container, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  watch(messageContainerRef, (container) => {
    disposeObservers();
    if (!container) {
      hasScrollableMessages.value = false;
      return;
    }

    observeMessageContent(container);
    syncAutoFollowMessageScroll();
    if (autoFollowMessageScroll.value) {
      scheduleScrollToBottom(true, 4);
    }
  });

  onBeforeUnmount(() => {
    cancelScheduledScroll();
    disposeObservers();
  });

  return {
    autoFollowMessageScroll,
    handleMessageContainerScroll,
    messageContainerRef,
    resumeAutoFollowMessageScroll,
    scrollToBottom,
    scrollToBottomIfFollowing,
    scrollToTop,
    setMessageContainerRef,
    showScrollToBottom,
  };
}
