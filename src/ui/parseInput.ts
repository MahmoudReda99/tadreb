/** Forgiving readers for what a person types into the review form. Arabic-Indic and ordinary digits are both fine. */

const AR = '٠١٢٣٤٥٦٧٨٩';

/** Arabic-Indic / Persian digits -> ordinary digits */
export const toLatin = (s: string): string =>
  s.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0));

/** ordinary digits -> Arabic-Indic (the default look of every field) */
export const toArabic = (s: string): string => s.replace(/\d/g, d => AR[+d]);

/** a whole number from any text; empty or no digits -> null. Leading zeros vanish (007 is 7). */
export function parseNum(raw: string): number | null {
  const m = toLatin(raw).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * A list of numbers. Anything that is not a digit separates them (comma, Arabic comma, space, و, a dash, a slash…),
 * so «19-23» is just 19 and 23 — never a range. Weeks are de-duplicated and sorted; a list whose order matters is not.
 */
export function parseList(raw: string, sorted: boolean): number[] {
  const nums = (toLatin(raw).match(/\d+/g) ?? []).map(n => parseInt(n, 10)).slice(0, 200);
  return sorted ? [...new Set(nums)].sort((a, b) => a - b) : nums;
}

const MONTHS: [RegExp, number][] = [
  [/يناير|jan\w*/i, 1], [/فبراير|feb\w*/i, 2], [/مارس|mar\w*/i, 3], [/ابريل|أبريل|apr\w*/i, 4], [/مايو|mayo?|may/i, 5],
  [/يونيه|يونيو|jun\w*/i, 6], [/يوليه|يوليو|jul\w*/i, 7], [/اغسطس|أغسطس|aug\w*/i, 8], [/سبتمبر|sep\w*/i, 9],
  [/اكتوبر|أكتوبر|oct\w*/i, 10], [/نوفمبر|nov\w*/i, 11], [/ديسمبر|dec\w*/i, 12],
];

const pad = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number) => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export type DateCtx = {
  from?: string;
  to?: string;
  yearLabel?: string;
  startSaturday?: string;
};

/**
 * Dedue the calendar year for a day and month based on training year context:
 * - inst.yearLabel (e.g. "2025 / 2026")
 * - inst.startSaturday (e.g. "2026-10-03")
 * - ctx.from / ctx.to
 */
export function deduceYear(m: number, d: number, ctx?: DateCtx): number {
  const labelYears = (toLatin(ctx?.yearLabel ?? '').match(/\b(19\d\d|20\d\d)\b/g) || []).map(Number);
  const startRef = ctx?.startSaturday || ctx?.from;
  const startYear = startRef ? +startRef.slice(0, 4) : undefined;
  const startMonth = startRef ? +startRef.slice(5, 7) : undefined;

  let yStart: number;
  let yEnd: number;

  if (labelYears.length >= 2) {
    yStart = Math.min(...labelYears);
    yEnd = Math.max(...labelYears);
  } else if (labelYears.length === 1) {
    const ly = labelYears[0];
    if (startYear && startYear < ly) {
      yStart = startYear;
      yEnd = ly;
    } else if (startYear && startYear > ly) {
      yStart = ly;
      yEnd = startYear;
    } else {
      yStart = ly;
      yEnd = ly + 1;
    }
  } else if (startYear) {
    yStart = startYear;
    yEnd = startYear + 1;
  } else {
    const nowY = new Date().getFullYear();
    yStart = nowY;
    yEnd = nowY + 1;
  }

  // 1. If any candidate year puts the date strictly inside [ctx.from, ctx.to], prioritize it!
  if (ctx?.from || ctx?.to) {
    for (const yy of [yStart, yEnd]) {
      const iso = `${yy}-${pad(m)}-${pad(d)}`;
      if (valid(yy, m, d) && (!ctx.from || iso >= ctx.from) && (!ctx.to || iso <= ctx.to)) {
        return yy;
      }
    }
  }

  // 2. Training year semester cutoff:
  // In the Egyptian Armed Forces calendar, the training year begins in autumn (Sept/Oct).
  // If startMonth >= 7, months >= startMonth belong to yStart, and months < startMonth belong to yEnd.
  // If startMonth < 7 (second semester), cutoff is month 9 (Sept), so months >= 9 belong to yStart and months < 9 belong to yEnd.
  const cutoff = (startMonth && startMonth >= 7) ? startMonth : 9;
  const chosenYear = (m >= cutoff) ? yStart : yEnd;

  if (valid(chosenYear, m, d)) return chosenYear;
  const altYear = chosenYear === yStart ? yEnd : yStart;
  if (valid(altYear, m, d)) return altYear;

  return chosenYear;
}

/**
 * A date written almost any way: 3-4-2026, 3/4/2026, 2026-04-03, 03.04.26, ٣ ـ ٤ ـ ٢٠٢٦, 3 أبريل 2026 …
 * Year first means year-month-day; otherwise day comes first (month first only when the day part is clearly above 12).
 * With only day and month (e.g. 12-7), the year is deduced from yearLabel, startSaturday, and the training period.
 */
export function parseDate(raw: string, ctx?: DateCtx): string | null {
  let t = toLatin(raw);
  for (const [re, n] of MONTHS) t = t.replace(re, ` ${n} `);
  const parts = t.match(/\d+/g);
  if (!parts) return null;
  let y: number; let m: number; let d: number;
  if (parts.length >= 3) {
    const [a, b, c] = parts;
    if (a.length === 4) { y = +a; m = +b; d = +c; }
    else if (c.length === 4) { d = +a; m = +b; y = +c; }
    else if (c.length <= 2) { d = +a; m = +b; y = 2000 + +c; }
    else return null;
  } else if (parts.length === 2) {
    d = +parts[0]; m = +parts[1];
    if (m > 12 && d <= 12) [d, m] = [m, d];
    y = deduceYear(m, d, ctx);
  } else return null;
  if (m > 12 && d <= 12) [d, m] = [m, d]; // 4/13/2026: the second number cannot be a month
  return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/**
 * Parses multiple dates pasted or typed together (comma, newline, semicolon-separated).
 * Supports ranges like "12-7 إلى 15-7" or "12/7 - 15/7".
 */
export function parseBulkHolidays(rawText: string, ctx?: DateCtx): { from: string; to: string | null }[] {
  const chunks = rawText.split(/[\n\r,،;]+/);
  const results: { from: string; to: string | null }[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const rangeMatch = trimmed.match(/^(.+?)\s*(?:إلى|حتى|to|–|—|\s-\s)\s*(.+)$/i);
    if (rangeMatch) {
      const f = parseDate(rangeMatch[1], ctx);
      const t = parseDate(rangeMatch[2], ctx);
      if (f) {
        results.push({ from: f, to: t && t >= f ? t : null });
      }
    } else {
      const d = parseDate(trimmed, ctx);
      if (d) {
        results.push({ from: d, to: null });
      }
    }
  }
  return results;
}

/** 2026-04-03 -> ٣/٤/٢٠٢٦ */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return toArabic(`${d}/${m}/${y}`);
}
