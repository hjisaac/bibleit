import { describe, it, expect } from 'vitest';
import { computeHeadroomState } from '../src/core/headroom';

describe('computeHeadroomState (Scroll Headroom Logic)', () => {
  it('keeps header visible when near the top within default threshold', () => {
    const result = computeHeadroomState(20, 0, true);
    expect(result.isVisible).toBe(true);
    expect(result.newLastScrollTop).toBe(20);
  });

  it('keeps header visible on negative scroll (iOS momentum overscroll)', () => {
    const result = computeHeadroomState(-15, 0, false);
    expect(result.isVisible).toBe(true);
    expect(result.newLastScrollTop).toBe(0);
  });

  it('hides header when scrolling down past threshold by more than deltaThreshold', () => {
    // Current scrollTop = 120, lastScrollTop = 50, delta = +70 > 8
    const result = computeHeadroomState(120, 50, true);
    expect(result.isVisible).toBe(false);
    expect(result.newLastScrollTop).toBe(120);
  });

  it('ignores micro-movements scrolling down if below deltaThreshold', () => {
    // Current scrollTop = 103, lastScrollTop = 100, delta = +3 < 8
    const result = computeHeadroomState(103, 100, true);
    expect(result.isVisible).toBe(true);
    expect(result.newLastScrollTop).toBe(100);
  });

  it('shows header immediately when scrolling up by more than deltaThreshold', () => {
    // Header is hidden, scrolling up: current scrollTop = 180, lastScrollTop = 210, delta = -30
    const result = computeHeadroomState(180, 210, false);
    expect(result.isVisible).toBe(true);
    expect(result.newLastScrollTop).toBe(180);
  });

  it('ignores micro-movements scrolling up if below deltaThreshold', () => {
    // Header is hidden, tiny scroll up: current scrollTop = 208, lastScrollTop = 210, delta = -2
    const result = computeHeadroomState(208, 210, false);
    expect(result.isVisible).toBe(false);
    expect(result.newLastScrollTop).toBe(210);
  });

  it('forces header to visible when returning to top even if it was hidden', () => {
    // Header was hidden, user scrolls back to top (scrollTop <= 50)
    const result = computeHeadroomState(30, 200, false);
    expect(result.isVisible).toBe(true);
    expect(result.newLastScrollTop).toBe(30);
  });

  it('respects custom threshold and deltaThreshold options', () => {
    const customOptions = { threshold: 100, deltaThreshold: 20 };

    // At scrollTop = 80 (< 100 threshold), should remain visible
    const at80 = computeHeadroomState(80, 50, false, customOptions);
    expect(at80.isVisible).toBe(true);

    // Delta of 15 is < 20 deltaThreshold, should keep current state
    const delta15 = computeHeadroomState(150, 135, true, customOptions);
    expect(delta15.isVisible).toBe(true);
    expect(delta15.newLastScrollTop).toBe(135);

    // Delta of 25 is > 20 deltaThreshold, should hide
    const delta25 = computeHeadroomState(160, 135, true, customOptions);
    expect(delta25.isVisible).toBe(false);
    expect(delta25.newLastScrollTop).toBe(160);
  });
});
