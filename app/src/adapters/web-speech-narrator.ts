import type { AudioNarrator } from '../core/ports';
import type { NarrationSegment, NarrationState } from '../core/types';

function inferWordLength(text: string, charIndex: number, reportedLength?: number): number {
  if (reportedLength && reportedLength > 0) return reportedLength;
  const rest = text.slice(charIndex);
  const match = rest.match(/^\S+/);
  return match ? match[0].length : 0;
}

export class WebSpeechNarrator implements AudioNarrator {
  private readonly synth: SpeechSynthesis | undefined;
  private readonly createUtterance: (text: string) => SpeechSynthesisUtterance;
  private readonly isNativeSynth: boolean;
  private readonly listeners = new Set<(state: NarrationState) => void>();

  // Strong reference prevents Chromium/WebKit from garbage-collecting active utterances mid-speech.
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  // Monotonic token guards against async onend/onerror firing after synth.cancel().
  private utteranceToken = 0;
  // Saved character offset for deterministic pause/resume where native synth.pause() is broken (Linux/Android/Chrome).
  private pausedCharOffset = 0;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;

  private state: NarrationState = {
    status: 'idle',
    queue: [],
    currentIndex: -1,
    activeSegment: null,
    wordBoundary: null,
    rate: 1,
  };

  constructor(
    synth?: SpeechSynthesis,
    utteranceFactory?: (text: string) => SpeechSynthesisUtterance,
  ) {
    this.isNativeSynth = !synth;
    this.synth =
      synth ??
      (typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis
        : undefined);
    this.createUtterance =
      utteranceFactory ?? ((text: string) => new SpeechSynthesisUtterance(text));

    // Halt any orphaned OS speech left running from a previous page reload.
    if (this.synth && (this.synth.speaking || this.synth.pending)) {
      this.synth.cancel();
    }

    // Stop OS speech daemon when the user refreshes, navigates away, or closes the tab.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const handlePageUnload = () => this.stop();
      window.addEventListener('pagehide', handlePageUnload);
      window.addEventListener('beforeunload', handlePageUnload);
    }
  }

  get supported(): boolean {
    return Boolean(
      this.synth && (typeof SpeechSynthesisUtterance !== 'undefined' || this.createUtterance),
    );
  }

  getState(): NarrationState {
    return this.state;
  }

  subscribe(listener: (state: NarrationState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(segments: NarrationSegment[], startIndex = 0): void {
    if (!this.synth || segments.length === 0) return;
    const shouldCancel = this.state.status === 'playing' || Boolean(this.synth.speaking);
    const boundedIndex = Math.max(0, Math.min(startIndex, segments.length - 1));
    this.pausedCharOffset = 0;
    this.state = {
      ...this.state,
      status: 'playing',
      queue: segments,
      currentIndex: boundedIndex,
      activeSegment: segments[boundedIndex] ?? null,
      wordBoundary: null,
    };
    this.emit();
    this.speakCurrentSegment(0, shouldCancel);
  }

  pause(): void {
    if (!this.synth || this.state.status !== 'playing') return;
    this.utteranceToken++;
    this.clearSpeakTimer();
    this.pausedCharOffset = this.state.wordBoundary?.charIndex ?? this.pausedCharOffset;
    this.currentUtterance = null;
    // Native synth.pause() is a no-op on Linux speech-dispatcher and Chrome network voices; cancel() halts immediately.
    this.synth.cancel();
    this.state = { ...this.state, status: 'paused' };
    this.emit();
  }

  resume(): void {
    if (!this.synth || this.state.status !== 'paused') return;
    this.state = { ...this.state, status: 'playing' };
    this.emit();
    // Do not call synth.cancel() here; pause() already cancelled, and synchronous cancel()+speak() drops audio in Chromium.
    this.speakCurrentSegment(this.pausedCharOffset, false);
  }

  stop(): void {
    this.utteranceToken++;
    this.clearSpeakTimer();
    this.pausedCharOffset = 0;
    this.currentUtterance = null;
    this.synth?.cancel();
    if (this.state.status === 'idle' && this.state.queue.length === 0) return;
    this.state = {
      ...this.state,
      status: 'idle',
      queue: [],
      currentIndex: -1,
      activeSegment: null,
      wordBoundary: null,
    };
    this.emit();
  }

  next(): void {
    if (this.state.queue.length === 0) return;
    const nextIdx = this.state.currentIndex + 1;
    if (nextIdx >= this.state.queue.length) {
      this.stop();
      return;
    }
    this.seekToIndex(nextIdx);
  }

  prev(): void {
    if (this.state.queue.length === 0) return;
    const prevIdx = Math.max(0, this.state.currentIndex - 1);
    this.seekToIndex(prevIdx);
  }

  seekToIndex(index: number): void {
    if (!this.synth || this.state.queue.length === 0) return;
    const shouldCancel = this.state.status === 'playing' || Boolean(this.synth.speaking);
    const bounded = Math.max(0, Math.min(index, this.state.queue.length - 1));
    this.pausedCharOffset = 0;
    this.state = {
      ...this.state,
      status: 'playing',
      currentIndex: bounded,
      activeSegment: this.state.queue[bounded] ?? null,
      wordBoundary: null,
    };
    this.emit();
    this.speakCurrentSegment(0, shouldCancel);
  }

  setRate(rate: number): void {
    const clamped = Math.max(0.5, Math.min(2, rate));
    if (clamped === this.state.rate) return;
    const charOffset = this.state.wordBoundary?.charIndex ?? this.pausedCharOffset;
    const wasPlaying = this.state.status === 'playing';
    this.state = { ...this.state, rate: clamped };
    this.emit();

    // Web Speech API ignores rate mutations on in-flight utterances; re-speak from current word.
    if (wasPlaying && this.state.activeSegment) {
      this.speakCurrentSegment(charOffset, true);
    }
  }

  private clearSpeakTimer(): void {
    if (this.speakTimer !== null) {
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }
  }

  private speakCurrentSegment(charOffset = 0, shouldCancelFirst = false): void {
    const segment = this.state.activeSegment;
    if (!this.synth || !segment) return;

    const token = ++this.utteranceToken;
    this.clearSpeakTimer();

    if (shouldCancelFirst) {
      this.synth.cancel();
    }

    const safeOffset =
      charOffset > 0 && charOffset < segment.text.length ? charOffset : 0;
    const textSlice = safeOffset > 0 ? segment.text.slice(safeOffset) : segment.text;
    if (!textSlice.trim()) {
      this.advanceFrom(token);
      return;
    }

    const startSpeech = () => {
      if (token !== this.utteranceToken || !this.synth) return;

      const utterance = this.createUtterance(textSlice);
      this.currentUtterance = utterance;
      utterance.rate = this.state.rate;
      utterance.lang = 'en-US';

      const preferredVoice = this.pickOfflineEnglishVoice();
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (token !== this.utteranceToken) return;
        if (event.name && event.name !== 'word') return;
        const charIndex = safeOffset + (event.charIndex ?? 0);
        const charLength = inferWordLength(segment.text, charIndex, event.charLength);
        this.pausedCharOffset = charIndex;
        this.state = {
          ...this.state,
          wordBoundary: { charIndex, charLength },
        };
        this.emit();
      };

      utterance.onend = () => {
        if (token !== this.utteranceToken) return;
        this.advanceFrom(token);
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (token !== this.utteranceToken) return;
        if (event.error === 'canceled' || event.error === 'interrupted') return;
        this.stop();
      };

      // Clear any sticky paused state in Blink before enqueuing the utterance.
      if (typeof this.synth.resume === 'function') {
        this.synth.resume();
      }
      this.synth.speak(this.currentUtterance);
    };

    // On Linux/Windows Chromium, synchronous cancel() + speak() in the same turn aborts the new utterance.
    if (shouldCancelFirst && this.isNativeSynth) {
      this.speakTimer = setTimeout(() => {
        this.speakTimer = null;
        startSpeech();
      }, 40);
    } else {
      startSpeech();
    }
  }

  private advanceFrom(token: number): void {
    if (token !== this.utteranceToken) return;
    const nextIdx = this.state.currentIndex + 1;
    if (nextIdx < this.state.queue.length) {
      this.pausedCharOffset = 0;
      this.state = {
        ...this.state,
        status: 'playing',
        currentIndex: nextIdx,
        activeSegment: this.state.queue[nextIdx] ?? null,
        wordBoundary: null,
      };
      this.emit();
      this.speakCurrentSegment(0, false);
    } else {
      this.stop();
    }
  }

  private pickOfflineEnglishVoice(): SpeechSynthesisVoice | undefined {
    if (!this.synth || typeof this.synth.getVoices !== 'function') return undefined;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return undefined;
    return (
      voices.find((v) => v.localService && v.lang.toLowerCase().startsWith('en')) ??
      voices.find((v) => v.lang.toLowerCase().startsWith('en'))
    );
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
