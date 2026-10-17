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

/**
 * Hook to manage scroll-driven header visibility (Headroom pattern).
 * Uses event capturing on window to detect scrolling in any nested scrollable container.
 */
export function useHeadroom(options: HeadroomOptions = {}): [boolean, (visible: boolean) => void] {
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const isVisibleRef = useRef<boolean>(true);
  const lastScrollTopRef = useRef<number>(0);

  isVisibleRef.current = isVisible;

  useEffect(() => {
    const handleScroll = (event: Event) => {
      const target = event.target as HTMLElement | Document | null;
      if (!target) return;

      const scrollTop =
        target instanceof HTMLElement
          ? target.scrollTop
          : window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;

      const next = computeHeadroomState(
        scrollTop,
        lastScrollTopRef.current,
        isVisibleRef.current,
        options,
      );

      lastScrollTopRef.current = next.newLastScrollTop;
      if (next.isVisible !== isVisibleRef.current) {
        setIsVisible(next.isVisible);
      }
    };

    // Attach on both document and window with capture to guarantee capture across all browsers
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [options.threshold, options.deltaThreshold]);

  return [isVisible, setIsVisible];
}
