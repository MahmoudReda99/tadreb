import type { AgendaResult, Breakdown, DayCell, DistributionResult, Instructions, SubjectKey } from './types';
import { MAIN_KEYS, SUBJECT_AR } from './types';
import { dm } from './dates';

export interface AuditStep { label: string; value: string }
export interface Audit { title: string; rule: string; steps: AuditStep[]; equation: string; result: string; ok: boolean }

const r2 = (x: number) => (Math.round(x * 100) / 100).toString();

export function auditDay(d: DayCell): Audit {
  const total = d.day + d.night;
  return {
    title: `يوم ${dm(d.date)} — الأسبوع ${d.week}`,
    rule: d.rule,
    steps: [
      { label: 'ساعات النهار', value: String(d.day) },
      { label: 'ساعات الليل', value: String(d.night) },
      { label: 'منها لياقة بدنية', value: String(d.fitness) },
      ...(d.education ? [{ label: 'تعليم منضم', value: String(d.education) }] : []),
      ...(d.security ? [{ label: 'أمن حربى', value: String(d.security) }] : []),
    ],
    equation: `${d.day} + ${d.night} = ${total}`,
    result: `${total} ساعة`, ok: true,
  };
}

export function auditSum(title: string, rule: string, parts: { label: string; value: number }[]): Audit {
  const t = parts.reduce((a, b) => a + b.value, 0);
  const shown = parts.filter(p => p.value !== 0); // empty days / weeks only add noise
  const list = shown.length ? shown : parts.slice(0, 1);
  return {
    title, rule, steps: list.map(p => ({ label: p.label, value: String(p.value) })),
    equation: `${list.map(p => p.value).join(' + ')} = ${t}`, result: String(t), ok: true,
  };
}

export function auditSubject(inst: Instructions, agenda: AgendaResult, dist: DistributionResult, k: SubjectKey, part: 'day' | 'night' | 'total'): Audit {
  const c = dist.cells[k]; const T = agenda.total; const p = inst.pcts;
  const total = c.day + c.night;
  const name = SUBJECT_AR[k];
  const steps: AuditStep[] = [];
  let rule = ''; let equation = '';
  const pctKey = k as keyof typeof p;
  if (part === 'total' || part === 'day' && !['tactics', 'tech', 'shooting', 'topography', 'recon', 'engineering', 'chemical'].includes(k)) {
    if (k === 'fitness' || k === 'education' || k === 'security') {
      rule = 'تؤخذ مباشرة من الأجندة (مجموع الأيام)';
      steps.push({ label: `${name} من الأجندة`, value: String(total) });
      equation = `${total}`;
    } else if (k === 'shooting') {
      rule = 'الرماية هى الباقى من الموضوعات الرئيسية بعد طرح (تكتيك + فنى تخصصى + لياقة)';
      steps.push({ label: 'إجمالى الرئيسية', value: String(dist.mainTotal) });
      steps.push({ label: 'تكتيك + فنى + لياقة', value: String(dist.cells.tactics.day + dist.cells.tactics.night + dist.cells.tech.day + dist.cells.tech.night + dist.cells.fitness.day) });
      equation = `${dist.mainTotal} − ${dist.mainTotal - total} = ${total}`;
    } else if (k === 'infoWar') {
      rule = 'حرب المعلومات هى الباقى من الموضوعات العامة بعد طرح باقى موضوعاتها';
      steps.push({ label: 'إجمالى العامة', value: String(dist.generalTotal) });
      equation = `${dist.generalTotal} − ${dist.generalTotal - total} = ${total}`;
    } else {
      const raw = (T * (p[pctKey] as number)) / 100;
      rule = 'الساعات = الإجمالى × النسبة ثم أقرب عدد زوجى';
      steps.push({ label: 'الإجمالى', value: String(T) });
      steps.push({ label: 'النسبة', value: `${p[pctKey]}%` });
      steps.push({ label: 'الناتج', value: r2(raw) });
      equation = `${T} × ${p[pctKey]}% = ${r2(raw)} ← ${total}`;
    }
  } else if (part === 'night' || ['tactics', 'tech', 'shooting', 'topography', 'recon', 'engineering', 'chemical'].includes(k)) {
    rule = k === 'tech'
      ? 'ليل الفنى التخصصى هو الباقى من إجمالى الليل بعد طرح ليل باقى الموضوعات الليلية'
      : 'الليل = ساعات الموضوع × نسبة الليل ثم أقرب عدد زوجى';
    steps.push({ label: 'نسبة الليل', value: `${agenda.night} ÷ ${dist.nightSubjectsHours} = ${r2(dist.nightRatio)}` });
    steps.push({ label: 'ساعات الموضوع', value: String(total) });
    steps.push({ label: 'الليل', value: String(c.night) });
    steps.push({ label: 'النهار = الساعات − الليل', value: `${total} − ${c.night} = ${c.day}` });
    equation = k === 'tech' ? `${agenda.night} − ${agenda.night - c.night} = ${c.night}` : `${total} × ${r2(dist.nightRatio)} = ${r2(total * dist.nightRatio)} ← ${c.night}`;
  }
  const shown = part === 'day' ? c.day : part === 'night' ? c.night : total;
  return { title: `${name} — ${part === 'day' ? 'نهارى' : part === 'night' ? 'ليلى' : 'الإجمالى'}`, rule, steps, equation, result: String(shown), ok: true };
}

export function auditLink(b: Breakdown, grand: { day: number; night: number }, rows: Record<SubjectKey, { day: number; night: number }>, col: number, k: SubjectKey, half: 'day' | 'night'): Audit {
  const colT = b.cols[col][half];
  const rowT = rows[k][half];
  const g = grand[half];
  const v = b.cells[col][k][half];
  const agendaDriven = k === 'fitness' || k === 'education' || k === 'security';
  const rule = agendaDriven
    ? 'يؤخذ من الأجندة لهذا العمود'
    : k === 'shooting' || k === 'infoWar'
      ? 'هذا الموضوع يأخذ الباقى: إجمالى العمود ناقص باقى موضوعات نفس المجموعة (ليتطابق المجموع)'
      : 'نصيب الموضوع من هذا العمود = إجمالى الموضوع × (ساعات العمود ÷ الإجمالى العام)، ثم يُقرَّب لأقرب عدد زوجى مع ضبط المجموع';
  return {
    title: `${SUBJECT_AR[k]} — ${b.cols[col].label} — ${half === 'day' ? 'نهارى' : 'ليلى'}`,
    rule,
    steps: [
      { label: 'إجمالى الموضوع', value: String(rowT) },
      { label: 'إجمالى العمود', value: String(colT) },
      { label: 'الإجمالى العام', value: String(g) },
      { label: 'الناتج النظرى', value: g ? r2((rowT * colT) / g) : '0' },
    ],
    equation: agendaDriven ? `${v}` : `${rowT} × ${colT} ÷ ${g} = ${g ? r2((rowT * colT) / g) : 0} ← ${v}`,
    result: String(v), ok: b.rowsOk && b.colsOk,
  };
}

export const isMain = (k: SubjectKey) => MAIN_KEYS.includes(k);
