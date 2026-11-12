import type { AgendaResult, Breakdown, Cell, Cells, ColumnTarget, DistributionResult, Instructions, LinkingResult, SubjectKey } from './types';
import { getAllKeys, getMainKeys, getGeneralKeys, getNightKeys } from './types';
import { allocateEven, nearestEven, nearestWithParity, sum } from './rounding';
import { monthNames } from './dates';

/**
 * Largest-remainder allocation in units of 2 that also respects per-column
 * capacity caps.  Columns whose weight is 0 always get 0.  Remainder units
 * that cannot fit anywhere (all caps exhausted) are silently dropped so that
 * we never exceed a cap.
 */
function allocateEvenCapped(total: number, weights: number[], caps: number[]): number[] {
  const out = weights.map(() => 0);
  const W = sum(weights);
  if (total <= 0 || W <= 0) return out;
  // Work in 2-hour units; ignore the odd remainder for now
  const odd = total % 2 !== 0;
  const units = (total - (odd ? 1 : 0)) / 2;
  const capUnits = caps.map(c => Math.floor(c / 2)); // cap in 2-h units
  const q = weights.map(w => (units * w) / W);
  const fl = q.map((x, i) => Math.min(Math.floor(x), capUnits[i]));
  let left = units - sum(fl);
  // Distribute remainder units in largest-fraction order, respecting caps
  const order = q
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .filter(o => weights[o.i] > 0)
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length * 2; k++) {
    const idx = order[k % order.length].i;
    if (fl[idx] < capUnits[idx]) { fl[idx]++; left--; }
  }
  fl.forEach((u, i) => (out[i] = u * 2));
  // Place the odd hour on the heaviest column that still has cap space
  if (odd) {
    let m = -1;
    weights.forEach((w, i) => {
      if (out[i] < caps[i] && (m < 0 || w > weights[m])) m = i;
    });
    if (m >= 0) out[m] += 1;
  }
  return out;
}

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
 * Allocates main hours across columns ensuring independent parity constraints:
 * 1. For each column, main total has the same parity as fitness.
 * 2. General total has the same parity as (education + security).
 * 3. Sum of column main totals equals grandMainTotal.
 * 4. Reconciliation uses smart +/- 2 redistribution to preserve parity.
 */
export function allocateMainWithParity(
  grandMainTotal: number,
  cols: ColumnTarget[],
  mainPct: number = 72,
  grandNightMainTotal?: number,
): {
  mainDays: number[];
  mainNights: number[];
  parityOk: boolean;
  conflictMessage?: string;
} {
  const N = cols.length;
  if (N === 0) {
    return { mainDays: [], mainNights: [], parityOk: true };
  }

  const totals = cols.map(c => c.day + c.night);
  const fitness = cols.map(c => c.fitness ?? 0);
  const edu = cols.map(c => c.education ?? 0);
  const sec = cols.map(c => c.security ?? 0);
  const genConstraints = cols.map((_, i) => edu[i] + sec[i]);

  let conflict = false;
  let conflictMessage: string | undefined;

  // Check mathematical feasibility of constraints for each column
  for (let i = 0; i < N; i++) {
    const tParity = Math.abs(totals[i] % 2);
    const sumConstraintParity = Math.abs((fitness[i] + genConstraints[i]) % 2);
    if (tParity !== sumConstraintParity) {
      conflict = true;
      conflictMessage = `تعارض فى قيود الفردية والزوجية للعمود ${cols[i].label || i + 1}: إجمالى الساعات (${totals[i]}) لا يتوافق مع مجموع ساعات القيود (${fitness[i] + genConstraints[i]}).`;
    }
  }

  // 1. Initial independent calculation for each column
  const M = cols.map((_, i) => {
    if (totals[i] === 0) return 0;
    const Xi = (totals[i] * mainPct) / 100;
    const reqParity = (Math.abs(fitness[i]) % 2) as 0 | 1;
    let m = nearestWithParity(Xi, reqParity);

    const minM = fitness[i];
    const maxM = Math.max(minM, totals[i] - genConstraints[i]);
    while (m < minM) m += 2;
    while (m > maxM && m - 2 >= minM) m -= 2;
    return m;
  });

  // 2. Reconcile monthly sum with grandMainTotal
  let diff = grandMainTotal - sum(M);

  if (Math.abs(diff % 2) !== 0) {
    conflict = true;
    if (!conflictMessage) {
      conflictMessage = 'تعارض رياضى: مجموع قيود الفردية والزوجية للأعمدة لا يتطابق مع الإجمالى النهائى.';
    }
  } else {
    // Diff is even: adjust in steps of +/- 2
    while (diff > 0) {
      let bestIdx = -1;
      let bestCost = Infinity;
      for (let i = 0; i < N; i++) {
        if (totals[i] === 0) continue;
        const maxM = Math.max(fitness[i], totals[i] - genConstraints[i]);
        if (M[i] + 2 <= maxM) {
          const Xi = (totals[i] * mainPct) / 100;
          const costChange = Math.abs(M[i] + 2 - Xi) - Math.abs(M[i] - Xi);
          if (costChange < bestCost) {
            bestCost = costChange;
            bestIdx = i;
          }
        }
      }
      if (bestIdx < 0) {
        conflict = true;
        if (!conflictMessage) {
          conflictMessage = 'تعذر استيعاب ساعات الموضوعات الرئيسية ضمن السعة المتاحة دون كسر القيود.';
        }
        break;
      }
      M[bestIdx] += 2;
      diff -= 2;
    }

    while (diff < 0) {
      let bestIdx = -1;
      let bestCost = Infinity;
      for (let i = 0; i < N; i++) {
        if (totals[i] === 0) continue;
        const minM = fitness[i];
        if (M[i] - 2 >= minM) {
          const Xi = (totals[i] * mainPct) / 100;
          const costChange = Math.abs(M[i] - 2 - Xi) - Math.abs(M[i] - Xi);
          if (costChange < bestCost) {
            bestCost = costChange;
            bestIdx = i;
          }
        }
      }
      if (bestIdx < 0) {
        conflict = true;
        if (!conflictMessage) {
          conflictMessage = 'تعذر تخفيض ساعات الموضوعات الرئيسية دون كسر قيد التربية البدنية.';
        }
        break;
      }
      M[bestIdx] -= 2;
      diff += 2;
    }
  }

  // 3. Allocate Main Night (always even)
  const nightW = cols.map(c => c.night);
  const maxNightCap = cols.map((c, i) => Math.max(0, Math.min(c.night, M[i] - fitness[i])));
  const targetNight = grandNightMainTotal ?? nearestEven((grandMainTotal * sum(nightW)) / Math.max(1, sum(totals)));
  const mainNights = allocateEvenCapped(targetNight, nightW, maxNightCap);
  const mainDays = M.map((m, i) => m - mainNights[i]);

  const parityOk = !conflict && cols.every((c, i) => {
    if (totals[i] === 0) return true;
    const mParity = Math.abs(M[i] % 2);
    const gParity = Math.abs((totals[i] - M[i]) % 2);
    const fitP = Math.abs((c.fitness ?? 0) % 2);
    const genP = Math.abs(((c.education ?? 0) + (c.security ?? 0)) % 2);
    return mParity === fitP && gParity === genP;
  });

  return { mainDays, mainNights, parityOk, conflictMessage };
}

/**
 * Splits subject totals (`rows`) over columns (months, or the weeks of one month).
 * cell = subjectTotal × columnTotal / grandTotal, rounded to even with largest remainder;
 * fitness / education / security come from the agenda; shooting balances the column's main
 * subjects, information war balances its general subjects.
 */
export function breakdown(rows: Cells, cols: ColumnTarget[], inst?: Instructions): Breakdown {
  const C = cols.length;
  const allKeys = getAllKeys(inst);
  const mainKeys = getMainKeys(inst);
  const generalKeys = getGeneralKeys(inst);
  const nightKeys = getNightKeys(inst);

  const out: Cells[] = cols.map(() => Object.fromEntries(allKeys.map(k => [k, { day: 0, night: 0 }])) as Cells);
  const dayW = cols.map(c => c.day); const nightW = cols.map(c => c.night);
  const rowDay = (k: SubjectKey) => rows[k]?.day || 0; const rowNight = (k: SubjectKey) => rows[k]?.night || 0;
  const mainDayTot = sum(mainKeys.map(k => rowDay(k)));
  const mainNightTot = sum(mainKeys.map(k => rowNight(k)));
  const grandMain = mainDayTot + mainNightTot;

  const mainPct = inst?.pcts?.mainPct ?? 72;
  const { mainDays: mainDay, mainNights: mainNight, parityOk, conflictMessage } = allocateMainWithParity(
    grandMain,
    cols,
    mainPct,
    mainNightTot,
  );
  const genDay = cols.map((c, i) => c.day - mainDay[i]); const genNight = cols.map((c, i) => c.night - mainNight[i]);

  const keysFixed: SubjectKey[] = ['fitness', 'education', 'security'];
  out.forEach((o, i) => { for (const k of keysFixed) if (cols[i][k as 'fitness'] !== undefined) o[k] = { day: cols[i][k as 'fitness'], night: 0 }; });

  // main subjects: tactics, tech, and custom main subjects by proportion, shooting balances the column
  const propMain = mainKeys.filter(k => k !== 'fitness' && k !== 'shooting');
  for (const half of ['day', 'night'] as const) {
    const w = half === 'day' ? dayW : nightW;
    const rowsM = propMain.map(k => allocateEven(half === 'day' ? rowDay(k) : rowNight(k), w));
    const q = propMain.map(k => quotaOf(half === 'day' ? rowDay(k) : rowNight(k), w));
    const colMain = half === 'day' ? mainDay : mainNight;
    const shoot = cols.map((_, c) => colMain[c] - (half === 'day' ? (out[c].fitness?.day || 0) : 0) - sum(rowsM.map(r => r[c])));
    repair(shoot, rowsM, q);
    out.forEach((o, c) => {
      propMain.forEach((k, idx) => { o[k][half] = rowsM[idx][c]; });
      if (o.shooting) o.shooting[half] = shoot[c];
    });
  }

  // general day: proportional subjects, information war balances the column.
  // Each propDay subject is capped by the available general-day space to prevent iw from going negative.
  const propDay = generalKeys.filter(k => k !== 'education' && k !== 'security' && k !== 'infoWar');
  const availGenDay = cols.map((c, i) => Math.max(0, genDay[i] - c.education - c.security));
  const pr = propDay.map(k => allocateEvenCapped(rowDay(k), dayW, availGenDay));
  const pq = propDay.map(k => quotaOf(rowDay(k), dayW));
  const iw = cols.map((c, i) => genDay[i] - c.education - c.security - sum(pr.map(r => r[i])));
  repair(iw, pr, pq);
  propDay.forEach((k, r) => out.forEach((o, i) => (o[k].day = pr[r][i])));
  out.forEach((o, i) => { if (o.infoWar) o.infoWar = { day: iw[i], night: 0 }; });

  // general night: the night subjects that belong to general
  const gNight = nightKeys.filter(k => generalKeys.includes(k));
  const maxGNight = genNight.map(v => Math.max(0, v));
  const nrows = gNight.map(k => allocateEvenCapped(rowNight(k), nightW, maxGNight));
  balanceColumns(nrows, gNight.map(k => quotaOf(rowNight(k), nightW)), genNight);
  gNight.forEach((k, r) => out.forEach((o, i) => (o[k].night = nrows[r][i])));

  const main = out.map(o => ({ day: sum(mainKeys.map(k => o[k]?.day || 0)), night: sum(mainKeys.map(k => o[k]?.night || 0)) }));
  const general: Cell[] = out.map(o => ({ day: sum(generalKeys.map(k => o[k]?.day || 0)), night: sum(generalKeys.map(k => o[k]?.night || 0)) }));
  const rowsOk = allKeys.every(k => sum(out.map(o => o[k]?.day || 0)) === (rows[k]?.day || 0) && sum(out.map(o => o[k]?.night || 0)) === (rows[k]?.night || 0));
  const colsOk = out.every((_o, i) => main[i].day + general[i].day === cols[i].day && main[i].night + general[i].night === cols[i].night)
    && out.every(o => allKeys.every(k => (o[k]?.day || 0) >= 0 && (o[k]?.night || 0) >= 0));
  void C;
  return { cols, cells: out, main, general, rowsOk, colsOk, parityOk, conflictMessage };
}

/** Page 3: months, plus the week split of every month (ops week = 0). */
export function calculateLinking(inst: Instructions, agenda: AgendaResult, dist: DistributionResult): LinkingResult {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const monthCols: ColumnTarget[] = agenda.months.map((m, i) => ({
    label: names[i], day: m.day, night: m.night, fitness: m.fitness, education: m.education, security: m.security,
  }));
  const months = breakdown(dist.cells, monthCols, inst);
  const allKeys = getAllKeys(inst);
  const weeks = agenda.months.map((_m, i) => {
    const ws = agenda.weeks.filter(w => w.month === i);
    const cols: ColumnTarget[] = ws.map(w => ({
      label: String(w.week), day: w.day, night: w.night, fitness: w.fitness, education: w.education, security: w.security,
    }));
    const rows = Object.fromEntries(allKeys.map(k => [k, months.cells[i][k]])) as Cells;
    return { month: i, weekNumbers: ws.map(w => w.week), b: breakdown(rows, cols, inst) };
  });
  const rows = months.rowsOk && weeks.every(w => w.b.rowsOk);
  const colsOk = months.colsOk && weeks.every(w => w.b.colsOk);
  const parityOk = (months.parityOk ?? true) && weeks.every(w => w.b.parityOk ?? true);
  const conflictMessage = months.conflictMessage || weeks.find(w => w.b.conflictMessage)?.b.conflictMessage;
  return { months, weeks, checks: { rows, cols: colsOk, parity: parityOk, conflictMessage, ok: rows && colsOk && parityOk } };
}
