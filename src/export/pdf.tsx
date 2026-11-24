import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Model } from '../ui/ExportPages';
import { ExportPages } from '../ui/ExportPages';

/** Renders the four sheets off-screen and writes them to an A4-landscape PDF, one page each. Fully offline. */
export async function exportPdf(m: Model, filename = 'اجندة-التدريب-القتالى.pdf'): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.className = 'export-host';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<ExportPages m={m} />));
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => r(null)));
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const pages = host.querySelectorAll<HTMLElement>('.paper');
    for (let i = 0; i < pages.length; i++) {
      const el = pages[i];
      const isPortrait = el.classList.contains('program-paper');
      const pageW = isPortrait ? 210 : 297;
      const pageH = isPortrait ? 297 : 210;
      const orient = isPortrait ? 'portrait' : 'landscape';

      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: false, logging: false });
      if (i > 0) pdf.addPage('a4', orient);

      // Fit proportionally within A4 bounds so no rows or footer are ever clipped
      const margin = 2;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
      const drawW = canvas.width * ratio;
      const drawH = canvas.height * ratio;
      const offsetX = (pageW - drawW) / 2;
      const offsetY = (pageH - drawH) / 2;

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', offsetX, offsetY, drawW, drawH);
    }
    pdf.save(filename);
  } finally {
    root.unmount();
    host.remove();
  }
}
