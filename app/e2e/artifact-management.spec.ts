import { test, expect } from '@playwright/test';

test.describe('Artifact Management & OPFS Storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(async () => {
      localStorage.setItem('bibleit_active_tab', 'settings');
      // Ensure pristine OPFS state before each test run
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        for await (const name of (root as any).keys?.() ?? []) {
          try {
            await root.removeEntry(name);
          } catch {
            // Ignore removal errors during cleanup
          }
        }
      }
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('downloads and verifies Scripture text, stores compressed in OPFS, and allows clearing', async ({ page }) => {
    // Verify initial clean state
    const downloadBtn = page.getByRole('button', { name: 'Download (1.2 MB)' });
    const clearBtn = page.getByRole('button', { name: 'Free Up Local Space (Clear Artifacts)' });
    await expect(downloadBtn).toBeVisible();
    await expect(clearBtn).toBeDisabled();
    await expect(page.getByText('0 MB cached')).toBeVisible();

    // Trigger download & canonical verification
    await downloadBtn.click();

    // Wait for download, SHA-256 verification, and OPFS storage
    const installedBadge = page.getByText('✓ Installed');
    await expect(installedBadge).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('1.2 MB in OPFS')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-download' })).toBeVisible();
    await expect(clearBtn).toBeEnabled();

    // Verify browser OPFS directly has compressed .gz bytes (~1.2 MB)
    const opfsFile = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('verses-v3.json.gz');
      const file = await handle.getFile();
      const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      return {
        name: file.name,
        size: file.size,
        isGzip: header[0] === 0x1f && header[1] === 0x8b,
      };
    });

    expect(opfsFile.name).toBe('verses-v3.json.gz');
    expect(opfsFile.size).toBeGreaterThan(1_000_000);
    expect(opfsFile.size).toBeLessThan(2_000_000);
    expect(opfsFile.isGzip).toBe(true);

    // Scroll Settings container to top so headroom restores navbar
    await page.locator('section').filter({ hasText: 'Settings' }).evaluate((el) => {
      el.scrollTo({ top: 0, behavior: 'instant' });
      el.dispatchEvent(new Event('scroll'));
    });

    // Switch to Reader view via navigation bar
    const readerNavBtn = page.getByRole('navigation').getByRole('button', { name: 'Reader' });
    await expect(readerNavBtn).toBeVisible();
    await readerNavBtn.click();
    await expect(page.getByRole('heading', { name: 'Genesis Chapter 1' })).toBeVisible();
    await expect(page.locator('#verse-1')).toBeVisible();

    // Return to Settings and clear storage with two-step confirmation
    await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Free Up Local Space (Clear Artifacts)' }).click();
    await expect(page.getByText('Delete all local offline data?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, Delete All' }).click();

    // Verify UI resets to clean state
    await expect(page.getByRole('button', { name: 'Download (1.2 MB)' })).toBeVisible();
    await expect(page.getByText('0 MB cached')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Free Up Local Space (Clear Artifacts)' })).toBeDisabled();

    // Verify file is purged from OPFS
    const remainingFiles = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const name of (root as any).keys?.() ?? []) {
        names.push(name);
      }
      return names;
    });
    expect(remainingFiles).not.toContain('verses-v3.json.gz');
  });
});
