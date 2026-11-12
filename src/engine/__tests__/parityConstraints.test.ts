import { describe, expect, it } from 'vitest';
import { allocateMainWithParity } from '../linking';
import { nearestWithParity } from '../rounding';
import { calculateAgenda } from '../agenda';
import { calculateDistribution } from '../distribution';
import { calculateLinking } from '../linking';
import { FIXTURE_108 } from '../fixtures';
import type { ColumnTarget } from '../types';

describe('Independent Odd/Even Constraints (تحديث منطق الفردية والزوجية)', () => {
  it('1. شهر به تربية بدنية فردية: إجمالي الموضوعات الرئيسية يجب أن يكون فردياً', () => {
    // Single month with fitness = 17 (odd)
    const cols: ColumnTarget[] = [
      { label: 'شهر فردي اللياقة', day: 89, night: 24, fitness: 17, education: 2, security: 4 },
    ];
    const total = 89 + 24; // 113
    const mainTarget = nearestWithParity((total * 72) / 100, 1); // 72% of 113 = 81.36 -> 81 (odd)
    expect(mainTarget % 2).toBe(1);

    const res = allocateMainWithParity(mainTarget, cols, 72);
    const mainTotal = res.mainDays[0] + res.mainNights[0];

    // Main total must be odd matching fitness (17)
    expect(mainTotal % 2).toBe(1);
    expect(mainTotal).toBe(81);
    expect(res.parityOk).toBe(true);
  });

  it('2. شهر به تربية بدنية زوجية: إجمالي الموضوعات الرئيسية يجب أن يكون زوجياً', () => {
    // Single month with fitness = 22 (even)
    const cols: ColumnTarget[] = [
      { label: 'شهر زوجي اللياقة', day: 120, night: 32, fitness: 22, education: 4, security: 4 },
    ];
    const total = 120 + 32; // 152
    const mainTarget = nearestWithParity((total * 72) / 100, 0); // 72% of 152 = 109.44 -> 110 (even)
    expect(mainTarget % 2).toBe(0);

    const res = allocateMainWithParity(mainTarget, cols, 72);
    const mainTotal = res.mainDays[0] + res.mainNights[0];

    // Main total must be even matching fitness (22)
    expect(mainTotal % 2).toBe(0);
    expect(mainTotal).toBe(110);
    expect(res.parityOk).toBe(true);
  });

  it('3. شهر به قيود الموضوعات العامة مجموعها فردي: إجمالي الموضوعات العامة يجب أن يكون فردياً', () => {
    // Education = 3, Security = 4 -> Sum = 7 (odd)
    // Fitness = 16 (even). Total = 113 (odd).
    const cols: ColumnTarget[] = [
      { label: 'شهر عامة فردية', day: 89, night: 24, fitness: 16, education: 3, security: 4 },
    ];
    const total = 89 + 24; // 113
    const mainTarget = nearestWithParity((total * 72) / 100, 0); // 81.36 -> 82 (even, matching fitness 16)
    const res = allocateMainWithParity(mainTarget, cols, 72);

    const mainTotal = res.mainDays[0] + res.mainNights[0];
    const generalTotal = total - mainTotal;

    // Main must be even matching fitness (16)
    expect(mainTotal % 2).toBe(0);
    // General must be odd matching (education + security = 7)
    expect(generalTotal % 2).toBe(1);
    expect(generalTotal).toBe(31);
    expect(res.parityOk).toBe(true);
  });

  it('4. شهر به قيود الموضوعات العامة مجموعها زوجي: إجمالي الموضوعات العامة يجب أن يكون زوجياً', () => {
    // Education = 2, Security = 4 -> Sum = 6 (even)
    // Fitness = 17 (odd). Total = 113 (odd).
    const cols: ColumnTarget[] = [
      { label: 'شهر عامة زوجية', day: 89, night: 24, fitness: 17, education: 2, security: 4 },
    ];
    const total = 89 + 24; // 113
    const mainTarget = nearestWithParity((total * 72) / 100, 1); // 81.36 -> 81 (odd, matching fitness 17)
    const res = allocateMainWithParity(mainTarget, cols, 72);

    const mainTotal = res.mainDays[0] + res.mainNights[0];
    const generalTotal = total - mainTotal;

    // Main must be odd matching fitness (17)
    expect(mainTotal % 2).toBe(1);
    // General must be even matching (education + security = 6)
    expect(generalTotal % 2).toBe(0);
    expect(generalTotal).toBe(32);
    expect(res.parityOk).toBe(true);
  });

  it('5. عدة شهور تختلف فيها قيود الفردية والزوجية: كل شهر يلتزم بقيوده والإجمالي النهائي متطابق', () => {
    const agenda = calculateAgenda(FIXTURE_108);
    const dist = calculateDistribution(FIXTURE_108, agenda);
    const link = calculateLinking(FIXTURE_108, agenda, dist);

    // 1. Verify Grand Totals parity
    expect(dist.mainTotal % 2).toBe(agenda.fitness % 2); // 558 % 2 === 120 % 2 === 0
    expect(dist.generalTotal % 2).toBe((agenda.education + agenda.security) % 2); // 217 % 2 === 35 % 2 === 1

    // 2. Verify Every Month's independent parity
    agenda.months.forEach((m, i) => {
      const monthMain = link.months.main[i].day + link.months.main[i].night;
      const monthGeneral = link.months.general[i].day + link.months.general[i].night;

      // Month main parity === Month fitness parity
      expect(monthMain % 2).toBe(m.fitness % 2);

      // Month general parity === Month (education + security) parity
      expect(monthGeneral % 2).toBe((m.education + m.security) % 2);

      // Month main + general === Month total
      expect(monthMain + monthGeneral).toBe(m.total);
    });

    // 3. Verify Sum of Months equals Grand Total
    const sumMonthlyMain = link.months.main.reduce((acc, c) => acc + c.day + c.night, 0);
    const sumMonthlyGeneral = link.months.general.reduce((acc, c) => acc + c.day + c.night, 0);
    expect(sumMonthlyMain).toBe(dist.mainTotal);
    expect(sumMonthlyGeneral).toBe(dist.generalTotal);

    // 4. Verify checks are completely green
    expect(link.checks.ok).toBe(true);
    expect(link.checks.parity).toBe(true);
  });

  it('6. حالة يكون فيها مجموع التقريبات الشهرية غير متوافق مع شرط الإجمالي النهائي: يتم التصحيح بوحدات 2 للحفاظ على الفردية والزوجية', () => {
    // 3 months where each rounded value produces a discrepancy with the grand total
    const cols: ColumnTarget[] = [
      { label: 'شهر 1', day: 100, night: 0, fitness: 10, education: 2, security: 2 }, // 72 -> 72 (even)
      { label: 'شهر 2', day: 100, night: 0, fitness: 10, education: 2, security: 2 }, // 72 -> 72 (even)
      { label: 'شهر 3', day: 100, night: 0, fitness: 10, education: 2, security: 2 }, // 72 -> 72 (even)
    ];
    // Sum of independent roundings = 72 + 72 + 72 = 216.
    // Suppose grandMainTotal is 214 (diff = -2, an even adjustment required to maintain parity).
    const grandMain = 214;
    const res = allocateMainWithParity(grandMain, cols, 72);

    const monthlyTotals = res.mainDays.map((d, i) => d + res.mainNights[i]);

    // Sum must equal grandMain (214)
    expect(monthlyTotals.reduce((a, b) => a + b, 0)).toBe(214);

    // Every month must remain even (matching fitness = 10)
    monthlyTotals.forEach(m => {
      expect(m % 2).toBe(0);
    });

    expect(res.parityOk).toBe(true);
  });

  it('7. حالة يتعذر فيها تحقيق جميع القيود رياضيًا: إظهار رسالة تعارض واضحة دون تطبيق تعديل خاطئ', () => {
    // Contradictory constraints:
    // Total = 100 (even). Fitness = 1 (odd). Education + Security = 2 (even).
    // Sum of constraints = 1 + 2 = 3 (odd), but total hours = 100 (even).
    // Mathematically: Main (odd) + General (even) = Odd != 100 (even)!
    const impossibleCols: ColumnTarget[] = [
      { label: 'شهر متعارض', day: 100, night: 0, fitness: 1, education: 2, security: 0 },
    ];

    const res = allocateMainWithParity(72, impossibleCols, 72);

    // Conflict must be flagged
    expect(res.parityOk).toBe(false);
    expect(res.conflictMessage).toBeDefined();
    expect(res.conflictMessage).toContain('تعارض');
  });
});
