import type { DayKind } from '../engine/types';

const AR = '٠١٢٣٤٥٦٧٨٩';
/** western digits -> Arabic-Indic, like the exam form */
export const ar = (v: string | number): string => String(v).replace(/\d/g, d => AR[+d]);
/** hours cell: zero prints as a dash, like the form */
export const h = (v: number): string => (v === 0 ? '-' : ar(v));

export const KIND_COLORS: Record<DayKind, { bg: string; fg: string; label: string }> = {
  prep: { bg: '#FEF08A', fg: '#111', label: 'فترة تحضيرية' },
  short: { bg: '#BBF7D0', fg: '#111', label: 'يوم قصير' },
  long: { bg: '#BAE6FD', fg: '#111', label: 'يوم طويل' },
  holiday: { bg: '#FECACA', fg: '#111', label: 'أجازة' },
  maintenance: { bg: '#FED7AA', fg: '#111', label: 'صيانة' },
  personnel: { bg: '#E2E8F0', fg: '#111', label: 'شئون أفراد' },
  friday: { bg: '#78350F', fg: '#fff', label: 'راحة أسبوعية' },
  ramadan: { bg: '#7DD3FC', fg: '#111', label: 'شهر رمضان' },
  camp: { bg: '#1E3A8A', fg: '#fff', label: 'معسكر تد ليلى' },
  ops: { bg: '#701A75', fg: '#fff', label: 'تد مهام عمليات' },
  reserve: { bg: '#14532D', fg: '#fff', label: 'إسبوع إحتياط' },
  march: { bg: '#881337', fg: '#fff', label: 'طابور سير' },
};
/** week-number header colour of each training level (same as the legend) */
export const LEVEL_BG = { individual: '#F8D5B8', crew: '#948A54', centre: '#DDB8B8' } as const;
export const LEVEL_SWATCH = [
  { bg: '#F8D5B8', label: 'مستوى فرد' },
  { bg: '#948A54', label: 'مستوى طاقم' },
  { bg: '#DDB8B8', label: 'مستوى مركز' },
];
