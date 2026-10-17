import { useEffect, useRef, useState } from 'preact/hooks';

export interface HeadroomOptions {
  /** Minimum scroll distance in pixels from top before header can hide. Default: 50 */
  readonly threshold?: number;
  /** Minimum scroll delta in pixels required to trigger a visibility change. Default: 8 */
  readonly deltaThreshold?: number;
}

export interface HeadroomStateResult {
  readonly isVisible: boolean;
  readonly newLastScrollTop: number;
}

/**
 * Pure state transition for headroom scroll logic.
 * Handles scrolling direction, thresholds, and top anchoring.
 */
export function computeHeadroomState(
  scrollTop: number,
  lastScrollTop: number,
  currentVisible: boolean,
  options: HeadroomOptions = {},
): HeadroomStateResult {
  const threshold = options.threshold ?? 50;
  const deltaThreshold = options.deltaThreshold ?? 8;

  // Always keep header visible at the top (or negative iOS overscroll)
  if (scrollTop <= threshold) {
    return {
      isVisible: true,
      newLastScrollTop: Math.max(0, scrollTop),
    };
  }

  const delta = scrollTop - lastScrollTop;

  // Ignore micro-movements below the jitter threshold
  if (Math.abs(delta) < deltaThreshold) {
    return {
      isVisible: currentVisible,
      newLastScrollTop: lastScrollTop,
    };
  }

  // Scrolling down -> hide header
  if (delta > 0) {
    return {
      isVisible: false,
      newLastScrollTop: scrollTop,
    };
  }

  // Scrolling up -> show header
  return {
    isVisible: true,
    newLastScrollTop: scrollTop,
  };
}

interface ScrollMetrics {
  readonly key: EventTarget;
  readonly scrollTop: number;
  readonly maxScroll: number;
}

function getScrollMetrics(event?: Event): ScrollMetrics | null {
  const target = event?.target;

  if (
    target instanceof HTMLElement &&
    target !== document.documentElement &&
    target !== document.body
  ) {
    // Never react to scroll events inside modals/dialogs, horizontal scrollers, or when window scrolls
    if (
      window.scrollY > 0 ||
      target.scrollHeight <= target.clientHeight ||
      target.closest('[role="dialog"], [aria-modal="true"]')
    ) {
      return null;
    }
    const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
    return {
      key: target,
      scrollTop: Math.min(Math.max(0, target.scrollTop), maxScroll || target.scrollTop),
      maxScroll,
    };
  }

  const rawTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const docEl = document.documentElement;
  const maxScroll =
    docEl && docEl.scrollHeight > docEl.clientHeight
      ? docEl.scrollHeight - docEl.clientHeight
      : 0;

  return {
    key: window,
    scrollTop: maxScroll > 0 ? Math.min(Math.max(0, rawTop), maxScroll) : Math.max(0, rawTop),
    maxScroll,
  };
}

/**
 * Hook to manage scroll-driven bar visibility (Headroom pattern).
 */
export function useHeadroom(options: HeadroomOptions = {}): [boolean, (visible: boolean) => void] {
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const isVisibleRef = useRef<boolean>(true);
  const lastScrollMapRef = useRef<WeakMap<EventTarget, number>>(new WeakMap());

  isVisibleRef.current = isVisible;

  const setVisible = (visible: boolean) => {
    isVisibleRef.current = visible;
    setIsVisible(visible);
  };

  useEffect(() => {
    const threshold = options.threshold ?? 50;

    const handleScroll = (event: Event) => {
      const metrics = getScrollMetrics(event);
      if (!metrics) return;

      // Keep bar visible if the page barely scrolls (prevents boundary oscillation)
      if (metrics.maxScroll > 0 && metrics.maxScroll < threshold + 40) {
        lastScrollMapRef.current.set(metrics.key, metrics.scrollTop);
        if (!isVisibleRef.current) {
          isVisibleRef.current = true;
          setIsVisible(true);
        }
        return;
      }

      const prevScrollTop = lastScrollMapRef.current.get(metrics.key) ?? 0;
      const next = computeHeadroomState(
        metrics.scrollTop,
        prevScrollTop,
        isVisibleRef.current,
        options,
      );

      lastScrollMapRef.current.set(metrics.key, next.newLastScrollTop);
      if (next.isVisible !== isVisibleRef.current) {
        isVisibleRef.current = next.isVisible;
        setIsVisible(next.isVisible);
      }
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [options.threshold, options.deltaThreshold]);

  return [isVisible, setVisible];
}


