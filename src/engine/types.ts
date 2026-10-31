export type DateStr = string; // YYYY-MM-DD
export interface DateRange { from: DateStr; to: DateStr }

export interface SubjectPcts {
  mainPct: number;
  tactics: number; tech: number; shooting: number; fitness: number;
  education: number; discipline: number; security: number; topography: number;
  morale: number; recon: number; engineering: number; chemical: number;
  admin: number; history: number; intlLaw: number; infoWar: number;
}

export interface Instructions {
  courseName: string;
  startSaturday: DateStr;
  totalWeeks: number;
  /** printed number of the first week (1 for the first period, 27 for the second) */
  firstWeek: number;
  /** training-year label as printed, e.g. "2025 / 2026" (derived from the dates when empty) */
  yearLabel?: string;
  weeksPerMonth: number[];
  prepWeeks: number[];
  opsWeeks: number[];
  reserveWeeks: number[];
  campWeeks: number[];
  ramadan: DateRange | null;
  holidays: (DateStr | DateRange)[];
  marchSecurityByMonth: [number, number][];
  marchWeekOfMonth: number;
  marchWeekExceptions: Record<number, number>;
  pcts: SubjectPcts;
  levelWeeks: { individual: number; crew: number; centre: number };
  selectedMonth: number;
  selectedWeek: number;
}

export type DayKind =
  | 'holiday' | 'prep' | 'reserve' | 'ops' | 'camp' | 'march'
  | 'ramadan' | 'friday' | 'short' | 'long' | 'maintenance' | 'personnel';

export interface DayCell {
  date: DateStr; week: number; dow: number; // dow: 0=Sun..6=Sat
  kind: DayKind;
  day: number; night: number;
  fitness: number; education: number; security: number;
  rule: string;
}
export type Level = 'individual' | 'crew' | 'centre';
export interface WeekRow {
  week: number; month: number; days: DayCell[]; // Sat..Fri
  day: number; night: number; total: number;
  fitness: number; education: number; security: number;
  level: Level | null;
}
export interface MonthRow {
  month: number; name: string; weeks: number[];
  day: number; night: number; total: number;
  fitness: number; education: number; security: number;
}
export interface AgendaResult {
  weeks: WeekRow[]; months: MonthRow[];
  day: number; night: number; total: number;
  fitness: number; education: number; security: number;
  checks: { weekly: boolean; monthly: boolean; ok: boolean };
}

export type SubjectKey =
  | 'tactics' | 'tech' | 'shooting' | 'fitness'
  | 'education' | 'discipline' | 'security' | 'topography' | 'morale'
  | 'recon' | 'engineering' | 'chemical' | 'admin' | 'history' | 'intlLaw' | 'infoWar';

export interface Cell { day: number; night: number }
export type Cells = Record<SubjectKey, Cell>;

export const MAIN_KEYS: SubjectKey[] = ['tactics', 'tech', 'shooting', 'fitness'];
export const GENERAL_KEYS: SubjectKey[] = [
  'education', 'discipline', 'security', 'topography', 'morale', 'recon',
  'engineering', 'chemical', 'admin', 'history', 'intlLaw', 'infoWar',
];
export const ALL_KEYS: SubjectKey[] = [...MAIN_KEYS, ...GENERAL_KEYS];
export const NIGHT_KEYS: SubjectKey[] = ['tactics', 'tech', 'shooting', 'topography', 'recon', 'engineering', 'chemical'];

export const SUBJECT_AR: Record<SubjectKey, string> = {
  tactics: 'تكتيك عام', tech: 'تدريب فنى تخصصى', shooting: 'رماية أ ص', fitness: 'تربية بدنية',
  education: 'تعليم منضم', discipline: 'انضباط عسكرى', security: 'أمن حربى', topography: 'طبوغرافيا',
  morale: 'تدريب معنوي', recon: 'سطع وعدو', engineering: 'تدريب هندسى', chemical: 'تدريب كيميائى',
  admin: 'تدريب إدارى', history: 'تاريخ عسكرى', intlLaw: 'قانون دولى إنسانى', infoWar: 'حرب المعلومات (التهديدات الحديثة)',
};
export const SUBJECT_SHORT: Record<SubjectKey, string> = {
  tactics: 'تك عـــام', tech: 'تد ف ت', shooting: 'رمايـــة', fitness: 'ت رياضية',
  education: 'تع منضم', discipline: 'انضباط ع', security: 'أمن حربى', topography: 'طبوغرافيا',
  morale: 'تد معنوي', recon: 'سطع', engineering: 'تد هندسى', chemical: 'تد كيميائى',
  admin: 'تد إدارى', history: 'تاريخ ع', intlLaw: 'ق دولى', infoWar: 'حرب معلومات',
};

export interface DistributionResult {
  total: number; mainTotal: number; generalTotal: number;
  nightRatio: number; nightSubjectsHours: number;
  cells: Cells;
  mainCell: Cell; generalCell: Cell;
  techLevels: Record<Level, Cell>;
  levelPeriods: Record<Level, { day: number; night: number; weeks: number[] }>;
  checks: { day: boolean; night: boolean; main: boolean; ok: boolean };
}

export interface ColumnTarget { label: string; day: number; night: number; fitness: number; education: number; security: number }
export interface Breakdown {
  cols: ColumnTarget[]; cells: Cells[]; main: Cell[]; general: Cell[];
  rowsOk: boolean; colsOk: boolean;
}
export interface LinkingResult {
  months: Breakdown;
  weeks: { month: number; weekNumbers: number[]; b: Breakdown }[];
  checks: { rows: boolean; cols: boolean; ok: boolean };
}

export interface SlotEntry { hours: number; lectures: string; text: string }
export interface WeeklyDay { date: DateStr; dow: number; day: number; night: number; kind: DayKind }
export interface WeeklyExtract {
  week: number; from: DateStr; to: DateStr; days: WeeklyDay[];
  rows: { key: SubjectKey; day: number; night: number; slots: SlotEntry[][] }[]; // slots[dayIdx 0..5 Sat..Thu]
  totals: { day: number; night: number };
  checks: { days: boolean; subjects: boolean; ok: boolean };
}
