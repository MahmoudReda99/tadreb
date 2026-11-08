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
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: false, logging: false });
      if (i > 0) pdf.addPage('a4', 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);
    }
    pdf.save(filename);
  } finally {
    root.unmount();
    host.remove();
  }
}
