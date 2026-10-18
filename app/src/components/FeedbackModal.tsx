import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  fileToAttachment,
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

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function FeedbackModal({
  isOpen,
  onClose,
  onToast,
}: FeedbackModalProps): JSX.Element | null {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!attachedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachedFile]);

  if (!isOpen) return null;

  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]!;

  const handleSelectFile = (file: File | null | undefined) => {
    setErrorMsg(null);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file (PNG, JPG, WebP, or GIF).');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg('Image must be smaller than 5 MB.');
      return;
    }
    setAttachedFile(file);
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleSelectFile(file);
          break;
        }
      }
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!message.trim()) {
      setErrorMsg('Please enter a message before sending.');
      return;
    }

    setIsSubmitting(true);
    try {
      const attachment = attachedFile ? await fileToAttachment(attachedFile) : undefined;
      await submitFeedback({
        category,
        message,
        name,
        email,
        attachment,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Feedback delivery issue:', err);
      }
      if (typeof window !== 'undefined' && window.Sentry?.captureException) {
        window.Sentry.captureException(err);
      }
    } finally {
      setIsSubmitting(false);
      setMessage('');
      setAttachedFile(null);
      onClose();
      onToast('Thank you! Your feedback has been sent.');
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
      onPaste={(e) => handlePaste(e as unknown as ClipboardEvent)}
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
              Report an issue, attach a screenshot, or suggest an improvement
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

          {/* Picture / Screenshot Attachment */}
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                Screenshot or Picture <span class="font-normal opacity-70">(optional)</span>
              </label>
              <span class="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                PNG, JPG, WebP up to 5 MB · Or paste image
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-label="Attach screenshot"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                handleSelectFile(file);
              }}
            />

            {!attachedFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="w-full py-2.5 px-3 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs transition-opacity hover:opacity-80"
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>Attach a screenshot or photo</span>
              </button>
            ) : (
              <div
                class="p-2.5 rounded-xl border flex items-center justify-between gap-3"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Attachment preview"
                      class="w-10 h-10 rounded-lg object-cover border shrink-0"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    />
                  )}
                  <div class="min-w-0">
                    <p
                      class="text-xs font-medium truncate"
                      style={{ color: 'var(--text-main)' }}
                    >
                      {attachedFile.name}
                    </p>
                    <p class="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                      {(attachedFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  class="px-2 py-1 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:opacity-75 shrink-0"
                  title="Remove image"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Optional Contact Fields */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div class="space-y-1">
              <label
                for="feedback-name"
                class="block text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Name (optional)
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
            <div class="space-y-1">
              <label
                for="feedback-email"
                class="block text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Email (optional, for follow-up)
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

          {errorMsg && (
            <div class="p-2.5 rounded-xl border text-xs bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400">
              {errorMsg}
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
