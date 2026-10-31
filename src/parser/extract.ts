/** Reads the instructions page from a DOCX, a PDF or an image — fully offline. */
import { scoreText } from './parse';
import { decodeWord, readNumberCrop, referenceHeight } from './digits';

export interface Extracted { text: string; confidence: number; source: 'docx' | 'pdf' | 'ocr' | 'pdf-ocr' | 'txt'; pages?: string[]; numbers?: string[] }

const base = import.meta.env.BASE_URL;
type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

export async function newWorker(onProgress?: (p: number) => void): Promise<Worker> {
  const { createWorker } = await import('tesseract.js');
  return createWorker('ara', 1, {
    workerPath: `${base}tess/worker.min.js`,
    corePath: `${base}tess/`,
    langPath: `${base}tess/`,
    gzip: false,
    logger: m => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
}

/** scale so the longer side is about 3000px — phone scans are usually too small for the Arabic digits */
export function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(2.5, Math.max(1, 3000 / Math.max(w, h)));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** grayscale + local-mean threshold: removes shadows and the grey of a phone photo, keeps thin digit strokes */
export function binarize(src: HTMLCanvasElement): HTMLCanvasElement {
  const { width: W, height: H } = src;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const img = src.getContext('2d')!.getImageData(0, 0, W, H);
  const d = img.data;
  const gray = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
  const integral = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += gray[y * W + x];
      integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row;
    }
  }
  const r = Math.max(15, Math.round(Math.min(W, H) / 40));
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(W, x + r + 1);
      const sum = integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] - integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * W + x] < mean * 0.9 ? 0 : 255;
      const o = (y * W + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
  }
  out.getContext('2d')!.putImageData(img, 0, 0);
  return out;
}

function rotate(src: HTMLCanvasElement, deg: 90 | 270): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = src.height; c.height = src.width;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

function shrink(src: HTMLCanvasElement, longSide: number): HTMLCanvasElement {
  const k = Math.min(1, longSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * OCR one page with a single full-resolution pass. The orientation is settled first with cheap low-resolution
 * passes (only when the page does not already look like instructions), so a sideways table page no longer costs
 * extra full-size runs.
 */
export async function ocrPage(w: Worker, page: HTMLCanvasElement, progress?: (p: number) => void): Promise<{ text: string; conf: number; numbers: string[] }> {
  const bw = binarize(page);
  const small = shrink(bw, 1100);
  const quick = async (c: HTMLCanvasElement) => scoreText((await w.recognize(c)).data.text);
  let canvas = bw;
  const s0 = await quick(small); progress?.(0.15);
  if (s0 < 5) {
    const s90 = await quick(rotate(small, 90)); const s270 = await quick(rotate(small, 270)); progress?.(0.3);
    const best = Math.max(s90, s270);
    if (best > s0 + 1) canvas = rotate(bw, s90 >= s270 ? 90 : 270);
  }
  const { data } = await w.recognize(canvas, {}, { blocks: true });
  progress?.(0.85);
  const words = (data.words ?? (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)))) as OcrWord[];
  // Tesseract cannot read Arabic-Indic digits: re-read every number-shaped word with the glyph recognizer
  const refined = await refineNumbers(data.text, words, canvas);
  progress?.(1);
  return { text: refined.text, conf: Math.max(0.05, Math.min(1, data.confidence / 100)), numbers: refined.log };
}

interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }

export async function refineNumbers(text: string, words: OcrWord[], bw: HTMLCanvasElement): Promise<{ text: string; log: string[] }> {
  const log: string[] = [];
  const clean = (t: string) => t.replace(/[\u200e\u200f\u202a-\u202e]/g, '');
  const numeric = (w: OcrWord) => {
    const t = clean(w.text).trim();
    if (!t || !/[0-9٠-٩۰-۹/()]/.test(t)) return false;
    const letters = (t.match(/[\u0621-\u064a]/g) ?? []).length;
    const slashes = (t.match(/\//g) ?? []).length;
    return letters === 0 || (slashes >= 2 && letters <= 2) || letters / t.length < 0.15; // OCR often types ٥ as the letter ه
  };
  // consecutive number-shaped words on one line are one number that Tesseract split — read them together
  type Grp = { idx: number[]; box: { x0: number; y0: number; x1: number; y1: number } };
  const groups: Grp[] = [];
  words.forEach((w, i) => {
    if (!numeric(w)) return;
    const last = groups[groups.length - 1];
    const mid = (w.bbox.y0 + w.bbox.y1) / 2;
    // same text line and close together (a stray non-numeric box in between does not break a number)
    const gapX = last ? Math.max(0, w.bbox.x0 - last.box.x1, last.box.x0 - w.bbox.x1) : 0;
    if (last && i - last.idx[last.idx.length - 1] <= 3 && gapX < 90 && mid > last.box.y0 && mid < last.box.y1) {
      last.idx.push(i);
      last.box = { x0: Math.min(last.box.x0, w.bbox.x0), y0: Math.min(last.box.y0, w.bbox.y0), x1: Math.max(last.box.x1, w.bbox.x1), y1: Math.max(last.box.y1, w.bbox.y1) };
    } else groups.push({ idx: [i], box: { ...w.bbox } });
  });
  const crops = groups.map(g => {
    const padX = 14; const padY = 6;
    const cx0 = Math.max(0, g.box.x0 - padX); const cy0 = Math.max(0, g.box.y0 - padY);
    const cw = Math.min(bw.width - cx0, g.box.x1 - g.box.x0 + 2 * padX); const ch = Math.min(bw.height - cy0, g.box.y1 - g.box.y0 + 2 * padY);
    const crop = document.createElement('canvas'); crop.width = Math.max(1, cw); crop.height = Math.max(1, ch);
    crop.getContext('2d')!.drawImage(bw, cx0, cy0, cw, ch, 0, 0, cw, ch);
    return crop;
  });
  const Href = referenceHeight(crops);
  const replace = new Map<number, string>(); // word index -> replacement
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const gs = await readNumberCrop(crops[gi], Href);
    if (!gs.some(x => x.kind === 'digit')) continue;
    const raw = g.idx.map(i => clean(words[i].text)).join(' ');
    const fixed = decodeWord(gs, raw);
    if (!fixed) continue;
    log.push(`${raw} -> ${fixed}`);
    g.idx.forEach((wi, k) => replace.set(wi, k === 0 ? ' ' + fixed + ' ' : ''));
  }
  // rebuild the text, walking the words in reading order
  let out = ''; let cur = 0;
  words.forEach((w, i) => {
    const at = text.indexOf(w.text, cur);
    if (at < 0 || !replace.has(i)) return;
    out += text.slice(cur, at) + replace.get(i)!;
    cur = at + w.text.length;
  });
  out += text.slice(cur);
  return { text: out, log };
}

async function readPdf(file: File, onProgress?: (p: number) => void): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY: number | null = null;
    for (const it of content.items as { str: string; transform: number[] }[]) {
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { text += line + '\n'; line = ''; }
      line += it.str + ' ';
      lastY = y;
    }
    text += line + '\n';
  }
  if (text.replace(/\s/g, '').length > 200) return { text, confidence: 0.95, source: 'pdf' };
  // scanned PDF (e.g. CamScanner): render each page and OCR it, several pages at once
  const n = doc.numPages;
  const lanes = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1, n));
  const workers = await Promise.all(Array.from({ length: lanes }, () => newWorker()));
  try {
    const pages: string[] = new Array(n).fill('');
    const confs: number[] = new Array(n).fill(0);
    const prog: number[] = new Array(n).fill(0);
    let next = 1;
    const lane = async (w: Worker) => {
      for (;;) {
        const i = next++;
        if (i > n) return;
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 3 });
        const raw = document.createElement('canvas');
        raw.width = vp.width; raw.height = vp.height;
        await page.render({ canvasContext: raw.getContext('2d')!, viewport: vp }).promise;
        const r = await ocrPage(w, toCanvas(raw, raw.width, raw.height), p => { prog[i - 1] = p; onProgress?.(prog.reduce((a, b) => a + b, 0) / n); });
        pages[i - 1] = r.text; confs[i - 1] = r.conf;
      }
    };
    await Promise.all(workers.map(lane));
    return { text: pages.join('\n'), pages, confidence: (confs.reduce((a, b) => a + b, 0) / n) * 0.9, source: 'pdf-ocr' };
  } finally { await Promise.all(workers.map(w => w.terminate())); }
}

export async function extractText(file: File, onProgress?: (p: number) => void): Promise<Extracted> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: r.value, confidence: 1, source: 'docx' };
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return readPdf(file, onProgress);
  if (file.type.startsWith('image/')) {
    const bmp = await createImageBitmap(file);
    const w = await newWorker();
    try {
      const r = await ocrPage(w, toCanvas(bmp, bmp.width, bmp.height), onProgress);
      return { text: r.text, confidence: r.conf * 0.9, source: 'ocr', pages: [r.text], numbers: r.numbers };
    } finally { await w.terminate(); }
  }
  if (name.endsWith('.txt')) return { text: await file.text(), confidence: 1, source: 'txt' };
  throw new Error('نوع الملف غير مدعوم — استخدم DOCX أو PDF أو صورة');
}
