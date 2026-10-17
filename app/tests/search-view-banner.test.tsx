import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { SearchView } from '../src/components/SearchView';
import type { SearchEngine } from '../src/core/ports';
import type { ComponentProps } from 'preact';

type SearchViewProps = ComponentProps<typeof SearchView>;

const mockEngine: SearchEngine = {
  ready: Promise.resolve(),
  retrieve: async () => ({
    query: '',
    passages: [],
    sources: { reference: [], lexical: [], semantic: [] },
    parsedRefs: [],
  }),
  answers: {
    available: false,
    answer: async function* () {},
  },
};

function renderSearchView(overrides: Partial<SearchViewProps> = {}) {
  const onOpenStorage = vi.fn();
  const onDismissOnboarding = vi.fn();
  const onOpenReader = vi.fn();
  const onToast = vi.fn();

  const props: SearchViewProps = {
    engine: mockEngine,
    isOnline: true,
    isAiEnabled: false,
    isInspectorMode: false,
    showHeadings: true,
    offlineTextStatus: 'not_downloaded',
    hasSeenOnboarding: false,
    savedVerses: [],
    onOpenStorage,
    onDismissOnboarding,
    onOpenReader,
    onToast,
    ...overrides,
  };

  const utils = render(<SearchView {...props} />);
  return { ...utils, props };
}

describe('SearchView Onboarding & Offline Storage Banner', () => {
  describe('Stage 1: Prominent Onboarding Warning (First Visit)', () => {
    it('renders the full warning banner when offline text is not downloaded and hasSeenOnboarding is false', () => {
      renderSearchView({ offlineTextStatus: 'not_downloaded', hasSeenOnboarding: false });

      expect(
        screen.getByText(/Save Scripture text \(~2 MB\) to read and search offline\./i),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: /Set Up →/i })).toBeTruthy();
      expect(screen.getByTitle('Dismiss banner')).toBeTruthy();
    });

    it('triggers onOpenStorage when clicking the "Set Up →" button in the prominent banner', () => {
      const { props } = renderSearchView({
        offlineTextStatus: 'not_downloaded',
        hasSeenOnboarding: false,
      });

      fireEvent.click(screen.getByRole('button', { name: /Set Up →/i }));
      expect(props.onOpenStorage).toHaveBeenCalledTimes(1);
    });

    it('triggers onDismissOnboarding when clicking the cross button', () => {
      const { props } = renderSearchView({
        offlineTextStatus: 'not_downloaded',
        hasSeenOnboarding: false,
      });

      fireEvent.click(screen.getByTitle('Dismiss banner'));
      expect(props.onDismissOnboarding).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stage 2: Discreet Reminder (After Dismissal)', () => {
    it('renders only the discreet single-line reminder once the full banner has been dismissed', () => {
      renderSearchView({ offlineTextStatus: 'not_downloaded', hasSeenOnboarding: true });

      // Prominent banner elements should NOT exist
      expect(
        screen.queryByText(/Save Scripture text \(~2 MB\) to read and search offline\./i),
      ).toBeNull();
      expect(screen.queryByTitle('Dismiss banner')).toBeNull();

      // Discreet reminder button should exist
      expect(
        screen.getByText(/Scripture text not saved for offline usage · Tap to set up →/i),
      ).toBeTruthy();
    });

    it('triggers onOpenStorage when tapping the discreet reminder', () => {
      const { props } = renderSearchView({
        offlineTextStatus: 'not_downloaded',
        hasSeenOnboarding: true,
      });

      fireEvent.click(screen.getByText(/Scripture text not saved for offline usage/i));
      expect(props.onOpenStorage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stage 3: Offline Storage Ready', () => {
    it('renders neither the prominent banner nor the discreet reminder when offline text is ready', () => {
      renderSearchView({ offlineTextStatus: 'ready', hasSeenOnboarding: false });

      expect(
        screen.queryByText(/Save Scripture text \(~2 MB\) to read and search offline\./i),
      ).toBeNull();
      expect(
        screen.queryByText(/Scripture text not saved for offline usage/i),
      ).toBeNull();
    });

    it('remains hidden when offline text is ready even if hasSeenOnboarding is true', () => {
      renderSearchView({ offlineTextStatus: 'ready', hasSeenOnboarding: true });

      expect(
        screen.queryByText(/Save Scripture text \(~2 MB\) to read and search offline\./i),
      ).toBeNull();
      expect(
        screen.queryByText(/Scripture text not saved for offline usage/i),
      ).toBeNull();
    });
  });
});
