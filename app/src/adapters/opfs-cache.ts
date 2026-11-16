export interface TransformersCache {
  match(request: string | Request): Promise<Response | undefined>;
  put(
    request: string | Request,
    response: Response,
    progressCallback?: (data: { loaded: number; total: number; progress: number }) => void,
  ): Promise<void>;
  delete?(request: string | Request): Promise<boolean>;
}

export function urlToOpfsFilename(urlOrKey: string): string {
  const stripped = urlOrKey.replace(/^https?:\/\/[^/]+\//, '');
  return stripped.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function getOpfsModelsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null;
  }
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('models', { create: true });
  } catch {
    return null;
  }
}

export class OpfsModelCache implements TransformersCache {
  async match(request: string | Request): Promise<Response | undefined> {
    const key = typeof request === 'string' ? request : request.url;
    const dir = await getOpfsModelsDir();
    if (!dir) return undefined;

    const filename = urlToOpfsFilename(key);
    try {
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      if (file.size === 0) return undefined;

      const headers = new Headers();
      headers.set('content-length', String(file.size));
      if (filename.endsWith('.json')) {
        headers.set('content-type', 'application/json');
      } else {
        headers.set('content-type', 'application/octet-stream');
      }

      return new Response(file, { headers });
    } catch {
      return undefined;
    }
  }

  async put(
    request: string | Request,
    response: Response,
    progressCallback?: (data: { loaded: number; total: number; progress: number }) => void,
  ): Promise<void> {
    const key = typeof request === 'string' ? request : request.url;
    const dir = await getOpfsModelsDir();
    if (!dir) throw new Error('OPFS not available');

    const filename = urlToOpfsFilename(key);
    const fileHandle = await dir.getFileHandle(filename, { create: true });

    // Stream directly to OPFS to avoid keeping large model files in JS heap.
    if ('createWritable' in fileHandle) {
      const writable = await fileHandle.createWritable();
      if (response.body) {
        const reader = response.body.getReader();
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          loaded += value.byteLength;
          if (progressCallback && total > 0) {
            progressCallback({
              loaded,
              total,
              progress: Math.min(Math.round((loaded / total) * 100), 100),
            });
          }
        }
        await writable.close();
      } else {
        const buf = await response.arrayBuffer();
        await writable.write(buf);
        await writable.close();
      }
    } else if ('createSyncAccessHandle' in fileHandle) {
      const accessHandle = await (fileHandle as any).createSyncAccessHandle();
      try {
        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accessHandle.write(value);
          }
        } else {
          const buf = await response.arrayBuffer();
          accessHandle.write(new Uint8Array(buf));
        }
        accessHandle.flush();
      } finally {
        accessHandle.close();
      }
    }
  }

  async delete(request: string | Request): Promise<boolean> {
    const key = typeof request === 'string' ? request : request.url;
    const dir = await getOpfsModelsDir();
    if (!dir) return false;

    const filename = urlToOpfsFilename(key);
    try {
      await dir.removeEntry(filename);
      return true;
    } catch {
      return false;
    }
  }
}
