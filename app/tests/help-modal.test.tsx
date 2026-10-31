import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { HelpModal } from '../src/components/HelpModal';

describe('HelpModal - Single Section Accordion Behavior', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<HelpModal isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders with only the first section expanded by default', () => {
    render(<HelpModal isOpen={true} onClose={vi.fn()} />);

    // First section text should be visible
    expect(screen.getByText(/bibleit is an offline Progressive Web App/i)).toBeTruthy();

    // Other section contents should NOT be visible
    expect(screen.queryByText(/Jump directly to any passage by typing canonical citations/i)).toBeNull();
    expect(screen.queryByText(/bibleit uses a hybrid retrieval engine combining two search modes/i)).toBeNull();
  });

  it('ensures only one section is expanded at a time when switching sections', () => {
    render(<HelpModal isOpen={true} onClose={vi.fn()} />);

    // Section 1 is expanded initially
    expect(screen.getByText(/bibleit is an offline Progressive Web App/i)).toBeTruthy();

    // Click section 2 ('Scripture Reference Lookups')
    const lookupButton = screen.getByRole('button', { name: /Scripture Reference Lookups/i });
    fireEvent.click(lookupButton);

    // Section 2 should now be expanded
    expect(screen.getByText(/Jump directly to any passage by typing canonical citations/i)).toBeTruthy();

    // Section 1 MUST be collapsed (only one section expanded at a time)
    expect(screen.queryByText(/bibleit is an offline Progressive Web App/i)).toBeNull();

    // Click section 3 ('Semantic & Keyword Search')
    const searchButton = screen.getByRole('button', { name: /Semantic & Keyword Search/i });
    fireEvent.click(searchButton);

    // Section 3 should now be expanded, section 2 collapsed
    expect(screen.getByText(/bibleit uses a hybrid retrieval engine combining two search modes/i)).toBeTruthy();
    expect(screen.queryByText(/Jump directly to any passage by typing canonical citations/i)).toBeNull();
  });

  it('collapses an open section when clicked again, leaving all sections closed', () => {
    render(<HelpModal isOpen={true} onClose={vi.fn()} />);

    // Section 1 is expanded initially
    const installButton = screen.getByRole('button', { name: /Install as an Offline App \(PWA\)/i });
    expect(screen.getByText(/bibleit is an offline Progressive Web App/i)).toBeTruthy();

    // Click section 1 again to collapse
    fireEvent.click(installButton);

    // Now section 1 is collapsed and no section content is visible
    expect(screen.queryByText(/bibleit is an offline Progressive Web App/i)).toBeNull();
    expect(screen.queryByText(/Jump directly to any passage by typing canonical citations/i)).toBeNull();
  });

  it('invokes onClose when clicking Got It or close button', () => {
    const onClose = vi.fn();
    render(<HelpModal isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Close guide'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
