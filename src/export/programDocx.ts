import JSZip from 'jszip';
import type { AgendaResult, Instructions, LinkingResult, SubjectKey, WeeklyExtract } from '../engine/types';
import { getSubjectName } from '../engine/types';
import { getSubjectCurriculum } from '../engine/curriculum';
import { computeCourseLessons, makeOverrideKey, type CourseLessonSchedule } from '../engine/lessonScheduler';
import { ar } from '../ui/format';

export interface ProgramSlot {
  timing: string;
  tabour: string;
  subject: string;
  location: string;
  aids: string;
  instructor: string;
  isNight: boolean;
  isMerged?: boolean;
  mergedLabel?: string;
  subjectKey?: SubjectKey;
  durationHours?: number;
  overrideKey?: string;
  hasCurriculum?: boolean;
  lessonText?: string;
  primaryLessonId?: string;
  lessonWarning?: string;
  isManualLesson?: boolean;
  referenceText?: string;
}

export interface DayProgram {
  dayName: string;
  dateStr: string;
  isRest: boolean;
  restLabel?: string;
  slots: ProgramSlot[];
}

export function getLocation(key: SubjectKey | string): string {
  switch (key) {
    case 'fitness':
    case 'education':
    case 'discipline':
      return 'أرض الطابور';
    case 'shooting':
      return 'ميدان الرماية';
    case 'tactics':
    case 'recon':
    case 'engineering':
    case 'chemical':
    case 'topography':
      return 'ميدان التدريب';
    case 'tech':
      return 'جناح التدريب الفنى';
    case 'security':
    case 'morale':
    case 'admin':
    case 'history':
    case 'intlLaw':
    case 'infoWar':
      return 'قاعة المحاضرات';
    default:
      return 'أرض التدريب';
  }
}

export function getAids(key: SubjectKey | string): string {
  switch (key) {
    case 'fitness':
      return 'أجهزة ومعدات اللياقة';
    case 'education':
    case 'discipline':
      return 'سلاح التدريب الشخصى';
    case 'shooting':
      return 'أهداف وشواخص ورقية ومهمات رماية';
    case 'tactics':
      return 'خرائط ومجسمات أرضية';
    case 'topography':
      return 'خرائط وبوصلات وأجهزة ملاحة';
    case 'tech':
      return 'معدات ومنظومات التخصص';
    case 'security':
      return 'لوحات إرشادية وتوعوية';
    case 'recon':
      return 'نظارات مراقبة ومهمات سطع';
    case 'engineering':
      return 'معدات وأدوات النسف والتطهير';
    case 'chemical':
      return 'مهمات وقاية وأجهزة استطلاع كيميائى';
    default:
      return 'مساعدات تدريب';
  }
}

export function getInstructor(key: SubjectKey | string): string {
  switch (key) {
    case 'fitness':
      return 'معلم اللياقة البدنية';
    case 'education':
    case 'discipline':
      return 'قائد الفصيلة';
    case 'shooting':
      return 'ضابط الرماية';
    case 'tactics':
      return 'قائد السرية / ضابط تدريب';
    case 'tech':
      return 'معلم تدريب فنى';
    case 'security':
      return 'ضابط الأمن الحربى';
    default:
      return 'معلم المادة';
  }
}

const DAY_NAMES = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

/**
 * Extracts and maps all day schedule rows from WeeklyExtract for a given week.
 */
export function buildWeekProgram(
  inst: Instructions,
  ex: WeeklyExtract,
  schedule?: CourseLessonSchedule | null,
): DayProgram[] {
  const result: DayProgram[] = [];

  const buildSubjectSlot = (
    di: number,
    timing: string,
    tabour: string,
    key: SubjectKey,
    isNight: boolean,
    durationHours: number,
    customSubject?: string,
  ): ProgramSlot => {
    const cur = getSubjectCurriculum(key);
    const overrideKey = makeOverrideKey(ex.week, di, tabour);
    const assigned = cur && schedule ? schedule.bySlotKey.get(overrideKey) : undefined;
    return {
      timing,
      tabour,
      subject: customSubject ?? getSubjectName(key, inst),
      location: getLocation(key),
      aids: getAids(key),
      instructor: getInstructor(key),
      isNight,
      subjectKey: key,
      durationHours,
      overrideKey,
      hasCurriculum: !!cur,
      lessonText: assigned?.displayText,
      primaryLessonId: assigned?.primaryLessonId,
      lessonWarning: assigned?.warning,
      isManualLesson: assigned?.isManual,
      referenceText: assigned?.parts.map(p => p.lesson.reference).filter(Boolean).join(' / ') || undefined,
    };
  };

  const isPrepWeek = inst.prepWeeks.includes(ex.week);
  const isOpsWeek = inst.opsWeeks.includes(ex.week);
  const isReserveWeek = inst.reserveWeeks.includes(ex.week);
  const isCampWeek = (inst.campWeeks && inst.campWeeks.includes(ex.week)) || (ex.days.some(day => day.day === 5 && day.night === 6));
  const isNonTrainingWeek = isPrepWeek || isOpsWeek || isReserveWeek || (ex.totals.day === 0 && ex.totals.night === 0);

  let weekTypeLabel = '';
  if (isPrepWeek) weekTypeLabel = 'أسبوع الفترة التحضيرية (لا يوجد تدريب)';
  else if (isOpsWeek) weekTypeLabel = 'أسبوع تدريب مهام العمليات (لا يوجد تدريب)';
  else if (isReserveWeek) weekTypeLabel = 'أسبوع احتياط (لا يوجد تدريب)';

  for (let di = 0; di < 6; di++) {
    const d = ex.days[di];
    const dayName = DAY_NAMES[di] ?? `يوم ${di + 1}`;
    const dateStr = d ? d.date.split('-').reverse().join('/') : '';

    // Check non-training conditions for this day
    const isHoliday = d?.kind === 'holiday';
    const isDayZero = !d || (d.day === 0 && d.night === 0);

    if (isNonTrainingWeek || isHoliday || isDayZero) {
      let restLabel = weekTypeLabel || 'لا يوجد تدريب';
      if (isHoliday || d?.kind === 'holiday') restLabel = 'إجازة رسمية';
      else if (isPrepWeek || d?.kind === 'prep') restLabel = 'الفترة التحضيرية';
      else if (isOpsWeek || d?.kind === 'ops') restLabel = (di === 5 || d?.dow === 4) ? 'يوم صيانة' : 'مهام العمليات';
      else if (isReserveWeek || d?.kind === 'reserve') restLabel = 'أسبوع احتياط';
      else if (isCampWeek || d?.kind === 'camp') restLabel = (di === 5 || d?.dow === 4) ? 'يوم صيانة' : 'راحة معسكر';

      result.push({
        dayName,
        dateStr,
        isRest: true,
        restLabel,
        slots: [],
      });
      continue;
    }

    // Collect all slots scheduled on this day
    const daySlots: { first: number; last: number; hours: number; key: SubjectKey }[] = [];
    for (const r of ex.rows) {
      const slots = r.slots[di] || [];
      for (const s of slots) {
        const parts = s.lectures.split('-').map(Number);
        const first = parts[0] || 1;
        const last = parts[1] || first;
        daySlots.push({ first, last, hours: s.hours, key: r.key });
      }
    }
    daySlots.sort((a, b) => a.first - b.first);

    // Identify standard periods
    const p1 = daySlots.find(s => s.first === 1);
    const p23 = daySlots.find(s => s.first === 2);
    const p47 = daySlots.find(s => s.first === 4 && s.hours >= 4);
    const p45 = daySlots.find(s => s.first === 4 && s.hours < 4);
    const p67 = daySlots.find(s => s.first === 6);
    const p89 = daySlots.find(s => s.first === 8);
    const p1011 = daySlots.find(s => s.first === 10);
    const p1213 = daySlots.find(s => s.first === 12);

    const isCamp = (inst.campWeeks && inst.campWeeks.includes(ex.week)) || (ex.days.some(day => day.day === 5 && day.night === 6));
    const isRamadan = d?.kind === 'ramadan' || (!!inst.ramadan && !!d && d.date >= inst.ramadan.from && d.date <= inst.ramadan.to);

    const programSlots: ProgramSlot[] = [];

    if (isCamp) {
      // ── أسابيع معسكرات التدريب الخارجية / المُركزة (مهام العمليات) ──
      // ط ١: ٠٧٣٥ - ٠٩٠٠
      const p1Key = p1 ? p1.key : 'fitness';
      programSlots.push(buildSubjectSlot(di, '٠٧٣٥ - ٠٩٠٠', 'ط ١', p1Key, false, p1?.hours ?? 1));

      // ط ٢ / ٣: ١٠٠٠ - ١١٣٠
      if (p23) {
        programSlots.push(buildSubjectSlot(di, '١٠٠٠ - ١١٣٠', 'ط ٢ / ٣', p23.key, false, p23.hours));
      } else {
        programSlots.push({
          timing: '١٠٠٠ - ١١٣٠',
          tabour: 'ط ٢ / ٣',
          subject: '—',
          location: '—',
          aids: '—',
          instructor: '—',
          isNight: false,
        });
      }

      // ط ٤ / ٥: ١١٤٠ - ١٣١٠
      if (p45) {
        programSlots.push(buildSubjectSlot(di, '١١٤٠ - ١٣١٠', 'ط ٤ / ٥', p45.key, false, p45.hours));
      } else {
        programSlots.push({
          timing: '١١٤٠ - ١٣١٠',
          tabour: 'ط ٤ / ٥',
          subject: '—',
          location: '—',
          aids: '—',
          instructor: '—',
          isNight: false,
        });
      }

      // ط ٦ / ٧: ١٨٠٠ - ١٩٣٠ (ليلى)
      const slot67 = p67 || p89;
      if (slot67) {
        programSlots.push(buildSubjectSlot(di, '١٨٠٠ - ١٩٣٠', 'ط ٦ / ٧', slot67.key, true, slot67.hours));
      } else {
        programSlots.push({
          timing: '١٨٠٠ - ١٩٣٠',
          tabour: 'ط ٦ / ٧',
          subject: 'تدريب ليلى',
          location: getLocation('tactics'),
          aids: getAids('tactics'),
          instructor: getInstructor('tactics'),
          isNight: true,
        });
      }

      // ط ٨ / ٩: ١٩٤٠ - ٢١١٠ (ليلى)
      const slot89 = p89 || p1011;
      if (slot89) {
        programSlots.push(buildSubjectSlot(di, '١٩٤٠ - ٢١١٠', 'ط ٨ / ٩', slot89.key, true, slot89.hours));
      } else {
        programSlots.push({
          timing: '١٩٤٠ - ٢١١٠',
          tabour: 'ط ٨ / ٩',
          subject: 'تدريب ليلى',
          location: getLocation('tactics'),
          aids: getAids('tactics'),
          instructor: getInstructor('tactics'),
          isNight: true,
        });
      }

      // ط ١٠ / ١١: ٢١٥٠ - ٢٣٢٠ (ليلى)
      const slot1011 = p1011 || p1213;
      if (slot1011) {
        programSlots.push(buildSubjectSlot(di, '٢١٥٠ - ٢٣٢٠', 'ط ١٠ / ١١', slot1011.key, true, slot1011.hours));
      } else {
        programSlots.push({
          timing: '٢١٥٠ - ٢٣٢٠',
          tabour: 'ط ١٠ / ١١',
          subject: 'تدريب ليلى',
          location: getLocation('tactics'),
          aids: getAids('tactics'),
          instructor: getInstructor('tactics'),
          isNight: true,
        });
      }
    } else {
      // ── الأيام العادية أو شهر رمضان ──
      const t1 = isRamadan ? '٩٠٠ - ٠٩٣٥' : '٦٠٠ - ٨٠٠';
      const t23 = isRamadan ? '١٠٠٠ - ١١١٠' : '٩٠٠ – ١٠٣٠';
      const t45 = isRamadan ? '١١٢٠ - ١٢٣٠' : '١٠٤٠ - ١٢١٠';
      const t47 = isRamadan ? '١١٢٠ - ١٣٥٠' : '١٠٤٠ - ١٣٥٠';
      const t67 = isRamadan ? '١٢٤٠ - ١٣٥٠' : '١٢٢٠ - ١٣٥٠';
      const t89 = '١٦٠٠ - ١٧٣٠';
      const t1011 = '١٧٤٥ - ١٩١٥';

      // Check if March day, Monday (maintenance), or Thursday (personnel)
      if (d?.kind === 'march') {
        // ── يوم طابور السير والأمن الحربى ──
        const secH = daySlots.find(s => s.key === 'security')?.hours ?? 0;

        // Period 1 (ساعة 1): طابور سير
        programSlots.push({
          timing: t1,
          tabour: 'ط ١',
          subject: 'طابور سير',
          location: 'خارج المعسكر / خط السير',
          aids: 'مهمات القتال والميدان كاملة',
          instructor: 'قائد السرية',
          isNight: false,
        });

        // Period 2-3 (ساعتان 2-3): طابور سير
        programSlots.push({
          timing: t23,
          tabour: 'ط ٢ / ٣',
          subject: 'طابور سير',
          location: 'خارج المعسكر / خط السير',
          aids: 'مهمات القتال والميدان كاملة',
          instructor: 'قائد السرية',
          isNight: false,
        });

        // Periods 4-7:
        if (secH >= 4) {
          // 4 ساعات أمن حربى متصلة
          programSlots.push(buildSubjectSlot(di, t47, 'ط ٤ / ٧', 'security', false, secH, 'أمن حربى'));
        } else if (secH === 2) {
          // ساعتان طابور سير + ساعتان أمن حربى
          programSlots.push({
            timing: t45,
            tabour: 'ط ٤ / ٥',
            subject: 'طابور سير',
            location: 'خارج المعسكر / خط السير',
            aids: 'مهمات القتال والميدان كاملة',
            instructor: 'قائد السرية',
            isNight: false,
          });
          programSlots.push(buildSubjectSlot(di, t67, 'ط ٦ / ٧', 'security', false, secH, 'أمن حربى'));
        } else {
          // اليوم بالكامل طابور سير (7 ساعات)
          programSlots.push({
            timing: t45,
            tabour: 'ط ٤ / ٥',
            subject: 'طابور سير',
            location: 'خارج المعسكر / خط السير',
            aids: 'مهمات القتال والميدان كاملة',
            instructor: 'قائد السرية',
            isNight: false,
          });
          programSlots.push({
            timing: t67,
            tabour: 'ط ٦ / ٧',
            subject: 'طابور سير',
            location: 'خارج المعسكر / خط السير',
            aids: 'مهمات القتال والميدان كاملة',
            instructor: 'قائد السرية',
            isNight: false,
          });
        }
      } else if ((d ? d.dow === (inst.maintenanceDow ?? 1) : di === ((inst.maintenanceDow ?? 1) === 2 ? 3 : 2)) || d?.kind === 'maintenance') {
        // ── يوم الصيانة (الإثنين افتراضياً أو الثلاثاء حسب الاختيار): ط ١ تربية بدنية وباقي اليوم يوم صيانة ──
        const p1Key = p1 ? p1.key : 'fitness';
        programSlots.push(buildSubjectSlot(di, t1, 'ط ١', p1Key, false, p1?.hours ?? 1));
        programSlots.push({
          timing: '',
          tabour: '',
          subject: 'يوم صيانة',
          location: '',
          aids: '',
          instructor: '',
          isNight: false,
          isMerged: true,
          mergedLabel: 'يوم صيانة',
        });
      } else if (di === 5 || d?.dow === 4 || d?.kind === 'personnel') {
        // ── الخميس: ط ١ تعليم منضم وباقي اليوم شئون أفراد ──
        const p1Key = p1 ? p1.key : 'education';
        programSlots.push(buildSubjectSlot(di, t1, 'ط ١', p1Key, false, p1?.hours ?? 1));
        programSlots.push({
          timing: '',
          tabour: '',
          subject: 'شئون أفراد',
          location: '',
          aids: '',
          instructor: '',
          isNight: false,
          isMerged: true,
          mergedLabel: 'شئون أفراد',
        });
      } else {
        // ── الأيام العادية (السبت، الأحد، الثلاثاء، الأربعاء) ──
        // Period 1
        const p1Key = p1 ? p1.key : 'fitness';
        programSlots.push(buildSubjectSlot(di, t1, 'ط ١', p1Key, false, p1?.hours ?? 1));

        // Period 2-3
        if (p23) {
          programSlots.push(buildSubjectSlot(di, t23, 'ط ٢ / ٣', p23.key, false, p23.hours));
        } else {
          programSlots.push({
            timing: t23,
            tabour: 'ط ٢ / ٣',
            subject: '—',
            location: '—',
            aids: '—',
            instructor: '—',
            isNight: false,
          });
        }

        // Period 4-5 or 4-7
        if (p47) {
          programSlots.push(buildSubjectSlot(di, t47, 'ط ٤ / ٧', p47.key, false, p47.hours));
        } else {
          if (p45) {
            programSlots.push(buildSubjectSlot(di, t45, 'ط ٤ / ٥', p45.key, false, p45.hours));
          } else {
            programSlots.push({
              timing: t45,
              tabour: 'ط ٤ / ٥',
              subject: '—',
              location: '—',
              aids: '—',
              instructor: '—',
              isNight: false,
            });
          }

          // Period 6-7
          if (p67) {
            programSlots.push(buildSubjectSlot(di, t67, 'ط ٦ / ٧', p67.key, false, p67.hours));
          } else {
            programSlots.push({
              timing: t67,
              tabour: 'ط ٦ / ٧',
              subject: '—',
              location: '—',
              aids: '—',
              instructor: '—',
              isNight: false,
            });
          }
        }

        // Night slots (if day has night hours)
        if (d && d.night > 0) {
          // Period 8-9
          if (p89) {
            programSlots.push(buildSubjectSlot(di, t89, 'ط ٨ / ٩', p89.key, true, p89.hours));
          } else {
            programSlots.push({
              timing: t89,
              tabour: 'ط ٨ / ٩',
              subject: 'تدريب ليلى',
              location: getLocation('tactics'),
              aids: getAids('tactics'),
              instructor: getInstructor('tactics'),
              isNight: true,
            });
          }

          // Period 10-11
          if (d.night >= 4 || p1011) {
            if (p1011) {
              programSlots.push(buildSubjectSlot(di, t1011, 'ط ١٠ / ١١', p1011.key, true, p1011.hours));
            } else {
              programSlots.push({
                timing: t1011,
                tabour: 'ط ١٠ / ١١',
                subject: 'تدريب ليلى',
                location: getLocation('tactics'),
                aids: getAids('tactics'),
                instructor: getInstructor('tactics'),
                isNight: true,
              });
            }
          }
        }
      }
    }

    result.push({
      dayName,
      dateStr,
      isRest: false,
      slots: programSlots,
    });
  }

  // Friday: Always rest day
  const fridayDate = ex.to ? ex.to.split('-').reverse().join('/') : '';
  result.push({
    dayName: 'الجمعة',
    dateStr: fridayDate,
    isRest: true,
    restLabel: 'راحة',
    slots: [],
  });

  return result;
}

// ── OpenXML Word Document Generation ──

const COL_W = [1100, 1200, 800, 420, 420, 420, 420, 2800, 800, 900, 920];

function tcXml(w: number, text = '', gridSpan = 1, vMerge?: 'restart' | 'continue', bold = false, sz = 16, align = 'center', red = false, thickBottom = false): string {
  const pAlign = `<w:jc w:val="${align}"/>`;
  const rBold = bold ? '<w:b/><w:bCs/>' : '';
  const rColor = red ? '<w:color w:val="FF0000"/>' : '';

  let vmTag = '';
  if (vMerge === 'restart') vmTag = '<w:vMerge w:val="restart"/>';
  else if (vMerge === 'continue') vmTag = '<w:vMerge/>';

  const gsTag = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
  const bdrTag = thickBottom ? '<w:tcBorders><w:bottom w:val="single" w:sz="18" w:space="0" w:color="000000"/></w:tcBorders>' : '';

  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${w}" w:type="dxa"/>
      ${gsTag}${vmTag}${bdrTag}
      <w:vAlign w:val="center"/>
      <w:tcMar><w:top w:w="20" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tcMar>
    </w:tcPr>
    <w:p>
      <w:pPr><w:bidi/>${pAlign}<w:spacing w:before="0" w:after="0" w:line="180" w:lineRule="auto"/></w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/>
          <w:bidi/><w:rtl/>
          ${rBold}${rColor}
          <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:tc>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function subjectCellXml(w: number, slot: ProgramSlot, sz = 14, red = false, thickBottom = false): string {
  if (!slot.lessonText) {
    return tcXml(w, slot.subject, 1, undefined, false, sz, 'center', red, thickBottom);
  }
  const rColor = red ? '<w:color w:val="FF0000"/>' : '';
  const bdrTag = thickBottom ? '<w:tcBorders><w:bottom w:val="single" w:sz="18" w:space="0" w:color="000000"/></w:tcBorders>' : '';
  const runPr = (bold: boolean) => `<w:rPr>
    <w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/>
    <w:bidi/><w:rtl/>
    ${bold ? '<w:b/><w:bCs/>' : ''}${rColor}
    <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>
  </w:rPr>`;
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${w}" w:type="dxa"/>
      ${bdrTag}
      <w:vAlign w:val="center"/>
      <w:tcMar><w:top w:w="20" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar>
    </w:tcPr>
    <w:p>
      <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:before="0" w:after="0" w:line="180" w:lineRule="auto"/></w:pPr>
      <w:r>${runPr(true)}<w:t xml:space="preserve">${escapeXml(slot.subject)} </w:t></w:r>
      <w:r>${runPr(true)}<w:t xml:space="preserve">━━━ </w:t></w:r>
      <w:r>${runPr(false)}<w:t xml:space="preserve">${escapeXml(slot.lessonText)}</w:t></w:r>
    </w:p>
  </w:tc>`;
}

export function buildDocxXml(inst: Instructions, ex: WeeklyExtract, schedule?: CourseLessonSchedule | null): string {
  const weekProgram = buildWeekProgram(inst, ex, schedule);
  const rows: string[] = [];

  // Header 1
  const h1 = [
    tcXml(COL_W[0], 'التاريخ', 1, 'restart', true, 18),
    tcXml(COL_W[1], 'التوقيت', 1, 'restart', true, 18),
    tcXml(COL_W[2], 'الطابور', 1, 'restart', true, 18),
    tcXml(COL_W[3] + COL_W[4] + COL_W[5] + COL_W[6], 'الفصائل', 4, undefined, true, 18),
    tcXml(COL_W[7], 'الموضوعات والدروس ومشتملاتها', 1, 'restart', true, 16),
    tcXml(COL_W[8], 'المكان', 1, 'restart', true, 18),
    tcXml(COL_W[9], 'مساعدات التدريب', 1, 'restart', true, 14),
    tcXml(COL_W[10], 'المعلم المشرف', 1, 'restart', true, 14),
  ];
  rows.push(`<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="340" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${h1.join('')}</w:tr>`);

  // Header 2
  const h2 = [
    tcXml(COL_W[0], '', 1, 'continue'),
    tcXml(COL_W[1], '', 1, 'continue'),
    tcXml(COL_W[2], '', 1, 'continue'),
    tcXml(COL_W[3], '١', 1, undefined, true, 16),
    tcXml(COL_W[4], '٢', 1, undefined, true, 16),
    tcXml(COL_W[5], '٣', 1, undefined, true, 16),
    tcXml(COL_W[6], '٤', 1, undefined, true, 16),
    tcXml(COL_W[7], '', 1, 'continue'),
    tcXml(COL_W[8], '', 1, 'continue'),
    tcXml(COL_W[9], '', 1, 'continue'),
    tcXml(COL_W[10], '', 1, 'continue'),
  ];
  rows.push(`<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="260" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${h2.join('')}</w:tr>`);

  // Day rows
  for (const day of weekProgram) {
    if (day.isRest) {
      const isMaint = day.restLabel === 'يوم صيانة';
      const trH = isMaint ? '750' : '260';
      const restCells = [
        tcXml(COL_W[0], day.dayName, 1, undefined, true, 18, 'center', false, true),
        tcXml(COL_W.slice(1).reduce((a, b) => a + b, 0), day.restLabel || 'راحة', COL_W.length - 1, undefined, true, isMaint ? 20 : 18, 'center', false, true),
      ];
      rows.push(`<w:tr><w:trPr><w:trHeight w:val="${trH}" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${restCells.join('')}</w:tr>`);
      continue;
    }

    const nSlots = day.slots.length;
    for (let si = 0; si < nSlots; si++) {
      const slot = day.slots[si];
      const isFirst = si === 0;
      const isLast = si === nSlots - 1;
      const isRed = slot.isNight;

      const cDay = isFirst
        ? tcXml(COL_W[0], day.dayName, 1, 'restart', true, 18, 'center', false, isLast)
        : tcXml(COL_W[0], '', 1, 'continue', false, 16, 'center', false, isLast);

      if (slot.isMerged) {
        const mergedW = COL_W.slice(1).reduce((a, b) => a + b, 0);
        const cMerged = tcXml(mergedW, slot.mergedLabel || slot.subject, COL_W.length - 1, undefined, true, 20, 'center', false, isLast);
        const rowXml = cDay + cMerged;
        rows.push(`<w:tr><w:trPr><w:trHeight w:val="750" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${rowXml}</w:tr>`);
        continue;
      }

      const cTiming = tcXml(COL_W[1], slot.timing, 1, undefined, true, 14, 'center', isRed, isLast);
      const cTabour = tcXml(COL_W[2], slot.tabour, 1, undefined, true, 14, 'center', isRed, isLast);
      const cPlatoons = [0, 1, 2, 3].map(j => tcXml(COL_W[3 + j], '✔', 1, undefined, false, 12, 'center', isRed, isLast)).join('');
      const cSubject = subjectCellXml(COL_W[7], slot, 14, isRed, isLast);
      const cLocation = tcXml(COL_W[8], slot.location, 1, undefined, false, 14, 'center', isRed, isLast);
      const cAids = tcXml(COL_W[9], slot.aids, 1, undefined, false, 12, 'center', isRed, isLast);
      const cInst = tcXml(COL_W[10], slot.instructor, 1, undefined, false, 12, 'center', isRed, isLast);

      const rowXml = cDay + cTiming + cTabour + cPlatoons + cSubject + cLocation + cAids + cInst;
      rows.push(`<w:tr><w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${rowXml}</w:tr>`);
    }
  }

  const tableTotalW = COL_W.reduce((a, b) => a + b, 0);

  const fromDate = ex.from.split('-').reverse().join('/');
  const toDate = ex.to.split('-').reverse().join('/');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Top 3-column Layout Table (Borderless) -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${tableTotalW}" w:type="dxa"/>
        <w:bidiVisual/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="3400"/><w:gridCol w:w="3400"/><w:gridCol w:w="3400"/></w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="140"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/><w:u w:val="single"/></w:rPr><w:t>وزارة الدفاع</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>الكتيبة / .........................</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/><w:u w:val="single"/></w:rPr><w:t>سرى جداً</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>- ١٥٥ -</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="left"/><w:spacing w:after="0"/></w:pPr>
            <w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>نموذج رقم ٥٤٦ ((هـ . تد رماية))</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Title -->
    <w:p>
      <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="80" w:after="40"/></w:pPr>
      <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/></w:rPr><w:t>برنامج تدريب السرية</w:t></w:r>
    </w:p>

    <!-- Approval (صودق على اليمين وقائد الكتيبة على اليسار في منطقة الوسط) -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5600" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:bidiVisual/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="2800"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:jc w:val="center"/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>صودق</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="left"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>قائد الكتيبة : ------------------------</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Week Label -->
    <w:p>
      <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="60" w:after="180"/></w:pPr>
      <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>عن الأسبوع رقم ( ${ar(ex.week)} )${
        inst.prepWeeks.includes(ex.week) ? ' — أسبوع الفترة التحضيرية' :
        inst.opsWeeks.includes(ex.week) ? ' — أسبوع تدريب مهام العمليات' :
        inst.reserveWeeks.includes(ex.week) ? ' — أسبوع احتياط' : ''
      } من : ${ar(fromDate)} إلي : ${ar(toDate)}</w:t></w:r>
    </w:p>

    <!-- Main Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${tableTotalW}" w:type="dxa"/>
        <w:bidiVisual/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:left w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:bottom w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:right w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>${COL_W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
      ${rows.join('')}
    </w:tbl>

    <!-- Footer Signature -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${tableTotalW}" w:type="dxa"/>
        <w:bidiVisual/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="4200"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4200" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="50" w:after="15"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>(                  ) التوقيع</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>قائد السرية / ....................................</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Page Setup: A4 Portrait, tight margins for 1-page fit -->
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
      <w:pgMar w:top="500" w:right="600" w:bottom="400" w:left="600" w:header="400" w:footer="400" w:gutter="0"/>
      <w:bidi/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:evenAndOddHeaders/>
</w:settings>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/>
        <w:sz w:val="18"/>
        <w:szCs w:val="18"/>
        <w:rtl/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:bidi/>
        <w:jc w:val="center"/>
        <w:spacing w:line="200" w:lineRule="auto" w:before="0" w:after="0"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

export async function generateProgramDocxBlob(
  inst: Instructions,
  ex: WeeklyExtract,
  agenda?: AgendaResult,
  linking?: LinkingResult,
): Promise<Blob> {
  const schedule = agenda && linking ? computeCourseLessons(inst, agenda, linking, ex.week) : null;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', DOC_RELS_XML);
  zip.file('word/settings.xml', SETTINGS_XML);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', buildDocxXml(inst, ex, schedule));

  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export async function downloadProgramDocx(
  inst: Instructions,
  ex: WeeklyExtract,
  agenda?: AgendaResult,
  linking?: LinkingResult,
): Promise<void> {
  const blob = await generateProgramDocxBlob(inst, ex, agenda, linking);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `نموذج_٥٤٦_برنامج_تدريب_السرية_أسبوع_${ex.week}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
