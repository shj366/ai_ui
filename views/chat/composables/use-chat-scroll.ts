import type { Ref } from 'vue';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const BOTTOM_THRESHOLD = 96;
const PROGRAMMATIC_SCROLL_LOCK_MS = 160;
const USER_INPUT_WINDOW_MS = 250;

interface UseChatScrollOptions {
  reverse?: boolean;
  scrollKey?: Ref<string>;
}

interface SavedScrollAnchor {
  key: string;
  offset: number;
}

function getMessageListScrollElement(element: unknown) {
  if (!element || typeof element !== 'object') {
    return undefined;
  }

  return (element as { scrollBoxNativeElement?: HTMLElement })
    .scrollBoxNativeElement;
}

export function useChatScroll(options: UseChatScrollOptions = {}) {
  const messageContainerRef = ref<HTMLElement>();
  const autoFollowMessageScroll = ref(true);
  const hasScrollableMessages = ref(false);
  const isScrollRestored = ref(false);
  const showScrollToBottom = computed(
    () => hasScrollableMessages.value && !autoFollowMessageScroll.value,
  );

  let contentResizeObserver: ResizeObserver | undefined;
  let contentMutationObserver: MutationObserver | undefined;
  let removeInputListeners: (() => void) | undefined;
  let scheduledContainerRefFrame: number | undefined;
  let scheduledScrollFrame: number | undefined;
  let scheduledRestoreFrame: number | undefined;
  let suppressSaveUntil = 0;
  let lastScrollTop = 0;
  let lastUserInputAt = 0;
  let lastUserScrollDirection: 'down' | 'none' | 'up' = 'none';
  let programmaticScrollUntil = 0;
  let boundScrollKey = getCurrentScrollKey();
  const scrollAnchors = new Map<string, null | SavedScrollAnchor>();

  function getCurrentScrollKey() {
    return options.scrollKey?.value || 'default';
  }

  function getBottomDistance(container: HTMLElement) {
    if (options.reverse) {
      return Math.abs(container.scrollTop);
    }

    return container.scrollHeight - container.scrollTop - container.clientHeight;
  }

  function getScrollDirection(container: HTMLElement) {
    const currentScrollTop = container.scrollTop;
    const delta = currentScrollTop - lastScrollTop;
    lastScrollTop = currentScrollTop;

    if (Math.abs(delta) < 1) {
      return lastUserScrollDirection;
    }

    if (options.reverse) {
      return delta > 0 ? 'up' : 'down';
    }

    return delta < 0 ? 'up' : 'down';
  }

  function updateLastScrollTop() {
    lastScrollTop = messageContainerRef.value?.scrollTop ?? 0;
  }

  function applyMessageContainerRef(nextElement: HTMLElement | undefined) {
    if (messageContainerRef.value && messageContainerRef.value !== nextElement) {
      saveScrollAnchor(true, boundScrollKey);
    }

    if (messageContainerRef.value !== nextElement) {
      isScrollRestored.value = false;
    }

    messageContainerRef.value = nextElement;
    if (nextElement) {
      boundScrollKey = getCurrentScrollKey();
    }
    updateLastScrollTop();
  }

  function cancelScheduledContainerRef() {
    if (scheduledContainerRefFrame === undefined) {
      return;
    }

    cancelAnimationFrame(scheduledContainerRefFrame);
    scheduledContainerRefFrame = undefined;
  }

  function resolveMessageContainerRef(element: unknown, remainingAttempts = 4) {
    cancelScheduledContainerRef();

    if (element instanceof HTMLElement || !element) {
      applyMessageContainerRef(
        element instanceof HTMLElement ? element : undefined,
      );
      return;
    }

    const nextElement = getMessageListScrollElement(element);
    if (nextElement || remainingAttempts <= 0) {
      applyMessageContainerRef(nextElement);
      return;
    }

    scheduledContainerRefFrame = requestAnimationFrame(() => {
      scheduledContainerRefFrame = undefined;
      resolveMessageContainerRef(element, remainingAttempts - 1);
    });
  }

  function setMessageContainerRef(element: unknown) {
    resolveMessageContainerRef(element);
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

  function isMessageContainerAtVisualBottom(container: HTMLElement) {
    return getBottomDistance(container) <= 2;
  }

  function getMessageElements(container: HTMLElement) {
    return [
      ...container.querySelectorAll<HTMLElement>('[data-chat-message-key]'),
    ];
  }

  function findTopVisibleMessageAnchor(container: HTMLElement) {
    const containerRect = container.getBoundingClientRect();

    for (const element of getMessageElements(container)) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= containerRect.top) {
        continue;
      }

      return {
        key: element.dataset.chatMessageKey || '',
        offset: Math.max(0, containerRect.top - rect.top),
      };
    }
  }

  function saveScrollAnchor(
    immediate = false,
    scrollKey = getCurrentScrollKey(),
  ) {
    if (!immediate && performance.now() < suppressSaveUntil) {
      return;
    }

    const container = messageContainerRef.value;
    if (!container) {
      return;
    }

    if (isMessageContainerNearBottom()) {
      scrollAnchors.set(scrollKey, null);
      return;
    }

    const anchor = findTopVisibleMessageAnchor(container);
    if (anchor?.key) {
      scrollAnchors.set(scrollKey, anchor);
    }
  }

  function handleMessageContainerScroll() {
    const container = messageContainerRef.value;
    if (!container) {
      return;
    }

    updateScrollableState();
    const direction = getScrollDirection(container);

    if (performance.now() < programmaticScrollUntil) {
      autoFollowMessageScroll.value = isMessageContainerNearBottom();
      saveScrollAnchor();
      return;
    }

    const isUserInitiated =
      performance.now() - lastUserInputAt < USER_INPUT_WINDOW_MS;
    const nearBottom = isMessageContainerNearBottom();

    if (nearBottom) {
      autoFollowMessageScroll.value = true;
      saveScrollAnchor(true);
      return;
    }

    if (isUserInitiated || direction === 'up') {
      autoFollowMessageScroll.value = false;
    }

    saveScrollAnchor();
  }

  function cancelScheduledScroll() {
    if (scheduledScrollFrame === undefined) {
      return;
    }

    cancelAnimationFrame(scheduledScrollFrame);
    scheduledScrollFrame = undefined;
  }

  function cancelScheduledRestore() {
    if (scheduledRestoreFrame === undefined) {
      return;
    }

    cancelAnimationFrame(scheduledRestoreFrame);
    scheduledRestoreFrame = undefined;
  }

  function setScrollTopToBottom(
    container: HTMLElement,
    scrollKey = getCurrentScrollKey(),
  ) {
    programmaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_LOCK_MS;
    const previousScrollBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';
    container.scrollTop = options.reverse ? 0 : container.scrollHeight;
    container.style.scrollBehavior = previousScrollBehavior;
    updateLastScrollTop();
    updateScrollableState();
    scrollAnchors.set(scrollKey, null);
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
      scrollAnchors.set(getCurrentScrollKey(), null);
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
      updateLastScrollTop();
      updateScrollableState();
      autoFollowMessageScroll.value = false;
      saveScrollAnchor(true);
    });
  }

  function restoreSavedScrollPosition(scrollKey = getCurrentScrollKey()) {
    const container = messageContainerRef.value;
    if (!container) {
      return;
    }

    suppressSaveUntil = performance.now() + PROGRAMMATIC_SCROLL_LOCK_MS * 2;
    const saved = scrollAnchors.get(scrollKey);
    const previousScrollBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';

    if (!saved) {
      autoFollowMessageScroll.value = true;
      setScrollTopToBottom(container, scrollKey);
      container.style.scrollBehavior = previousScrollBehavior;
      return;
    }

    const target = getMessageElements(container).find(
      (element) => element.dataset.chatMessageKey === saved.key,
    );
    if (!target) {
      autoFollowMessageScroll.value = true;
      setScrollTopToBottom(container, scrollKey);
      container.style.scrollBehavior = previousScrollBehavior;
      return;
    }

    programmaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_LOCK_MS;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop += targetRect.top - containerRect.top - saved.offset;
    container.style.scrollBehavior = previousScrollBehavior;
    updateLastScrollTop();
    autoFollowMessageScroll.value = false;
    updateScrollableState();
  }

  function scheduleRestoreSavedScrollPosition() {
    cancelScheduledRestore();
    isScrollRestored.value = false;
    const restoreKey = getCurrentScrollKey();
    nextTick(() => {
      scheduledRestoreFrame = requestAnimationFrame(() => {
        scheduledRestoreFrame = undefined;
        if (restoreKey !== getCurrentScrollKey()) {
          return;
        }
        restoreSavedScrollPosition(restoreKey);
        waitForStableRestore(restoreKey);
      });
    });
  }

  function waitForStableRestore(
    scrollKey = getCurrentScrollKey(),
    remainingAttempts = 18,
    stableFrames = 0,
    previousScrollHeight = 0,
  ) {
    scheduledRestoreFrame = requestAnimationFrame(() => {
      scheduledRestoreFrame = undefined;
      const container = messageContainerRef.value;
      if (!container) {
        isScrollRestored.value = true;
        return;
      }
      if (scrollKey !== getCurrentScrollKey()) {
        return;
      }

      if (autoFollowMessageScroll.value) {
        setScrollTopToBottom(container, scrollKey);
      } else {
        restoreSavedScrollPosition(scrollKey);
      }

      const currentScrollHeight = container.scrollHeight;
      const isStable =
        currentScrollHeight === previousScrollHeight &&
        (!autoFollowMessageScroll.value ||
          isMessageContainerAtVisualBottom(container));
      const nextStableFrames = isStable ? stableFrames + 1 : 0;

      if (nextStableFrames >= 3 || remainingAttempts <= 0) {
        if (autoFollowMessageScroll.value) {
          setScrollTopToBottom(container, scrollKey);
        }
        suppressSaveUntil = 0;
        isScrollRestored.value = true;
        return;
      }

      waitForStableRestore(
        scrollKey,
        remainingAttempts - 1,
        nextStableFrames,
        currentScrollHeight,
      );
    });
  }

  function disposeObservers() {
    contentResizeObserver?.disconnect();
    contentMutationObserver?.disconnect();
    removeInputListeners?.();
    contentResizeObserver = undefined;
    contentMutationObserver = undefined;
    removeInputListeners = undefined;
  }

  function observeUserInput(container: HTMLElement) {
    removeInputListeners?.();

    const markInput = () => {
      lastUserInputAt = performance.now();
    };
    const handleWheel = (event: WheelEvent) => {
      markInput();
      lastUserScrollDirection =
        event.deltaY < 0 ? 'up' : event.deltaY > 0 ? 'down' : 'none';
    };
    const handlePointer = () => {
      markInput();
      lastUserScrollDirection = 'none';
    };
    const handleKeydown = (event: KeyboardEvent) => {
      markInput();
      lastUserScrollDirection = ['ArrowUp', 'PageUp'].includes(event.key)
        ? 'up'
        : ['ArrowDown', 'End', 'PageDown'].includes(event.key)
          ? 'down'
          : 'none';
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('pointerdown', handlePointer, { passive: true });
    container.addEventListener('touchstart', handlePointer, { passive: true });
    container.addEventListener('keydown', handleKeydown);
    removeInputListeners = () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointerdown', handlePointer);
      container.removeEventListener('touchstart', handlePointer);
      container.removeEventListener('keydown', handleKeydown);
    };
  }

  function observeMessageContent(container: HTMLElement) {
    disposeObservers();
    observeUserInput(container);

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
    scheduleRestoreSavedScrollPosition();
  });

  watch(
    () => options.scrollKey?.value,
    (_scrollKey, previousScrollKey) => {
      if (previousScrollKey) {
        saveScrollAnchor(true, previousScrollKey);
      }
      isScrollRestored.value = false;
      autoFollowMessageScroll.value = true;
      suppressSaveUntil = performance.now() + PROGRAMMATIC_SCROLL_LOCK_MS * 2;
      scheduleRestoreSavedScrollPosition();
    },
    { flush: 'sync' },
  );

  onBeforeUnmount(() => {
    saveScrollAnchor(true, boundScrollKey);
    cancelScheduledContainerRef();
    cancelScheduledScroll();
    cancelScheduledRestore();
    disposeObservers();
  });

  return {
    autoFollowMessageScroll,
    handleMessageContainerScroll,
    isScrollRestored,
    messageContainerRef,
    resumeAutoFollowMessageScroll,
    scrollToBottom,
    scrollToBottomIfFollowing,
    scrollToTop,
    setMessageContainerRef,
    showScrollToBottom,
  };
}
