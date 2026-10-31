import type { AgendaResult, LinkingResult, SlotEntry, SubjectKey, WeeklyExtract } from './types';
import { ALL_KEYS } from './types';
import { sum } from './rounding';

interface Block { day: number; first: number; len: number }

/** lecture numbers 1-7 are day lectures, 8-11 night lectures (camp: up to 13) */
function dayBlocks(dayIdx: number, hours: number, reserved: number): { day: Block[]; } {
  const free: number[] = [];
  for (let l = reserved + 1; l <= hours; l++) free.push(l);
  const blocks: Block[] = [];
  for (let i = 0; i < free.length; i += 2) blocks.push({ day: dayIdx, first: free[i], len: Math.min(2, free.length - i) });
  return { day: blocks };
}

/** Page 4: weekly extract for one week, from the page-3 week split and the agenda days. */
export function calculateWeekly(agenda: AgendaResult, linking: LinkingResult, week: number): WeeklyExtract | null {
  const wr = agenda.weeks.find(w => w.week === week);
  if (!wr) return null;
  const block = linking.weeks.find(w => w.weekNumbers.includes(week));
  if (!block) return null;
  const col = block.weekNumbers.indexOf(week);
  const cells = block.b.cells[col];
  const days = wr.days.slice(0, 6); // Sat..Thu

  const rem: Record<SubjectKey, { day: number; night: number }> = Object.fromEntries(
    ALL_KEYS.map(k => [k, { day: cells[k].day, night: cells[k].night }]),
  ) as never;
  const slots: Record<SubjectKey, SlotEntry[][]> = Object.fromEntries(ALL_KEYS.map(k => [k, days.map(() => [] as SlotEntry[])])) as never;
  const push = (k: SubjectKey, di: number, first: number, len: number) => {
    const lectures = `${first}-${first + len - 1}`;
    slots[k][di].push({ hours: len, lectures, text: `${len} / ${lectures}` });
  };

  // reserved lectures (fitness first, then combined education or military security)
  const reservedDay: number[] = [];
  days.forEach((d, di) => {
    let at = 0;
    const take = (k: SubjectKey, n: number) => { if (n > 0) { push(k, di, at + 1, n); at += n; rem[k].day -= n; } };
    if (d.kind === 'march') { take('fitness', d.fitness); take('security', d.security); }
    else { take('fitness', d.fitness); take('education', d.education); take('security', d.security); }
    reservedDay.push(at);
  });

  const free: SubjectKey[] = ALL_KEYS.filter(k => k !== 'fitness' && k !== 'education' && k !== 'security');
  const assign = (list: Block[], kind: 'day' | 'night', startNo: (b: Block) => number) => {
    for (const b of list) {
      let len = b.len;
      let first = startNo(b);
      while (len > 0) {
        const cand = free.filter(k => rem[k][kind] > 0).sort((a, c) => rem[c][kind] - rem[a][kind]);
        if (!cand.length) return;
        const fit = cand.find(k => rem[k][kind] >= len);
        const k = fit ?? cand[0];
        const n = fit ? len : 1;
        push(k, b.day, first, n); rem[k][kind] -= n; first += n; len -= n;
      }
    }
  };
  const dayList: Block[] = []; const nightList: Block[] = [];
  days.forEach((d, di) => {
    dayList.push(...dayBlocks(di, d.day, reservedDay[di]).day);
    for (let i = 0; i < d.night; i += 2) nightList.push({ day: di, first: 8 + i, len: Math.min(2, d.night - i) });
  });
  assign(dayList, 'day', b => b.first);
  assign(nightList, 'night', b => b.first);

  const rows = ALL_KEYS.map(k => ({ key: k, day: cells[k].day, night: cells[k].night, slots: slots[k] }));
  const perDayHours = days.map((_, di) => sum(ALL_KEYS.map(k => sum(slots[k][di].map(s => s.hours)))));
  const daysOk = days.every((d, di) => perDayHours[di] === d.day + d.night);
  const subjOk = ALL_KEYS.every(k => sum(slots[k].flat().map(s => s.hours)) === cells[k].day + cells[k].night);
  return {
    week, from: wr.days[0].date, to: wr.days[6].date,
    days: days.map(d => ({ date: d.date, dow: d.dow, day: d.day, night: d.night, kind: d.kind })),
    rows, totals: { day: wr.day, night: wr.night },
    checks: { days: daysOk, subjects: subjOk, ok: daysOk && subjOk },
  };
}
