import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseInstructions, LOW } from '../parse';
import { FIXTURE_108 as F } from '../../engine/fixtures';
import { calculateAgenda } from '../../engine/agenda';
import { addDays } from '../../engine/dates';

const holidayDays = (hs: (string | { from: string; to: string })[]) => {
  const out = new Set<string>();
  for (const h of hs) {
    if (typeof h === 'string') out.add(h);
    else for (let d = h.from; d <= h.to; d = addDays(d, 1)) out.add(d);
  }
  return [...out].sort();
};
// the real exam text is private and not in the repository: these tests run only where the file exists
const file = new URL('./exam108.txt', import.meta.url);
const has = existsSync(file);
const text = has ? readFileSync(file, 'utf8') : '';
const { instructions: p, conf } = parseInstructions(text);

describe.skipIf(!has)('parser on the real exam DOCX text (reversed digits included)', () => {
  it('period, special weeks, levels', () => {
    expect(p.startSaturday).toBe(F.startSaturday);
    expect(p.totalWeeks).toBe(26);
    expect(p.firstWeek).toBe(1);
    expect(p.prepWeeks).toEqual([1, 2]);
    expect(p.opsWeeks).toEqual([21]);
    expect(p.reserveWeeks).toEqual([26]);
    expect(p.campWeeks).toEqual([16, 23]);
    expect(p.levelWeeks).toEqual(F.levelWeeks);
  });
  it('holidays and Ramadan', () => {
    expect(holidayDays(p.holidays)).toEqual(holidayDays(F.holidays));
    expect(p.ramadan).toEqual(F.ramadan);
  });
  it('march / security, percentages, selections', () => {
    expect(p.marchSecurityByMonth).toEqual(F.marchSecurityByMonth);
    expect(p.marchWeekOfMonth).toBe(4);
    expect(p.marchWeekExceptions).toEqual({ 5: 2 });
    expect(p.pcts).toEqual(F.pcts);
    expect(p.weeksPerMonth).toEqual(F.weeksPerMonth);
    expect(p.selectedMonth).toBe(4);
    expect(p.selectedWeek).toBe(20);
  });
  it('parsed instructions reproduce the key totals', () => {
    const a = calculateAgenda(p);
    expect([a.total, a.day, a.night, a.fitness, a.education, a.security]).toEqual([775, 603, 172, 120, 17, 18]);
  });
  it('everything came with high confidence from a DOCX', () => {
    for (const [k, v] of Object.entries(conf)) expect(v, k).toBeGreaterThanOrEqual(LOW);
  });
  it('OCR confidence lowers the flags', () => {
    const r = parseInstructions(text, 0.7);
    expect(Object.values(r.conf).every(v => v < LOW)).toBe(true);
  });
});
