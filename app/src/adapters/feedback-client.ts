export type FeedbackCategory = 'bug' | 'feature' | 'scripture' | 'general';

export interface FeedbackSubmission {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly name?: string;
  readonly email?: string;
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<void> {
  const destinationEmail = import.meta.env.VITE_FEEDBACK_EMAIL;
  if (!destinationEmail) {
    throw new Error('Missing VITE_FEEDBACK_EMAIL in environment');
  }

  const endpoint =
    import.meta.env.VITE_FEEDBACK_ENDPOINT || `https://formsubmit.co/ajax/${encodeURIComponent(destinationEmail)}`;

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
