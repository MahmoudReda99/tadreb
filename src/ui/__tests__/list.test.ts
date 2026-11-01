import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, parseList, parseNum, toArabic } from '../parseInput';

describe('week lists', () => {
  it('any non-digit separates the numbers', () => {
    expect(parseList('12, 13', true)).toEqual([12, 13]);
    expect(parseList('12،13', true)).toEqual([12, 13]);
    expect(parseList('12 13', true)).toEqual([12, 13]);
    expect(parseList('12 و 13', true)).toEqual([12, 13]);
    expect(parseList('12;13', true)).toEqual([12, 13]);
  });
  it('a dash is NOT a range: 19-23 is 19 and 23', () => {
    expect(parseList('19-23', true)).toEqual([19, 23]);
    expect(parseList('19 - 23', true)).toEqual([19, 23]);
    expect(parseList('19 الى 23', true)).toEqual([19, 23]);
    expect(parseList('12-14', true)).toEqual([12, 14]);
  });
  it('keeps half-typed text usable and reads both digit kinds', () => {
    expect(parseList('12,', true)).toEqual([12]);
    expect(parseList('', true)).toEqual([]);
    expect(parseList('٢٧، ٢٨', true)).toEqual([27, 28]);
    expect(parseList('٢٧, 28', true)).toEqual([27, 28]);
  });
  it('de-duplicates and sorts weeks; keeps the order when asked', () => {
    expect(parseList('40، 16، 16', true)).toEqual([16, 40]);
    expect(parseList('5، 4، 4، 5', false)).toEqual([5, 4, 4, 5]);
  });
});

describe('single numbers never keep a leading zero', () => {
  it('parses', () => {
    expect(parseNum('007')).toBe(7);
    expect(parseNum('٠٥')).toBe(5);
    expect(parseNum('0')).toBe(0);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
});

describe('dates written any way', () => {
  it('day-month-year with any separator, any digits', () => {
    for (const s of ['3-4-2026', '3/4/2026', '03.04.2026', '3 4 2026', '٣-٤-٢٠٢٦', '٣ ـ ٤ ـ ٢٠٢٦', '3/4/26']) expect(parseDate(s), s).toBe('2026-04-03');
  });
  it('year first is year-month-day', () => {
    expect(parseDate('2026-04-03')).toBe('2026-04-03');
    expect(parseDate('2026/4/3')).toBe('2026-04-03');
    expect(parseDate('٢٠٢٦/٠٤/٠٣')).toBe('2026-04-03');
  });
  it('month names and a month-first date with an obvious day', () => {
    expect(parseDate('3 أبريل 2026')).toBe('2026-04-03');
    expect(parseDate('3 Apr 2026')).toBe('2026-04-03');
    expect(parseDate('4/13/2026')).toBe('2026-04-13');
  });
  it('day and month only: the year comes from the training period', () => {
    const ctx = { from: '2023-12-30', to: '2024-06-28' };
    expect(parseDate('7/1', ctx)).toBe('2024-01-07');
    expect(parseDate('30-12', ctx)).toBe('2023-12-30');
    expect(parseDate('٢٥/٤', ctx)).toBe('2024-04-25');
  });
  it('rejects impossible dates', () => {
    expect(parseDate('31-2-2026')).toBeNull();
    expect(parseDate('hello')).toBeNull();
    expect(parseDate('12')).toBeNull();
  });
  it('formats with Arabic digits by default', () => {
    expect(formatDate('2026-04-03')).toBe('٣/٤/٢٠٢٦');
    expect(toArabic('12/5')).toBe('١٢/٥');
  });
});
