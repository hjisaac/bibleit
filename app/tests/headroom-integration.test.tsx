import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { useHeadroom } from '../src/core/headroom';
import { Navbar, type ViewTab } from '../src/components/Navbar';

function TestNavbarScrollComponent() {
  const [activeTab, setActiveTab] = useState<ViewTab>('reader');
  const [isBarVisible, setIsBarVisible] = useHeadroom({ threshold: 50, deltaThreshold: 8 });

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    setIsBarVisible(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="scroll-container"
        style={{ flex: 1, overflowY: 'auto' }}
      >
        <div data-testid="chip-bar" style={{ overflowX: 'auto' }}>
          Chips
        </div>
        <div style={{ height: '2500px' }}>Scrollable Genesis text</div>
      </div>
      <Navbar activeTab={activeTab} onTabChange={handleTabChange} isVisible={isBarVisible} />
    </div>
  );
}

describe('Navbar Auto-Hide DOM Integration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it('pins Navbar with fixed bottom-0 and slides down/up on window scroll', async () => {
    const { container } = render(<TestNavbarScrollComponent />);
    const nav = container.querySelector('nav')!;

    // Initial state: fixed bottom-0 and visible (translate-y-0)
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('bottom-0');
    expect(nav.className).toContain('translate-y-0');
    expect(nav.className).not.toContain('translate-y-full');

    // Window scroll down past threshold (scrollY = 140 > 50)
    Object.defineProperty(window, 'scrollY', { value: 140, writable: true, configurable: true });
    await act(async () => {
      fireEvent.scroll(window);
    });

    // Hidden state: slides smoothly down out of view
    expect(nav.className).toContain('translate-y-full');
    expect(nav.className).toContain('pointer-events-none');
    expect(nav.className).not.toContain('translate-y-0');

    // Horizontal chip scroll should NOT reset or interfere with window scroll state
    const chipBar = container.querySelector('[data-testid="chip-bar"]')!;
    Object.defineProperty(chipBar, 'scrollHeight', { value: 32, configurable: true });
    Object.defineProperty(chipBar, 'clientHeight', { value: 32, configurable: true });
    Object.defineProperty(chipBar, 'scrollTop', { value: 0, configurable: true });
    await act(async () => {
      fireEvent.scroll(chipBar);
    });
    expect(nav.className).toContain('translate-y-full');

    // Window scroll up by more than deltaThreshold (from 140 to 90, delta = -50)
    Object.defineProperty(window, 'scrollY', { value: 90, writable: true, configurable: true });
    await act(async () => {
      fireEvent.scroll(window);
    });

    // Revealed state: slides smoothly back into view
    expect(nav.className).toContain('translate-y-0');
    expect(nav.className).not.toContain('translate-y-full');
  });

  it('slides Navbar down and up on vertical scroll container events', async () => {
    const { container, getByTestId } = render(<TestNavbarScrollComponent />);
    const nav = container.querySelector('nav')!;
    const scrollContainer = getByTestId('scroll-container');

    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2500, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, configurable: true });

    // Scroll down past threshold (scrollTop = 120 > 50)
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 120, writable: true, configurable: true });
    await act(async () => {
      fireEvent.scroll(scrollContainer);
    });

    expect(nav.className).toContain('translate-y-full');
    expect(nav.className).toContain('pointer-events-none');

    // Scroll up by more than deltaThreshold (from 120 to 80, delta = -40)
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 80, writable: true, configurable: true });
    await act(async () => {
      fireEvent.scroll(scrollContainer);
    });

    expect(nav.className).toContain('translate-y-0');
    expect(nav.className).not.toContain('translate-y-full');
  });

  it('never hides or shakes on short pages where maxScroll is below threshold + 40', async () => {
    const { container, getByTestId } = render(<TestNavbarScrollComponent />);
    const nav = container.querySelector('nav')!;
    const scrollContainer = getByTestId('scroll-container');

    // maxScroll = 660 - 600 = 60 (< 50 + 40 = 90)
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 660, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 58, writable: true, configurable: true });

    await act(async () => {
      fireEvent.scroll(scrollContainer);
    });

    expect(nav.className).toContain('translate-y-0');
    expect(nav.className).not.toContain('translate-y-full');
  });

  it('ignores scroll events originating inside modal dialogs ([role="dialog"])', async () => {
    const { container } = render(
      <div>
        <TestNavbarScrollComponent />
        <div role="dialog" aria-modal="true">
          <div data-testid="modal-scroll" style={{ overflowY: 'auto' }}>
            Modal content
          </div>
        </div>
      </div>,
    );
    const nav = container.querySelector('nav')!;
    const modalScroll = container.querySelector('[data-testid="modal-scroll"]')!;

    Object.defineProperty(modalScroll, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(modalScroll, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(modalScroll, 'scrollTop', { value: 250, writable: true, configurable: true });

    await act(async () => {
      fireEvent.scroll(modalScroll);
    });

    expect(nav.className).toContain('translate-y-0');
    expect(nav.className).not.toContain('translate-y-full');
  });
});

