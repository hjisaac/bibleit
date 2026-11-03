import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { Header, SearchMode } from '../src/components/Header';

describe('Header Component', () => {
  it('is silent by default when in AUTO search mode', () => {
    render(
      <Header
        isOnline={true}
        isAiEnabled={true}
        searchMode={SearchMode.AUTO}
        onOpenHelp={vi.fn()}
      />,
    );

    expect(screen.queryByText(/on-device/i)).toBeNull();
    expect(screen.queryByText(/device only/i)).toBeNull();
    expect(screen.queryByText(/ai ready/i)).toBeNull();
  });

  it('renders dotless On-Device pill when searchMode is DEVICE', () => {
    render(
      <Header
        isOnline={true}
        isAiEnabled={true}
        searchMode={SearchMode.DEVICE}
        onOpenHelp={vi.fn()}
      />,
    );

    const pill = screen.getByText('On-Device');
    expect(pill).toBeTruthy();
    // Verify no pre-dot circle element is present inside the pill
    expect(pill.querySelector('.rounded-full')).toBeNull();
  });
});
