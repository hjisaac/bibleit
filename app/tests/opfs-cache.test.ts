import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpfsModelCache,
  urlToOpfsFilename,
} from '../src/adapters/opfs-cache';

describe('OpfsModelCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('urlToOpfsFilename', () => {
    it('sanitizes URL into safe OPFS filename while preserving extension', () => {
      const url =
        'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/onnx/model_q4.onnx';
      const filename = urlToOpfsFilename(url);
      expect(filename).toBe(
        'HuggingFaceTB_SmolLM2-360M-Instruct_resolve_main_onnx_model_q4.onnx',
      );
      expect(filename).not.toContain('/');
      expect(filename).not.toContain(':');
    });

    it('handles JSON configs and tokenizers cleanly', () => {
      const url =
        'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/tokenizer.json';
      expect(urlToOpfsFilename(url)).toBe(
        'HuggingFaceTB_SmolLM2-360M-Instruct_resolve_main_tokenizer.json',
      );
    });
  });

  describe('match', () => {
    it('returns undefined if OPFS storage is not supported or blocked', async () => {
      vi.stubGlobal('navigator', {});
      const cache = new OpfsModelCache();
      const res = await cache.match('https://huggingface.co/model.onnx');
      expect(res).toBeUndefined();
    });

    it('returns undefined if file is not found in OPFS', async () => {
      const mockDir = {
        getFileHandle: vi.fn(async () => {
          throw new Error('NotFound');
        }),
      };
      const mockRoot = {
        getDirectoryHandle: vi.fn(async () => mockDir),
      };
      vi.stubGlobal('navigator', {
        storage: { getDirectory: vi.fn(async () => mockRoot) },
      });

      const cache = new OpfsModelCache();
      const res = await cache.match('https://huggingface.co/model.onnx');
      expect(res).toBeUndefined();
    });

    it('returns undefined if file exists but is 0 bytes (aborted/corrupt download)', async () => {
      const mockFileHandle = {
        getFile: vi.fn(async () => ({ size: 0 })),
      };
      const mockDir = {
        getFileHandle: vi.fn(async () => mockFileHandle),
      };
      const mockRoot = {
        getDirectoryHandle: vi.fn(async () => mockDir),
      };
      vi.stubGlobal('navigator', {
        storage: { getDirectory: vi.fn(async () => mockRoot) },
      });

      const cache = new OpfsModelCache();
      const res = await cache.match('https://huggingface.co/model.onnx');
      expect(res).toBeUndefined();
    });

    it('returns Response with correct headers when valid file exists', async () => {
      const fileBytes = new Uint8Array([1, 2, 3, 4]);
      const mockFile = new Blob([fileBytes]);
      Object.defineProperty(mockFile, 'size', { value: 4 });

      const mockFileHandle = {
        getFile: vi.fn(async () => mockFile),
      };
      const mockDir = {
        getFileHandle: vi.fn(async () => mockFileHandle),
      };
      const mockRoot = {
        getDirectoryHandle: vi.fn(async () => mockDir),
      };
      vi.stubGlobal('navigator', {
        storage: { getDirectory: vi.fn(async () => mockRoot) },
      });

      const cache = new OpfsModelCache();
      const res = await cache.match('https://huggingface.co/model.onnx');
      expect(res).toBeDefined();
      expect(res?.headers.get('content-length')).toBe('4');
      expect(res?.headers.get('content-type')).toBe('application/octet-stream');
    });
  });

  describe('put', () => {
    it('streams response chunks directly to OPFS and reports progress', async () => {
      const writes: Uint8Array[] = [];
      const closeSpy = vi.fn();
      const mockWritable = {
        write: vi.fn(async (chunk) => {
          writes.push(chunk);
        }),
        close: closeSpy,
      };
      const mockFileHandle = {
        createWritable: vi.fn(async () => mockWritable),
      };
      const mockDir = {
        getFileHandle: vi.fn(async () => mockFileHandle),
      };
      const mockRoot = {
        getDirectoryHandle: vi.fn(async () => mockDir),
      };
      vi.stubGlobal('navigator', {
        storage: { getDirectory: vi.fn(async () => mockRoot) },
      });

      const chunk1 = new Uint8Array([10, 20]);
      const chunk2 = new Uint8Array([30, 40]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });

      const response = new Response(stream, {
        headers: { 'content-length': '4' },
      });

      const progressSpy = vi.fn();
      const cache = new OpfsModelCache();
      await cache.put('https://huggingface.co/model.onnx', response, progressSpy);

      expect(writes).toHaveLength(2);
      expect(closeSpy).toHaveBeenCalled();
      expect(progressSpy).toHaveBeenCalledWith(
        expect.objectContaining({ loaded: 4, total: 4, progress: 100 }),
      );
    });
  });

  describe('delete', () => {
    it('removes the file entry from OPFS directory', async () => {
      const removeEntrySpy = vi.fn();
      const mockDir = {
        removeEntry: removeEntrySpy,
      };
      const mockRoot = {
        getDirectoryHandle: vi.fn(async () => mockDir),
      };
      vi.stubGlobal('navigator', {
        storage: { getDirectory: vi.fn(async () => mockRoot) },
      });

      const cache = new OpfsModelCache();
      const deleted = await cache.delete('https://huggingface.co/model.onnx');

      expect(deleted).toBe(true);
      expect(removeEntrySpy).toHaveBeenCalledWith(
        'model.onnx',
      );
    });
  });
});
