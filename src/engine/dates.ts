import type { DateRange, DateStr } from './types';

export const parseDate = (s: DateStr): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const fmt = (d: Date): DateStr => d.toISOString().slice(0, 10);
export const addDays = (s: DateStr, n: number): DateStr => fmt(new Date(parseDate(s).getTime() + n * 864e5));
export const dowOf = (s: DateStr) => parseDate(s).getUTCDay(); // 0=Sun..6=Sat
export const inRange = (s: DateStr, r: DateRange) => s >= r.from && s <= r.to;
export const isHoliday = (s: DateStr, hs: (DateStr | DateRange)[]) =>
  hs.some(h => (typeof h === 'string' ? h === s : inRange(s, h)));
export const dm = (s: DateStr) => { const d = parseDate(s); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
export const dmy = (s: DateStr) => { const d = parseDate(s); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`; };

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيه', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const DAYS_AR = ['الأحد', 'الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Calendar month (0-11) that holds most of the week's Sat..Thu days (a tie goes to the later month). */
export function weekCalendarMonth(satStr: DateStr): number {
  const first = parseDate(satStr).getUTCMonth();
  const c = new Map<number, number>();
  for (let i = 0; i < 6; i++) {
    const m = parseDate(addDays(satStr, i)).getUTCMonth();
    c.set(m, (c.get(m) ?? 0) + 1);
  }
  const ordered = [...c.keys()].sort((a, b) => ((a - first + 12) % 12) - ((b - first + 12) % 12));
  return ordered.reduce((best, m) => (c.get(m)! >= c.get(best)! ? m : best), ordered[0]);
}

/**
 * Weeks per month. The exam tables use a 5-4-4-5-4-4 grouping for a 26-week period (courses 108 and 111 both do,
 * even where a week straddles two months); other lengths fall back to the month holding most of the week's days.
 * Always editable in the review screen.
 */
export function defaultWeeksPerMonth(startSaturday: DateStr, totalWeeks: number): number[] {
  if (totalWeeks === 26) return [5, 4, 4, 5, 4, 4];
  return weeksByCalendar(startSaturday, totalWeeks);
}

export function weeksByCalendar(startSaturday: DateStr, totalWeeks: number): number[] {
  const res: number[] = [];
  let prev = -1;
  for (let w = 0; w < totalWeeks; w++) {
    const m = weekCalendarMonth(addDays(startSaturday, w * 7));
    if (m !== prev) { res.push(0); prev = m; }
    res[res.length - 1]++;
  }
  return res;
}

export function monthNames(startSaturday: DateStr, count: number): string[] {
  const first = weekCalendarMonth(startSaturday);
  return Array.from({ length: count }, (_, i) => MONTHS_AR[(first + i) % 12]);
}
