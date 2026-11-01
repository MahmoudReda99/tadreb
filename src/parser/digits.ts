/**
 * A tiny offline recognizer for Arabic-Indic digits.
 * Tesseract's Arabic model reads the words of a phone scan but not its digits, so number-shaped words are cut into
 * glyphs (connected components) and matched against the ten digit shapes rendered from bundled fonts.
 */
const GLYPHS = '٠١٢٣٤٥٦٧٨٩';
const LATIN = '0123456789';
const N = 16; // feature grid

export interface Box { x0: number; y0: number; x1: number; y1: number }
interface Comp { box: Box; w: number; h: number; mask: Uint8Array; area: number }
interface Template { ch: string; f: Float32Array; aspect: number; script: 'indic' | 'latin' }

let templates: Template[] | null = null;

// Safari caps the total memory of all canvases and only frees them at garbage collection, so the few
// canvases this module needs are created once and reused (thousands of throw-away canvases blank out on iPhone).
let scratchBig: HTMLCanvasElement | null = null;
let scratchSmall: HTMLCanvasElement | null = null;
const big = () => (scratchBig ??= document.createElement('canvas'));
const small = () => { if (!scratchSmall) { scratchSmall = document.createElement('canvas'); scratchSmall.width = N; scratchSmall.height = N; } return scratchSmall; };

/** mask -> N×N feature (glyph scaled to fit, centred) */
function feature(mask: Uint8Array, w: number, h: number): Float32Array {
  const c = big(); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = mask[i] ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const sg = small().getContext('2d', { willReadFrequently: true })!;
  sg.fillStyle = '#fff'; sg.fillRect(0, 0, N, N);
  const k = (N - 2) / Math.max(w, h);
  const dw = w * k; const dh = h * k;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(c, (N - dw) / 2, (N - dh) / 2, dw, dh);
  const d = sg.getImageData(0, 0, N, N).data;
  const f = new Float32Array(N * N);
  let norm = 0;
  for (let i = 0; i < N * N; i++) { f[i] = 1 - d[i * 4] / 255; norm += f[i] * f[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}

function tightMask(c: HTMLCanvasElement): { mask: Uint8Array; w: number; h: number } | null {
  const g = c.getContext('2d')!;
  const { width: W, height: H } = c;
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = d[((y + y0) * W + x + x0) * 4] < 128 ? 1 : 0;
  return { mask, w, h };
}

const FONTS = ['Cairo', 'Arial', 'Tahoma', 'Times New Roman', 'Geeza Pro', 'Traditional Arabic', 'Simplified Arabic', 'Segoe UI', 'serif', 'sans-serif'];
async function loadTemplates(): Promise<Template[]> {
  if (templates) return templates;
  try { await Promise.all([document.fonts.load('400 80px Cairo', GLYPHS), document.fonts.load('700 80px Cairo', GLYPHS)]); } catch { /* fonts optional */ }
  const out: Template[] = [];
  const seen = new Set<string>();
  const tplCanvas = document.createElement('canvas');
  for (const font of FONTS) for (const weight of ['400', '700']) for (const blur of [0, 1]) {
    for (const ch of GLYPHS + LATIN) {
      const script = GLYPHS.includes(ch) ? 'indic' as const : 'latin' as const;
      const c = tplCanvas; c.width = 120; c.height = 140; // resizing clears it
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.filter = 'none';
      g.fillStyle = '#fff'; g.fillRect(0, 0, 120, 140);
      g.fillStyle = '#000'; g.font = `${weight} 90px "${font}"`; g.textBaseline = 'middle'; g.textAlign = 'center';
      if (blur) g.filter = 'blur(1.2px)';
      g.fillText(ch, 60, 70);
      if (blur) { // re-threshold the blurred glyph so it becomes a bolder one
        const img = g.getImageData(0, 0, 120, 140);
        for (let i = 0; i < 120 * 140; i++) { const v = img.data[i * 4] < 200 ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; }
        g.putImageData(img, 0, 0);
      } else {
        const img = g.getImageData(0, 0, 120, 140);
        for (let i = 0; i < 120 * 140; i++) { const v = img.data[i * 4] < 128 ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; }
        g.putImageData(img, 0, 0);
      }
      const t = tightMask(c);
      if (!t || t.w < 3 || t.h < 3) continue;
      const key = script + ch + ':' + t.w + 'x' + t.h + ':' + t.mask.reduce((a, b) => a + b, 0);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ch: script === 'latin' ? String.fromCharCode(0x660 + +ch) : ch, f: feature(t.mask, t.w, t.h), aspect: t.w / t.h, script });
    }
  }
  templates = out;
  return out;
}

/** 8-connected components of the dark pixels of a binarised crop */
function components(c: HTMLCanvasElement): Comp[] {
  const { width: W, height: H } = c;
  const d = c.getContext('2d')!.getImageData(0, 0, W, H).data;
  const lab = new Int32Array(W * H);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (lab[i] || d[i * 4] >= 128) continue;
    const id = comps.length + 1;
    let x0 = x, x1 = x, y0 = y, y1 = y, area = 0;
    const px: number[] = [];
    stack.push(i); lab[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      const py = (p / W) | 0; const pxx = p - py * W;
      px.push(p); area++;
      if (pxx < x0) x0 = pxx; if (pxx > x1) x1 = pxx; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = pxx + dx; const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (!lab[q] && d[q * 4] < 128) { lab[q] = id; stack.push(q); }
      }
    }
    const w = x1 - x0 + 1; const h = y1 - y0 + 1;
    const mask = new Uint8Array(w * h);
    for (const p of px) { const py = (p / W) | 0; mask[(py - y0) * w + (p - py * W - x0)] = 1; }
    comps.push({ box: { x0, y0, x1, y1 }, w, h, mask, area });
  }
  return comps;
}

export interface Glyph { x: number; x1: number; w: number; h: number; byScript?: { indic: { ch: string; score: number }[]; latin: { ch: string; score: number }[] }; ch: string; alts: { ch: string; score: number }[]; kind: 'digit' | 'slash' | 'dash' | 'paren' | 'noise' }

/** classify the glyphs of one number-shaped word (left-to-right, as printed) */
/** digit height of a whole page: lower tercile of the compact components that are not tiny dots */
export function referenceHeight(crops: HTMLCanvasElement[]): number {
  const hs: number[] = [];
  for (const c of crops) for (const k of components(c)) if (k.area >= 6 && k.w <= k.h * 1.6) hs.push(k.h);
  if (!hs.length) return 0;
  const mx = Math.max(...hs.filter(h => h < 80));
  const big = hs.filter(h => h >= mx * 0.5 && h < 80).sort((a, b) => a - b);
  return big[Math.floor(big.length * 0.35)] ?? 0;
}

/** heights of the compact components of a crop (digits, slashes, brackets — not specks or letter blobs) */
export function compactHeights(crop: HTMLCanvasElement): number[] {
  return components(crop).filter(k => k.area >= 6 && k.w <= k.h * 1.6 && k.h < 90).map(k => k.h);
}

/** digit height of one text line: the commonest height (digits outnumber the taller slashes and brackets); 0 when there is too little to judge */
export function lineHeight(hs: number[]): number {
  if (hs.length < 8) return 0;
  const sorted = [...hs].sort((x, y) => x - y);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const big = hs.filter(h => h >= p90 * 0.55);
  const count = new Map<number, number>();
  big.forEach(h => count.set(h, (count.get(h) ?? 0) + 1));
  let best = 0; let bestN = -1;
  for (const h of count.keys()) { const n = (count.get(h - 1) ?? 0) + (count.get(h) ?? 0) + (count.get(h + 1) ?? 0); if (n > bestN || (n === bestN && h < best)) { bestN = n; best = h; } }
  return best;
}

/** two glyphs that touch (a slash against a digit, or two digits) form one wide blob: cut it at its thinnest columns */
function splitWide(c: Comp, H: number): Comp[] {
  // only blobs taller than a digit are a slash glued to a digit; two glued plain digits are rarer and risky to cut
  if (c.w <= H * 1.05 || c.w > H * 2.2 || c.h < H * 1.12) return [c];
  const pieces = Math.max(2, Math.min(3, Math.round(c.w / (0.62 * H))));
  const ink = new Array<number>(c.w).fill(0);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.mask[y * c.w + x]) ink[x]++;
  const cuts: number[] = [];
  for (let k = 1; k < pieces; k++) {
    const mid = Math.round((c.w * k) / pieces);
    let bx = mid; let bv = Infinity;
    for (let x = Math.max(cuts[k - 2] ?? 0, mid - Math.round(c.w * 0.18)) + 1; x < Math.min(c.w - 1, mid + Math.round(c.w * 0.18)); x++) if (ink[x] < bv) { bv = ink[x]; bx = x; }
    cuts.push(bx);
  }
  const edges = [0, ...cuts, c.w];
  const out: Comp[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = edges[i]; const x1 = edges[i + 1];
    let ymin = c.h, ymax = -1, area = 0;
    for (let y = 0; y < c.h; y++) for (let x = x0; x < x1; x++) if (c.mask[y * c.w + x]) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; area++; }
    if (ymax < 0 || area < 6) continue;
    const w = x1 - x0; const h = ymax - ymin + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = c.mask[(y + ymin) * c.w + x0 + x];
    out.push({ box: { x0: c.box.x0 + x0, x1: c.box.x0 + x1 - 1, y0: c.box.y0 + ymin, y1: c.box.y0 + ymax }, w, h, mask, area });
  }
  return out.length ? out : [c];
}

export async function readNumberCrop(crop: HTMLCanvasElement, Href = 0): Promise<Glyph[]> {
  const T = await loadTemplates();
  let comps = components(crop).filter(c => c.area >= 6);
  if (!comps.length) return [];
  // reference digit height: digits are ~30px, slashes ~36px, brackets ~45px, letter blobs are wide — use a middling percentile of the compact ones
  const compact = comps.filter(c => c.w <= c.h * 1.6);
  const hs = (compact.length ? compact : comps).map(c => c.h).sort((a, b) => a - b);
  const H = Href || hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.55))];
  comps = comps.filter(c => c.h <= H * 1.9).flatMap(c => splitWide(c, H));
  comps.sort((a, b) => a.box.x0 - b.box.x0);
  // digit zero is a dot at mid-height of the digit line; full stops, colons and letter dots sit elsewhere
  const tall = comps.filter(c => c.h >= H * 0.8).map(c => (c.box.y0 + c.box.y1) / 2).sort((a, b) => a - b);
  const lineMid = tall.length ? tall[Math.floor(tall.length / 2)] : -1;
  const out: Glyph[] = [];
  const mk = (c: Comp, ch: string, kind: Glyph['kind'], alts: Glyph['alts'] = []): Glyph => ({ x: c.box.x0, x1: c.box.x1, w: c.w, h: c.h, ch, alts, kind });
  for (const c of comps) {
    const asp = c.w / c.h;
    if (c.w > H * 1.8) { out.push(mk(c, '', 'noise')); continue; } // part of an Arabic word
    if (c.h < H * 0.5) {
      if (c.w <= c.h * 0.95 && c.w <= H * 0.45 && (lineMid < 0 || Math.abs((c.box.y0 + c.box.y1) / 2 - lineMid) <= H * 0.3)) out.push(mk(c, '٠', 'digit', [{ ch: '٠', score: 1 }])); // zero is a small upright dot at mid-height
      else if (asp > 1.4 && c.h < H * 0.4 && c.w >= H * 0.35) out.push(mk(c, '-', 'dash'));
      else out.push(mk(c, '', 'noise'));
      continue;
    }
    if (c.h >= H * 1.35 && asp < 0.7) { out.push(mk(c, '(', 'paren')); continue; } // bracket
    if (c.h >= H * 1.1 && asp < 0.7) { out.push(mk(c, '/', 'slash')); continue; } // slash is a little taller than a digit
    const f = feature(c.mask, c.w, c.h);
    const best = { indic: new Map<string, number>(), latin: new Map<string, number>() };
    for (const t of T) {
      let dot = 0;
      for (let i = 0; i < f.length; i++) dot += f[i] * t.f[i];
      const ar = Math.abs(Math.log((asp + 0.05) / (t.aspect + 0.05)));
      const sc = dot - 0.25 * ar;
      const m = best[t.script];
      if (sc > (m.get(t.ch) ?? -9)) m.set(t.ch, sc);
    }
    const rank = (m: Map<string, number>) => [...m.entries()].map(([ch, score]) => ({ ch, score })).sort((a, b) => b.score - a.score).slice(0, 3);
    const byScript = { indic: rank(best.indic), latin: rank(best.latin) };
    const g = mk(c, byScript.indic[0].ch, 'digit', byScript.indic);
    g.byScript = byScript;
    out.push(g);
  }
  return out.filter(g => g.kind !== 'noise');
}

/** which digit shapes does this page use? compare how well the glyphs match each family (dot-zeros are Arabic-Indic by construction and ignored) */
export function pageScript(all: Glyph[][]): 'indic' | 'latin' {
  let si = 0, sl = 0, n = 0;
  for (const gs of all) for (const g of gs) if (g.kind === 'digit' && g.byScript) { si += g.byScript.indic[0].score; sl += g.byScript.latin[0].score; n++; }
  return n && sl > si ? 'latin' : 'indic';
}
export function useScript(gs: Glyph[], script: 'indic' | 'latin'): Glyph[] {
  return gs.map(g => (g.byScript ? { ...g, alts: g.byScript[script], ch: g.byScript[script][0].ch } : g));
}

const toAscii = (s: string) => s.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));

const dateOk = (a: string) => {
  let m = a.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return +m[1] >= 2020 && +m[1] <= 2040 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31;
  m = a.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return +m[3] >= 2020 && +m[3] <= 2040 && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31;
  return false;
};

/**
 * A 10-glyph group is a date: its separators sit at fixed places (yyyy/mm/dd or dd/mm/yyyy), so whatever the shape
 * classifier made of the slashes is overwritten, and the digits are corrected with their runner-up shapes
 * until the date is a real one.
 */
function decodeDate(gs: Glyph[]): string | null {
  if (gs.length < 10) return null;
  const g = gs.length === 10 ? gs : null;
  if (!g) return null;
  for (const seps of [[4, 7], [2, 5]]) {
    const digitIdx = g.map((_, i) => i).filter(i => !seps.includes(i));
    const build = (repl: Map<number, string>) => g.map((x, i) => (seps.includes(i) ? '/' : repl.get(i) ?? x.ch)).join('');
    if (g.some((x, i) => !seps.includes(i) && x.kind !== 'digit')) continue;
    const base = toAscii(build(new Map()));
    if (dateOk(base)) return base;
    const cands: { s: string; cost: number }[] = [];
    for (const i of digitIdx) for (const a of g[i].alts.slice(1)) {
      const c1 = g[i].alts[0].score - a.score;
      cands.push({ s: toAscii(build(new Map([[i, a.ch]]))), cost: c1 });
      for (const j of digitIdx) if (j > i) for (const b of g[j].alts.slice(1)) cands.push({ s: toAscii(build(new Map([[i, a.ch], [j, b.ch]]))), cost: c1 + g[j].alts[0].score - b.score });
    }
    cands.sort((x, y) => x.cost - y.cost);
    const hit = cands.find(c => dateOk(c.s));
    if (hit) return hit.s;
  }
  return null;
}

/** "27 - 30 / 2026/05": a day range written before the year and month (13 glyphs, optional trailing slash) */
function decodeRange(gs: Glyph[]): string | null {
  if (gs.length < 13) return null;
  const g = gs.slice(0, 13);
  const dig = (i: number) => (g[i].kind === 'digit' ? toAscii(g[i].ch) : null);
  const idx = [0, 1, 3, 4, 6, 7, 8, 9, 11, 12];
  const ds = idx.map(dig);
  if (ds.some(d => d === null)) return null;
  const d1 = +(ds[0]! + ds[1]!); const d2 = +(ds[2]! + ds[3]!); const y = +(ds.slice(4, 8).join('')); const m = +(ds[8]! + ds[9]!);
  if (!(d1 >= 1 && d2 <= 31 && d1 < d2 && y >= 2020 && y <= 2040 && m >= 1 && m <= 12)) return null;
  return `${String(d1).padStart(2, '0')}-${String(d2).padStart(2, '0')}/${y}/${String(m).padStart(2, '0')}`;
}

/** one OCR word -> text: glyphs are grouped by wide gaps; 10-glyph windows that form a real date are lifted out in reading order */
export function decodeWord(gs: Glyph[], raw: string): string {
  void raw;
  const heights = gs.map(g => g.h).sort((a, b) => a - b);
  const H0 = heights[Math.floor(heights.length * 0.55)] ?? 14;
  const gap = H0 * 0.7;
  const groups: Glyph[][] = [];
  for (const g of gs) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    const limit = prev && (g.kind === 'dash' || prev.kind === 'dash') ? H0 * 1.2 : gap; // a dash belongs to the number it joins
    if (last && prev && g.x - prev.x1 <= limit) last.push(g); else groups.push([g]);
  }
  const dates: string[] = [];
  const rest: string[] = [];
  for (const grp of groups) {
    let i = 0; let any = false;
    while (i + 10 <= grp.length) {
      const rg = decodeRange(grp.slice(i, i + 13));
      if (rg) { dates.push(rg); i += 13; any = true; continue; }
      const dt = decodeDate(grp.slice(i, i + 10));
      if (dt) {
        // "27 - 2026/05/30": a start day, a dash, then the end date — printed right-to-left, so the "- 27" sits after the date
        const tail = grp.slice(i + 10, i + 13);
        const m = dt.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
        if (m && tail.length === 3 && tail[0].kind === 'dash' && tail[1].kind === 'digit' && tail[2].kind === 'digit') {
          const d1 = +toAscii(tail[1].ch + tail[2].ch);
          if (d1 >= 1 && d1 < +m[3]) { dates.push(`${String(d1).padStart(2, '0')}-${m[3]}/${m[1]}/${m[2]}`); i += 13; any = true; continue; }
        }
        dates.push(dt); i += 10; any = true;
      } else i++;
    }
    // thin slashes are sometimes lost: eight digits in a row are yyyymmdd or ddmmyyyy
    for (let j = 0; !any && j + 8 <= grp.length; j++) {
      const w8 = grp.slice(j, j + 8);
      if (!w8.every(x => x.kind === 'digit')) continue;
      const mkSlash = (at: number): Glyph => ({ ...w8[at], ch: '/', kind: 'slash', alts: [] });
      for (const seps of [[4, 6], [2, 4]]) {
        const v: Glyph[] = [];
        w8.forEach((x, k) => { if (seps.includes(k)) v.push(mkSlash(k)); v.push(x); });
        const dt = decodeDate(v);
        if (dt) { dates.push(dt); any = true; break; }
      }
      if (any) break;
    }
    if (any) continue;
    // brackets (taller than digits) mark a week number, e.g. (27)
    const parens = grp.filter(g => g.kind === 'paren');
    const core = grp.filter(g => g.kind === 'digit');
    const txt = toAscii(core.map(g => g.ch).join(''));
    if (!txt) continue;
    rest.push(parens.length >= 2 || (parens.length === 1 && grp.length >= 3) ? `(${txt})` : txt);
  }
  const pct = /%/.test(raw) ? ' %' : '';
  if (dates.length) {
    // visual order is right-to-left in Arabic reading: the right-most date is the first one read
    const ordered = [...dates].reverse();
    return ordered.length === 2 ? `${ordered[0]} حتى ${ordered[1]}` : ordered.join(' ');
  }
  return rest.reverse().join(' ') + (rest.length ? pct : '');
}
