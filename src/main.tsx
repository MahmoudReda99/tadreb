import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/cairo/arabic-900.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/latin-700.css';
import '@fontsource/cairo/latin-900.css';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] محتوى جديد متاح');
  },
  onOfflineReady() {
    console.log('[PWA] التطبيق جاهز تماماً للعمل بدون إنترنت');
  },
  onRegisterError(error) {
    console.warn('[PWA] خطأ في تسجيل Service Worker:', error);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
