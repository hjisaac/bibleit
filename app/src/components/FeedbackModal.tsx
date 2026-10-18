import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  submitFeedback,
  type FeedbackCategory,
} from '../adapters/feedback-client';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}

const CATEGORIES: Array<{ id: FeedbackCategory; label: string; placeholder: string }> = [
  {
    id: 'bug',
    label: 'Bug Report',
    placeholder: 'What happened, and what did you expect instead? (e.g., Search or Reader issue)',
  },
  {
    id: 'feature',
    label: 'Feature Idea',
    placeholder: 'What feature or improvement would make bibleit more helpful for you?',
  },
  {
    id: 'scripture',
    label: 'Scripture / Text',
    placeholder: 'Which book, chapter, or verse has a formatting or reference issue?',
  },
  {
    id: 'general',
    label: 'General',
    placeholder: 'Share your thoughts, questions, or experience using bibleit...',
  },
];

export function FeedbackModal({
  isOpen,
  onClose,
  onToast,
}: FeedbackModalProps): JSX.Element | null {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isServerError, setIsServerError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]!;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsServerError(false);

    if (!message.trim()) {
      setErrorMsg('Please enter a message before sending.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitFeedback({
        category,
        message,
        name,
        email,
      });
      setMessage('');
      onClose();
      onToast('Thank you! Your feedback has been sent.');
    } catch {
      setIsServerError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send Feedback"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fadeIn overflow-hidden overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        class="w-full max-w-lg rounded-t-[28px] sm:rounded-2xl border p-5 sm:p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col overscroll-contain"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-main)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          class="flex items-center justify-between border-b pb-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2 class="font-serif text-lg font-semibold">Send Feedback & Report Bug</h2>
            <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
              Report an issue or suggest an improvement
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            class="p-1 rounded-full hover:opacity-70 text-xs"
            style={{ color: 'var(--text-muted)' }}
            title="Close feedback form"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div class="flex-1 overflow-y-auto overscroll-contain space-y-3.5 pr-1">
          {/* Category Select */}
          <div class="space-y-1.5">
            <label
              for="feedback-category"
              class="block text-xs font-semibold"
              style={{ color: 'var(--text-main)' }}
            >
              Category
            </label>
            <select
              id="feedback-category"
              value={category}
              onChange={(e) => setCategory((e.target as HTMLSelectElement).value as FeedbackCategory)}
              class="w-full p-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Message Input */}
          <div class="space-y-1.5">
            <label
              for="feedback-message"
              class="block text-xs font-semibold"
              style={{ color: 'var(--text-main)' }}
            >
              Details <span class="text-amber-600">*</span>
            </label>
            <textarea
              id="feedback-message"
              rows={4}
              required
              value={message}
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              placeholder={activeCategory.placeholder}
              class="w-full p-3 rounded-xl border text-xs leading-relaxed outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            />
          </div>

          {/* Optional Contact Fields */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div class="space-y-1.5">
              <label
                for="feedback-name"
                class="block text-xs font-semibold"
                style={{ color: 'var(--text-main)' }}
              >
                Name <span class="font-normal opacity-70">(optional)</span>
              </label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
                placeholder="Your name"
                class="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />
            </div>
            <div class="space-y-1.5">
              <label
                for="feedback-email"
                class="block text-xs font-semibold"
                style={{ color: 'var(--text-main)' }}
              >
                Email <span class="font-normal opacity-70">(optional, for follow-up)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="you@example.com"
                class="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />
            </div>
          </div>

          {errorMsg && !isServerError && (
            <div class="p-2.5 rounded-xl border text-xs bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {isServerError && (
            <div class="p-3 rounded-xl border text-xs bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400 space-y-1.5 leading-relaxed">
              <p class="font-semibold">Sorry, an issue occurred with the server.</p>
              <p class="text-[11px] opacity-90">
                You can email us directly at{' '}
                <a
                  href="mailto:hjisaach@gmail.com"
                  class="underline font-semibold hover:opacity-80"
                >
                  hjisaach@gmail.com
                </a>{' '}
                or create an issue on{' '}
                <a
                  href="https://github.com/hjisaac/bibleit/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline font-semibold hover:opacity-80"
                >
                  GitHub
                </a>.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          class="pt-3 border-t flex items-center justify-end shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="submit"
            disabled={isSubmitting || !message.trim()}
            class="px-4 py-1.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {isSubmitting ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
}
