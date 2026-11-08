import type { Instructions, SubjectPcts } from './types';
import { defaultWeeksPerMonth } from './dates';

export const DEFAULT_PCTS: SubjectPcts = {
  mainPct: 72, tactics: 15, tech: 32, shooting: 10, fitness: 15,
  education: 3, discipline: 3, security: 2, topography: 3, morale: 2, recon: 3,
  engineering: 2, chemical: 3, admin: 2, history: 2, intlLaw: 1, infoWar: 2,
};

export function emptyInstructions(): Instructions {
  const start = '2023-12-30';
  return {
    courseName: '', startSaturday: start, totalWeeks: 26, firstWeek: 1,
    weeksPerMonth: defaultWeeksPerMonth(start, 26),
    prepWeeks: [], opsWeeks: [], reserveWeeks: [], campWeeks: [],
    ramadan: null, holidays: [],
    marchSecurityByMonth: [], marchWeekOfMonth: 4, marchWeekExceptions: {},
    pcts: { ...DEFAULT_PCTS }, levelWeeks: { individual: 9, crew: 7, centre: 6 },
    selectedMonth: 4, selectedWeek: 20,
    nightKeys: ['tactics', 'tech', 'shooting', 'topography', 'recon', 'engineering', 'chemical'],
    customSubjects: [],
  };
}
