import type { AgendaResult, Instructions, LinkingResult, SlotEntry, SubjectKey, WeeklyExtract } from './types';
import { getAllKeys } from './types';
import { sum } from './rounding';

interface Block { day: number; first: number; len: number }

/** Build paired 2-hr (or 1-hr remainder) lecture blocks for a single day's free slots. */
function buildFreeBlocks(dayIdx: number, hours: number, reserved: number): Block[] {
  const free: number[] = [];
  for (let l = reserved + 1; l <= hours; l++) free.push(l);
  const blocks: Block[] = [];
  for (let i = 0; i < free.length; i += 2)
    blocks.push({ day: dayIdx, first: free[i], len: Math.min(2, free.length - i) });
  return blocks;
}

/** Page 4: weekly extract for one week, from the page-3 week split and the agenda days. */
export function calculateWeekly(agenda: AgendaResult, linking: LinkingResult, week: number, inst?: Instructions): WeeklyExtract | null {
  const wr = agenda.weeks.find(w => w.week === week);
  if (!wr) return null;
  const block = linking.weeks.find(w => w.weekNumbers.includes(week));
  if (!block) return null;
  const col = block.weekNumbers.indexOf(week);
  const cells = block.b.cells[col];
  const days = wr.days.slice(0, 6); // Sat..Thu
  const allKeys = getAllKeys(inst);

  const rem: Record<SubjectKey, { day: number; night: number }> = Object.fromEntries(
    allKeys.map(k => [k, { day: cells[k]?.day || 0, night: cells[k]?.night || 0 }]),
  ) as never;
  const slots: Record<SubjectKey, SlotEntry[][]> = Object.fromEntries(
    allKeys.map(k => [k, days.map(() => [] as SlotEntry[])]),
  ) as never;
  const push = (k: SubjectKey, di: number, first: number, len: number) => {
    const lectures = `${first}-${first + len - 1}`;
    slots[k][di].push({ hours: len, lectures, text: `${len} / ${lectures}` });
  };

  // ── Step 1: reserved lectures (fitness → education → security) at the top of each day ──
  const reservedDay: number[] = [];
  days.forEach((d, di) => {
    let at = 0;
    const take = (k: SubjectKey, n: number) => { if (n > 0) { push(k, di, at + 1, n); at += n; rem[k].day -= n; } };
    if (d.kind === 'march') { take('fitness', d.fitness); take('security', d.security); }
    else { take('fitness', d.fitness); take('education', d.education); take('security', d.security); }
    reservedDay.push(at);
  });

  // ── Step 2: build free blocks per day ──
  const freeBlocksByDay: Block[][] = days.map((d, di) =>
    buildFreeBlocks(di, d.day, reservedDay[di]),
  );
  const nightBlocksByDay: Block[][] = days.map((d, di) => {
    const bs: Block[] = [];
    for (let i = 0; i < d.night; i += 2)
      bs.push({ day: di, first: 8 + i, len: Math.min(2, d.night - i) });
    return bs;
  });

  const free: SubjectKey[] = allKeys.filter(k => k !== 'fitness' && k !== 'education' && k !== 'security');

  const dayAlloc: Record<SubjectKey, number[]> = Object.fromEntries(allKeys.map(k => [k, days.map(() => 0)])) as never;
  const nightAlloc: Record<SubjectKey, number[]> = Object.fromEntries(allKeys.map(k => [k, days.map(() => 0)])) as never;

  /**
   * Balanced assignment — column-major round-robin across days.
   * Spreads each subject's 2-hour (or 1-hour) blocks across different days
   * before any day receives a second block of the same subject.
   */
  const assignBalanced = (blocksByDay: Block[][], kind: 'day' | 'night') => {
    const alloc = kind === 'day' ? dayAlloc : nightAlloc;
    const maxRounds = Math.max(0, ...blocksByDay.map(bs => bs.length));
    const usedOnDay: Set<SubjectKey>[] = days.map(() => new Set<SubjectKey>());

    for (let round = 0; round < maxRounds; round++) {
      for (let di = 0; di < blocksByDay.length; di++) {
        const dayBlks = blocksByDay[di];
        if (round >= dayBlks.length) continue;

        const b = dayBlks[round];
        let len = b.len;

        while (len > 0) {
          const withHours = free.filter(k => rem[k][kind] > 0);
          if (!withHours.length) break;

          const preferred = withHours
            .filter(k => !usedOnDay[di].has(k))
            .sort((a, c) => rem[c][kind] - rem[a][kind]);
          const pool = preferred.length ? preferred : withHours.sort((a, c) => rem[c][kind] - rem[a][kind]);

          const fit = pool.find(k => rem[k][kind] >= len);
          const k = fit ?? pool[0];
          const n = fit ? len : Math.min(rem[k][kind], len);

          alloc[k][di] += n;
          rem[k][kind] -= n;
          usedOnDay[di].add(k);
          len -= n;
        }
      }
    }
  };

  assignBalanced(freeBlocksByDay, 'day');
  assignBalanced(nightBlocksByDay, 'night');

  // ── Step 3: row order — fitness, education, security always first, then the rest ──
  const PRIORITY: SubjectKey[] = ['fitness', 'education', 'security'];
  const orderedKeys: SubjectKey[] = [
    ...PRIORITY.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !PRIORITY.includes(k)),
  ];

  // ── Step 4: number lecture slots in top-to-bottom row order for each day ──
  // Daytime lectures: start at reservedDay[di] + 1 (e.g. 2), advance down rows (2-3, 4-5, 6-7)
  // Nighttime lectures: start at 8, advance down rows (8-9, 10-11)
  days.forEach((_d, di) => {
    let curDay = reservedDay[di] + 1;
    for (const k of orderedKeys) {
      let h = dayAlloc[k][di];
      while (h > 0) {
        // If a subject has 4 consecutive hours covering lectures 4 to 7, merge into a single "4 / 4-7"
        const chunk = (curDay === 4 && h === 4) ? 4 : Math.min(2, h);
        push(k, di, curDay, chunk);
        curDay += chunk;
        h -= chunk;
      }
    }

    let curNight = 8;
    for (const k of orderedKeys) {
      let h = nightAlloc[k][di];
      while (h > 0) {
        const chunk = Math.min(2, h);
        push(k, di, curNight, chunk);
        curNight += chunk;
        h -= chunk;
      }
    }
  });

  const rows = orderedKeys.map(k => ({
    key: k,
    day: cells[k]?.day || 0,
    night: cells[k]?.night || 0,
    slots: slots[k],
  }));

  const perDayHours = days.map((_, di) => sum(allKeys.map(k => sum(slots[k][di].map(s => s.hours)))));
  const daysOk = days.every((d, di) => perDayHours[di] === d.day + d.night);
  const subjOk = allKeys.every(k => sum(slots[k].flat().map(s => s.hours)) === (cells[k]?.day || 0) + (cells[k]?.night || 0));

  return {
    week, from: wr.days[0].date, to: wr.days[6].date,
    days: days.map(d => ({ date: d.date, dow: d.dow, day: d.day, night: d.night, kind: d.kind })),
    rows, totals: { day: wr.day, night: wr.night },
    checks: { days: daysOk, subjects: subjOk, ok: daysOk && subjOk },
  };
}
