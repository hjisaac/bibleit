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

  it('submits feedback message, category, and image attachment to contact service endpoint', async () => {
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

    // Attach a PNG image
    const fileInput = screen.getByLabelText('Attach screenshot') as HTMLInputElement;
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const imageFile = new File([pngBytes], 'bug-screen.png', { type: 'image/png' });
    Object.defineProperty(imageFile, 'arrayBuffer', {
      value: async () => pngBytes.buffer,
    });

    fireEvent.change(fileInput, { target: { files: [imageFile] } });
    expect(screen.getByText('bug-screen.png')).toBeTruthy();

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
    expect(formData.get('message')).toBe('Please add cross-reference footnotes.');
    expect(formData.get('name')).toBe('Isaac');
    expect(formData.get('email')).toBe('isaac@example.com');
    expect(formData.get('attachment')).toBeDefined();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Thank you! Your feedback has been sent.');
  });

  it('rejects non-image attachments with a helpful validation message', () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} onToast={vi.fn()} />);

    const fileInput = screen.getByLabelText('Attach screenshot') as HTMLInputElement;
    const badFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(
      screen.getByText(/Please select an image file \(PNG, JPG, WebP, or GIF\)\./i),
    ).toBeTruthy();
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
