import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'tess/*'],
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
        // precache every file, including the OCR worker, wasm core and the Arabic model
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,woff,woff2,wasm,traineddata,json}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
