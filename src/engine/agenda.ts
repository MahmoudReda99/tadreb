import type { AgendaResult, DayCell, DayKind, Instructions, Level, MonthRow, WeekRow } from './types';
import { addDays, dowOf, inRange, isHoliday, monthNames } from './dates';
import { sum } from './rounding';

/** month index (0-based) of every week, from weeksPerMonth; surplus weeks join the last month */
export function weekMonths(inst: Instructions): number[] {
  const out: number[] = [];
  inst.weeksPerMonth.forEach((n, m) => { for (let i = 0; i < n; i++) out.push(m); });
  while (out.length < inst.totalWeeks) out.push(Math.max(0, inst.weeksPerMonth.length - 1));
  return out.slice(0, inst.totalWeeks);
}

/** weeks that carry training: everything except prep, ops-task and reserve weeks */
export const isTrainingWeek = (inst: Instructions, w: number) =>
  !inst.prepWeeks.includes(w) && !inst.opsWeeks.includes(w) && !inst.reserveWeeks.includes(w);

/** week -> level (individual, then crew, then centre) over the training weeks in order */
export function weekLevels(inst: Instructions): Map<number, Level> {
  const res = new Map<number, Level>();
  const order: Level[] = [];
  (['individual', 'crew', 'centre'] as Level[]).forEach(l => { for (let i = 0; i < inst.levelWeeks[l]; i++) order.push(l); });
  let k = 0;
  const first = inst.firstWeek ?? 1;
  for (let w = first; w < first + inst.totalWeeks && k < order.length; w++) {
    if (isTrainingWeek(inst, w)) res.set(w, order[k++]);
  }
  return res;
}

interface Hours { day: number; night: number; fitness: number; education: number; security: number }
const Z: Hours = { day: 0, night: 0, fitness: 0, education: 0, security: 0 };

/** paint order: 1 holiday > 2 prep > 3 reserve > 4 ops > 5 camp > 6 march > 7 Ramadan/Friday > 8 weekday type */
function resolveDay(date: string, week: number, month: number, weekInMonth: number, inst: Instructions): { kind: DayKind; h: Hours; rule: string } {
  const dow = dowOf(date);
  if (isHoliday(date, inst.holidays)) return { kind: 'holiday', h: Z, rule: 'إجازة رسمية — لا يوجد تدريب (0 ساعة)' };
  if (inst.prepWeeks.includes(week)) return { kind: 'prep', h: Z, rule: 'أسبوع الفترة التحضيرية — لا يوجد تدريب (0 ساعة)' };
  if (inst.reserveWeeks.includes(week)) return { kind: 'reserve', h: Z, rule: 'أسبوع احتياط — لا يوجد تدريب (0 ساعة)' };
  if (inst.opsWeeks.includes(week)) return { kind: 'ops', h: Z, rule: 'أسبوع تدريب مهام العمليات — لا يدخل فى ساعات التدريب (0 ساعة)' };
  if (inst.campWeeks.includes(week)) {
    if (dow === 4 || dow === 5) return { kind: 'camp', h: Z, rule: 'أسبوع المعسكر الليلى — الخميس والجمعة بلا تدريب (0 ساعة)' };
    return { kind: 'camp', h: { day: 5, night: 6, fitness: 1, education: 0, security: 0 }, rule: 'معسكر ليلى — 5 ساعات نهاراً + 6 ليلاً فى كل يوم من السبت إلى الأربعاء، منها ساعة لياقة' };
  }
  const marchWeek = inst.marchWeekExceptions[month] ?? inst.marchWeekOfMonth;
  if (dow === 6 && weekInMonth === marchWeek) {
    const [march, sec] = inst.marchSecurityByMonth[month] ?? [0, 0];
    return {
      kind: 'march', h: { day: 7, night: 0, fitness: march, education: 0, security: sec },
      rule: `يوم طابور السير (السبت من الأسبوع ${marchWeek} فى الشهر) — 7 ساعات: ${march} طابور سير (تُحسب لياقة) + ${sec} أمن حربى`,
    };
  }
  const ram = !!inst.ramadan && inRange(date, inst.ramadan);
  let h: Hours; let rule: string; let base: DayKind;
  if (dow === 5) { h = Z; base = 'friday'; rule = 'الجمعة راحة أسبوعية — لا يوجد تدريب'; }
  else if (dow === 6 || dow === 2) { h = { ...Z, day: 7, fitness: 1 }; base = 'short'; rule = 'يوم قصير — 7 ساعات نهاراً، أولها لياقة بدنية'; }
  else if (dow === 0 || dow === 3) {
    if (ram) { h = { ...Z, day: 7, fitness: 1 }; base = 'short'; rule = 'فى رمضان يصبح اليوم الطويل قصيراً — 7 ساعات نهاراً وبدون ليل'; }
    else { h = { ...Z, day: 7, night: 4, fitness: 1 }; base = 'long'; rule = 'يوم طويل — 7 ساعات نهاراً + 4 ليلاً، أولها لياقة بدنية'; }
  } else if (dow === 1) { h = { ...Z, day: 1, fitness: 1 }; base = 'maintenance'; rule = 'يوم صيانة — ساعة واحدة لياقة بدنية'; }
  else { h = { ...Z, day: 1, education: 1 }; base = 'personnel'; rule = 'يوم شئون أفراد — ساعة واحدة تعليم منضم'; }
  if (ram) return { kind: 'ramadan', h, rule: `شهر رمضان (لونه لبنى) — ${rule}` };
  return { kind: base, h, rule };
}

export function calculateAgenda(inst: Instructions): AgendaResult {
  const wm = weekMonths(inst);
  const levels = weekLevels(inst);
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const seen: Record<number, number> = {};
  const weeks: WeekRow[] = [];
  const first = inst.firstWeek ?? 1;
  for (let i = 0; i < inst.totalWeeks; i++) {
    const w = first + i; // printed week number
    const month = wm[i];
    seen[month] = (seen[month] ?? 0) + 1;
    const sat = addDays(inst.startSaturday, i * 7);
    const days: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(sat, i);
      const { kind, h, rule } = resolveDay(date, w, month, seen[month], inst);
      days.push({ date, week: w, dow: dowOf(date), kind, ...h, rule });
    }
    const day = sum(days.map(d => d.day)); const night = sum(days.map(d => d.night));
    weeks.push({
      week: w, month, days, day, night, total: day + night,
      fitness: sum(days.map(d => d.fitness)), education: sum(days.map(d => d.education)),
      security: sum(days.map(d => d.security)), level: levels.get(w) ?? null,
    });
  }
  const months: MonthRow[] = inst.weeksPerMonth.map((_, m) => {
    const ws = weeks.filter(x => x.month === m);
    const day = sum(ws.map(x => x.day)); const night = sum(ws.map(x => x.night));
    return {
      month: m, name: names[m], weeks: ws.map(x => x.week), day, night, total: day + night,
      fitness: sum(ws.map(x => x.fitness)), education: sum(ws.map(x => x.education)), security: sum(ws.map(x => x.security)),
    };
  });
  const day = sum(weeks.map(x => x.day)); const night = sum(weeks.map(x => x.night));
  const monthly = sum(months.map(x => x.total)) === day + night;
  const weekly = sum(weeks.map(x => x.total)) === day + night;
  return {
    weeks, months, day, night, total: day + night,
    fitness: sum(weeks.map(x => x.fitness)), education: sum(weeks.map(x => x.education)), security: sum(weeks.map(x => x.security)),
    checks: { weekly, monthly, ok: weekly && monthly },
  };
}
