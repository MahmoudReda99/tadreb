import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Model } from '../ui/ExportPages';
import { ExportPages } from '../ui/ExportPages';

/**
 * Exports the four sheets as a Microsoft Word document (.doc) in A4 Landscape, RTL,
 * with complete table formatting, Cairo/Arial font, and page breaks.
 * Fully offline, zero dependencies.
 */
export async function exportWord(m: Model, filename = 'اجندة-التدريب-القتالى.doc'): Promise<void> {
  const host = document.createElement('div');
  host.className = 'export-host';
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => root.render(<ExportPages m={m} />));
    const pages = Array.from(host.querySelectorAll<HTMLElement>('.paper'));
    const bodyContent = pages.map(p => p.innerHTML).join(
      '<br clear="all" style="page-break-before:always;mso-break-type:section-break" />\n'
    );

    const docHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>أجندة التدريب القتالى</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page Section1 {
  size: 297mm 210mm;
  mso-page-orientation: landscape;
  margin: 10mm 10mm 10mm 10mm;
  mso-header-margin: 0mm;
  mso-footer-margin: 0mm;
}
div.Section1 {
  page: Section1;
}
body {
  font-family: 'Cairo', 'Arial', sans-serif;
  direction: rtl;
  text-align: right;
  margin: 0;
  padding: 0;
}
.sheet {
  font-size: 11px;
  line-height: 1.35;
  direction: rtl;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.sheet-title {
  text-align: center;
  font-weight: bold;
  font-size: 14px;
  margin: 4px 0 10px;
}
.u {
  text-decoration: underline;
}
.mod {
  display: flex;
  justify-content: space-between;
  font-weight: bold;
  text-decoration: underline;
  font-size: 14px;
  margin-bottom: 8px;
}
table.grid {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 11px;
  direction: rtl;
}
table.grid th, table.grid td {
  border: 1px solid #000;
  padding: 3px 2px;
  text-align: center;
}
table.grid th {
  background-color: #e6e6e6;
  font-weight: bold;
}
.r, b.red {
  color: #d00000;
}
.band td {
  background-color: #f2f2f2;
  font-weight: bold;
}
.sub td {
  font-weight: bold;
  background-color: #fafafa;
}
.sub.grand td {
  font-weight: bold;
  background-color: #e8e8e8;
}
.notes {
  margin-top: 10px;
  font-weight: bold;
}
.chk {
  display: none !important;
}
</style>
</head>
<body>
<div class="Section1">
${bodyContent}
</div>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + docHtml], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    root.unmount();
    host.remove();
  }
}
