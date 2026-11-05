import { describe, it, expect } from 'vitest';
import { formatCitation, renderChunk, type Chunk } from '@bibleit/engine';

describe('renderers', () => {
  describe('formatCitation', () => {
    it('formats a single verse citation with canonical book name', () => {
      expect(formatCitation('JHN', [3, 16], [3, 16])).toBe('John 3:16');
    });

    it('formats a multi-verse range in the same chapter', () => {
      expect(formatCitation('JHN', [3, 16], [3, 18])).toBe('John 3:16–18');
    });

    it('formats a cross-chapter verse range', () => {
      expect(formatCitation('GEN', [1, 31], [2, 3])).toBe('Genesis 1:31–2:3');
    });

    it('accepts a chunk object overload', () => {
      const chunk = { book: 'MRK', start: [1, 1] as [number, number], end: [1, 3] as [number, number] };
      expect(formatCitation(chunk)).toBe('Mark 1:1–3');
    });

    it('falls back to bookId when book name is unrecognized', () => {
      expect(formatCitation('UNKNOWN_BOOK', [1, 1], [1, 2])).toBe('UNKNOWN_BOOK 1:1–2');
    });
  });

  describe('renderChunk', () => {
    it('renders a chunk with citation and pericope heading', () => {
      const chunk: Chunk = {
        book: 'JHN',
        start: [3, 16],
        end: [3, 17],
        headings: [[3, 16, 'For God So Loved the World']],
        text: 'For God so loved the world...',
      };

      const rendered = renderChunk(chunk);
      expect(rendered).toBe('[John 3:16–17] For God So Loved the World\nFor God so loved the world...');
    });

    it('renders a chunk without heading cleanly', () => {
      const chunk: Chunk = {
        book: 'GEN',
        start: [1, 1],
        end: [1, 1],
        text: 'In the beginning...',
      };

      const rendered = renderChunk(chunk);
      expect(rendered).toBe('[Genesis 1:1]\nIn the beginning...');
    });
  });
});
