import { describe, expect, it } from 'vitest';
import { parseList } from '../Review';

describe('forgiving week lists', () => {
  it('accepts commas of any kind, spaces and "و"', () => {
    expect(parseList('12, 13', true)).toEqual([12, 13]);
    expect(parseList('12،13', true)).toEqual([12, 13]);
    expect(parseList('12 13', true)).toEqual([12, 13]);
    expect(parseList('12 و 13', true)).toEqual([12, 13]);
    expect(parseList('12;13', true)).toEqual([12, 13]);
  });
  it('keeps a half-typed value usable', () => {
    expect(parseList('12,', true)).toEqual([12]);
    expect(parseList('12،', true)).toEqual([12]);
    expect(parseList('', true)).toEqual([]);
  });
  it('expands ranges, reads Arabic digits, de-duplicates and sorts', () => {
    expect(parseList('12-14', true)).toEqual([12, 13, 14]);
    expect(parseList('12 - 14', true)).toEqual([12, 13, 14]);
    expect(parseList('12 الى 14', true)).toEqual([12, 13, 14]);
    expect(parseList('٢٧، ٢٨', true)).toEqual([27, 28]);
    expect(parseList('40، 16، 16', true)).toEqual([16, 40]);
  });
  it('keeps the order when asked (weeks per month)', () => {
    expect(parseList('5، 4، 4، 5', false)).toEqual([5, 4, 4, 5]);
  });
});
