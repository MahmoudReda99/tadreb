import { getSubjectCurriculum, type LessonDef } from './curriculum';
import { getSubjectName, type AgendaResult, type Instructions, type LessonOverride, type LinkingResult, type SubjectKey, type WeeklyExtract } from './types';
import { calculateWeekly } from './weekly';

export interface AssignedLessonPart {
  lesson: LessonDef;
  hours: number;
  cumulativeHours: number;
  totalPhaseHours: number;
  isContinuation: boolean;
  isPartial: boolean;
}

export interface SlotLessonAssignment {
  overrideKey: string;
  subjectKey: SubjectKey;
  durationHours: number;
  isNight: boolean;
  parts: AssignedLessonPart[];
  displayText: string;
  primaryLessonId: string;
  secondaryLessonId?: string;
  isManual: boolean;
  warning?: string;
}

export interface RawProgramSlotSpec {
  dayIdx: number;
  tabour: string;
  subjectKey?: SubjectKey;
  durationHours: number;
  isNight: boolean;
}

export interface LessonStatusInfo {
  lesson: LessonDef;
  remDay: number;
  remNight: number;
  status: 'completed' | 'in-progress' | 'next' | 'upcoming';
  phaseCompatible: boolean;
}

export interface CourseLessonSchedule {
  /** Keyed by `${week}:${dayIdx}:${tabour}` */
  bySlotKey: Map<string, SlotLessonAssignment>;
  /** Snapshots before a week starts, keyed by `${week}:${subjectKey}` */
  subjectStatusAtWeek: Map<string, LessonStatusInfo[]>;
}

interface LessonProgress {
  def: LessonDef;
  remDay: number;
  remNight: number;
  startedDay: boolean;
  startedNight: boolean;
}

export function makeOverrideKey(week: number, dayIdx: number, tabour: string): string {
  return `${week}:${dayIdx}:${tabour}`;
}

/**
 * Extracts the ordered curriculum-eligible slots for a single week
 * mirroring the exact mapping of `buildWeekProgram` in `programDocx.ts`.
 */
export function extractWeekSlotSpecs(inst: Instructions, ex: WeeklyExtract): RawProgramSlotSpec[] {
  const specs: RawProgramSlotSpec[] = [];
  const isPrepWeek = inst.prepWeeks.includes(ex.week);
  const isOpsWeek = inst.opsWeeks.includes(ex.week);
  const isReserveWeek = inst.reserveWeeks.includes(ex.week);
  const isNonTrainingWeek = isPrepWeek || isOpsWeek || isReserveWeek || (ex.totals.day === 0 && ex.totals.night === 0);
  if (isNonTrainingWeek) return specs;

  const isCamp = (inst.campWeeks && inst.campWeeks.includes(ex.week)) || ex.days.some(day => day.day === 5 && day.night === 6);

  for (let di = 0; di < 6; di++) {
    const d = ex.days[di];
    if (!d || d.kind === 'holiday' || (d.day === 0 && d.night === 0)) continue;

    const daySlots: { first: number; last: number; hours: number; key: SubjectKey }[] = [];
    for (const r of ex.rows) {
      for (const s of r.slots[di] || []) {
        const parts = s.lectures.split('-').map(Number);
        const first = parts[0] || 1;
        const last = parts[1] || first;
        daySlots.push({ first, last, hours: s.hours, key: r.key });
      }
    }
    daySlots.sort((a, b) => a.first - b.first);

    const p1 = daySlots.find(s => s.first === 1);
    const p23 = daySlots.find(s => s.first === 2);
    const p47 = daySlots.find(s => s.first === 4 && s.hours >= 4);
    const p45 = daySlots.find(s => s.first === 4 && s.hours < 4);
    const p67 = daySlots.find(s => s.first === 6);
    const p89 = daySlots.find(s => s.first === 8);
    const p1011 = daySlots.find(s => s.first === 10);
    const p1213 = daySlots.find(s => s.first === 12);

    if (isCamp) {
      const p1Key = p1 ? p1.key : 'fitness';
      specs.push({ dayIdx: di, tabour: 'ط ١', subjectKey: p1Key, durationHours: p1?.hours ?? 1, isNight: false });
      if (p23) specs.push({ dayIdx: di, tabour: 'ط ٢ / ٣', subjectKey: p23.key, durationHours: p23.hours, isNight: false });
      if (p45) specs.push({ dayIdx: di, tabour: 'ط ٤ / ٥', subjectKey: p45.key, durationHours: p45.hours, isNight: false });

      const slot67 = p67 || p89;
      if (slot67) specs.push({ dayIdx: di, tabour: 'ط ٦ / ٧', subjectKey: slot67.key, durationHours: slot67.hours, isNight: true });

      const slot89 = p89 || p1011;
      if (slot89) specs.push({ dayIdx: di, tabour: 'ط ٨ / ٩', subjectKey: slot89.key, durationHours: slot89.hours, isNight: true });

      const slot1011 = p1011 || p1213;
      if (slot1011) specs.push({ dayIdx: di, tabour: 'ط ١٠ / ١١', subjectKey: slot1011.key, durationHours: slot1011.hours, isNight: true });
    } else if (d.kind === 'march') {
      // طابور السير نفسه لا يأخذ دروس المنهج، فقط حصة الأمن الحربى إذا وُجدت
      const secSlot = daySlots.find(s => s.key === 'security');
      if (secSlot && secSlot.hours >= 4) {
        specs.push({ dayIdx: di, tabour: 'ط ٤ / ٧', subjectKey: 'security', durationHours: secSlot.hours, isNight: false });
      } else if (secSlot && secSlot.hours >= 2) {
        specs.push({ dayIdx: di, tabour: 'ط ٦ / ٧', subjectKey: 'security', durationHours: secSlot.hours, isNight: false });
      }
    } else if (di === 2 || d.dow === 1 || d.kind === 'maintenance') {
      const p1Key = p1 ? p1.key : 'fitness';
      specs.push({ dayIdx: di, tabour: 'ط ١', subjectKey: p1Key, durationHours: p1?.hours ?? 1, isNight: false });
    } else if (di === 5 || d.dow === 4 || d.kind === 'personnel') {
      const p1Key = p1 ? p1.key : 'education';
      specs.push({ dayIdx: di, tabour: 'ط ١', subjectKey: p1Key, durationHours: p1?.hours ?? 1, isNight: false });
    } else {
      const p1Key = p1 ? p1.key : 'fitness';
      specs.push({ dayIdx: di, tabour: 'ط ١', subjectKey: p1Key, durationHours: p1?.hours ?? 1, isNight: false });
      if (p23) specs.push({ dayIdx: di, tabour: 'ط ٢ / ٣', subjectKey: p23.key, durationHours: p23.hours, isNight: false });
      if (p47) {
        specs.push({ dayIdx: di, tabour: 'ط ٤ / ٧', subjectKey: p47.key, durationHours: p47.hours, isNight: false });
      } else {
        if (p45) specs.push({ dayIdx: di, tabour: 'ط ٤ / ٥', subjectKey: p45.key, durationHours: p45.hours, isNight: false });
        if (p67) specs.push({ dayIdx: di, tabour: 'ط ٦ / ٧', subjectKey: p67.key, durationHours: p67.hours, isNight: false });
      }
      if (d.night > 0) {
        if (p89) specs.push({ dayIdx: di, tabour: 'ط ٨ / ٩', subjectKey: p89.key, durationHours: p89.hours, isNight: true });
        if (p1011) specs.push({ dayIdx: di, tabour: 'ط ١٠ / ١١', subjectKey: p1011.key, durationHours: p1011.hours, isNight: true });
      }
    }
  }

  return specs;
}

function getRem(lp: LessonProgress, isNight: boolean): number {
  return isNight ? lp.remNight : lp.remDay;
}

function setRem(lp: LessonProgress, isNight: boolean, val: number): void {
  if (isNight) lp.remNight = Math.max(0, val);
  else lp.remDay = Math.max(0, val);
}

function isStarted(lp: LessonProgress, isNight: boolean): boolean {
  return isNight ? lp.startedNight : lp.startedDay;
}

function markStarted(lp: LessonProgress, isNight: boolean): void {
  if (isNight) lp.startedNight = true;
  else lp.startedDay = true;
}

function phaseTotal(def: LessonDef, isNight: boolean): number {
  return isNight ? def.nightHours : def.dayHours;
}

function ensurePhaseAvailable(lessons: LessonProgress[], isNight: boolean): void {
  const hasAnyInPhase = lessons.some(lp => phaseTotal(lp.def, isNight) > 0);
  if (!hasAnyInPhase) return;
  const anyRem = lessons.some(lp => getRem(lp, isNight) > 0);
  if (!anyRem) {
    for (const lp of lessons) {
      if (isNight) {
        lp.remNight = lp.def.nightHours;
        lp.startedNight = false;
      } else {
        lp.remDay = lp.def.dayHours;
        lp.startedDay = false;
      }
    }
  }
}

function formatPartsText(parts: AssignedLessonPart[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    const p = parts[0];
    if (!p.isPartial && !p.isContinuation) return p.lesson.title;
    if (p.isContinuation && !p.isPartial) return `${p.lesson.title} (استكمال ${p.hours} س)`;
    return `${p.lesson.title} (${p.cumulativeHours}/${p.totalPhaseHours} س)`;
  }
  return parts
    .map(p => {
      if (p.isContinuation && !p.isPartial) return `استكمال: ${p.lesson.title} (${p.hours} س)`;
      if (p.isPartial) return `${p.lesson.title} (${p.cumulativeHours}/${p.totalPhaseHours} س)`;
      return `${p.lesson.title} (${p.hours} س)`;
    })
    .join(' + ');
}

function consumeFromLesson(lp: LessonProgress, isNight: boolean, hours: number): AssignedLessonPart {
  const remBefore = getRem(lp, isNight);
  const wasStarted = isStarted(lp, isNight);
  const totalPhase = phaseTotal(lp.def, isNight);
  const take = remBefore > 0 ? Math.min(hours, remBefore) : hours;
  if (remBefore > 0) {
    setRem(lp, isNight, remBefore - take);
    markStarted(lp, isNight);
  }
  const remAfter = getRem(lp, isNight);
  const effectiveTotal = totalPhase > 0 ? totalPhase : lp.def.totalHours;
  const cumulativeHours = remBefore > 0 ? effectiveTotal - remAfter : take;
  return {
    lesson: lp.def,
    hours: take,
    cumulativeHours,
    totalPhaseHours: effectiveTotal,
    isContinuation: wasStarted && remBefore > 0,
    isPartial: remAfter > 0 || (remBefore === 0 && take < lp.def.totalHours && totalPhase > take),
  };
}

/**
 * Simulates sequential curriculum progress across all weeks of the course
 * with day/night matching, 1-hour lecture fitting, and week-to-week hour compensation.
 */
export function computeCourseLessons(
  inst: Instructions,
  agenda: AgendaResult,
  linking: LinkingResult,
  targetWeek?: number,
): CourseLessonSchedule {
  const bySlotKey = new Map<string, SlotLessonAssignment>();
  const subjectStatusAtWeek = new Map<string, LessonStatusInfo[]>();

  // Initialize state per mapped subject
  const stateBySubject = new Map<SubjectKey, LessonProgress[]>();
  const getState = (key: SubjectKey): LessonProgress[] | null => {
    const existing = stateBySubject.get(key);
    if (existing) return existing;
    const cur = getSubjectCurriculum(key);
    if (!cur) return null;
    const init: LessonProgress[] = cur.lessons.map(def => ({
      def,
      remDay: def.dayHours,
      remNight: def.nightHours,
      startedDay: false,
      startedNight: false,
    }));
    stateBySubject.set(key, init);
    return init;
  };

  const first = inst.firstWeek ?? 1;
  const maxWeek = targetWeek ?? (first + inst.totalWeeks - 1);

  for (let w = first; w <= maxWeek; w++) {
    const ex = calculateWeekly(agenda, linking, w, inst);
    if (!ex) continue;

    // Snapshot subject progress at the start of this week for Lesson Picker status badges
    for (const r of ex.rows) {
      const lessons = getState(r.key);
      if (!lessons) continue;
      const inProg = lessons.find(lp => (lp.startedDay && lp.remDay > 0) || (lp.startedNight && lp.remNight > 0));
      const nextDay = lessons.find(lp => lp.remDay > 0);
      const nextNight = lessons.find(lp => lp.remNight > 0);
      subjectStatusAtWeek.set(
        `${w}:${r.key}`,
        lessons.map(lp => {
          let status: LessonStatusInfo['status'] = 'upcoming';
          if (lp.remDay === 0 && lp.remNight === 0) status = 'completed';
          else if (lp === inProg) status = 'in-progress';
          else if (lp === nextDay || lp === nextNight) status = 'next';
          return {
            lesson: lp.def,
            remDay: lp.remDay,
            remNight: lp.remNight,
            status,
            phaseCompatible: true,
          };
        }),
      );
    }

    const specs = extractWeekSlotSpecs(inst, ex);
    for (const spec of specs) {
      const k = spec.subjectKey;
      if (!k) continue;
      const lessons = getState(k);
      if (!lessons) continue;

      const overrideKey = makeOverrideKey(w, spec.dayIdx, spec.tabour);
      const override: LessonOverride | undefined = inst.lessonOverrides?.[overrideKey];

      // Refresh phase if needed before checking natural order
      ensurePhaseAvailable(lessons, spec.isNight);

      if (override) {
        const chosen = lessons.find(lp => lp.def.id === override.lessonId);
        if (chosen) {
          const chosenRem = getRem(chosen, spec.isNight);

          // Consume hours from manual selection (and optional secondary lesson)
          const parts: AssignedLessonPart[] = [];
          const hasPhaseInChosen = phaseTotal(chosen.def, spec.isNight) > 0;
          if (hasPhaseInChosen && chosenRem > 0) {
            const p = consumeFromLesson(chosen, spec.isNight, spec.durationHours);
            parts.push(p);
          } else {
            // Repeating an already-completed or phase-mismatched manual choice
            parts.push({
              lesson: chosen.def,
              hours: spec.durationHours,
              cumulativeHours: spec.durationHours,
              totalPhaseHours: phaseTotal(chosen.def, spec.isNight) || chosen.def.totalHours,
              isContinuation: false,
              isPartial: false,
            });
          }

          const used = parts.reduce((acc, p) => acc + p.hours, 0);
          const remSlot = spec.durationHours - used;
          if (remSlot > 0 && override.secondaryLessonId) {
            const sec = lessons.find(lp => lp.def.id === override.secondaryLessonId);
            if (sec) {
              parts.push(consumeFromLesson(sec, spec.isNight, remSlot));
            }
          }

          bySlotKey.set(overrideKey, {
            overrideKey,
            subjectKey: k,
            durationHours: spec.durationHours,
            isNight: spec.isNight,
            parts,
            displayText: formatPartsText(parts),
            primaryLessonId: chosen.def.id,
            secondaryLessonId: override.secondaryLessonId,
            isManual: true,
          });
          continue;
        }
      }

      // ── Default automatic sequential allocation ──
      const parts: AssignedLessonPart[] = [];
      let need = spec.durationHours;

      // Guard loop bounded by lessons count
      let guard = 0;
      while (need > 0 && guard++ < lessons.length + 2) {
        ensurePhaseAvailable(lessons, spec.isNight);

        // If subject has NO lessons for this phase at all (e.g. a night slot for a day-only subject), break cleanly
        const hasAnyPhaseHours = lessons.some(lp => phaseTotal(lp.def, spec.isNight) > 0);
        if (!hasAnyPhaseHours) {
          // Fall back to daytime lessons for review if subject has zero night lessons in curriculum
          ensurePhaseAvailable(lessons, false);
          const fallback = lessons.find(lp => lp.remDay > 0);
          if (!fallback) break;
          parts.push(consumeFromLesson(fallback, false, need));
          break;
        }

        // 1. Always finish any in-progress (partially consumed) lesson first for carry-over compensation
        const inProgress = lessons.find(lp => isStarted(lp, spec.isNight) && getRem(lp, spec.isNight) > 0);
        if (inProgress) {
          const p = consumeFromLesson(inProgress, spec.isNight, need);
          parts.push(p);
          need -= p.hours;
          continue;
        }

        // 2. When 1 hour remains in the slot (either 1h slot or 1h left after finishing a carry-over):
        //    "take one lecture for 1 hour" — look for a 1-hour lesson if completing a split 2h slot,
        //    or follow sequential order cleanly when starting a standalone 1h slot.
        if (need === 1 && parts.length > 0) {
          const oneHourLesson = lessons.find(lp => !isStarted(lp, spec.isNight) && getRem(lp, spec.isNight) === 1);
          if (oneHourLesson) {
            const p = consumeFromLesson(oneHourLesson, spec.isNight, 1);
            parts.push(p);
            need = 0;
            continue;
          }
        }

        // 3. Otherwise take the next sequential lesson with remaining hours in this phase
        const nextSeq = lessons.find(lp => getRem(lp, spec.isNight) > 0);
        if (!nextSeq) break;

        const p = consumeFromLesson(nextSeq, spec.isNight, need);
        parts.push(p);
        need -= p.hours;
      }

      if (parts.length > 0) {
        bySlotKey.set(overrideKey, {
          overrideKey,
          subjectKey: k,
          durationHours: spec.durationHours,
          isNight: spec.isNight,
          parts,
          displayText: formatPartsText(parts),
          primaryLessonId: parts[0].lesson.id,
          secondaryLessonId: parts[1]?.lesson.id,
          isManual: false,
        });
      }
    }
  }

  return { bySlotKey, subjectStatusAtWeek };
}

/**
 * Computes warning message for a subject subject/lesson status list in the picker modal.
 */
export function getLessonsForPicker(
  schedule: CourseLessonSchedule | null,
  week: number,
  subjectKey: SubjectKey,
  isNight: boolean,
): LessonStatusInfo[] {
  const cur = getSubjectCurriculum(subjectKey);
  if (!cur) return [];
  const snap = schedule?.subjectStatusAtWeek.get(`${week}:${subjectKey}`);
  return cur.lessons.map((def, idx) => {
    const s = snap?.[idx];
    const phaseHours = isNight ? def.nightHours : def.dayHours;
    return {
      lesson: def,
      remDay: s?.remDay ?? def.dayHours,
      remNight: s?.remNight ?? def.nightHours,
      status: s?.status ?? (idx === 0 ? 'next' : 'upcoming'),
      phaseCompatible: phaseHours > 0,
    };
  });
}

export function getSubjectArabicLabel(key: SubjectKey, inst: Instructions): string {
  return getSubjectName(key, inst);
}
