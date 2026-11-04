import type { Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Playwright network fixtures: outage simulation and HAR cassette replay.
export async function simulateBackendOffline(page: Page): Promise<void> {
  await page.route('**/api/v1/search*', (route) => route.abort('connectionrefused'));
}

export function resolveCassettePath(nameOrPath: string): string {
  if (path.isAbsolute(nameOrPath)) return nameOrPath;
  const fileName = nameOrPath.endsWith('.har') ? nameOrPath : `${nameOrPath}.har`;
  return path.resolve(__dirname, '../cassettes', path.basename(fileName));
}

export async function useSearchCassette(
  page: Page,
  harPath: string,
  options: { update?: boolean } = {},
): Promise<void> {
  const resolved = resolveCassettePath(harPath);
  await page.routeFromHAR(resolved, {
    url: '**/api/v1/search*',
    update: options.update ?? !!process.env.RECORD_CASSETTES,
    updateContent: 'embed',
    notFound: 'abort',
  });
}
