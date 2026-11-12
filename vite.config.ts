import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      includeAssets: ['icons/*.png', 'vite.svg'],
      manifest: {
        name: 'منظومة أجندة التدريب القتالى',
        short_name: 'أجندة التدريب',
        description: 'حل أجندة التدريب القتالى وتصديرها بصيغة نموذج الامتحان — تعمل بدون إنترنت',
        lang: 'ar', dir: 'rtl', display: 'standalone',
        theme_color: '#14170F', background_color: '#14170F', start_url: '/', scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // precache core UI shell and assets (<2MB) so install completes in <1s
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,woff,woff2,json}'],
        globIgnores: ['**/tess/**'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // cache OCR wasm and language model on-demand or idle without blocking SW installation
            urlPattern: /\/tess\/.*|\.(?:wasm|traineddata)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-assets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
