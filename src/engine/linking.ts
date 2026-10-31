import type { AgendaResult, Breakdown, Cell, Cells, ColumnTarget, DistributionResult, Instructions, LinkingResult, SubjectKey } from './types';
import { ALL_KEYS, GENERAL_KEYS } from './types';
import { allocateEven, sum } from './rounding';
import { monthNames } from './dates';

const emptyCells = (): Cells => Object.fromEntries(ALL_KEYS.map(k => [k, { day: 0, night: 0 }])) as Cells;

/** move 2-hour units between columns of the night-subject rows until every column hits its target */
function balanceColumns(rows: number[][], quotas: number[][], targets: number[]) {
  for (let guard = 0; guard < 2000; guard++) {
    const diff = targets.map((t, c) => t - sum(rows.map(r => r[c])));
    const def = diff.findIndex(x => x >= 2);
    const sur = diff.findIndex(x => x <= -2);
    if (def < 0 || sur < 0) return;
    let best = -1; let bestCost = Infinity;
    rows.forEach((r, i) => {
      if (r[sur] < 2) return;
      const cost = Math.abs(r[def] + 2 - quotas[i][def]) + Math.abs(r[sur] - 2 - quotas[i][sur])
        - Math.abs(r[def] - quotas[i][def]) - Math.abs(r[sur] - quotas[i][sur]);
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    if (best < 0) return;
    rows[best][def] += 2; rows[best][sur] -= 2;
  }
}

/** a balancing row must not go negative: shift 2-hour units of the other rows from its low columns to its richest column */
function repair(balance: number[], rows: number[][], quotas: number[][]) {
  for (let guard = 0; guard < 4000; guard++) {
    const a = balance.findIndex(x => x < 0);
    if (a < 0) return;
    let b = 0;
    balance.forEach((x, i) => { if (x > balance[b]) b = i; });
    if (b === a) return;
    let moved = false;
    for (const step of [2, 1]) { // an odd single hour only when no whole 2-hour unit can move
      if (balance[b] < step) continue;
      let best = -1; let bestCost = Infinity;
      rows.forEach((r, i) => {
        if (r[a] < step) return;
        const cost = Math.abs(r[b] + step - quotas[i][b]) + Math.abs(r[a] - step - quotas[i][a])
          - Math.abs(r[b] - quotas[i][b]) - Math.abs(r[a] - quotas[i][a]);
        if (cost < bestCost) { bestCost = cost; best = i; }
      });
      if (best < 0) continue;
      rows[best][a] -= step; rows[best][b] += step; balance[a] += step; balance[b] -= step;
      moved = true; break;
    }
    if (!moved) return;
  }
}
const quotaOf = (total: number, w: number[]) => { const t = sum(w); return w.map(x => (t ? (total * x) / t : 0)); };

/**
 * Splits subject totals (`rows`) over columns (months, or the weeks of one month).
 * cell = subjectTotal × columnTotal / grandTotal, rounded to even with largest remainder;
 * fitness / education / security come from the agenda; shooting balances the column's main
 * subjects, information war balances its general subjects.
 */
export function breakdown(rows: Cells, cols: ColumnTarget[]): Breakdown {
  const C = cols.length;
  const out: Cells[] = cols.map(emptyCells);
  const dayW = cols.map(c => c.day); const nightW = cols.map(c => c.night);
  const rowDay = (k: SubjectKey) => rows[k].day; const rowNight = (k: SubjectKey) => rows[k].night;
  const mainDayTot = sum(['tactics', 'tech', 'shooting', 'fitness'].map(k => rowDay(k as SubjectKey)));
  const mainNightTot = sum(['tactics', 'tech', 'shooting', 'fitness'].map(k => rowNight(k as SubjectKey)));
  const mainDay = allocateEven(mainDayTot, dayW); const mainNight = allocateEven(mainNightTot, nightW);
  const genDay = cols.map((c, i) => c.day - mainDay[i]); const genNight = cols.map((c, i) => c.night - mainNight[i]);

  const keysFixed: SubjectKey[] = ['fitness', 'education', 'security'];
  out.forEach((o, i) => { for (const k of keysFixed) o[k] = { day: cols[i][k as 'fitness'], night: 0 }; });
  // main subjects: tactics and technical by proportion, shooting balances the column
  for (const half of ['day', 'night'] as const) {
    const w = half === 'day' ? dayW : nightW;
    const rowsM = (['tactics', 'tech'] as SubjectKey[]).map(k => allocateEven(rows[k][half], w));
    const q = (['tactics', 'tech'] as SubjectKey[]).map(k => quotaOf(rows[k][half], w));
    const colMain = half === 'day' ? mainDay : mainNight;
    const shoot = cols.map((_, c) => colMain[c] - (half === 'day' ? out[c].fitness.day : 0) - rowsM[0][c] - rowsM[1][c]);
    repair(shoot, rowsM, q);
    out.forEach((o, c) => { o.tactics[half] = rowsM[0][c]; o.tech[half] = rowsM[1][c]; o.shooting[half] = shoot[c]; });
  }
  // general day: proportional subjects, information war balances the column
  const propDay: SubjectKey[] = ['discipline', 'topography', 'morale', 'recon', 'engineering', 'chemical', 'admin', 'history', 'intlLaw'];
  const pr = propDay.map(k => allocateEven(rows[k].day, dayW));
  const pq = propDay.map(k => quotaOf(rows[k].day, dayW));
  const iw = cols.map((c, i) => genDay[i] - c.education - c.security - sum(pr.map(r => r[i])));
  repair(iw, pr, pq);
  propDay.forEach((k, r) => out.forEach((o, i) => (o[k].day = pr[r][i])));
  out.forEach((o, i) => (o.infoWar = { day: iw[i], night: 0 }));
  // general night: the four night subjects must fill each column's general night exactly
  const gNight: SubjectKey[] = ['topography', 'recon', 'engineering', 'chemical'];
  const nrows = gNight.map(k => allocateEven(rows[k].night, nightW));
  balanceColumns(nrows, gNight.map(k => quotaOf(rows[k].night, nightW)), genNight);
  gNight.forEach((k, r) => out.forEach((o, i) => (o[k].night = nrows[r][i])));

  const main = out.map(o => ({ day: sum(['tactics', 'tech', 'shooting', 'fitness'].map(k => o[k as SubjectKey].day)), night: sum(['tactics', 'tech', 'shooting', 'fitness'].map(k => o[k as SubjectKey].night)) }));
  const general: Cell[] = out.map(o => ({ day: sum(GENERAL_KEYS.map(k => o[k].day)), night: sum(GENERAL_KEYS.map(k => o[k].night)) }));
  const rowsOk = ALL_KEYS.every(k => sum(out.map(o => o[k].day)) === rows[k].day && sum(out.map(o => o[k].night)) === rows[k].night);
  const colsOk = out.every((_o, i) => main[i].day + general[i].day === cols[i].day && main[i].night + general[i].night === cols[i].night)
    && out.every(o => ALL_KEYS.every(k => o[k].day >= 0 && o[k].night >= 0));
  void C;
  return { cols, cells: out, main, general, rowsOk, colsOk };
}

/** Page 3: months, plus the week split of every month (ops week = 0). */
export function calculateLinking(inst: Instructions, agenda: AgendaResult, dist: DistributionResult): LinkingResult {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const monthCols: ColumnTarget[] = agenda.months.map((m, i) => ({
    label: names[i], day: m.day, night: m.night, fitness: m.fitness, education: m.education, security: m.security,
  }));
  const months = breakdown(dist.cells, monthCols);
  const weeks = agenda.months.map((_m, i) => {
    const ws = agenda.weeks.filter(w => w.month === i);
    const cols: ColumnTarget[] = ws.map(w => ({
      label: String(w.week), day: w.day, night: w.night, fitness: w.fitness, education: w.education, security: w.security,
    }));
    const rows = Object.fromEntries(ALL_KEYS.map(k => [k, months.cells[i][k]])) as Cells;
    return { month: i, weekNumbers: ws.map(w => w.week), b: breakdown(rows, cols) };
  });
  const rows = months.rowsOk && weeks.every(w => w.b.rowsOk);
  const colsOk = months.colsOk && weeks.every(w => w.b.colsOk);
  return { months, weeks, checks: { rows, cols: colsOk, ok: rows && colsOk } };
}
