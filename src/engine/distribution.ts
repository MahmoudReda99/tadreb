import type { AgendaResult, Cell, Cells, DistributionResult, Instructions, Level, SubjectKey } from './types';
import { ALL_KEYS, getAllKeys, getMainKeys, getGeneralKeys, getNightKeys } from './types';
import { weekLevels } from './agenda';
import { nearestEven, sum } from './rounding';

const emptyCells = (keys: SubjectKey[] = ALL_KEYS): Cells => Object.fromEntries(keys.map(k => [k, { day: 0, night: 0 }])) as Cells;
export const sumCells = (c: Cells, keys: SubjectKey[]): Cell => ({
  day: sum(keys.map(k => c[k]?.day || 0)), night: sum(keys.map(k => c[k]?.night || 0)),
});

/**
 * Page 2. Every product that is not a balancing figure is rounded to the nearest even number.
 * Balancing figures: shooting (main), information war (general), specialised-technical night.
 */
export function calculateDistribution(inst: Instructions, agenda: AgendaResult): DistributionResult {
  const p = inst.pcts;
  const T = agenda.total;
  const mainTotal = nearestEven((T * p.mainPct) / 100);
  const generalTotal = T - mainTotal;

  const allKeys = getAllKeys(inst);
  const mainKeys = getMainKeys(inst);
  const generalKeys = getGeneralKeys(inst);
  const nightKeys = getNightKeys(inst);

  const tot: Record<SubjectKey, number> = Object.fromEntries(allKeys.map(k => [k, 0])) as Record<SubjectKey, number>;

  tot.fitness = agenda.fitness; tot.education = agenda.education; tot.security = agenda.security;
  for (const k of ['tactics', 'tech', 'discipline', 'topography', 'morale', 'recon', 'engineering', 'chemical', 'admin', 'history', 'intlLaw'] as SubjectKey[]) {
    tot[k] = nearestEven((T * (p[k as keyof typeof p] ?? 0)) / 100);
  }
  for (const s of (inst.customSubjects || [])) {
    tot[s.id] = nearestEven((T * (s.pct ?? 0)) / 100);
  }

  // shooting balances main
  const otherMain = sum(mainKeys.filter(k => k !== 'shooting').map(k => tot[k] || 0));
  tot.shooting = mainTotal - otherMain;

  // infoWar balances general
  const otherGeneral = sum(generalKeys.filter(k => k !== 'infoWar').map(k => tot[k] || 0));
  tot.infoWar = generalTotal - otherGeneral;

  // night: ratio of the night hours to the hours of active night subjects
  const activeNightKeys = nightKeys.filter(k => allKeys.includes(k));
  const nightSubjectsHours = sum(activeNightKeys.map(k => tot[k] || 0));
  const nightRatio = nightSubjectsHours ? agenda.night / nightSubjectsHours : 0;
  const night: Record<SubjectKey, number> = Object.fromEntries(allKeys.map(k => [k, 0])) as Record<SubjectKey, number>;

  // tech balances night hours if present; otherwise the first night subject balances
  const nightBalancer = activeNightKeys.includes('tech') ? 'tech' : (activeNightKeys[0] || 'tactics');
  for (const k of activeNightKeys) {
    if (k !== nightBalancer) {
      night[k] = Math.min(tot[k] || 0, nearestEven((tot[k] || 0) * nightRatio));
    }
  }
  const otherNight = sum(activeNightKeys.filter(k => k !== nightBalancer).map(k => night[k] || 0));
  night[nightBalancer] = Math.max(0, agenda.night - otherNight);

  const cells = emptyCells(allKeys);
  for (const k of allKeys) cells[k] = { day: Math.max(0, (tot[k] || 0) - (night[k] || 0)), night: night[k] || 0 };

  // specialised technical split into the three levels, from the hours of each level's period
  const lv = weekLevels(inst);
  const periods = {} as DistributionResult['levelPeriods'];
  (['individual', 'crew', 'centre'] as Level[]).forEach(l => {
    const ws = agenda.weeks.filter(w => lv.get(w.week) === l);
    periods[l] = { day: sum(ws.map(w => w.day)), night: sum(ws.map(w => w.night)), weeks: ws.map(w => w.week) };
  });
  const split = (hours: number, key: 'day' | 'night'): Record<Level, number> => {
    const all = agenda[key];
    const crew = all ? nearestEven((hours * periods.crew[key]) / all) : 0;
    const centre = all ? nearestEven((hours * periods.centre[key]) / all) : 0;
    return { crew, centre, individual: hours - crew - centre };
  };
  const d = split(cells.tech.day, 'day'); const n = split(cells.tech.night, 'night');
  const techLevels = {
    individual: { day: d.individual, night: n.individual },
    crew: { day: d.crew, night: n.crew },
    centre: { day: d.centre, night: n.centre },
  };

  const mainCell = sumCells(cells, mainKeys);
  const generalCell = sumCells(cells, generalKeys);
  const dayOk = mainCell.day + generalCell.day === agenda.day;
  const nightOk = mainCell.night + generalCell.night === agenda.night;
  const mainOk = mainCell.day + mainCell.night === mainTotal;
  return {
    total: T, mainTotal, generalTotal, nightRatio, nightSubjectsHours, cells, mainCell, generalCell,
    techLevels, levelPeriods: periods,
    checks: { day: dayOk, night: nightOk, main: mainOk, ok: dayOk && nightOk && mainOk },
  };
}
