import { describe, expect, it } from 'vitest';
import { GENERAL_CURRICULA, getSubjectCurriculum } from '../curriculum';
import { FIXTURE_108 } from '../fixtures';
import { calculateAgenda } from '../agenda';
import { calculateDistribution } from '../distribution';
import { calculateLinking } from '../linking';
import { calculateWeekly } from '../weekly';
import { computeCourseLessons, makeOverrideKey } from '../lessonScheduler';
import { buildDocxXml, buildWeekProgram } from '../../export/programDocx';

describe('Word Curriculum Catalog & Sequential Lesson Scheduler', () => {
  const inst = FIXTURE_108;
  const agenda = calculateAgenda(inst);
  const dist = calculateDistribution(inst, agenda);
  const link = calculateLinking(inst, agenda, dist);

  it('provides all 14 general Word subjects while keeping tactics and tech unmapped', () => {
    const expectedKeys = [
      'education', 'fitness', 'discipline', 'security', 'topography', 'shooting',
      'recon', 'engineering', 'chemical', 'morale', 'admin', 'history', 'intlLaw', 'infoWar',
    ];
    for (const k of expectedKeys) {
      const cur = getSubjectCurriculum(k);
      expect(cur, `missing curriculum for ${k}`).not.toBeNull();
      expect(cur!.lessons.length).toBeGreaterThan(0);
    }
    expect(getSubjectCurriculum('tactics')).toBeNull();
    expect(getSubjectCurriculum('tech')).toBeNull();
    expect(Object.keys(GENERAL_CURRICULA).length).toBe(14);
  });

  it('assigns lessons sequentially with 1-hour carry-over compensation across days and weeks', () => {
    const schedule = computeCourseLessons(inst, agenda, link, 5);
    const ex3 = calculateWeekly(agenda, link, 3, inst)!;
    const w3 = buildWeekProgram(inst, ex3, schedule);

    // Saturday ط ١ fitness (1h slot vs 2h lesson #1) -> 1/2 س, Sunday completes it!
    const satFit = w3[0].slots[0];
    const sunFit = w3[1].slots[0];
    expect(satFit.subjectKey).toBe('fitness');
    expect(satFit.lessonText).toContain('تمرينات بدنية + مهارات عسكرية');
    expect(satFit.lessonText).toContain('1/2 س');
    expect(sunFit.lessonText).toContain('تمرينات بدنية + مهارات عسكرية');
    expect(sunFit.lessonText).toContain('استكمال 1 س');

    // Tuesday moves cleanly to fitness lesson #2
    const tueFit = w3[3].slots[0];
    expect(tueFit.lessonText).toContain('تمرينات بدنية + إختراق ضاحية');

    // Thursday education (1h slot vs 2h lesson #1) -> Week 3 starts 1/2 س, Week 4 completes it!
    const w3ThuEdu = w3[5].slots[0];
    expect(w3ThuEdu.subjectKey).toBe('education');
    expect(w3ThuEdu.lessonText).toContain('الوقوف (انتباه / صفا / أسترح)');
    expect(w3ThuEdu.lessonText).toContain('1/2 س');

    // Week 4 Thursday is Jan 25 holiday (rest), so education compensates in Week 5 Thursday!
    const ex4 = calculateWeekly(agenda, link, 4, inst)!;
    const w4 = buildWeekProgram(inst, ex4, schedule);
    expect(w4[5].isRest).toBe(true);

    const ex5 = calculateWeekly(agenda, link, 5, inst)!;
    const w5 = buildWeekProgram(inst, ex5, schedule);
    const w5ThuEdu = w5[5].slots[0];
    expect(w5ThuEdu.lessonText).toContain('الوقوف (انتباه / صفا / أسترح)');
    expect(w5ThuEdu.lessonText).toContain('استكمال 1 س');
  });

  it('keeps tactics and tech untouched without curriculum lessons or horizontal bars', () => {
    const schedule = computeCourseLessons(inst, agenda, link, 5);
    const ex3 = calculateWeekly(agenda, link, 3, inst)!;
    const w3 = buildWeekProgram(inst, ex3, schedule);

    const tacticsSlots = w3.flatMap(d => d.slots).filter(s => s.subjectKey === 'tactics');
    const techSlots = w3.flatMap(d => d.slots).filter(s => s.subjectKey === 'tech');

    for (const s of [...tacticsSlots, ...techSlots]) {
      expect(s.hasCurriculum).toBe(false);
      expect(s.lessonText).toBeUndefined();
    }
  });

  it('places night-only hours exclusively in night slots across the course', () => {
    const schedule = computeCourseLessons(inst, agenda, link);

    for (const [, assign] of schedule.bySlotKey) {
      for (const part of assign.parts) {
        if (assign.isNight && part.lesson.nightHours > 0) {
          expect(part.lesson.nightHours).toBeGreaterThan(0);
        }
        if (!assign.isNight && getSubjectCurriculum(assign.subjectKey)?.lessons.some(l => l.dayHours > 0)) {
          expect(part.lesson.dayHours).toBeGreaterThan(0);
        }
      }
    }
  });

  it('takes a 1-hour lesson when 1 hour remains in a 2-hour slot after a carry-over', () => {
    const schedule = computeCourseLessons(inst, agenda, link);
    // Find any slot where 2 parts filled a 2h slot cleanly (1h carry-over + 1h lecture)
    const splitTwoHourSlots = [...schedule.bySlotKey.values()].filter(
      a => a.durationHours === 2 && a.parts.length === 2,
    );
    for (const slot of splitTwoHourSlots) {
      expect(slot.parts[0].hours).toBe(1);
      expect(slot.parts[1].hours).toBe(1);
    }
    expect(splitTwoHourSlots.length).toBeGreaterThan(0);
  });

  it('allows manual lesson overrides in any order without warnings and exports ━━━ to DOCX', () => {
    const key = makeOverrideKey(3, 0, 'ط ١'); // Week 3 Saturday fitness slot
    const customInst = {
      ...inst,
      lessonOverrides: {
        [key]: { lessonId: 'fitness-4' },
      },
    };
    const schedule = computeCourseLessons(customInst, agenda, link, 3);
    const assign = schedule.bySlotKey.get(key)!;
    expect(assign.isManual).toBe(true);
    expect(assign.primaryLessonId).toBe('fitness-4');
    expect(assign.warning).toBeUndefined();

    const ex3 = calculateWeekly(agenda, link, 3, customInst)!;
    const xml = buildDocxXml(customInst, ex3, schedule);
    expect(xml).toContain('━━━');
    expect(xml).toContain('تمرينات بدنية + طابور موانع');
  });
});
