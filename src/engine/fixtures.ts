import type { Instructions } from './types';
import { DEFAULT_PCTS } from './instructions';

/**
 * Course 108, training year 2024/2025, as printed in the exam instructions.
 * Note: the document gives the march / security pairs as 3+4, 3+4, 5+2, 7+0 and says
 * months 5 and 6 repeat months 1 and 2 (3+4, 3+4); the solved key agrees (April = 7+0).
 */
export const FIXTURE_108: Instructions = {
  courseName: 'الدورة الراقية رقم (108) — الكتيبة الأولى / الفوج 656 إشارة',
  startSaturday: '2023-12-30',
  totalWeeks: 26,
  firstWeek: 1,
  yearLabel: '2024 / 2025',
  weeksPerMonth: [5, 4, 4, 5, 4, 4],
  prepWeeks: [1, 2], opsWeeks: [21], reserveWeeks: [26], campWeeks: [16, 23],
  ramadan: { from: '2024-03-11', to: '2024-04-09' },
  holidays: [
    '2024-01-07', '2024-01-25', { from: '2024-04-10', to: '2024-04-12' }, '2024-04-25',
    '2024-05-01', '2024-05-06', { from: '2024-06-15', to: '2024-06-19' },
  ],
  marchSecurityByMonth: [[3, 4], [3, 4], [5, 2], [7, 0], [3, 4], [3, 4]],
  marchWeekOfMonth: 4, marchWeekExceptions: { 5: 2 },
  pcts: { ...DEFAULT_PCTS },
  levelWeeks: { individual: 9, crew: 7, centre: 6 },
  selectedMonth: 4, selectedWeek: 20,
};

/**
 * Course 111, second training period 2025/2026 (weeks 27-52), transcribed by eye from the scanned exam paper.
 * Verify it against your copy: the OCR cannot read the Arabic-Indic digits of that scan.
 */
export const FIXTURE_111: Instructions = {
  courseName: 'الدورة المتقدمة رقم (111) — الكتيبة الأولى / الفوج 652 إشارة / ج 2 ميد — الفترة الثانية',
  startSaturday: '2026-01-03',
  totalWeeks: 26,
  firstWeek: 27,
  yearLabel: '2025 / 2026',
  weeksPerMonth: [5, 4, 4, 5, 4, 4],
  prepWeeks: [27, 28], opsWeeks: [45], reserveWeeks: [52], campWeeks: [40, 49],
  ramadan: { from: '2026-02-18', to: '2026-03-18' },
  holidays: [
    '2026-01-07', '2026-01-25', { from: '2026-03-19', to: '2026-03-22' }, '2026-04-13', '2026-04-25',
    '2026-05-01', { from: '2026-05-26', to: '2026-05-30' }, '2026-06-16', '2026-06-30',
  ],
  marchSecurityByMonth: [[3, 4], [3, 4], [5, 2], [7, 0], [3, 4], [3, 4]],
  marchWeekOfMonth: 3, marchWeekExceptions: { 2: 4 },
  pcts: { ...DEFAULT_PCTS },
  levelWeeks: { individual: 9, crew: 7, centre: 6 },
  selectedMonth: 4, selectedWeek: 46,
};

/** values read from the solved answer key (pages 1-4) */
export const KEY_108 = {
  total: 775, day: 603, night: 172, fitness: 120, education: 17, security: 18,
  monthDay: [89, 120, 120, 129, 89, 56],
  monthNight: [24, 32, 12, 42, 24, 38],
  monthFitness: [17, 22, 24, 29, 16, 12],
  weekMay: { 19: [29, 8], 20: [30, 8], 21: [0, 0], 22: [30, 8] } as Record<number, [number, number]>,
  page2: {
    tactics: [78, 38], tech: [168, 80], shooting: [50, 24], fitness: [120, 0], education: [17, 0],
    discipline: [24, 0], security: [18, 0], topography: [16, 8], morale: [16, 0], recon: [16, 8],
    engineering: [10, 6], chemical: [16, 8], admin: [16, 0], history: [16, 0], intlLaw: [8, 0], infoWar: [14, 0],
  } as Record<string, [number, number]>,
  mainTotal: 558, mainNight: 142, generalTotal: 217, generalNight: 30,
  techLevels: { individual: [76, 32], crew: [52, 20], centre: [40, 28] } as Record<string, [number, number]>,
  /** page 3 rows under independent parity constraints (Month 0: 61+20=81 (odd), Month 3: 89+34=123 (odd)) */
  monthMainDay: [61, 84, 84, 89, 62, 36],
  monthMainNight: [20, 26, 10, 34, 20, 32],
  monthTactics: [[12, 4], [16, 8], [16, 2], [16, 10], [12, 6], [6, 8]],
};
