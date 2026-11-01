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

/**
 * A date written almost any way: 3-4-2026, 3/4/2026, 2026-04-03, 03.04.26, ٣ ـ ٤ ـ ٢٠٢٦, 3 أبريل 2026 …
 * Year first means year-month-day; otherwise day comes first (month first only when the day part is clearly above 12).
 * With only day and month, the year is the one that puts the date inside `ctx` (the training period).
 */
export function parseDate(raw: string, ctx?: { from?: string; to?: string }): string | null {
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
    const y0 = ctx?.from ? +ctx.from.slice(0, 4) : new Date().getFullYear();
    const y1 = ctx?.to ? +ctx.to.slice(0, 4) : y0 + 1;
    y = y0;
    for (let yy = y0; yy <= Math.max(y0, y1); yy++) {
      const iso = `${yy}-${pad(m)}-${pad(d)}`;
      if (valid(yy, m, d) && (!ctx?.from || iso >= ctx.from) && (!ctx?.to || iso <= ctx.to)) { y = yy; break; }
    }
  } else return null;
  if (m > 12 && d <= 12) [d, m] = [m, d]; // 4/13/2026: the second number cannot be a month
  return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** 2026-04-03 -> ٣/٤/٢٠٢٦ */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return toArabic(`${d}/${m}/${y}`);
}
