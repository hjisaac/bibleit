import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/preact';
import { useHeadroom } from '../src/core/headroom';

function TestScrollComponent() {
  const [isHeaderVisible] = useHeadroom({ threshold: 50, deltaThreshold: 8 });

  return (
    <div style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="header-wrapper"
        class={`transition-[margin,transform,opacity] duration-300 ease-in-out shrink-0 z-20 ${
          isHeaderVisible
            ? 'mt-0 translate-y-0 opacity-100'
            : '-mt-[57px] -translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <header style={{ height: '57px' }}>bibleit</header>
      </div>
      <div
        data-testid="scroll-container"
        style={{ flex: 1, overflowY: 'auto' }}
      >
        <div style={{ height: '2000px' }}>Scrollable Genesis text</div>
      </div>
    </div>
  );
}

describe('useHeadroom DOM Integration', () => {
  it('toggles exact negative margin and translate classes on scroll down and scroll up', async () => {
    const { getByTestId } = render(<TestScrollComponent />);
    const wrapper = getByTestId('header-wrapper');
    const container = getByTestId('scroll-container');

    // Initial state: visible
    expect(wrapper.className).toContain('mt-0');
    expect(wrapper.className).toContain('translate-y-0');
    expect(wrapper.className).toContain('opacity-100');
    expect(wrapper.className).not.toContain('-mt-[57px]');

    // Scroll down past threshold (scrollTop = 120 > 50)
    Object.defineProperty(container, 'scrollTop', { value: 120, writable: true });
    await act(async () => {
      fireEvent.scroll(container);
    });

    // Hidden state: negative margin collapses space, translate slides it up, opacity fades out
    expect(wrapper.className).toContain('-mt-[57px]');
    expect(wrapper.className).toContain('-translate-y-full');
    expect(wrapper.className).toContain('opacity-0');
    expect(wrapper.className).toContain('pointer-events-none');

    // Scroll up by more than deltaThreshold (from 120 to 80, delta = -40)
    Object.defineProperty(container, 'scrollTop', { value: 80, writable: true });
    await act(async () => {
      fireEvent.scroll(container);
    });

    // Revealed state: slides back down smoothly
    expect(wrapper.className).toContain('mt-0');
    expect(wrapper.className).toContain('translate-y-0');
    expect(wrapper.className).toContain('opacity-100');
    expect(wrapper.className).not.toContain('-mt-[57px]');
  });
});
