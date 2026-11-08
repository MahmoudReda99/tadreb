import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Model } from '../ui/ExportPages';
import { ExportAllPages } from '../ui/ExportPages';

/**
 * Renders the full military training exam document to PDF:
 * - Instructions & Questions paper (Pages 1 & 2 in A4 Portrait)
 * - The four solved training sheets (Pages 3 to 6 in A4 Landscape)
 * 100% offline, zero external dependencies.
 */
export async function exportPdf(m: Model, filename = 'اجندة-التدريب-القتالى-كاملة.pdf'): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.className = 'export-host';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => root.render(<ExportAllPages m={m} />));
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => r(null)));

    const pages = Array.from(host.querySelectorAll<HTMLElement>('.paper'));
    if (pages.length === 0) return;

    const firstIsPortrait = pages[0].classList.contains('portrait-paper');
    const pdf = new jsPDF({
      orientation: firstIsPortrait ? 'portrait' : 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const isPortrait = p.classList.contains('portrait-paper');
      if (i > 0) {
        pdf.addPage('a4', isPortrait ? 'portrait' : 'landscape');
      }
      const canvas = await html2canvas(p, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: false,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (isPortrait) {
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      } else {
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      }
    }

    pdf.save(filename);
  } finally {
    root.unmount();
    host.remove();
  }
}
