import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseInstructions, LOW } from '../parse';
import { calculateAgenda } from '../../engine/agenda';
import { calculateDistribution } from '../../engine/distribution';
import { calculateLinking } from '../../engine/linking';
import { calculateWeekly } from '../../engine/weekly';
import { addDays } from '../../engine/dates';

// private exam text is not in the repository: tests that need it run only where the files exist
const f111 = new URL('./exam111.txt', import.meta.url);
const has111 = existsSync(f111);
const text = has111 ? readFileSync(f111, 'utf8') : '';
const { instructions: p, conf } = parseInstructions(text);

describe.skipIf(!has111)('course 111 (second period: weeks 27-52, year-first dates, march on week 3)', () => {
  it('period and special weeks', () => {
    expect(p.startSaturday).toBe('2026-01-03');
    expect([p.firstWeek, p.totalWeeks]).toEqual([27, 26]);
    expect(p.prepWeeks).toEqual([27, 28]); // printed "(2،1)" is relative; the dates win
    expect(p.opsWeeks).toEqual([45]);
    expect(p.reserveWeeks).toEqual([52]);
    expect(p.campWeeks).toEqual([40, 49]);
    expect(p.levelWeeks).toEqual({ individual: 9, crew: 7, centre: 6 });
  });
  it('holidays, Ramadan, march / security', () => {
    expect(p.holidays).toEqual([
      '2026-01-07', '2026-01-25', { from: '2026-03-19', to: '2026-03-22' }, '2026-04-13', '2026-04-25', '2026-05-01',
      '2026-05-26', { from: '2026-05-27', to: '2026-05-30' }, '2026-06-16', '2026-06-30',
    ]);
    expect(p.ramadan).toEqual({ from: '2026-02-18', to: '2026-03-18' });
    expect(p.marchSecurityByMonth).toEqual([[3, 4], [3, 4], [5, 2], [7, 0], [3, 4], [3, 4]]);
    expect(p.marchWeekOfMonth).toBe(3);
    expect(p.marchWeekExceptions).toEqual({ 2: 4 });
    expect(p.weeksPerMonth).toEqual([5, 4, 4, 5, 4, 4]);
    expect(p.selectedMonth).toBe(4);
    expect(p.selectedWeek).toBe(46);
  });
  it('clean text parses with high confidence, except the guessed percentages', () => {
    for (const [k, v] of Object.entries(conf)) if (k !== 'pcts') expect(v, k).toBeGreaterThanOrEqual(LOW);
  });
  it('calculates end to end with every check green', () => {
    const a = calculateAgenda(p); const d = calculateDistribution(p, a); const l = calculateLinking(p, a, d);
    expect(a.weeks[0].week).toBe(27);
    expect(a.weeks.at(-1)!.week).toBe(52);
    expect(a.checks.ok && d.checks.ok && l.checks.ok).toBe(true);
    expect(a.weeks.find(w => w.week === 45)!.total).toBe(0); // ops
    expect(a.weeks.find(w => w.week === 52)!.total).toBe(0); // reserve
    expect(a.weeks.find(w => w.week === 40)!.night).toBe(30); // camp
    expect(calculateWeekly(a, l, 46)?.checks.ok).toBe(true);
  });
});

import { FIXTURE_111 } from '../../engine/fixtures';
describe('course 111 preset', () => {
  it('equals what the typed text parses to and every check is green', () => {
    const a = calculateAgenda(FIXTURE_111); const d = calculateDistribution(FIXTURE_111, a); const l = calculateLinking(FIXTURE_111, a, d);
    expect(a.checks.ok && d.checks.ok && l.checks.ok).toBe(true);
    expect(a.weeks.map(w => w.week)).toEqual(Array.from({ length: 26 }, (_, i) => i + 27));
    expect(a.total).toBe(a.day + a.night);
    for (let w = 27; w <= 52; w++) expect(calculateWeekly(a, l, w)?.checks.ok, `week ${w}`).toBe(true);
  });
});
describe('unreadable OCR digits degrade gracefully', () => {
  it('keeps anchors, fills structural defaults, flags everything and explains', () => {
    const ocr = [
      'للدورة المتقدمة رقم (111)', 'الفترة التدريبية الثانية للعام التدريبى ‎٠١75/٠١11‏ فى المدة من ‎٠055/01/86‏', 'حتى ‎7١75/:017/.7‏ من الأسبوع رقم',
      'الفترة التحضيرية الثانية فى الأسبوع رقم ‎)١2١(‏ خلال المدة من', 'أسبوع الإحتياط رقم (57) خلال المدة', 'مستوى الفرد (؟) أسبوع - الطاقم (/) أسبوع',
      'الأجازات الرسمية :', 'عيد الميلاد المجيد /1./١1٠', 'شهر رمضان خلال فى المدة من /١/17٠', 'من الأسبوع الثالث من كل شهر',
    ].join('\n');
    const r = parseInstructions(ocr, 0.5);
    expect(r.notes[0]).toMatch(/لم تُقرأ الأرقام الهندية/);
    expect(Object.values(r.conf).every(v => v < LOW)).toBe(true);
    expect(r.instructions.marchWeekOfMonth).toBe(3);
  });
});

const fOcr = new URL('./exam111-ocr.txt', import.meta.url);
describe.skipIf(!existsSync(fOcr))('real OCR of the scanned course-111 PDF (after the glyph digit reader)', () => {
  const ocr = existsSync(fOcr) ? readFileSync(fOcr, 'utf8') : '';
  const r = parseInstructions(ocr, 0.6);
  const i = r.instructions;
  it('recovers the structure and dates that Tesseract alone lost', () => {
    expect(i.startSaturday).toBe('2026-01-03');
    expect([i.firstWeek, i.totalWeeks]).toEqual([27, 26]);
    expect(i.prepWeeks).toEqual([27, 28]);
    expect(i.opsWeeks).toEqual([45]);
    expect(i.reserveWeeks).toEqual([52]);
    expect(i.campWeeks).toEqual([40, 49]);
    expect(i.levelWeeks).toEqual({ individual: 9, crew: 7, centre: 6 });
    expect(i.ramadan).toEqual({ from: '2026-02-18', to: '2026-03-18' });
    expect(i.marchWeekOfMonth).toBe(3);
    expect(i.selectedMonth).toBe(4);
    expect(i.selectedWeek).toBe(46);
  });
  it('reads all ten holidays, including the 27-30 May range', () => {
    const days = new Set<string>();
    for (const h of i.holidays) { if (typeof h === 'string') days.add(h); else for (let d = h.from; d <= h.to; d = addDays(d, 1)) days.add(d); }
    for (const d of ['2026-01-07', '2026-01-25', '2026-03-19', '2026-03-22', '2026-04-13', '2026-04-25', '2026-05-01', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-06-16', '2026-06-30']) expect(days.has(d), d).toBe(true);
  });
  it('march / security hours survive the bracket glyph artefacts', () => {
    expect(i.marchSecurityByMonth).toEqual([[3, 4], [3, 4], [5, 2], [7, 0], [3, 4], [3, 4]]);
  });
  it('every OCR-read field is still flagged for the user to confirm', () => {
    expect(Object.values(r.conf).every(v => v < LOW)).toBe(true);
  });
});

describe('implausible march hours are rejected, not printed', () => {
  it('flags a month whose numbers cannot be hours of one day', () => {
    const r = parseInstructions(['الأجازات الرسمية :', 'أ - الشهر الأول 3 طابور سير + 4 أمن حربى .', 'ب - الشهر الثانى 431 طابور سير + 4410 أمن حربى .', 'ج - الشهر الثالث 5 طابور سير + 2 أمن حربى .'].join('\n'), 0.6);
    expect(r.instructions.marchSecurityByMonth.slice(0, 3)).toEqual([[3, 4], [0, 0], [5, 2]]);
    expect(r.notes.join(' ')).toMatch(/الشهر 2/);
  });
});
