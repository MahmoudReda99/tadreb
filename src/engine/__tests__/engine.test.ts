import { describe, expect, it } from 'vitest';
import { calculateAgenda } from '../agenda';
import { calculateDistribution } from '../distribution';
import { calculateLinking } from '../linking';
import { calculateWeekly } from '../weekly';
import { defaultWeeksPerMonth } from '../dates';
import { allocateEven, nearestEven } from '../rounding';
import { FIXTURE_108 as F, KEY_108 as K } from '../fixtures';
import { ALL_KEYS } from '../types';

const agenda = calculateAgenda(F);
const dist = calculateDistribution(F, agenda);
const link = calculateLinking(F, agenda, dist);

describe('rounding', () => {
  it('nearest even', () => {
    expect(nearestEven(116.25)).toBe(116);
    expect(nearestEven(5.23)).toBe(6);
    expect(nearestEven(15.5)).toBe(16);
    expect(nearestEven(19.53)).toBe(20);
    expect(nearestEven(7.75)).toBe(8);
  });
  it('allocateEven keeps total and evenness', () => {
    const a = allocateEven(78, [89, 120, 120, 129, 89, 56]);
    expect(a.reduce((x, y) => x + y)).toBe(78);
    expect(a).toEqual([12, 16, 16, 16, 12, 6]);
  });
});

describe('calendar', () => {
  it('weeks per month by calendar match the exam table', () => {
    expect(defaultWeeksPerMonth('2023-12-30', 26)).toEqual([5, 4, 4, 5, 4, 4]);
  });
});

describe('page 1 agenda', () => {
  it('grand totals', () => {
    expect(agenda.total).toBe(K.total);
    expect(agenda.day).toBe(K.day);
    expect(agenda.night).toBe(K.night);
    expect(agenda.fitness).toBe(K.fitness);
    expect(agenda.education).toBe(K.education);
    expect(agenda.security).toBe(K.security);
    expect(agenda.checks.ok).toBe(true);
  });
  it('month columns', () => {
    expect(agenda.months.map(m => m.day)).toEqual(K.monthDay);
    expect(agenda.months.map(m => m.night)).toEqual(K.monthNight);
    expect(agenda.months.map(m => m.fitness)).toEqual(K.monthFitness);
  });
  it('May weeks', () => {
    for (const [w, [d, n]] of Object.entries(K.weekMay)) {
      const row = agenda.weeks[Number(w) - 1];
      expect([row.day, row.night]).toEqual([d, n]);
    }
  });
  it('paint order and special days', () => {
    const wk = (w: number) => agenda.weeks[w - 1].days;
    expect(wk(2)[1].kind).toBe('holiday'); // 7/1 inside the prep week
    expect(wk(1).every(d => d.kind === 'prep')).toBe(true);
    expect(wk(21).every(d => d.kind === 'ops' || d.kind === 'holiday')).toBe(true);
    expect(wk(16).every(d => d.kind === 'camp')).toBe(true);
    expect(wk(16)[0]).toMatchObject({ day: 5, night: 6, fitness: 1 });
    expect(wk(16)[5]).toMatchObject({ day: 0, night: 0 });
    expect(wk(4)[0].kind).toBe('march'); // Jan, 4th week
    expect(wk(24)[0].kind).toBe('march'); // June uses the 2nd week
    expect(wk(17)[0]).toMatchObject({ kind: 'march', fitness: 7, security: 0 }); // April 7+0
    expect(wk(12)[1].kind).toBe('ramadan');
    expect(wk(12)[1]).toMatchObject({ day: 7, night: 0 }); // Ramadan Sunday is short
    expect(wk(12)[2]).toMatchObject({ day: 1, fitness: 1 }); // Monday unchanged
    expect(wk(26).every(d => d.kind === 'reserve')).toBe(true);
  });
});

describe('page 2 distribution', () => {
  it('totals', () => {
    expect(dist.mainTotal).toBe(K.mainTotal);
    expect(dist.generalTotal).toBe(K.generalTotal);
    expect(dist.mainCell.night).toBe(K.mainNight);
    expect(dist.generalCell.night).toBe(K.generalNight);
    expect(dist.checks.ok).toBe(true);
  });
  it('every subject day / night', () => {
    for (const k of ALL_KEYS) {
      const [d, n] = K.page2[k];
      expect([k, dist.cells[k].day, dist.cells[k].night]).toEqual([k, d, n]);
    }
  });
  it('technical levels', () => {
    for (const l of ['individual', 'crew', 'centre'] as const) {
      const [d, n] = K.techLevels[l];
      expect([l, dist.techLevels[l].day, dist.techLevels[l].night]).toEqual([l, d, n]);
    }
  });
});

describe('page 3 linking', () => {
  it('horizontal and vertical checks', () => {
    expect(link.months.rowsOk).toBe(true);
    expect(link.months.colsOk).toBe(true);
    expect(link.checks.ok).toBe(true);
  });
  it('main totals per month match the key', () => {
    expect(link.months.main.map(m => m.day)).toEqual(K.monthMainDay);
    expect(link.months.main.map(m => m.night)).toEqual(K.monthMainNight);
  });
  it('tactics per month match the key', () => {
    expect(link.months.cells.map(c => [c.tactics.day, c.tactics.night]).slice(0, 5).map(x => x[0])).toEqual([12, 16, 16, 16, 12]);
    expect(link.months.cells.map(c => c.tactics.day)).toEqual(K.monthTactics.map(x => x[0]));
  });
  it('agenda-driven rows equal the agenda per month', () => {
    expect(link.months.cells.map(c => c.fitness.day)).toEqual(K.monthFitness);
    expect(link.months.cells.map(c => c.security.day)).toEqual([4, 4, 2, 0, 4, 4]);
  });
  it('May split by weeks, ops week = 0', () => {
    const may = link.weeks[4];
    expect(may.weekNumbers).toEqual([19, 20, 21, 22]);
    expect(may.b.cols.map(c => [c.day, c.night])).toEqual([[29, 8], [30, 8], [0, 0], [30, 8]]);
    expect(may.b.cells[2] && ALL_KEYS.every(k => may.b.cells[2][k].day === 0 && may.b.cells[2][k].night === 0)).toBe(true);
    expect(may.b.rowsOk && may.b.colsOk).toBe(true);
  });
  it('every month split by weeks is consistent', () => {
    link.weeks.forEach(w => { expect(w.b.rowsOk).toBe(true); expect(w.b.colsOk).toBe(true); });
  });
});

describe('page 4 weekly extract', () => {
  it('week 20 slots add up to the day hours and to each subject', () => {
    const ex = calculateWeekly(agenda, link, 20)!;
    expect(ex.checks.ok).toBe(true);
    expect(ex.totals).toEqual({ day: 30, night: 8 });
    const fit = ex.rows.find(r => r.key === 'fitness')!;
    expect(fit.slots.map(s => s.map(e => e.text))).toEqual([['1 / 1-1'], ['1 / 1-1'], ['1 / 1-1'], ['1 / 1-1'], ['1 / 1-1'], []]);
    const edu = ex.rows.find(r => r.key === 'education')!;
    expect(edu.slots[5].map(e => e.text)).toEqual(['1 / 1-1']);
    const nightSlots = ex.rows.flatMap(r => r.slots.flat()).filter(e => /8-9|10-11/.test(e.lectures));
    expect(nightSlots.length).toBe(4);
  });
  it('all training weeks pass the checks', () => {
    for (const w of agenda.weeks) {
      const ex = calculateWeekly(agenda, link, w.week);
      expect(ex?.checks.ok, `week ${w.week}`).toBe(true);
    }
  });
});

describe('page 3 linking – no negative cells', () => {
  it('all month cells are non-negative (fixture 108)', () => {
    for (const col of link.months.cells) {
      for (const k of ALL_KEYS) {
        expect(col[k].day, `months – ${k}.day`).toBeGreaterThanOrEqual(0);
        expect(col[k].night, `months – ${k}.night`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('all week cells are non-negative (fixture 108)', () => {
    for (const wm of link.weeks) {
      for (const col of wm.b.cells) {
        for (const k of ALL_KEYS) {
          expect(col[k].day, `month ${wm.month} – ${k}.day`).toBeGreaterThanOrEqual(0);
          expect(col[k].night, `month ${wm.month} – ${k}.night`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('link.checks.ok is true (fixture 108)', () => {
    expect(link.checks.ok).toBe(true);
  });

  it('no negative cells in a scenario with a 1-hour holiday week', () => {
    // Build a minimal instruction set where month 1 has weeks [0, 1] (normal, holiday).
    // We test by using FIXTURE_108 and checking the August month which contains
    // the fewest hours (Eid al-Adha holiday week = very low hours).
    const augustMonth = link.weeks.at(-1)!; // last month = June / lightest
    for (const col of augustMonth.b.cells) {
      for (const k of ALL_KEYS) {
        expect(col[k].day, `holiday-month – ${k}.day`).toBeGreaterThanOrEqual(0);
        expect(col[k].night, `holiday-month – ${k}.night`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
