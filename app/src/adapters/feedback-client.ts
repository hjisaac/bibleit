export type FeedbackCategory = 'bug' | 'feature' | 'scripture' | 'general';

export interface FeedbackSubmission {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly name?: string;
  readonly email?: string;
  readonly attachment?: {
    readonly filename: string;
    readonly data: Uint8Array;
    readonly contentType: string;
  };
}

export async function fileToAttachment(file: File): Promise<{
  filename: string;
  data: Uint8Array;
  contentType: string;
}> {
  const buffer = await file.arrayBuffer();
  return {
    filename: file.name || 'screenshot.png',
    data: new Uint8Array(buffer),
    contentType: file.type || 'image/png',
  };
}

// In-memory crash ring buffer: captures unhandled runtime crashes to attach to bug reports
interface CrashRecord {
  readonly message: string;
  readonly stack?: string;
  readonly time: string;
}

const crashBuffer: CrashRecord[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    const message = e.error?.message || e.message || 'Unknown window error';
    const stack = e.error?.stack;
    crashBuffer.push({ message, stack, time: new Date().toISOString() });
    if (crashBuffer.length > 3) crashBuffer.shift();
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection');
    const stack = reason instanceof Error ? reason.stack : undefined;
    crashBuffer.push({ message, stack, time: new Date().toISOString() });
    if (crashBuffer.length > 3) crashBuffer.shift();
  });
}

export function getRecentCrashes(): readonly CrashRecord[] {
  return crashBuffer;
}

function createFormData(
  submission: FeedbackSubmission,
  includeAttachment: boolean,
): FormData {
  const formData = new FormData();
  formData.append('_subject', `[bibleit] ${submission.category.toUpperCase()}: ${submission.message.slice(0, 60)}`);
  formData.append('_captcha', 'false');
  formData.append('_template', 'table');
  formData.append('category', submission.category);

  let detailedMessage = submission.message.trim();
  if (submission.category === 'bug' && crashBuffer.length > 0) {
    detailedMessage +=
      '\n\n--- Diagnostics (Recent Errors) ---\n' +
      crashBuffer.map((c) => `[${c.time}] ${c.message}${c.stack ? `\n${c.stack}` : ''}`).join('\n\n');
  }
  if (!includeAttachment && submission.attachment) {
    detailedMessage += `\n\n[Attachment: ${submission.attachment.filename} (${(submission.attachment.data.length / 1024).toFixed(0)} KB omitted in text retry)]`;
  }
  formData.append('message', detailedMessage);

  if (submission.name?.trim()) {
    formData.append('name', submission.name.trim());
  }
  if (submission.email?.trim()) {
    formData.append('email', submission.email.trim());
  }

  if (typeof window !== 'undefined') {
    formData.append('page_url', window.location.href);
    formData.append('user_agent', navigator.userAgent);
  }

  if (includeAttachment && submission.attachment) {
    const blob = new Blob([submission.attachment.data.buffer as ArrayBuffer], {
      type: submission.attachment.contentType,
    });
    formData.append('attachment', blob, submission.attachment.filename);
  }

  return formData;
}

declare global {
  interface Window {
    Sentry?: {
      captureException?: (error: unknown, captureContext?: Record<string, unknown>) => string;
      captureMessage?: (message: string) => string;
    };
  }
}

function logFeedbackIssue(error: unknown, context?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.error('Feedback delivery issue:', error);
  }
  if (typeof window !== 'undefined' && window.Sentry?.captureException) {
    window.Sentry.captureException(error, { extra: context });
  }
}

interface DeliveryOptions {
  readonly includeAttachment: boolean;
}

async function postFeedbackPayload(
  endpoint: string,
  submission: FeedbackSubmission,
  options: DeliveryOptions,
): Promise<Response> {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: createFormData(submission, options.includeAttachment),
  });
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  const destinationEmail = import.meta.env.VITE_FEEDBACK_EMAIL;
  if (!destinationEmail) {
    logFeedbackIssue(new Error('Missing VITE_FEEDBACK_EMAIL in environment'));
    return;
  }

  const endpoint =
    import.meta.env.VITE_FEEDBACK_ENDPOINT || `https://formsubmit.co/ajax/${encodeURIComponent(destinationEmail)}`;

  const hasAttachment = Boolean(submission.attachment);

  try {
    let response = await postFeedbackPayload(endpoint, submission, { includeAttachment: hasAttachment });

    // If attachment caused rejection, retry with text details only
    if (!response.ok && hasAttachment) {
      response = await postFeedbackPayload(endpoint, submission, { includeAttachment: false });
    }

    const data = await response.json().catch(() => null);
    if (!response.ok || (data && (data.success === false || data.success === 'false'))) {
      const errorMsg = data?.message || `HTTP ${response.status}`;
      logFeedbackIssue(new Error(`Feedback submission rejected: ${errorMsg}`), { category: submission.category });
    }
  } catch (networkError) {
    // If initial attempt with attachment threw network error, attempt text-only fallback
    if (hasAttachment) {
      try {
        const fallbackResponse = await postFeedbackPayload(endpoint, submission, { includeAttachment: false });
        if (!fallbackResponse.ok) {
          logFeedbackIssue(new Error(`Fallback text-only submission failed (HTTP ${fallbackResponse.status})`));
        }
      } catch (fallbackError) {
        logFeedbackIssue(fallbackError, { phase: 'text_fallback', category: submission.category });
      }
    } else {
      logFeedbackIssue(networkError, { category: submission.category });
    }
  }
}
