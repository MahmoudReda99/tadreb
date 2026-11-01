import type { DateRange, Instructions, SubjectPcts } from '../engine/types';
import { addDays, dowOf, defaultWeeksPerMonth, MONTHS_AR, monthNames, parseDate } from '../engine/dates';
import { emptyInstructions } from '../engine/instructions';

export interface ParseResult {
  instructions: Instructions;
  /** 0..1 per field; anything below LOW needs the user's eyes */
  conf: Record<string, number>;
  /** what was not found or looks wrong, in plain Arabic */
  notes: string[];
}
export const LOW = 0.8;

const rev = (s: string) => [...s].reverse().join('');
export const norm = (s: string) =>
  s.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0))
    .replace(/[ـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[ً-ْ]/g, '')
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[ \t ]+/g, ' ').trim();

const ORD: Record<string, number> = { الايع: 4, الرايع: 4, الثالت: 3, الثانى: 2, الاول: 1, الاولي: 1, الثاني: 2, الثانيه: 2, الثالث: 3, الثالثه: 3, الرابع: 4, الرابعه: 4, الخامس: 5, الخامسه: 5, السادس: 6, السادسه: 6 };
const ORD_RE = '(الرايع|الثالت|الاول|الاولي|الثاني|الثانيه|الثالث|الثالثه|الرابع|الرابعه|الخامس|الخامسه|السادس|السادسه)';
const MONTHS_N = MONTHS_AR.map(norm);
const MONTH_ALIASES: Record<string, number> = { يونيو: 5, يوليو: 6, مايو: 4, ابريل: 3, يونيه: 5, اغسطس: 7, سبتمبر: 8, اكتوبر: 9, نوفمبر: 10, ديسمبر: 11, يناير: 0, فبراير: 1, مارس: 2 };
const lev = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const monthByName = (w: string): number => {
  const n = norm(w).replace(/[()[\]]/g, '');
  if (n in MONTH_ALIASES) return MONTH_ALIASES[n];
  const i = MONTHS_N.indexOf(n);
  if (i >= 0) return i;
  // OCR typos (مايق for مايو): accept a single wrong letter
  const names = Object.keys(MONTH_ALIASES);
  const near = names.filter(k => lev(k, n) <= 1);
  return near.length === 1 ? MONTH_ALIASES[near[0]] : -1;
};

const pad = (n: number | string) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const validDate = (y: number, m: number, d: number) => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

interface Tok { from: string; to?: string; reversed: boolean }
/**
 * One date token. Accepts 30/12/2023, 2026/01/03 (year first), 16-19/06/2024, 27 - 30 / 2026/05,
 * and the same strings stored character-reversed (03/21/3202).
 */
function dateToken(raw: string): Tok | null {
  const tok = raw.replace(/\s+/g, '');
  const mk = (y: number, m: number, dayPart: string, reversed: boolean): Tok | null => {
    const days = dayPart.split('-').map(Number);
    if (!days.every(d => validDate(y, m, d))) return null;
    const lo = Math.min(...days); const hi = Math.max(...days);
    return { from: iso(y, m, lo), to: hi !== lo ? iso(y, m, hi) : undefined, reversed };
  };
  // year first: 2026/01/03  or  27-30/2026/05  (day range, then year/month)
  let m = tok.match(/^(20\d\d)\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return mk(+m[1], +m[2], m[3], false);
  m = tok.match(/^([\d-]+)\/(20\d\d)\/(\d{1,2})$/);
  if (m) return mk(+m[2], +m[3], m[1], false);
  // day first: 30/12/2023, 16-19/06/2024
  m = tok.match(/^([\d-]+)\/(\d{1,2})\/(20\d\d)$/);
  if (m) return mk(+m[3], +m[2], m[1], false);
  // character-reversed variants (year ends with "02", e.g. 03/21/3202)
  const last = tok.split('/').pop() ?? '';
  if (/^\d{4}$/.test(last) && last.endsWith('02') && !last.startsWith('20')) {
    const a = rev(tok).match(/^(20\d\d)\/(\d{1,2})\/([\d-]+)$/);
    if (a) return mk(+a[1], +a[2], a[3], true);
  }
  return null;
}
const TOKEN_RE = /\d{1,2}\s*-\s*\d{1,2}\s*\/\s*20\d\d\s*\/\s*\d{1,2}|[\d-]+\s*\/\s*\d{1,4}\s*\/\s*\d{1,4}/g;
export const dateTokens = (line: string): Tok[] => {
  const out: Tok[] = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const t = dateToken(m[0]);
    const prev = out[out.length - 1];
    if (t && !(prev && prev.from === t.from && prev.to === t.to)) out.push(t); // a merged OCR word can repeat its neighbour
  }
  return out;
};

const PCT_PATTERNS: [keyof SubjectPcts, RegExp][] = [
  ['tactics', /^تكتيك عام/], ['tech', /^تدريب فني تخصصي/], ['shooting', /^رمايه/], ['fitness', /^تربيه بدنيه/],
  ['education', /^تعليم منضم/], ['discipline', /^انضباط عسكري/], ['security', /^امن حربي/], ['topography', /^طبوغرافيا/],
  ['morale', /^تدريب معنوي/], ['recon', /^سطع وعدو/], ['engineering', /^تدريب هندسي/], ['chemical', /^تدريب كيميائي/],
  ['admin', /^تدريب اداري/], ['history', /^تاريخ عسكري/], ['intlLaw', /^قانون دولي/], ['infoWar', /^حرب المعلومات/],
];

/**
 * Turns the text of the instructions page into an Instructions object.
 * Works on DOCX / PDF text (confidence 0.95) and on OCR text (`ocrConfidence` scales every field).
 * Handles first or second training period (week numbers 1-26 or 27-52), dates written day-first or
 * year-first, and digits that the source stored reversed (03/21/3202 for 30/12/2023).
 * Special weeks are taken from their date ranges when those are readable, from the printed numbers otherwise.
 */
export function parseInstructions(raw: string, ocrConfidence = 1): ParseResult {
  const inst = emptyInstructions();
  const conf: Record<string, number> = {};
  const notes: string[] = [];
  const base = 0.95 * ocrConfidence;
  const set = (k: string, c: number) => { conf[k] = Math.min(base, c * ocrConfidence); };
  const lines = raw.split(/\r?\n/).map(norm).map(l => l.replace(/\b(20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g, '$1/$2/$3')).filter(Boolean); // yyyymmdd lost its slashes
  const text = lines.join('\n');
  const miss = (k: string, why: string) => { set(k, 0.2); notes.push(why); };

  const course = text.match(/دوره\s+\S+\s+رقم\s*[(\[]?\s*(\d+)/);
  const unit = text.match(/الكتيبه\s+(\S+)\s*\/\s*الفوج\s*(\d+)\s*اشاره/);
  inst.courseName = course ? `الدورة رقم (${course[1]})${unit ? ` — الكتيبة / الفوج ${unit[2]} إشارة` : ''}` : '';
  set('courseName', course ? 1 : 0.3);

  const yl = text.match(/العام التدريبي\s*(\d{4})\s*\/\s*(\d{4})/);
  if (yl) {
    const a = +yl[1]; const b = +yl[2];
    const ra = +rev(yl[1]); const rb = +rev(yl[2]);
    if (b === a + 1 && a > 2000) { inst.yearLabel = `${a} / ${b}`; set('yearLabel', 1); }
    else if (rb === ra + 1 && ra > 2000) { inst.yearLabel = `${ra} / ${rb}`; set('yearLabel', 0.85); }
  }

  // --- training period (the dates may wrap onto the next line)
  const pRe = /ال[فق][تق]ره\s*التدريبيه\s*(?:الاولي|الثانيه|الثالثه|الرابعه)/;
  let pIdx = lines.findIndex(l => pRe.test(l) && dateTokens(l).length >= 2);
  if (pIdx < 0) pIdx = lines.findIndex((l, i) => pRe.test(l) && dateTokens(l + ' ' + (lines[i + 1] ?? '')).length >= 2);
  if (pIdx < 0) pIdx = lines.findIndex((l, i) => /الاسبوع رقم/.test(lines[i + 1] ?? l) && dateTokens(l + ' ' + (lines[i + 1] ?? '')).length >= 2 && /المده|مده/.test(l));
  const pText = pIdx >= 0 ? lines[pIdx] + ' ' + (lines[pIdx + 1] ?? '') : '';
  const pTok = pIdx >= 0 ? dateTokens(pText) : [];
  const lineRev = pTok.some(t => t.reversed);
  let first = 1;
  if (pTok.length >= 2) {
    inst.startSaturday = pTok[0].from;
    const byDates = Math.round((parseDate(pTok[1].from).getTime() - parseDate(pTok[0].from).getTime()) / 864e5 / 7) || 26;
    set('startSaturday', 1);
    const wm = pText.match(/الاسبوع رقم\s*[(\[]?\s*(\d+)\s*[)\]]?\s*(?:حتي|الي|-)\s*(?:الاسبوع)?\s*(?:رقم)?\s*[(\[]?\s*(\d+)/);
    if (wm) {
      let a = +wm[1]; let b = +wm[2];
      if (lineRev) { a = +rev(wm[1]); b = +rev(wm[2]); }
      if (b >= a && Math.abs(b - a + 1 - byDates) <= 1) { first = a; inst.totalWeeks = b - a + 1; set('totalWeeks', 1); set('firstWeek', 1); }
      else { inst.totalWeeks = byDates; set('totalWeeks', 0.6); set('firstWeek', 0.5); notes.push('أرقام الأسابيع المقروءة لا تطابق التواريخ — راجع «رقم أول أسبوع»'); }
    } else { inst.totalWeeks = byDates; set('totalWeeks', 0.6); set('firstWeek', 0.6); }
    inst.firstWeek = first;
    if (dowOf(inst.startSaturday) !== 6) { notes.push('تاريخ بداية الفترة ليس يوم سبت — راجعه'); set('startSaturday', 0.4); }
  } else {
    miss('startSaturday', 'لم يُقرأ تاريخ بداية الفترة التدريبية (الأرقام الهندية غير واضحة فى الصورة) — أدخله يدوياً');
    set('totalWeeks', 0.2); set('firstWeek', 0.2);
  }
  const total = inst.totalWeeks;
  const lastWeek = first + total - 1;
  const weekOf = (d: string) => first + Math.floor((parseDate(d).getTime() - parseDate(inst.startSaturday).getTime()) / 864e5 / 7);
  const inPeriod = (d: string) => d >= inst.startSaturday && d <= addDays(inst.startSaturday, total * 7 - 1);

  /** special-week line: weeks from the printed date range when readable, otherwise from the printed numbers */
  const specialWeeks = (line: string, anchor: RegExp, key: string, label: string, fallback: number[] = []): number[] => {
    if (!line) { miss(key, `لم يُعثر على سطر ${label}`); return []; }
    const dt = dateTokens(line).filter(t => inPeriod(t.from));
    let byDates: number[] = [];
    if (dt.length >= 2 || (dt.length === 1 && dt[0].to)) {
      const from = dt[0].from; const to = dt.length >= 2 ? dt[dt.length - 1].to ?? dt[dt.length - 1].from : dt[0].to!;
      for (let w = weekOf(from); w <= weekOf(to); w++) byDates.push(w);
      byDates = byDates.filter(w => w >= first && w <= lastWeek);
    }
    const m = line.match(anchor);
    const lr = lineRev || dateTokens(line).some(t => t.reversed);
    const nums: number[] = []; let c = 1;
    if (m) {
      for (const s of m[1].split(/[،,و\s-]+/).filter(x => /^\d+$/.test(x))) {
        const o = +s; const r = +rev(s);
        if (s.length === 1) nums.push(o);
        else if (lr && r >= first && r <= lastWeek) nums.push(r);
        else if ((o < first || o > lastWeek) && r >= first && r <= lastWeek) { nums.push(r); c = Math.min(c, 0.75); }
        else if (o >= first && o <= lastWeek) { nums.push(o); if (r >= first && r <= lastWeek && r !== o) c = Math.min(c, 0.7); }
        else { nums.push(o); c = 0.4; }
      }
    } else c = 0.4;
    if (nums.some(n => n >= first && n <= lastWeek)) { // a comma read as the digit 4 etc.
      for (let i = nums.length - 1; i >= 0; i--) if (nums[i] < first || nums[i] > lastWeek) nums.splice(i, 1);
    }
    if (byDates.length) {
      const same = nums.length === byDates.length && nums.every((n, i) => n === byDates[i]);
      set(key, same || !nums.length ? 1 : 0.85);
      if (!same && nums.length) notes.push(`${label}: الأرقام المطبوعة (${nums.join('، ')}) تختلف عن الأسابيع حسب التواريخ (${byDates.join('، ')}) — اعتُمدت التواريخ`);
      return byDates;
    }
    if (!nums.length && fallback.length) {
      set(key, 0.5);
      notes.push(`أرقام ${label} غير مقروءة — وُضعت القيمة المعتادة (${fallback.join('، ')}) وتحتاج تأكيدك`);
      return fallback;
    }
    set(key, nums.length ? c : 0.2);
    if (!nums.length) notes.push(`لم تُقرأ أرقام ${label}`);
    return [...new Set(nums)].sort((a, b) => a - b);
  };
  const wl = (re: RegExp) => lines.find(l => re.test(l) && /رقم/.test(l)) ?? '';
  inst.prepWeeks = specialWeeks(wl(/الفتره التحضيريه/), /الاسبوع رقم\s*[(\[]([^)\]]*)[)\]]/, 'prepWeeks', 'الفترة التحضيرية', [first, first + 1]);
  inst.opsWeeks = specialWeeks(wl(/مهام العمليات/), /الاسبوع رقم\s*[(\[]([^)\]]*)[)\]]/, 'opsWeeks', 'مهام العمليات');
  inst.reserveWeeks = specialWeeks(wl(/الاحتياط/), /رقم\s*[(\[]([^)\]]*)[)\]]/, 'reserveWeeks', 'أسبوع الاحتياط', [lastWeek]);
  const campLine = lines.find(l => /معسكر/.test(l) && /الاسبوع\s*رقم\s*[(\[]?\s*\d/.test(l)) ?? '';
  if (campLine) inst.campWeeks = specialWeeks(campLine, /الاسبوع\s*رقم\s*[(\[]?\s*([\d\s،,و-]+)/, 'campWeeks', 'المعسكر الليلى');
  else miss('campWeeks', 'لم يُعثر على أسابيع المعسكر الليلى');

  // --- level weeks
  const lv = (name: string) => text.match(new RegExp(`${name}\\s*[(\\[]\\s*(\\d+)\\s*[)\\]]\\s*اسبوع`));
  const li = lv('الفرد'); const lc = lv('الطاقم'); const lm = lv('المركز');
  if (li && lc && lm) {
    inst.levelWeeks = { individual: +li[1], crew: +lc[1], centre: +lm[1] };
    const trainingWeeks = total - inst.prepWeeks.length - inst.opsWeeks.length - inst.reserveWeeks.length;
    const s = +li[1] + +lc[1] + +lm[1];
    set('levelWeeks', s === trainingWeeks ? 1 : 0.6);
    if (s !== trainingWeeks) notes.push(`مجموع أسابيع المستويات (${s}) لا يساوي عدد أسابيع التدريب (${trainingWeeks})`);
  } else if (/مستوي الفرد/.test(text)) {
    set('levelWeeks', 0.5);
    notes.push('أرقام أسابيع المستويات غير مقروءة — وُضعت القيمة المعتادة 9 / 7 / 6 وتحتاج تأكيدك');
  } else miss('levelWeeks', 'لم تُقرأ أسابيع مستويات الفرد والطاقم والمركز');

  // --- holidays
  const hs: (string | DateRange)[] = [];
  const hi = lines.findIndex(l => /الاجازات الرسميه/.test(l));
  let holidayLines = 0;
  if (hi >= 0) {
    for (let i = hi + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/رمضان/.test(l) || (/طابور/.test(l) && /سير/.test(l))) break;
      holidayLines++;
      const t = dateTokens(l);
      if (!t.length) continue;
      if (t.length >= 2 && !t[0].to) hs.push({ from: t[0].from, to: t[1].to ?? t[1].from });
      else hs.push(t[0].to ? { from: t[0].from, to: t[0].to } : t[0].from);
      if (t.length === 1 && !t[0].to && /المبارك/.test(l) && ocrConfidence < 0.95) {
        notes.push(`الإجازة «${l.replace(/[\d/\s.,-]+$/g, '').replace(/^[^ا-ي]*/, '').slice(0, 40)}» قُرئت بيوم واحد (${t[0].from}) — الأعياد المباركة تمتد عدة أيام: راجع مدتها فى الورقة وأضف الأيام الناقصة`);
        set('holidays', 0.5);
      }
    }
    const ok = hs.length >= Math.max(1, holidayLines - 1);
    set('holidays', ok ? 0.95 : hs.length ? 0.5 : 0.2);
    if (!ok) notes.push(`قُرئت ${hs.length} من ${holidayLines} أجازة رسمية فقط — راجع القائمة`);
  } else miss('holidays', 'لم يُعثر على قائمة الأجازات الرسمية');
  inst.holidays = hs;

  // --- Ramadan
  const rLine = lines.find(l => /رمضان/.test(l) && /(?:حتي|الي)/.test(l) && dateTokens(l).length >= 2);
  if (rLine) { const t = dateTokens(rLine); inst.ramadan = { from: t[0].from, to: t[1].from }; set('ramadan', 0.9); }
  else { inst.ramadan = null; miss('ramadan', 'لم تُقرأ مدة شهر رمضان — أدخلها أو اتركها فارغة'); }

  // --- weeks per month (by calendar; editable) and month names
  inst.weeksPerMonth = defaultWeeksPerMonth(inst.startSaturday, total);
  set('weeksPerMonth', 0.85);
  const mNames = monthNames(inst.startSaturday, inst.weeksPerMonth.length);

  // --- march Saturday / military security
  const pairs: [number, number][] = [];
  const partial: number[] = [];
  let found = 0; let maxIdx = -1;
  for (const l of lines) {
    const m = l.match(new RegExp(`الشهر\\s*${ORD_RE}(.*)$`));
    if (!m || !/طابور|سير|حربي/.test(m[2])) continue;
    // the number written before «طابور سير» is the march hours, the one before «أمن حربى» the security hours;
    // a number that was not read stays 0 instead of letting the other one slide into its place
    const march = m[2].match(/(\d+)\s*[)\]]?\s*(?:ساعه\s*)?طابور/);
    const sec = m[2].match(/(\d+)\s*[)\]]?\s*(?:ساعه\s*)?(?:امن\s*)+حربي/);
    if (!march && !sec) continue;
    const dashed = (word: RegExp) => new RegExp(`[(\\[]?\\s*[-–]\\s*[)\\]]?\\s*(?:ساعه\\s*)?${word.source}`).test(m[2]); // "(-)" means an explicit zero
    // a day has 7 hours: a bracket glyph read as a leading 1 makes (13) of (3); anything still above 7 is a misread
    const fix = (n: number): number | null => (n <= 7 ? n : n < 20 && n % 10 <= 7 ? n % 10 : null);
    const mv = march ? fix(+march[1]) : null; const sv = sec ? fix(+sec[1]) : null;
    const i = ORD[m[1]] - 1;
    pairs[i] = [mv ?? 0, sv ?? 0];
    if ((mv === null && !dashed(/طابور/)) || (sv === null && !dashed(/(?:امن\s*)+حربي/))) { partial.push(i + 1); }
    found++; maxIdx = Math.max(maxIdx, i);
  }
  const repeats = /يكرر\s*الشهر/.test(text);
  let mc = found ? 0.95 : 0.2;
  const known = maxIdx + 1;
  for (let i = 0; i < inst.weeksPerMonth.length; i++) {
    if (!pairs[i]) {
      const src = repeats && i >= known ? pairs[i - known] : undefined;
      pairs[i] = src ? ([...src] as [number, number]) : [0, 0];
      mc = Math.min(mc, repeats && src ? 0.8 : 0.3);
    }
  }
  if (partial.length) { mc = Math.min(mc, 0.5); notes.push(`ساعات طابور السير أو الأمن الحربى غير مقروءة بالكامل فى الشهر ${partial.join('، ')} — راجعها`); }
  if (repeats) notes.push('الأشهر الزائدة تكرر الأشهر الأولى (كما ورد: «يكرر الشهر الخامس والسادس»)');
  if (!found) notes.push('لم تُقرأ ساعات طابور السير والأمن الحربى');
  inst.marchSecurityByMonth = pairs.slice(0, inst.weeksPerMonth.length);
  set('marchSecurityByMonth', mc);
  const wk = text.match(new RegExp(`الاسبوع\\s*${ORD_RE}\\s*من\\s*كل\\s*شهر`));
  inst.marchWeekOfMonth = wk ? ORD[wk[1]] : 4; set('marchWeekOfMonth', wk ? 1 : 0.5);
  const ex = text.match(new RegExp(`عدا\\s*شهر\\s*[(\\[]?\\s*([^\\s)\\]]+)[\\s\\S]{0,160}?الاسبوع\\s*${ORD_RE}`));
  inst.marchWeekExceptions = {};
  if (ex) {
    const mi = monthByName(ex[1]);
    const idx = mi >= 0 ? mNames.map(norm).findIndex(n => n === norm(MONTHS_AR[mi])) : -1;
    if (idx >= 0) inst.marchWeekExceptions[idx] = ORD[ex[2]];
    set('marchWeekExceptions', idx >= 0 ? 0.95 : 0.5);
    if (idx < 0) notes.push('لم يُفهم الشهر المستثنى من يوم الطابور — راجعه');
  } else set('marchWeekExceptions', 0.9);

  // --- subject percentages
  const pcts = { ...inst.pcts };
  let nPct = 0;
  for (const [key, re] of PCT_PATTERNS) {
    const i = lines.findIndex((l, ix) => re.test(l) && [l, ...lines.slice(ix + 1, ix + 4)].some(x => /\d+\s*%/.test(x)));
    if (i < 0) continue;
    for (const l of [lines[i], ...lines.slice(i + 1, i + 4)]) {
      const m = l.match(/(\d+)\s*%/);
      if (m) { pcts[key] = +m[1]; nPct++; break; }
    }
  }
  const mainLine = lines.find(l => /الموضوعات الرئيسيه/.test(l) && /\d+\s*%/.test(l));
  if (mainLine) pcts.mainPct = +mainLine.match(/(\d+)\s*%/)![1];
  inst.pcts = pcts;
  set('pcts', nPct >= 16 ? 0.95 : nPct >= 10 ? 0.7 : 0.4);
  if (nPct < 16) notes.push(`عُثر على ${nPct} من 16 نسبة مئوية — القيم المعروضة افتراضية (15/32/10/15 …) وتحتاج مراجعتك`);

  // --- month of the linking table and week of the weekly extract
  const mm = text.match(/ربط\s*الساعات\s*عن\s*شهر\s*[(\[]?\s*([^\s)\]]+)/);
  const mmi = mm ? monthByName(mm[1]) : -1;
  const midx = mmi >= 0 ? mNames.map(norm).findIndex(n => n === norm(MONTHS_AR[mmi])) : -1;
  if (midx >= 0) { inst.selectedMonth = midx; set('selectedMonth', 0.95); }
  else { inst.selectedMonth = Math.min(4, inst.weeksPerMonth.length - 1); set('selectedMonth', 0.5); }

  inst.selectedWeek = first + Math.min(19, Math.max(0, total - 1));
  const wline = lines.find(l => /مستخرج/.test(l) && /الاسبوع/.test(l));
  let weekSet = false;
  if (wline) {
    const dts = dateTokens(wline).filter(t => inPeriod(t.from));
    if (dts.length) { inst.selectedWeek = weekOf(dts[0].from); set('selectedWeek', 0.9); weekSet = true; }
    else {
      const wd = wline.match(/من (\d{1,2})\/(\d{1,2}) حتي (\d{1,2})\/(\d{1,2})/);
      if (wd) {
        const y0 = parseDate(inst.startSaturday).getUTCFullYear();
        const cands: [number, number][] = [[+wd[1], +wd[2]], [+wd[2], +wd[1]], [+rev(wd[2]), +rev(wd[1])], [+rev(wd[1]), +rev(wd[2])]];
        for (const [d, m] of cands) {
          for (const yr of [y0, y0 + 1]) {
            if (validDate(yr, m, d) && inPeriod(iso(yr, m, d))) { inst.selectedWeek = weekOf(iso(yr, m, d)); set('selectedWeek', 0.9); weekSet = true; break; }
          }
          if (weekSet) break;
        }
      }
    }
    if (!weekSet) {
      const n = wline.match(/الاسبوع رقم\s*[(\[]\s*(\d+)/);
      if (n && +n[1] >= first && +n[1] <= lastWeek) { inst.selectedWeek = +n[1]; set('selectedWeek', 0.8); weekSet = true; }
    }
  }
  if (!weekSet) set('selectedWeek', 0.5);
  const good = Object.values(conf).filter(v => v >= LOW).length;
  if (ocrConfidence < 0.95) {
    notes.unshift(good < 3 && (conf.startSaturday ?? 0) < 0.3
      ? 'لم تُقرأ الأرقام الهندية فى هذه الصورة. استخدم ملف DOCX أو PDF نصى إن وُجد، أو أدخل التواريخ والأسابيع يدوياً (حقول قليلة)، أو ابدأ من نموذج الدورة الجاهز.'
      : 'قُرئت الأرقام بالتعرف على شكل كل رقم وقد تخطئ فى رقم أو رقمين: قارن كل حقل مظلل بالورقة الأصلية ثم أكّده.');
  }
  return { instructions: inst, conf, notes };
}

/** how usable an OCR attempt looks — used to pick the best of several OCR variants */
export function scoreText(raw: string): number {
  const lines = raw.split(/\r?\n/).map(norm).filter(Boolean);
  const t = lines.join('\n');
  let s = dateTokens(t).length * 3;
  for (const re of [/الفتره التدريبيه/, /مهام العمليات/, /الاحتياط/, /الاجازات/, /رمضان/, /طابور/, /مستوي الفرد/, /تكتيك/, /الموضوع/]) if (re.test(t)) s += 2;
  s += (t.match(/[؀-ۿ]{3,}/g)?.length ?? 0) / 20;
  return s;
}

const ANCHORS = [/ال[فق][تق]ره\s*التدريبيه/, /مهام\s*العمليات/, /الاحتياط/, /الاجازات\s*الرسميه/, /رمضان/, /طابور\s*السير/, /مستوي\s*الفرد/, /التحضيريه/];
/** how many of the fixed phrases of the instructions page are present — a garbled text layer has almost none */
export function anchorCount(raw: string): number {
  const t = raw.split(/\r?\n/).map(norm).join('\n');
  return ANCHORS.filter(a => a.test(t)).length;
}
