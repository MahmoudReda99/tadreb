import type { Instructions } from '../engine/types';
import { getNightKeys, getSubjectName } from '../engine/types';
import { addDays, monthNames, parseDate } from '../engine/dates';
import { ar } from '../ui/format';

export interface FormattedHoliday {
  letter: string;
  name: string;
  dateStr: string;
}

export interface ExamInstructionsData {
  courseTitle: string;
  examCode: string;
  durationMinutes: number;
  totalGrade: number;
  officerName: string;
  preamble: string;
  periodName: string;
  yearLabel: string;
  startDate: string;
  endDate: string;
  firstWeek: number;
  lastWeek: number;
  prepWeeks: number[];
  prepStartDate: string;
  prepEndDate: string;
  opsWeeks: number[];
  opsStartDate: string;
  opsEndDate: string;
  reserveWeeks: number[];
  reserveStartDate: string;
  reserveEndDate: string;
  individualWeeks: number;
  crewWeeks: number;
  centreWeeks: number;
  holidays: FormattedHoliday[];
  ramadanStart: string;
  ramadanEnd: string;
  marchDayOfWeek: string;
  marchWeekDefault: number;
  marchWeekExceptionMonth: string;
  marchWeekExceptionWeek: number;
  marchSecuritySchedule: { monthIndex: number; monthName: string; marchHours: number; securityHours: number }[];
  shortDayHours: number;
  longDayHours: number;
  longDayDayHours: number;
  longDayNightHours: number;
  maintenanceHours: number;
  personnelHours: number;
  nightSubjects: string[];
  selectedMonthName: string;
  selectedWeek: number;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  campWeeks: number[];
  campDayHours: number;
  campNightHours: number;
  campTotalHours: number;
}

const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ى', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر', 'ش', 'ت', 'ث', 'خ', 'ذ', 'ض', 'ظ', 'غ'];

export function formatArDate(dStr?: string): string {
  if (!dStr) return '—';
  const parts = dStr.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${ar(d)}/ ${ar(m)}/ ${ar(y)}`;
  }
  return ar(dStr);
}

function detectHolidayName(dateOrFrom: string, toDate?: string): string {
  const parts = dateOrFrom.split('-');
  const md = parts.length === 3 ? `${parts[1]}-${parts[2]}` : '';

  if (md === '01-07') return 'عيد الميلاد المجيد';
  if (md === '01-25') return 'عيد الشرطة وثورة ٢٥ يناير';
  if (md === '04-25') return 'عيد تحرير سيناء';
  if (md === '05-01') return 'عيد العمال';
  if (md === '06-30') return 'عيد ثورة ٣٠ يونيه';
  if (md === '07-23') return 'عيد ثورة ٢٣ يوليو';
  if (md === '10-06') return 'عيد القوات المسلحة (٦ أكتوبر)';

  // Known movable Egyptian holidays
  if (toDate) {
    if (dateOrFrom.startsWith('2024-04-10') || dateOrFrom.startsWith('2026-03-19')) return 'عيد الفطر المبارك';
    if (dateOrFrom.startsWith('2024-06-15') || dateOrFrom.startsWith('2026-05-26') || dateOrFrom.startsWith('2026-05-27')) return 'وقفة وعيد الأضحى المبارك';
    return 'أجازة رسمية';
  }

  if (dateOrFrom.endsWith('04-13') || dateOrFrom.endsWith('05-06')) return 'شم النسيم';
  if (dateOrFrom.endsWith('05-26')) return 'وقفة عيد الأضحى';
  if (dateOrFrom.endsWith('06-16')) return 'رأس السنة الهجرية';
  return 'أجازة رسمية';
}

export function extractInstructionsData(inst: Instructions): ExamInstructionsData {
  const totalWeeks = inst.totalWeeks || 26;
  const firstWeek = inst.firstWeek || 1;
  const lastWeek = firstWeek + totalWeeks - 1;
  const startDate = inst.startSaturday;
  const endDate = addDays(startDate, totalWeeks * 7 - 1);

  // Period naming
  const isSecond = firstWeek > 1 || (inst.courseName && (inst.courseName.includes('الثانية') || inst.courseName.includes('2')));
  const periodName = isSecond ? 'الثانية' : 'الأولى';

  const years = (() => {
    if (inst.yearLabel) return ar(inst.yearLabel);
    const d = parseDate(addDays(inst.startSaturday, 3));
    const y = d.getUTCFullYear();
    const from = d.getUTCMonth() >= 6 ? y + 1 : y - 1;
    return `${ar(from)} / ${ar(from + 1)}`;
  })();

  // Course title
  let courseTitle = inst.courseName || `إختبار مادة التدريب القتالى للدورة المتقدمة رقم (${ar(firstWeek > 1 ? 111 : 108)})`;
  if (!courseTitle.startsWith('إختبار')) {
    courseTitle = `إختبار مادة التدريب القتالى — ${courseTitle}`;
  }

  // Preamble
  let unitText = 'الكتيبة الأولى / الفوج ٦٥٢ إشارة / ج ٢ ميد';
  if (inst.courseName) {
    const m = inst.courseName.match(/(الكتيبة[^\n—]+)/);
    if (m) unitText = m[1].trim();
  }

  const preamble = `بصفتك رئيس عمليات ${unitText} حصلت على المعلومات الآتية من التعليمات التنظيمية لإدارة الإشارة عن الفترة التدريبية ${periodName} للعام التدريبى ${years} كالآتى :`;

  // Prep weeks
  const prepList = inst.prepWeeks.length > 0 ? inst.prepWeeks : [firstWeek, firstWeek + 1];
  const prepMin = Math.min(...prepList);
  const prepMax = Math.max(...prepList);
  const prepStartDate = addDays(startDate, (prepMin - firstWeek) * 7);
  const prepEndDate = addDays(startDate, (prepMax - firstWeek) * 7 + 6);

  // Ops weeks
  const opsList = inst.opsWeeks.length > 0 ? inst.opsWeeks : [firstWeek + 18];
  const opsMin = Math.min(...opsList);
  const opsMax = Math.max(...opsList);
  const opsStartDate = addDays(startDate, (opsMin - firstWeek) * 7);
  const opsEndDate = addDays(startDate, (opsMax - firstWeek) * 7 + 6);

  // Reserve weeks
  const resList = inst.reserveWeeks.length > 0 ? inst.reserveWeeks : [lastWeek];
  const resMin = Math.min(...resList);
  const resMax = Math.max(...resList);
  const reserveStartDate = addDays(startDate, (resMin - firstWeek) * 7);
  const reserveEndDate = addDays(startDate, (resMax - firstWeek) * 7 + 6);

  // Holidays
  const holidays: FormattedHoliday[] = [];
  (inst.holidays || []).forEach((h, idx) => {
    const letter = ARABIC_LETTERS[idx % ARABIC_LETTERS.length];
    if (typeof h === 'string') {
      const name = detectHolidayName(h);
      holidays.push({ letter, name, dateStr: formatArDate(h) });
    } else {
      const name = detectHolidayName(h.from, h.to);
      holidays.push({
        letter,
        name,
        dateStr: `فى المدة من ${formatArDate(h.from)} حتى ${formatArDate(h.to)}`,
      });
    }
  });

  // Month names
  const mNames = monthNames(inst.startSaturday, inst.weeksPerMonth.length);

  // March & Security
  const marchSched = (inst.marchSecurityByMonth || []).map((pair, idx) => ({
    monthIndex: idx,
    monthName: mNames[idx] || `الشهر ${ar(idx + 1)}`,
    marchHours: pair[0],
    securityHours: pair[1],
  }));

  // Exceptions for march week
  let marchWeekExceptionMonth = 'مارس';
  let marchWeekExceptionWeek = 4;
  if (inst.marchWeekExceptions && Object.keys(inst.marchWeekExceptions).length > 0) {
    const firstKey = +Object.keys(inst.marchWeekExceptions)[0];
    marchWeekExceptionMonth = mNames[firstKey] || 'مارس';
    marchWeekExceptionWeek = inst.marchWeekExceptions[firstKey];
  }

  // Selected week
  const selW = inst.selectedWeek || (firstWeek + 19);
  const selWStart = addDays(startDate, (selW - firstWeek) * 7);
  const selWEnd = addDays(startDate, (selW - firstWeek) * 7 + 6);

  // Selected month
  const selMName = mNames[inst.selectedMonth] || 'مايو';

  // Night subjects
  const nightKeys = getNightKeys(inst);
  const nightSubjects = nightKeys.map(k => getSubjectName(k, inst));

  return {
    courseTitle,
    examCode: 'SF-EX-8-7-36',
    durationMinutes: 240,
    totalGrade: 90,
    officerName: 'عميد / أمير منصور إسماعيل',
    preamble,
    periodName,
    yearLabel: years,
    startDate: formatArDate(startDate),
    endDate: formatArDate(endDate),
    firstWeek,
    lastWeek,
    prepWeeks: prepList,
    prepStartDate: formatArDate(prepStartDate),
    prepEndDate: formatArDate(prepEndDate),
    opsWeeks: opsList,
    opsStartDate: formatArDate(opsStartDate),
    opsEndDate: formatArDate(opsEndDate),
    reserveWeeks: resList,
    reserveStartDate: formatArDate(reserveStartDate),
    reserveEndDate: formatArDate(reserveEndDate),
    individualWeeks: inst.levelWeeks?.individual ?? 9,
    crewWeeks: inst.levelWeeks?.crew ?? 7,
    centreWeeks: inst.levelWeeks?.centre ?? 6,
    holidays,
    ramadanStart: formatArDate(inst.ramadan?.from),
    ramadanEnd: formatArDate(inst.ramadan?.to),
    marchDayOfWeek: 'السبت',
    marchWeekDefault: inst.marchWeekOfMonth || 3,
    marchWeekExceptionMonth,
    marchWeekExceptionWeek,
    marchSecuritySchedule: marchSched,
    shortDayHours: 7,
    longDayHours: 11,
    longDayDayHours: 7,
    longDayNightHours: 4,
    maintenanceHours: 1,
    personnelHours: 1,
    nightSubjects,
    selectedMonthName: selMName,
    selectedWeek: selW,
    selectedWeekStart: formatArDate(selWStart),
    selectedWeekEnd: formatArDate(selWEnd),
    campWeeks: inst.campWeeks || [firstWeek + 13, firstWeek + 22],
    campDayHours: 25,
    campNightHours: 30,
    campTotalHours: 55,
  };
}
