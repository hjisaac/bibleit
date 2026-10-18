import { describe, it, expect, vi } from 'vitest';
import { WebSpeechNarrator } from '../src/adapters/web-speech-narrator';
import type { NarrationSegment } from '../src/core/types';

function createMockSpeech() {
  const spoken: Array<{
    text: string;
    rate: number;
    lang: string;
    onboundary: ((e: Partial<SpeechSynthesisEvent>) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: Partial<SpeechSynthesisErrorEvent>) => void) | null;
  }> = [];

  const synth = {
    speak: vi.fn((u: unknown) => {
      spoken.push(u as (typeof spoken)[number]);
    }),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => []),
  } as unknown as SpeechSynthesis;

  const factory = (text: string) =>
    ({
      text,
      rate: 1,
      lang: 'en-US',
      onboundary: null,
      onend: null,
      onerror: null,
    }) as unknown as SpeechSynthesisUtterance;

  return { synth, factory, spoken };
}

describe('WebSpeechNarrator', () => {
  const segments: NarrationSegment[] = [
    {
      id: 'GEN:1:1',
      citation: 'Genesis 1:1',
      text: 'In the beginning God created the heavens and the earth.',
      book: 'GEN',
      chapter: 1,
      verse: 1,
    },
    {
      id: 'GEN:1:2',
      citation: 'Genesis 1:2',
      text: 'The earth was formless and empty.',
      book: 'GEN',
      chapter: 1,
      verse: 2,
    },
  ];

  it('plays segments sequentially and resets to idle when finished', () => {
    const { synth, factory, spoken } = createMockSpeech();
    const narrator = new WebSpeechNarrator(synth, factory);

    narrator.play(segments, 0);
    expect(narrator.getState().status).toBe('playing');
    expect(narrator.getState().activeSegment?.id).toBe('GEN:1:1');
    expect(spoken.length).toBe(1);

    spoken[0]?.onend?.();
    expect(narrator.getState().activeSegment?.id).toBe('GEN:1:2');
    expect(spoken.length).toBe(2);

    spoken[1]?.onend?.();
    expect(narrator.getState().status).toBe('idle');
    expect(narrator.getState().activeSegment).toBeNull();
  });

  it('tracks word boundaries and infers missing word length', () => {
    const { synth, factory, spoken } = createMockSpeech();
    const narrator = new WebSpeechNarrator(synth, factory);

    narrator.play(segments, 0);
    spoken[0]?.onboundary?.({ name: 'word', charIndex: 7 });

    expect(narrator.getState().wordBoundary).toEqual({
      charIndex: 7,
      charLength: 9, // "beginning"
    });
  });

  it('ignores stale onend events after scrubbing to next segment', () => {
    const { synth, factory, spoken } = createMockSpeech();
    const narrator = new WebSpeechNarrator(synth, factory);

    narrator.play(segments, 0);
    const firstUtterance = spoken[0];

    narrator.next();
    expect(narrator.getState().activeSegment?.id).toBe('GEN:1:2');

    // Simulate browser firing async onend from cancelled utterance
    firstUtterance?.onend?.();
    expect(narrator.getState().status).toBe('playing');
    expect(narrator.getState().activeSegment?.id).toBe('GEN:1:2');
  });

  it('re-speaks from current word offset when rate is changed mid-verse', () => {
    const { synth, factory, spoken } = createMockSpeech();
    const narrator = new WebSpeechNarrator(synth, factory);

    narrator.play(segments, 0);
    spoken[0]?.onboundary?.({ name: 'word', charIndex: 17 }); // "God created..."

    narrator.setRate(1.5);
    expect(spoken.length).toBe(2);
    expect(spoken[1]?.text).toBe('God created the heavens and the earth.');
    expect(spoken[1]?.rate).toBe(1.5);

    spoken[1]?.onboundary?.({ name: 'word', charIndex: 4 }); // "created" in sliced string
    expect(narrator.getState().wordBoundary?.charIndex).toBe(21);
  });

  it('halts synthesis on pause() and resumes from the paused word offset', () => {
    const { synth, factory, spoken } = createMockSpeech();
    const narrator = new WebSpeechNarrator(synth, factory);

    narrator.play(segments, 0);
    spoken[0]?.onboundary?.({ name: 'word', charIndex: 17 }); // "God created..."

    narrator.pause();
    expect(narrator.getState().status).toBe('paused');
    expect(synth.cancel).toHaveBeenCalledTimes(1);

    // Stale onend fired by browser after cancel() must not advance to next verse
    spoken[0]?.onend?.();
    expect(narrator.getState().status).toBe('paused');
    expect(narrator.getState().activeSegment?.id).toBe('GEN:1:1');

    narrator.resume();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.resume).toHaveBeenCalled();
    expect(narrator.getState().status).toBe('playing');
    expect(spoken.length).toBe(2);
    expect(spoken[1]?.text).toBe('God created the heavens and the earth.');
  });

  it('cancels orphaned OS speech left running from a previous page load on init', () => {
    const { synth, factory } = createMockSpeech();
    (synth as { speaking?: boolean }).speaking = true;

    new WebSpeechNarrator(synth, factory);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('stops active speech when the page unloads (pagehide / beforeunload)', () => {
    const listeners: Record<string, Array<() => void>> = {};
    const origWindow = globalThis.window;
    globalThis.window = {
      addEventListener: vi.fn((event: string, cb: () => void) => {
        (listeners[event] ??= []).push(cb);
      }),
    } as unknown as Window & typeof globalThis;

    try {
      const { synth, factory } = createMockSpeech();
      const narrator = new WebSpeechNarrator(synth, factory);

      narrator.play(segments, 0);
      expect(narrator.getState().status).toBe('playing');
      expect(synth.cancel).toHaveBeenCalledTimes(0);

      // Simulate browser firing pagehide on tab refresh/close
      listeners['pagehide']?.forEach((cb) => cb());

      expect(synth.cancel).toHaveBeenCalledTimes(1);
      expect(narrator.getState().status).toBe('idle');
    } finally {
      globalThis.window = origWindow;
    }
  });
});



