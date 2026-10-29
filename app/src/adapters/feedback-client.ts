export type FeedbackCategory = 'bug' | 'feature' | 'scripture' | 'general';

export interface FeedbackSubmission {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly name?: string;
  readonly email?: string;
}

function getFeedbackEmail(): string {
  return (import.meta.env.VITE_FEEDBACK_EMAIL || '').trim();
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<void> {
  const email = getFeedbackEmail();
  if (!email) {
    throw new Error('Feedback service unconfigured: missing VITE_FEEDBACK_EMAIL');
  }
  const endpoint = `https://formsubmit.co/ajax/${email}`;

  const formData = new FormData();
  formData.append('_subject', `[bibleit] ${submission.category.toUpperCase()}: ${submission.message.slice(0, 60)}`);
  formData.append('_captcha', 'false');
  formData.append('_template', 'table');
  formData.append('category', submission.category);
  formData.append('message', submission.message.trim());

  if (submission.name?.trim()) {
    formData.append('name', submission.name.trim());
  }
  if (submission.email?.trim()) {
    formData.append('email', submission.email.trim());
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || (data && (data.success === false || data.success === 'false'))) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }
}
