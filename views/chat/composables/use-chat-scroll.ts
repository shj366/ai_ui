import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const BOTTOM_THRESHOLD = 96;
const PROGRAMMATIC_SCROLL_LOCK_MS = 160;

export function useChatScroll() {
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

    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    );
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
    container.scrollTop = container.scrollHeight;
    updateScrollableState();
  }

  function scheduleScrollToBottom(force = false) {
    cancelScheduledScroll();

    scheduledScrollFrame = requestAnimationFrame(() => {
      scheduledScrollFrame = undefined;
      const container = messageContainerRef.value;
      if (!container || (!force && !autoFollowMessageScroll.value)) {
        return;
      }

      setScrollTopToBottom(container);
      requestAnimationFrame(() => {
        const nextContainer = messageContainerRef.value;
        if (!nextContainer || (!force && !autoFollowMessageScroll.value)) {
          return;
        }
        setScrollTopToBottom(nextContainer);
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
      container.scrollTo({ top: 0 });
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
      childList: true,
      subtree: false,
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
    showScrollToBottom,
  };
}
