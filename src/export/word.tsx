import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Model } from '../ui/ExportPages';
import { ExportAllPages } from '../ui/ExportPages';

/**
 * Exports the complete military training exam document as a Microsoft Word document (.doc)
 * matching the Egyptian Armed Forces Signal Corps official specification:
 * - Pages 1 & 2: Exam Questions & Instructions Paper (A4 Portrait)
 * - Pages 3 to 6: The four solved training sheets (A4 Landscape)
 * 100% offline, zero external dependencies.
 */
export async function exportWord(
  m: Model,
  filename = 'اجندة-التدريب-القتالى-كاملة.doc'
): Promise<void> {
  const host = document.createElement('div');
  host.className = 'export-host';
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => root.render(<ExportAllPages m={m} />));
    const pages = Array.from(host.querySelectorAll<HTMLElement>('.paper'));
    if (pages.length < 6) return;

    // Portrait pages: Page 1 and Page 2
    const portraitPagesHtml = [pages[0], pages[1]].map(p => `
<div class="page-outer">
  <div class="frame-portrait">
    ${p.innerHTML}
  </div>
</div>`).join('\n<br clear="all" style="page-break-before:always" />\n');

    // Landscape pages: Pages 3, 4, 5, 6
    const landscapePagesHtml = [pages[2], pages[3], pages[4], pages[5]].map(p => `
<div class="page-outer">
  <div class="frame-landscape">
    ${p.innerHTML}
  </div>
</div>`).join('\n<br clear="all" style="page-break-before:always" />\n');

    const docHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40' dir='rtl'>
<head>
<meta charset='utf-8'>
<title>${m.inst.courseName || 'أجندة التدريب القتالى'}</title>
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
@page SectionPortrait {
  size: 210mm 297mm;
  mso-page-orientation: portrait;
  margin: 10mm 12mm 10mm 12mm;
  mso-header-margin: 0mm;
  mso-footer-margin: 0mm;
}
div.SectionPortrait {
  page: SectionPortrait;
}
@page SectionLandscape {
  size: 297mm 210mm;
  mso-page-orientation: landscape;
  margin: 6mm 8mm 6mm 8mm;
  mso-header-margin: 0mm;
  mso-footer-margin: 0mm;
}
div.SectionLandscape {
  page: SectionLandscape;
}

body {
  font-family: 'Cairo', 'Traditional Arabic', 'Arial', sans-serif;
  direction: rtl;
  text-align: right;
  margin: 0;
  padding: 0;
  color: #000000;
  background-color: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page-outer {
  width: 100%;
  margin: 0 auto;
}

/* Authentic military double border */
.frame-portrait {
  border: 4.5pt double #000000;
  padding: 12pt 16pt;
  min-height: 260mm;
  box-sizing: border-box;
}

.frame-landscape {
  border: 4.5pt double #000000;
  padding: 8pt 10pt;
  min-height: 185mm;
  box-sizing: border-box;
}

.sheet {
  font-size: 11pt;
  line-height: 1.35;
  direction: rtl;
}

.sheet-head {
  display: block;
  position: relative;
  margin-bottom: 6pt;
  text-align: center;
}

.sheet-head .grade {
  position: absolute;
  left: 0;
  top: 0;
  font-weight: bold;
  text-decoration: underline;
  font-size: 13pt;
}

.sheet-title {
  text-align: center;
  font-weight: bold;
  font-size: 13pt;
  margin: 2pt 0 8pt;
}

.sheet-title.c {
  margin: 4pt 0 8pt;
}

.u {
  text-decoration: underline;
}

.mod {
  display: block;
  position: relative;
  font-weight: bold;
  text-decoration: underline;
  font-size: 13pt;
  margin-bottom: 6pt;
  min-height: 38pt;
}

.mod > span:first-child {
  float: right;
}

.mod > span:last-child {
  float: left;
  text-align: left;
}

/* Tables */
table.grid {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 10pt;
  direction: rtl;
  margin-bottom: 6pt;
}

table.grid th, table.grid td {
  border: 1pt solid #000000;
  padding: 2.5pt 1.5pt;
  text-align: center;
  vertical-align: middle;
}

table.grid th {
  background-color: #e6e6e6;
  font-weight: bold;
}

.r, b.red, span.r, td.r {
  color: #d00000 !important;
  font-weight: bold;
}

.band td {
  background-color: #ffffff;
  text-align: right;
  font-weight: bold;
  font-size: 11.5pt;
  text-decoration: underline;
  border-left: 0;
  border-right: 0;
  padding: 4pt 6pt;
}

.sub td {
  background-color: #a5d16b;
  font-weight: bold;
}

.sub.grand td {
  background-color: #4facf0;
  font-weight: bold;
}

.subj {
  text-align: right !important;
  padding-right: 6pt !important;
  font-weight: bold;
}

.agenda td.daycell {
  height: 20pt;
  font-weight: bold;
  font-size: 10pt;
}

.agenda tbody.hours td {
  font-weight: bold;
}

.agenda tbody.hours {
  border-top: 2.5pt double #000000;
}

.agenda tbody.extra {
  border-top: 2.5pt double #000000;
}

/* Footer & Legend Table */
.foot {
  margin-top: 8pt;
  display: block;
  width: 100%;
}

.legend-table-wrap {
  float: right;
  width: 66%;
}

.legend-grid {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 9pt;
  font-weight: bold;
}

.legend-grid td {
  border: 1pt solid #000000;
  padding: 3pt 2pt;
  text-align: center;
}

.totals {
  float: left;
  width: 30%;
  border: 1.5pt solid #000000;
  border-radius: 10pt;
  padding: 6pt 10pt;
  font-weight: bold;
  font-size: 11.5pt;
  text-align: right;
}

.notes {
  margin-top: 8pt;
  font-size: 10.5pt;
  line-height: 1.5;
  font-weight: bold;
  clear: both;
}

.chk {
  display: none !important;
}

.tap {
  cursor: default;
}

/* ──────── Instructions Document Styles ──────── */
.inst-sheet {
  font-size: 11.5pt;
  line-height: 1.5;
}

.inst-header-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 6pt;
}

.student-box td {
  border: 1pt solid #000000;
  padding: 6pt 10pt;
  font-size: 11pt;
}

.inst-warning-band {
  background-color: #f2f2f2;
  border: 1pt solid #000000;
  border-top: none;
  text-align: center;
  font-weight: bold;
  font-size: 12pt;
  letter-spacing: 2px;
  padding: 4pt;
  margin-bottom: 8pt;
}

.exam-info-box td {
  border: 1pt solid #000000;
  padding: 6pt 8pt;
  vertical-align: middle;
  font-size: 10.5pt;
}

.inst-title-box {
  border: 2pt solid #000000;
  text-align: center;
  font-weight: bold;
  font-size: 14pt;
  padding: 6pt 12pt;
  margin: 10pt 0;
  background-color: #fafafa;
}

.inst-preamble {
  font-size: 12pt;
  font-weight: bold;
  line-height: 1.6;
  margin: 8pt 0 10pt;
}

.inst-sec {
  margin-bottom: 10pt;
}

.inst-sec-head {
  font-weight: bold;
  font-size: 12.5pt;
  text-decoration: underline;
  margin-bottom: 6pt;
}

.inst-list {
  padding-right: 18pt;
  margin: 4pt 0;
}

.inst-list li {
  margin-bottom: 5pt;
  line-height: 1.55;
}

.inst-holidays-grid {
  display: block;
  margin: 4pt 0;
  padding-right: 10pt;
}

.inst-holiday-item {
  display: block;
  margin-bottom: 2pt;
  font-size: 11pt;
}

.inst-sub-list {
  padding-right: 14pt;
  margin-top: 4pt;
  line-height: 1.5;
}

.inst-night-grid {
  display: block;
  margin: 6pt 0;
  padding-right: 8pt;
}

.inst-night-item {
  display: inline-block;
  width: 23%;
  margin-bottom: 6pt;
  font-size: 11pt;
}

.inst-night-item .idx {
  font-weight: bold;
}

.inst-color-table {
  display: block;
  margin: 6pt 0;
  padding-right: 8pt;
}

.inst-color-row {
  display: inline-block;
  width: 48%;
  margin-bottom: 4pt;
  font-size: 11pt;
}

.col-swatch {
  display: inline-block;
  width: 14pt;
  height: 10pt;
  border: 1pt solid #000000;
  margin-left: 4pt;
  vertical-align: middle;
}

.col-let {
  margin-left: 4pt;
}

.col-lbl {
  margin-left: 4pt;
}

.inst-note-box {
  border: 1.5pt solid #000000;
  padding: 8pt 12pt;
  margin: 10pt 0;
  background-color: #fafafa;
  font-size: 11pt;
  line-height: 1.55;
}

.inst-closing {
  text-align: center;
  font-weight: bold;
  font-size: 13pt;
  margin-top: 14pt;
  padding-bottom: 6pt;
}
</style>
</head>
<body>
<div class="SectionPortrait">
  ${portraitPagesHtml}
</div>
<br clear="all" style="page-break-before:always;mso-break-type:section-break" />
<div class="SectionLandscape">
  ${landscapePagesHtml}
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
