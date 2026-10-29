/// <reference types="vitest" />
import { execSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const commitHash =
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
    process.env.GITHUB_SHA?.slice(0, 7) ||
    (() => {
      try {
        return execSync('git rev-parse --short HEAD').toString().trim();
      } catch {
        return 'dev';
      }
    })();

  if (command === 'build') {
    const requiredVars = ['VITE_FEEDBACK_EMAIL', 'VITE_CLOUDFLARE_R2_URL'];
    const missing = requiredVars.filter((key) => !env[key]?.trim());
    if (missing.length > 0) {
      throw new Error(`[Build Failure] Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  const isDev = command === 'serve' && mode === 'development';
  let sslPlugin: any[] = [];
  if (isDev) {
    try {
      const basicSsl = (await import('@vitejs/plugin-basic-ssl')).default;
      sslPlugin = [basicSsl()];
    } catch {
      // @vitejs/plugin-basic-ssl not yet installed; gracefully fall back to HTTP
    }
  }

  return {
    base: process.env.BASE_URL || '/',
    resolve: {
      alias: {
        '@bibleit/engine': path.resolve(__dirname, '../engine/src/index.ts'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __COMMIT_HASH__: JSON.stringify(commitHash),
    },
    plugins: [
      ...sslPlugin,
      preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'bibleit',
        short_name: 'bibleit',
        description: 'Offline-first Bible search PWA with hybrid retrieval',
        theme_color: '#FBFBF9',
        background_color: '#FBFBF9',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
    // Exclude heavy WASM binary (>25MB) so Cloudflare Pages deployment succeeds (served from R2).
    {
      name: 'exclude-heavy-wasm',
      generateBundle(_options, bundle) {
        for (const fileName of Object.keys(bundle)) {
          if (fileName.endsWith('.wasm')) {
            delete bundle[fileName];
          }
        }
      },
    },
  ],
  server: {
    port: 3000,
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    env: {
      VITE_FEEDBACK_EMAIL: 'test-feedback@example.com',
      VITE_CLOUDFLARE_R2_URL: 'https://test-r2.dev/',
    },
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
};
});

