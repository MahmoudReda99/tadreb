import { describe, expect, it } from 'vitest';
import { FIXTURE_108 } from '../../engine/fixtures';
import { calculateAgenda } from '../../engine/agenda';
import { calculateDistribution } from '../../engine/distribution';
import { calculateLinking } from '../../engine/linking';
import { calculateWeekly } from '../../engine/weekly';
import { buildWeekProgram, buildDocxXml } from '../../export/programDocx';

describe('Training Program Sheet & Docx Mapping', () => {
  const inst = FIXTURE_108;
  const agenda = calculateAgenda(inst);
  const dist = calculateDistribution(inst, agenda);
  const link = calculateLinking(inst, agenda, dist);

  it('maps a normal training week (week 3) with subject slots and Friday as rest', () => {
    const ex = calculateWeekly(agenda, link, 3, inst);
    expect(ex).not.toBeNull();
    if (!ex) return;

    const program = buildWeekProgram(inst, ex);
    expect(program.length).toBe(7); // Sat..Fri

    // Days 0..5: Sat..Thu
    for (let di = 0; di < 6; di++) {
      const day = program[di];
      expect(day.isRest).toBe(false);

      if (di === 2) {
        // Monday: Period 1 is fitness, rest of day is merged 'يوم صيانة'
        expect(day.dayName).toBe('الإثنين');
        expect(day.slots.length).toBe(2);
        expect(day.slots[0].tabour).toBe('ط ١');
        expect(day.slots[0].timing).toBe('٦٠٠ - ٨٠٠');
        expect(day.slots[0].subject).toBe('تربية بدنية');
        expect(day.slots[1].isMerged).toBe(true);
        expect(day.slots[1].mergedLabel).toBe('يوم صيانة');
      } else if (di === 5) {
        // Thursday: Period 1 is education, rest of day is merged 'شئون أفراد'
        expect(day.dayName).toBe('الخميس');
        expect(day.slots.length).toBe(2);
        expect(day.slots[0].tabour).toBe('ط ١');
        expect(day.slots[0].timing).toBe('٦٠٠ - ٨٠٠');
        expect(day.slots[0].subject).toBe('تعليم منضم');
        expect(day.slots[1].isMerged).toBe(true);
        expect(day.slots[1].mergedLabel).toBe('شئون أفراد');
      } else {
        // Standard training days: Sat, Sun, Tue, Wed
        expect(day.slots.length).toBeGreaterThanOrEqual(4);
        expect(day.slots[0].tabour).toBe('ط ١');
        expect(day.slots[0].timing).toBe('٦٠٠ - ٨٠٠');
        expect(day.slots[0].isNight).toBe(false);
      }
    }

    // Day 6: Friday (rest)
    const friday = program[6];
    expect(friday.dayName).toBe('الجمعة');
    expect(friday.isRest).toBe(true);

    // Verify Docx XML output
    const xml = buildDocxXml(inst, ex);
    expect(xml).toContain('برنامج تدريب السرية');
    expect(xml).toContain('الجمعة');
    expect(xml).toContain('راحة');
    expect(xml).toContain('يوم صيانة');
    expect(xml).toContain('شئون أفراد');
    expect(xml).toContain('قائد السرية');
  });

  it('correctly treats prep week (week 1) as non-training with NO fitness or subject slots', () => {
    const ex1 = calculateWeekly(agenda, link, 1, inst);
    expect(ex1).not.toBeNull();
    if (!ex1) return;

    const program = buildWeekProgram(inst, ex1);
    expect(program.length).toBe(7);

    // All days must be rest/non-training
    for (let di = 0; di < 6; di++) {
      const day = program[di];
      expect(day.isRest).toBe(true);
      expect(day.slots.length).toBe(0);
      expect(day.restLabel).toContain('الفترة التحضيرية');
    }
    expect(program[6].isRest).toBe(true);
    expect(program[6].restLabel).toBe('راحة');

    // Make sure NO 'تربية بدنية' is generated in XML for prep week
    const xml = buildDocxXml(inst, ex1);
    expect(xml).not.toContain('تربية بدنية');
    expect(xml).toContain('الفترة التحضيرية');
  });

  it('correctly treats ops week (week 21) as non-training with NO fitness slots', () => {
    const ex21 = calculateWeekly(agenda, link, 21, inst);
    expect(ex21).not.toBeNull();
    if (!ex21) return;

    const program = buildWeekProgram(inst, ex21);
    for (let di = 0; di < 5; di++) {
      expect(program[di].isRest).toBe(true);
      expect(program[di].slots.length).toBe(0);
      expect(program[di].restLabel).toContain('مهام العمليات');
    }
    // Thursday (di = 5) is maintenance day
    expect(program[5].isRest).toBe(true);
    expect(program[5].restLabel).toBe('يوم صيانة');

    const xml = buildDocxXml(inst, ex21);
    expect(xml).not.toContain('تربية بدنية');
    expect(xml).toContain('مهام العمليات');
    expect(xml).toContain('يوم صيانة');
  });

  it('correctly treats reserve week (week 26) as non-training with NO fitness slots', () => {
    const ex26 = calculateWeekly(agenda, link, 26, inst);
    expect(ex26).not.toBeNull();
    if (!ex26) return;

    const program = buildWeekProgram(inst, ex26);
    for (let di = 0; di < 6; di++) {
      expect(program[di].isRest).toBe(true);
      expect(program[di].slots.length).toBe(0);
      expect(program[di].restLabel).toContain('احتياط');
    }

    const xml = buildDocxXml(inst, ex26);
    expect(xml).not.toContain('تربية بدنية');
    expect(xml).toContain('احتياط');
  });

  it('maps camp week (week 16) with 3 day slots + 3 night slots in red, and Thursday rest', () => {
    const ex16 = calculateWeekly(agenda, link, 16, inst);
    expect(ex16).not.toBeNull();
    if (!ex16) return;

    const program = buildWeekProgram(inst, ex16);
    expect(program.length).toBe(7);

    // Days 0..4: Saturday to Wednesday
    for (let di = 0; di < 5; di++) {
      const day = program[di];
      expect(day.isRest).toBe(false);
      expect(day.slots.length).toBe(6);

      // Day slots
      expect(day.slots[0].tabour).toBe('ط ١');
      expect(day.slots[0].timing).toBe('٠٧٣٥ - ٠٩٠٠');
      expect(day.slots[0].isNight).toBe(false);

      expect(day.slots[1].tabour).toBe('ط ٢ / ٣');
      expect(day.slots[1].timing).toBe('١٠٠٠ - ١١٣٠');
      expect(day.slots[1].isNight).toBe(false);

      expect(day.slots[2].tabour).toBe('ط ٤ / ٥');
      expect(day.slots[2].timing).toBe('١١٤٠ - ١٣١٠');
      expect(day.slots[2].isNight).toBe(false);

      // Night slots (all in red)
      expect(day.slots[3].tabour).toBe('ط ٦ / ٧');
      expect(day.slots[3].timing).toBe('١٨٠٠ - ١٩٣٠');
      expect(day.slots[3].isNight).toBe(true);

      expect(day.slots[4].tabour).toBe('ط ٨ / ٩');
      expect(day.slots[4].timing).toBe('١٩٤٠ - ٢١١٠');
      expect(day.slots[4].isNight).toBe(true);

      expect(day.slots[5].tabour).toBe('ط ١٠ / ١١');
      expect(day.slots[5].timing).toBe('٢١٥٠ - ٢٣٢٠');
      expect(day.slots[5].isNight).toBe(true);
    }

    // Day 5: Thursday is maintenance in camp week
    const thursday = program[5];
    expect(thursday.isRest).toBe(true);
    expect(thursday.restLabel).toBe('يوم صيانة');

    // Day 6: Friday is rest
    const friday = program[6];
    expect(friday.isRest).toBe(true);
    expect(friday.restLabel).toBe('راحة');
    expect(friday.dateStr).toBeTruthy();

    // Verify weekly extract night lectures start at 6-7, 8-9, 10-11 for camp week
    const allSlots = ex16.rows.flatMap(r => r.slots.slice(0, 5).flat());
    const nightSlots = allSlots.filter(s => s.isNight);
    const nightLectures = new Set(nightSlots.map(s => s.lectures));
    expect(nightLectures.has('6-7')).toBe(true);
    expect(nightLectures.has('8-9')).toBe(true);
    expect(nightLectures.has('10-11')).toBe(true);
    expect(nightLectures.has('12-13')).toBe(false);
  });

  it('maps ramadan days with specialized short lecture timings and no night hours', () => {
    // Find a week during ramadan in FIXTURE_108
    let ramadanWeek = -1;
    for (let w = 1; w <= 26; w++) {
      const ex = calculateWeekly(agenda, link, w, inst);
      if (ex && ex.days.some(d => d.kind === 'ramadan')) {
        ramadanWeek = w;
        break;
      }
    }

    expect(ramadanWeek).toBeGreaterThan(0);
    const exRamadan = calculateWeekly(agenda, link, ramadanWeek, inst);
    expect(exRamadan).not.toBeNull();
    if (!exRamadan) return;

    const program = buildWeekProgram(inst, exRamadan);

    // Standard training Ramadan day (e.g. Saturday or Sunday or Tuesday or Wednesday)
    const rDayIdx = exRamadan.days.findIndex((d, idx) => d.kind === 'ramadan' && idx !== 2 && idx !== 5);
    expect(rDayIdx).toBeGreaterThanOrEqual(0);
    const rDay = program[rDayIdx];

    expect(rDay.isRest).toBe(false);
    expect(rDay.slots.length).toBe(4);

    expect(rDay.slots[0].tabour).toBe('ط ١');
    expect(rDay.slots[0].timing).toBe('٩٠٠ - ٠٩٣٥');

    expect(rDay.slots[1].tabour).toBe('ط ٢ / ٣');
    expect(rDay.slots[1].timing).toBe('١٠٠٠ - ١١١٠');

    expect(rDay.slots[2].tabour).toBe('ط ٤ / ٥');
    expect(rDay.slots[2].timing).toBe('١١٢٠ - ١٢٣٠');

    expect(rDay.slots[3].tabour).toBe('ط ٦ / ٧');
    expect(rDay.slots[3].timing).toBe('١٢٤٠ - ١٣٥٠');

    // All slots must be daytime
    expect(rDay.slots.every(s => !s.isNight)).toBe(true);

    // Monday in Ramadan: fitness with Ramadan timing ٩٠٠ - ٠٩٣٥ + merged 'يوم صيانة'
    const mon = program[2];
    expect(mon.dayName).toBe('الإثنين');
    expect(mon.slots.length).toBe(2);
    expect(mon.slots[0].timing).toBe('٩٠٠ - ٠٩٣٥');
    expect(mon.slots[0].subject).toBe('تربية بدنية');
    expect(mon.slots[1].isMerged).toBe(true);
    expect(mon.slots[1].mergedLabel).toBe('يوم صيانة');

    // Thursday in Ramadan: education with Ramadan timing ٩٠٠ - ٠٩٣٥ + merged 'شئون أفراد'
    const thu = program[5];
    expect(thu.dayName).toBe('الخميس');
    expect(thu.slots.length).toBe(2);
    expect(thu.slots[0].timing).toBe('٩٠٠ - ٠٩٣٥');
    expect(thu.slots[0].subject).toBe('تعليم منضم');
    expect(thu.slots[1].isMerged).toBe(true);
    expect(thu.slots[1].mergedLabel).toBe('شئون أفراد');
  });

  it('correctly adapts March day to show طابور سير and أمن حربى with no empty slots', () => {
    // Find a week containing a march day
    let marchWeek = -1;
    for (let w = 1; w <= 26; w++) {
      const ex = calculateWeekly(agenda, link, w, inst);
      if (ex && ex.days.some(d => d.kind === 'march')) {
        marchWeek = w;
        break;
      }
    }

    expect(marchWeek).toBeGreaterThan(0);
    const exMarch = calculateWeekly(agenda, link, marchWeek, inst);
    expect(exMarch).not.toBeNull();
    if (!exMarch) return;

    const program = buildWeekProgram(inst, exMarch);
    const sat = program[0]; // Saturday is march day

    expect(sat.dayName).toBe('السبت');
    expect(sat.isRest).toBe(false);
    expect(sat.slots.length).toBe(3); // ط ١ (سير), ط ٢/٣ (سير), ط ٤/٧ (أمن حربى)

    expect(sat.slots[0].tabour).toBe('ط ١');
    expect(sat.slots[0].subject).toBe('طابور سير');
    expect(sat.slots[0].location).toContain('خط السير');

    expect(sat.slots[1].tabour).toBe('ط ٢ / ٣');
    expect(sat.slots[1].subject).toBe('طابور سير');
    expect(sat.slots[1].location).toContain('خط السير');

    expect(sat.slots[2].tabour).toBe('ط ٤ / ٧');
    expect(sat.slots[2].subject).toBe('أمن حربى');
    expect(sat.slots[2].location).toContain('قاعة المحاضرات');

    // No slot should be '—' or 'تربية بدنية'
    expect(sat.slots.every(s => s.subject !== '—' && s.subject !== 'تربية بدنية')).toBe(true);
  });
});
