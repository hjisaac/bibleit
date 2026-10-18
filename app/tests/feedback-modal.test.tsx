import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { FeedbackModal } from '../src/components/FeedbackModal';
import { HelpModal } from '../src/components/HelpModal';

describe('FeedbackModal & Entry Points', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    if (typeof URL.createObjectURL === 'undefined') {
      URL.createObjectURL = vi.fn(() => 'blob:preview');
      URL.revokeObjectURL = vi.fn();
    }
  });

  it('submits feedback message, category, and contact info to contact service endpoint', async () => {
    const onClose = vi.fn();
    const onToast = vi.fn();

    render(<FeedbackModal isOpen={true} onClose={onClose} onToast={onToast} />);

    // Select "Feature Idea" category via dropdown
    fireEvent.change(screen.getByLabelText(/Category/i), {
      target: { value: 'feature' },
    });

    // Fill message, name, and email
    fireEvent.input(screen.getByLabelText(/Details/i), {
      target: { value: 'Please add cross-reference footnotes.' },
    });
    fireEvent.input(screen.getByLabelText(/Name/i), {
      target: { value: 'Isaac' },
    });
    fireEvent.input(screen.getByLabelText(/Email/i), {
      target: { value: 'isaac@example.com' },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('formsubmit.co/ajax/');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);

    const formData = init.body as FormData;
    expect(formData.get('category')).toBe('feature');
    expect(String(formData.get('message'))).toBe('Please add cross-reference footnotes.');
    expect(formData.get('name')).toBe('Isaac');
    expect(formData.get('email')).toBe('isaac@example.com');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onToast).toHaveBeenCalledWith('Thank you! Your feedback has been sent.');
    });
  });

  it('disables submit button when message is empty', () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} onToast={vi.fn()} />);
    const submitBtn = screen.getByRole('button', { name: 'Send Feedback' }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('opens FeedbackModal from HelpModal footer button', () => {
    const onClose = vi.fn();
    const onOpenFeedback = vi.fn();

    render(<HelpModal isOpen={true} onClose={onClose} onOpenFeedback={onOpenFeedback} />);

    fireEvent.click(screen.getByRole('button', { name: /Send Feedback/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenFeedback).toHaveBeenCalledTimes(1);
  });
});
