import type { Instructions, SubjectPcts } from './types';

export const DEFAULT_PCTS: SubjectPcts = {
  mainPct: 72, tactics: 15, tech: 32, shooting: 10, fitness: 15,
  education: 3, discipline: 3, security: 2, topography: 3, morale: 2, recon: 3,
  engineering: 2, chemical: 3, admin: 2, history: 2, intlLaw: 1, infoWar: 2,
};

export function emptyInstructions(): Instructions {
  return {
    courseName: '', startSaturday: '', totalWeeks: 26, firstWeek: 1,
    weeksPerMonth: [5, 4, 4, 5, 4, 4],
    prepWeeks: [], opsWeeks: [], reserveWeeks: [], campWeeks: [],
    ramadan: null, holidays: [],
    marchSecurityByMonth: [], marchWeekOfMonth: 4, marchWeekExceptions: {},
    pcts: { ...DEFAULT_PCTS }, levelWeeks: { individual: 9, crew: 7, centre: 6 },
    selectedMonth: 0, selectedWeek: 1,
    nightKeys: ['tactics', 'tech', 'shooting', 'topography', 'recon', 'engineering', 'chemical'],
    customSubjects: [],
    disabledSubjects: [],
  };
}
