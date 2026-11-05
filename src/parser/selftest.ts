/** A one-tap device test: runs the pieces of the reading pipeline that can behave differently on a phone and reports each one. */
import { newWorker } from './extract';
import { decodeWord, readNumberCrop, referenceHeight, useScript } from './digits';

export interface Check { name: string; ok: boolean; detail: string }

const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

async function canvasMemory(): Promise<Check> {
  const made: HTMLCanvasElement[] = [];
  try {
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('canvas'); c.width = 2120; c.height = 3000;
      const g = c.getContext('2d');
      if (!g) return { name: 'ذاكرة الرسم (8 صفحات كبيرة معاً)', ok: false, detail: `فشل إنشاء الصفحة رقم ${i + 1}` };
      g.fillStyle = '#000'; g.fillRect(2000, 2900, 100, 80);
      const px = g.getImageData(2050, 2940, 1, 1).data;
      if (px[3] === 0) return { name: 'ذاكرة الرسم (8 صفحات كبيرة معاً)', ok: false, detail: `الصفحة ${i + 1} رجعت فارغة (الذاكرة امتلأت)` };
      made.push(c);
    }
    return { name: 'ذاكرة الرسم (8 صفحات كبيرة معاً)', ok: true, detail: 'سليمة' };
  } catch (e) {
    return { name: 'ذاكرة الرسم (8 صفحات كبيرة معاً)', ok: false, detail: String(e) };
  } finally { made.forEach(c => { c.width = 0; c.height = 0; }); }
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** one Arabic-Indic digit on a white strip */
function digitStrip(ch: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 90; c.height = 90;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000'; g.font = '700 46px Cairo'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 45, 48);
  return c;
}

export async function runSelfTest(onStep?: (c: Check) => void): Promise<Check[]> {
  const out: Check[] = [];
  const add = (c: Check) => { out.push(c); onStep?.(c); };

  let simd = false;
  try { simd = WebAssembly.validate(SIMD); } catch { /* old engine */ }
  add({
    name: 'الجهاز والمتصفح', ok: typeof WebAssembly === 'object',
    detail: `${navigator.platform || '?'} · نوى ${navigator.hardwareConcurrency ?? '?'} · نسبة الشاشة ${window.devicePixelRatio} · WebAssembly SIMD ${simd ? 'نعم' : 'لا'} · اتصال آمن ${window.isSecureContext ? 'نعم' : 'لا'}\n${navigator.userAgent}`,
  });
  add(await canvasMemory());

  try {
    await document.fonts.load('700 38px Cairo', '٠١٢٣٤٥٦٧٨٩');
    const ok = document.fonts.check('700 38px Cairo', '٠١٢٣٤٥٦٧٨٩');
    add({ name: 'خط التطبيق (كايرو)', ok, detail: ok ? 'محمّل' : 'لم يُحمّل' });
  } catch (e) { add({ name: 'خط التطبيق (كايرو)', ok: false, detail: String(e) }); }

  // 1) the digit reader on this device: draw each Arabic-Indic digit, read the pixels back, recognise it by shape
  try {
    const bad: string[] = [];
    for (let i = 0; i < 10; i++) {
      const strip = digitStrip(AR_DIGITS[i]);
      const glyphs = await readNumberCrop(strip, referenceHeight([strip]));
      const got = glyphs.find(x => x.kind === 'digit');
      const read = got ? decodeWord(useScript([got], 'indic'), '') : '';
      strip.width = 0; strip.height = 0;
      if (read !== String(i)) bad.push(`${AR_DIGITS[i]} (${i}) ← قُرئ ${read || '(لا شيء)'}`);
    }
    add({ name: 'التعرف على شكل الأرقام الهندية (٠ إلى ٩)', ok: bad.length === 0, detail: bad.length ? `${10 - bad.length} من 10 صحيحة\n${bad.join('\n')}` : '10 من 10 صحيحة' });
  } catch (e) {
    add({ name: 'التعرف على شكل الأرقام الهندية (٠ إلى ٩)', ok: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // 2) Tesseract with the Arabic model on this device
  try {
    const t0 = performance.now();
    const w = await newWorker();
    try {
      const c = document.createElement('canvas'); c.width = 900; c.height = 150;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#000'; g.font = '700 46px Cairo'; g.direction = 'rtl'; g.textAlign = 'right';
      g.fillText('الفترة التدريبية الأولى فى المدة', 870, 90);
      const { data } = await w.recognize(c);
      const text = data.text.replace(/\s+/g, ' ').trim();
      const hits = ['الفترة', 'التدريبية', 'الأولى', 'المدة'].filter(k => text.includes(k)).length;
      c.width = 0; c.height = 0;
      add({ name: `قراءة الكلمات العربية (${((performance.now() - t0) / 1000).toFixed(1)} ث)`, ok: hits >= 3, detail: `${hits} من 4 كلمات صحيحة\nقرأ: ${text || '(لا شيء)'}` });
    } finally { await w.terminate(); }
  } catch (e) {
    add({ name: 'قراءة الكلمات العربية', ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  return out;
}
