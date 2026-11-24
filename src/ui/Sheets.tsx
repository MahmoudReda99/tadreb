import { Fragment, useMemo, useState } from 'react';
import type { AgendaResult, DistributionResult, Instructions, LinkingResult, SubjectKey, WeeklyExtract } from '../engine/types';
import { getAllKeys, getMainKeys, getGeneralKeys, getSubjectName, getSubjectShortName } from '../engine/types';
import { DAYS_AR, addDays, dm, monthNames, parseDate } from '../engine/dates';
import { auditDay, auditLink, auditSubject, auditSum, type Audit } from '../engine/audit';
import { ar, h, KIND_COLORS, LEVEL_BG, LEVEL_SWATCH } from './format';
import { sum } from '../engine/rounding';
import { buildWeekProgram } from '../export/programDocx';
import { computeCourseLessons } from '../engine/lessonScheduler';
import { LessonPickerModal } from './LessonPickerModal';

export type Inspect = (a: Audit) => void;
const noop: Inspect = () => {};
const Num = ({ v, on, text }: { v: number; on?: () => void; text?: string }) => (
  <span className={on ? 'tap' : undefined} onClick={on} role={on ? 'button' : undefined} tabIndex={on ? 0 : undefined}
    onKeyDown={on ? e => { if (e.key === 'Enter' || e.key === ' ') on(); } : undefined}>{text ?? h(v)}</span>
);
/** day / night hours — the night figure is always red, as on the form */
const Pair = ({ d, n, onD, onN }: { d: number; n: number; onD?: () => void; onN?: () => void }) => (
  <span className="dn"><Num v={d} on={onD} /><i className="sep">/</i><span className="r"><Num v={n} on={onN} /></span></span>
);
const Title = ({ children, grade }: { children: React.ReactNode; grade?: string }) => (
  <div className="sheet-head">{grade ? <span className="grade">({grade})</span> : null}<div className="sheet-title">{children}</div></div>
);
const YEARS = (i: Instructions) => {
  if (i.yearLabel) return ar(i.yearLabel);
  const d = parseDate(addDays(i.startSaturday, 3));
  const y = d.getUTCFullYear();
  // a Jul-Dec start belongs to the next training year; a Jan-Jun period (second period) to the one that began the year before
  const from = d.getUTCMonth() >= 6 ? y + 1 : y - 1;
  return `${ar(from)} / ${ar(from + 1)}`;
};
const PERIOD_AR = (i: Instructions) => {
  const p = i.period ?? (i.firstWeek >= 53 ? 3 : i.firstWeek >= 27 ? 2 : 1);
  return p === 3 ? 'الثالثة' : p === 2 ? 'الثانية' : 'الأولى';
};
const dayLabel = (d: string, first: boolean) => (first || d.endsWith('-01') ? dm(d) : String(+d.slice(8)));

/* ───────────────────────────── page 1 ───────────────────────────── */
export function AgendaSheet({ inst, agenda, onInspect = noop }: { inst: Instructions; agenda: AgendaResult; onInspect?: Inspect }) {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const W = agenda.weeks;
  const monthEndWeeks = new Set<number>();
  let accW = 0;
  for (const n of inst.weeksPerMonth) {
    accW += n;
    if (accW > 0 && accW - 1 < W.length) monthEndWeeks.add(W[accW - 1].week);
  }
  const mEnd = (week: number) => (monthEndWeeks.has(week) ? 'm-end' : '');
  const order = [6, 0, 1, 2, 3, 4, 5]; // Sat..Fri
  const rowTot = (i: number) => {
    const ds = W.map(w => w.days[i]);
    return { d: sum(ds.map(x => x.day)), n: sum(ds.map(x => x.night)) };
  };
  const hdrKind = (w: number) => inst.prepWeeks.includes(w) ? 'prep' : inst.reserveWeeks.includes(w) ? 'reserve' : inst.opsWeeks.includes(w) ? 'ops' : null;
  const bottom: { label: string; key: 'fitness' | 'education' | 'security'; f: (w: typeof W[number]) => number; tot: number }[] = [
    { label: 'ساعات اللياقة البدنية', key: 'fitness', f: w => w.fitness, tot: agenda.fitness },
    { label: 'ساعات التعليم المنضم', key: 'education', f: w => w.education, tot: agenda.education },
    { label: 'ساعات الأمن حربى', key: 'security', f: w => w.security, tot: agenda.security },
  ];
  const tap = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));
  const weekSum = (w: typeof W[number], what: 'day' | 'night' | 'total') => () =>
    onInspect(auditSum(`الأسبوع ${w.week} — ${what === 'day' ? 'نهارى' : what === 'night' ? 'ليلى' : 'الإجمالى'}`, 'مجموع ساعات أيام الأسبوع', w.days.map(d => ({ label: dm(d.date), value: what === 'day' ? d.day : what === 'night' ? d.night : d.day + d.night }))));
  return (
    <div className="sheet" dir="rtl">
      <Title>
        <div className="u">أجندة التدريب</div>
        <div className="u">للفترة التدريبية {PERIOD_AR(inst)} من العام التدريبى {YEARS(inst)} م</div>
        {inst.courseName.trim() ? <div className="u">{ar(inst.courseName.trim())}</div> : null}
      </Title>
      <table className="grid agenda">
        <thead>
          <tr>
            <th className="corner" rowSpan={2}><span className="c1">الشهر</span><span className="c2">اليوم</span></th>
            {inst.weeksPerMonth.map((n, m) => <th key={m} colSpan={n} className="mh m-end">{names[m]}</th>)}
            <th colSpan={3} className="mh">الإجمالى</th>
          </tr>
          <tr>
            {W.map(w => {
              const k = hdrKind(w.week);
              // prep / reserve / ops weeks keep their own colour; every other week takes the colour of its level (فرد / طاقم / مركز)
              const style = k ? { background: KIND_COLORS[k].bg, color: KIND_COLORS[k].fg } : w.level ? { background: LEVEL_BG[w.level], color: '#111' } : undefined;
              return <th key={w.week} className={mEnd(w.week) || undefined} style={style}>{ar(w.week)}</th>;
            })}
            <th>ن</th><th className="r">ل</th><th>ج</th>
          </tr>
        </thead>
        <tbody>
          {order.map((dow, i) => {
            const t = rowTot(i);
            return (
              <tr key={dow}>
                <th className="rowh">{DAYS_AR[dow]}</th>
                {W.map(w => {
                  const d = w.days[i];
                  const c = KIND_COLORS[d.kind];
                  return (
                    <td key={w.week} className={`daycell tap ${mEnd(w.week)}`.trim()} style={{ background: c.bg, color: c.fg }} onClick={() => onInspect(auditDay(d))}
                      role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onInspect(auditDay(d)); }}>
                      {ar(dayLabel(d.date, w.week === 1 && i < 2))}
                    </td>
                  );
                })}
                {(['d', 'n', 't'] as const).map(c => {
                  const val = c === 'd' ? t.d : c === 'n' ? t.n : t.d + t.n;
                  const lbl = c === 'd' ? 'نهارى' : c === 'n' ? 'ليلى' : 'الإجمالى';
                  return (
                    <td key={c} className={c === 'n' ? 'r' : undefined}>
                      <Num v={val} on={tap(`كل ${DAYS_AR[dow]} فى الفترة — ${lbl}`, `مجموع ساعات يوم ${DAYS_AR[dow]} فى كل أسابيع الفترة`,
                        W.map(w => ({ label: `أسبوع ${ar(w.week)}`, value: c === 'd' ? w.days[i].day : c === 'n' ? w.days[i].night : w.days[i].day + w.days[i].night })))} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tbody className="hours">
          {(['day', 'night', 'total'] as const).map(what => (
            <tr key={what}>
              <th className="rowh">{what === 'day' ? 'نهاراً' : what === 'night' ? 'ليلاً' : 'الإجمالى'}</th>
              {W.map(w => <td key={w.week} className={[what === 'night' ? 'r' : '', mEnd(w.week)].filter(Boolean).join(' ') || undefined}><Num v={what === 'total' ? w.total : w[what]} on={weekSum(w, what)} /></td>)}
              {what === 'day' ? (
                <>
                  <td className="gt">
                    <Num v={agenda.day} on={() => onInspect(auditSum('إجمالى الفترة — نهارى', 'مجموع الأسابيع، ويساوى مجموع الشهور', W.map(w => ({ label: `أسبوع ${w.week}`, value: w.day }))))} />
                  </td>
                  <td>-</td>
                  <td>-</td>
                </>
              ) : what === 'night' ? (
                <>
                  <td>-</td>
                  <td className="gt r">
                    <Num v={agenda.night} on={() => onInspect(auditSum('إجمالى الفترة — ليلى', 'مجموع الأسابيع، ويساوى مجموع الشهور', W.map(w => ({ label: `أسبوع ${w.week}`, value: w.night }))))} />
                  </td>
                  <td>-</td>
                </>
              ) : (
                <>
                  <td>-</td>
                  <td>-</td>
                  <td className="gt">
                    <Num v={agenda.total} on={() => onInspect(auditSum('إجمالى الفترة — الكلى', 'مجموع الأسابيع، ويساوى مجموع الشهور', W.map(w => ({ label: `أسبوع ${w.week}`, value: w.total }))))} />
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tbody className="extra">
          {bottom.map(b => (
            <tr key={b.label}>
              <th className="rowh">{b.label}</th>
              {W.map(w => (
                <td key={w.week} className={mEnd(w.week) || undefined}><Num v={b.f(w)} on={tap(`${b.label} — أسبوع ${ar(w.week)}`, 'مجموع هذه الساعات فى أيام الأسبوع',
                  w.days.map(d => ({ label: `${DAYS_AR[d.dow]} ${dm(d.date)}`, value: d[b.key] })))} /></td>
              ))}
              <td colSpan={3} className="gt"><Num v={b.tot} on={tap(`${b.label} — إجمالى الفترة`, 'مجموع الأسابيع', W.map(w => ({ label: `أسبوع ${ar(w.week)}`, value: b.f(w) })))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="foot">
        <div className="legend">
          {(['prep', 'short', 'long', 'personnel', 'friday', 'maintenance', 'holiday', 'reserve', 'ops', 'march', 'camp', 'ramadan'] as const).map(k => (
            <span key={k} className="lg"><i style={{ background: KIND_COLORS[k].bg }} />{KIND_COLORS[k].label}</span>
          ))}
          {LEVEL_SWATCH.map(l => <span key={l.label} className="lg"><i style={{ background: l.bg }} />{l.label}</span>)}
        </div>
        <div className="totals">
          <div>إجمالى عدد الساعات : ( <b>{ar(agenda.total)}</b> ) ساعة</div>
          <div>نهارى : ( <b>{ar(agenda.day)}</b> ) ساعـة</div>
          <div>ليـــلى : ( <b className="red">{ar(agenda.night)}</b> ) ساعة</div>
          {!agenda.checks.ok && (
            <div className="chk bad">✘ عدم تطابق بين الأسابيع والشهور</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── page 2 ───────────────────────────── */
export function DistributionSheet({ inst, agenda, dist, onInspect = noop }: { inst: Instructions; agenda: AgendaResult; dist: DistributionResult; onInspect?: Inspect }) {
  const p = inst.pcts;
  const mainKeys = getMainKeys(inst);
  const genKeys = getGeneralKeys(inst);
  const pct = (k: SubjectKey) => {
    const custom = inst.customSubjects?.find(s => s.id === k);
    if (custom) return custom.pct;
    return k === 'fitness' ? p.fitness : k === 'education' ? p.education : k === 'security' ? p.security : (p[k as keyof typeof p] ?? 0);
  };
  const cell = (k: SubjectKey, part: 'day' | 'night' | 'total') => {
    const c = dist.cells[k] || { day: 0, night: 0 };
    const v = part === 'day' ? c.day : part === 'night' ? c.night : c.day + c.night;
    return <Num v={v} on={() => onInspect(auditSubject(inst, agenda, dist, k, part))} />;
  };
  const lv = (k: SubjectKey, l: 'individual' | 'crew' | 'centre', half: 'day' | 'night') =>
    k === 'tech' ? <Num v={dist.techLevels[l][half]} on={() => onInspect({
      title: `فنى تخصصى — ${l === 'individual' ? 'فرد' : l === 'crew' ? 'طاقم' : 'مركز'} — ${half === 'day' ? 'نهارى' : 'ليلى'}`,
      rule: l === 'individual' ? 'مستوى الفرد = الباقى بعد الطاقم والمركز' : 'المستوى = ساعات الفنى × ساعات فترة المستوى ÷ إجمالى ساعات الفترة، بأقرب زوجى',
      steps: [
        { label: `ساعات الفنى (${half === 'day' ? 'نهارى' : 'ليلى'})`, value: String(dist.cells.tech[half]) },
        { label: 'ساعات فترة المستوى', value: String(dist.levelPeriods[l][half]) },
        { label: 'إجمالى الفترة', value: String(agenda[half]) },
        { label: 'أسابيع المستوى', value: dist.levelPeriods[l].weeks.map(ar).join('، ') || '—' },
      ],
      equation: l === 'individual' ? `${dist.cells.tech[half]} − ${dist.techLevels.crew[half]} − ${dist.techLevels.centre[half]} = ${dist.techLevels[l][half]}`
        : `${dist.cells.tech[half]} × ${dist.levelPeriods[l][half]} ÷ ${agenda[half]} = ${agenda[half] ? Math.round(dist.cells.tech[half] * dist.levelPeriods[l][half] / agenda[half] * 100) / 100 : 0} ← ${dist.techLevels[l][half]}`,
      result: String(dist.techLevels[l][half]), ok: true,
    })} /> : <span>-</span>;
  const row = (k: SubjectKey, i: number) => (
    <tr key={k}>
      <td>{ar(i + 1)}</td><td className="subj">{getSubjectName(k, inst)}</td><td>{ar(pct(k))} %</td>
      <td>{cell(k, 'total')}</td><td>{cell(k, 'day')}</td><td className="r">{cell(k, 'night')}</td>
      {(['individual', 'crew', 'centre'] as const).map(l => (
        <><td key={l + 'd'}>{lv(k, l, 'day')}</td><td key={l + 'n'} className="r">{lv(k, l, 'night')}</td></>
      ))}
    </tr>
  );
  const dsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));
  const sub = (label: string, c: { day: number; night: number }, pc: number, keys: SubjectKey[]) => {
    const parts = (f: (k: SubjectKey) => number) => keys.map(k => ({ label: getSubjectName(k, inst), value: f(k) }));
    return (
      <tr className="sub"><td colSpan={2}>{label}</td><td>{ar(pc)} %</td>
        <td><Num v={c.day + c.night} on={dsum(`${label} — عدد الساعات`, 'مجموع ساعات موضوعات هذه المجموعة', parts(k => (dist.cells[k]?.day || 0) + (dist.cells[k]?.night || 0)))} /></td>
        <td><Num v={c.day} on={dsum(`${label} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة', parts(k => dist.cells[k]?.day || 0))} /></td>
        <td className="r"><Num v={c.night} on={dsum(`${label} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة', parts(k => dist.cells[k]?.night || 0))} /></td>
        <td colSpan={6} /></tr>
    );
  };
  const gparts = (f: (c: { day: number; night: number }) => number) => [{ label: 'الموضوعات الرئيسية', value: f(dist.mainCell) }, { label: 'الموضوعات العامة', value: f(dist.generalCell) }];
  const mainPctSum = mainKeys.reduce((acc, k) => acc + pct(k), 0);
  const genPctSum = genKeys.reduce((acc, k) => acc + pct(k), 0);
  return (
    <div className="sheet" dir="rtl">
      <Title><div className="u">توزيع الساعات على الموضوعات</div></Title>
      <table className="grid dist">
        <thead>
          <tr><th rowSpan={2}>م</th><th rowSpan={2}>الموضوع</th><th rowSpan={2}>النسبة المئوية</th><th rowSpan={2}>عدد الساعات</th><th rowSpan={2}>نهارى</th><th rowSpan={2} className="r">ليلى</th>
            <th colSpan={2}>فرد</th><th colSpan={2}>طاقم</th><th colSpan={2}>مركز</th></tr>
          <tr>{[0, 1, 2].map(i => <Fragment key={i}><th key={'n' + i}>ن</th><th key={'l' + i} className="r">ل</th></Fragment>)}</tr>
        </thead>
        <tbody>
          <tr className="band"><td colSpan={12}>الموضوعات الرئيسية : {ar(mainPctSum || p.mainPct)} %</td></tr>
          {mainKeys.map(row)}
          {sub('إجمالى الموضوعات الرئيسية', dist.mainCell, mainPctSum || p.mainPct, mainKeys)}
          <tr className="band"><td colSpan={12}>الموضوعات العامة : {ar(genPctSum || (100 - p.mainPct))} %</td></tr>
          {genKeys.map(row)}
          {sub('إجمالى الموضوعات العامة', dist.generalCell, genPctSum || (100 - p.mainPct), genKeys)}
          <tr className="sub grand"><td colSpan={2}>الإجمالى</td><td>١٠٠ %</td>
            <td><Num v={dist.total} on={dsum('الإجمالى — عدد الساعات', 'الرئيسية + العامة، وتساوى إجمالى ساعات الأجندة', gparts(c => c.day + c.night))} /></td>
            <td><Num v={agenda.day} on={dsum('الإجمالى — نهارى', 'الرئيسية + العامة، وتساوى ساعات الأجندة النهارية', gparts(c => c.day))} /></td>
            <td className="r"><Num v={agenda.night} on={dsum('الإجمالى — ليلى', 'الرئيسية + العامة، وتساوى ساعات الأجندة الليلية', gparts(c => c.night))} /></td>
            {(['individual', 'crew', 'centre'] as const).map(l => {
              const lp = dist.levelPeriods[l];
              const name = l === 'individual' ? 'فرد' : l === 'crew' ? 'طاقم' : 'مركز';
              return (
                <Fragment key={l}>
                  <td>
                    <Num
                      v={lp.day}
                      on={() =>
                        onInspect({
                          title: `إجمالى ساعات مستوى ${name} — نهارى`,
                          rule: `مجموع الساعات النهارية لأسابيع مستوى ${name} فى الأجندة`,
                          steps: [
                            { label: `أسابيع المستوى (${ar(lp.weeks.length)} أسبوع)`, value: lp.weeks.map(ar).join('، ') || '—' },
                            { label: 'الساعات النهارية', value: String(lp.day) },
                          ],
                          equation: `مجموع أسابيع مستوى ${name} نهاراً = ${lp.day}`,
                          result: String(lp.day),
                          ok: true,
                        })
                      }
                    />
                  </td>
                  <td className="r">
                    <Num
                      v={lp.night}
                      on={() =>
                        onInspect({
                          title: `إجمالى ساعات مستوى ${name} — ليلى`,
                          rule: `مجموع الساعات الليلية لأسابيع مستوى ${name} فى الأجندة`,
                          steps: [
                            { label: `أسابيع المستوى (${ar(lp.weeks.length)} أسبوع)`, value: lp.weeks.map(ar).join('، ') || '—' },
                            { label: 'الساعات الليلية', value: String(lp.night) },
                          ],
                          equation: `مجموع أسابيع مستوى ${name} ليلاً = ${lp.night}`,
                          result: String(lp.night),
                          ok: true,
                        })
                      }
                    />
                  </td>
                </Fragment>
              );
            })}
          </tr>
        </tbody>
      </table>
      {!dist.checks.ok && (
        <div className="chk bad">✘ مجموع الموضوعات لا يساوى إجمالى الأجندة</div>
      )}
    </div>
  );
}

/* ───────────────────────────── page 3 ───────────────────────────── */
export function LinkingSheet({
  inst,
  agenda,
  dist,
  link,
  showMonthDetail = false,
  onInspect = noop,
}: {
  inst: Instructions;
  agenda: AgendaResult;
  dist: DistributionResult;
  link: LinkingResult;
  showMonthDetail?: boolean;
  onInspect?: Inspect;
}) {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const grand = { day: agenda.day, night: agenda.night };
  const M = link.months;
  const sm = Math.min(inst.selectedMonth, Math.max(0, names.length - 1));
  const monthName = names[sm] || '';
  const wk = link.weeks[sm];
  const withDetail = Boolean(showMonthDetail && wk);
  const mainKeys = getMainKeys(inst);
  const genKeys = getGeneralKeys(inst);
  const allKeys = getAllKeys(inst);
  const pct = (k: SubjectKey) => {
    const custom = inst.customSubjects?.find(s => s.id === k);
    if (custom) return custom.pct;
    return k === 'fitness' ? inst.pcts.fitness : ((inst.pcts as unknown as Record<string, number>)[k] ?? 0);
  };
  const lsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));

  const pair = (col: number, k: SubjectKey) => {
    const c = M.cells[col]?.[k] || { day: 0, night: 0 };
    return (
      <Pair d={c.day} n={c.night}
        onD={() => onInspect(auditLink(M, grand, dist.cells, col, k, 'day'))}
        onN={() => onInspect(auditLink(M, grand, dist.cells, col, k, 'night'))} />
    );
  };

  const body = (k: SubjectKey, i: number) => (
    <tr key={k}>
      <td>{ar(i + 1)}</td><td className="subj">{getSubjectShortName(k, inst)}</td><td>{ar(pct(k))}%</td>
      <td className="pair"><Pair d={dist.cells[k]?.day || 0} n={dist.cells[k]?.night || 0}
        onD={lsum(`${getSubjectName(k, inst)} — إجمالى النهارى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cells[m][k]?.day || 0 })))}
        onN={lsum(`${getSubjectName(k, inst)} — إجمالى الليلى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cells[m][k]?.night || 0 })))} /></td>
      {names.map((_, m) => (
        <Fragment key={m}>
          <td className={withDetail && m === sm ? 'pair mh2-cell' : undefined}>{pair(m, k)}</td>
          {withDetail && m === sm && wk.weekNumbers.map((w, c) => (
            <td key={`w-${w}`} className="pair mh2-cell">
              <Pair
                d={wk.b.cells[c]?.[k]?.day || 0}
                n={wk.b.cells[c]?.[k]?.night || 0}
                onD={() => onInspect(auditLink(wk.b, { day: M.cols[sm].day, night: M.cols[sm].night }, Object.fromEntries(allKeys.map(key => [key, M.cells[sm][key]])) as typeof dist.cells, c, k, 'day'))}
                onN={() => onInspect(auditLink(wk.b, { day: M.cols[sm].day, night: M.cols[sm].night }, Object.fromEntries(allKeys.map(key => [key, M.cells[sm][key]])) as typeof dist.cells, c, k, 'night'))}
              />
            </td>
          ))}
        </Fragment>
      ))}
    </tr>
  );

  const subtotal = (label: string, side: 'main' | 'general', pc: number, c: { day: number; night: number }) => {
    const keys = side === 'main' ? mainKeys : genKeys;
    const cellOf = (col: number, name: string, x: { day: number; night: number }) => (
      <Pair d={x.day} n={x.night}
        onD={lsum(`${label} — ${name} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة فى هذا العمود', keys.map(k => ({ label: getSubjectName(k, inst), value: M.cells[col]?.[k]?.day || 0 })))}
        onN={lsum(`${label} — ${name} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة فى هذا العمود', keys.map(k => ({ label: getSubjectName(k, inst), value: M.cells[col]?.[k]?.night || 0 })))} />
    );
    return (
      <tr className="sub"><td colSpan={2}>{label}</td><td>{ar(pc)}%</td>
        <td className="pair"><Pair d={c.day} n={c.night}
          onD={lsum(`${label} — إجمالى النهارى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M[side][m].day })))}
          onN={lsum(`${label} — إجمالى الليلى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M[side][m].night })))} /></td>
        {names.map((n, m) => (
          <Fragment key={m}>
            <td>{cellOf(m, n, M[side][m])}</td>
            {withDetail && m === sm && wk.weekNumbers.map((w, ci) => {
              const x = wk.b[side][ci];
              return (
                <td key={`ws-${w}`} className="pair">
                  <Pair
                    d={x.day}
                    n={x.night}
                    onD={lsum(`${label} — أسبوع ${w} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة فى هذا الأسبوع', keys.map(k => ({ label: getSubjectName(k, inst), value: wk.b.cells[ci]?.[k]?.day || 0 })))}
                    onN={lsum(`${label} — أسبوع ${w} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة فى هذا الأسبوع', keys.map(k => ({ label: getSubjectName(k, inst), value: wk.b.cells[ci]?.[k]?.night || 0 })))}
                  />
                </td>
              );
            })}
          </Fragment>
        ))}
      </tr>
    );
  };

  const grandCell = (col: number, name: string) => (
    <Pair d={M.cols[col].day} n={M.cols[col].night}
      onD={lsum(`الإجمالى — ${name} — نهارى`, 'الرئيسية + العامة، وتساوى ساعات هذا العمود فى الأجندة', [{ label: 'الموضوعات الرئيسية', value: M.main[col].day }, { label: 'الموضوعات العامة', value: M.general[col].day }])}
      onN={lsum(`الإجمالى — ${name} — ليلى`, 'الرئيسية + العامة، وتساوى ساعات هذا العمود فى الأجندة', [{ label: 'الموضوعات الرئيسية', value: M.main[col].night }, { label: 'الموضوعات العامة', value: M.general[col].night }])} />
  );

  const mainPctSum = mainKeys.reduce((acc, k) => acc + pct(k), 0);
  const genPctSum = genKeys.reduce((acc, k) => acc + pct(k), 0);
  const totalCols = 4 + names.length + (withDetail ? wk.weekNumbers.length : 0);

  return (
    <div className="sheet" dir="rtl">
      <Title>
        <div className="u">جدول ربط الساعات والموضوعات (نهارى / ليلى)</div>
        <div className="u">عن الفترة التدريبية {PERIOD_AR(inst)} من العام التدريبى {YEARS(inst)} م</div>
      </Title>
      <table className="grid link">
        <thead>
          <tr>
            <th rowSpan={withDetail ? 2 : 1}>م</th>
            <th rowSpan={withDetail ? 2 : 1}>الموضوع</th>
            <th rowSpan={withDetail ? 2 : 1}>النسبة المئوية</th>
            <th rowSpan={withDetail ? 2 : 1}>إجمالى الساعات</th>
            {names.map((n, m) =>
              withDetail && m === sm ? (
                <th key={m} colSpan={1 + wk.weekNumbers.length} className="mh2">{monthName}</th>
              ) : (
                <th key={m} rowSpan={withDetail ? 2 : 1}>{n}</th>
              ),
            )}
          </tr>
          {withDetail && (
            <tr>
              <th className="mh2" style={{ fontSize: '9.5px', lineHeight: 1.15 }}>إجمالى ساعات الشهر</th>
              {wk.weekNumbers.map(w => <th key={w} className="mh2">{ar(w)}</th>)}
            </tr>
          )}
        </thead>
        <tbody>
          <tr className="band"><td colSpan={totalCols}>الموضوعات الرئيسية : {ar(mainPctSum || inst.pcts.mainPct)} %</td></tr>
          {mainKeys.map(body)}
          {subtotal('إجمالى الموضوعات الرئيسية', 'main', mainPctSum || inst.pcts.mainPct, dist.mainCell)}
          <tr className="band"><td colSpan={totalCols}>الموضوعات العامة : {ar(genPctSum || (100 - inst.pcts.mainPct))} %</td></tr>
          {genKeys.map(body)}
          {subtotal('إجمالى الموضوعات العامة', 'general', genPctSum || (100 - inst.pcts.mainPct), dist.generalCell)}
          <tr className="sub grand"><td colSpan={2}>الإجمالى</td><td>١٠٠%</td><td><Pair d={agenda.day} n={agenda.night}
            onD={lsum('الإجمالى العام — نهارى', 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cols[m].day })))}
            onN={lsum('الإجمالى العام — ليلى', 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cols[m].night })))} /></td>
            {names.map((n, m) => (
              <Fragment key={m}>
                <td>{grandCell(m, n)}</td>
                {withDetail && m === sm && wk.weekNumbers.map((w, ci) => (
                  <td key={`wg-${w}`} className="pair">
                    <Pair
                      d={wk.b.cols[ci].day}
                      n={wk.b.cols[ci].night}
                      onD={lsum(`الإجمالى — أسبوع ${w} — نهارى`, 'الرئيسية + العامة فى هذا الأسبوع', [{ label: 'الموضوعات الرئيسية', value: wk.b.main[ci].day }, { label: 'الموضوعات العامة', value: wk.b.general[ci].day }])}
                      onN={lsum(`الإجمالى — أسبوع ${w} — ليلى`, 'الرئيسية + العامة فى هذا الأسبوع', [{ label: 'الموضوعات الرئيسية', value: wk.b.main[ci].night }, { label: 'الموضوعات العامة', value: wk.b.general[ci].night }])}
                    />
                  </td>
                ))}
              </Fragment>
            ))}
          </tr>
        </tbody>
      </table>
      {(!link.checks.rows || !link.checks.cols || (link.checks.parity !== undefined && !link.checks.parity)) && (
        <div className="checks">
          {!link.checks.rows && <span className="chk bad">✘ الفحص الأفقى</span>}
          {!link.checks.cols && <span className="chk bad">✘ الفحص الرأسى</span>}
          {link.checks.parity !== undefined && !link.checks.parity && (
            <span className="chk bad">
              ✘ {link.checks.conflictMessage || 'تعارض في قيود الفردية والزوجية'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── page 4: detailed month ───────────────────────────── */
export function MonthDetailSheet({ inst, dist, link, onInspect = noop }: { inst: Instructions; agenda?: AgendaResult; dist: DistributionResult; link: LinkingResult; onInspect?: Inspect }) {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const sm = Math.min(inst.selectedMonth, names.length - 1);
  const monthName = names[sm] || '';
  const wk = link.weeks[sm];
  const M = link.months;
  const mainKeys = getMainKeys(inst);
  const genKeys = getGeneralKeys(inst);
  const allKeys = getAllKeys(inst);
  const pct = (k: SubjectKey) => {
    const custom = inst.customSubjects?.find(s => s.id === k);
    if (custom) return custom.pct;
    return k === 'fitness' ? inst.pcts.fitness : ((inst.pcts as unknown as Record<string, number>)[k] ?? 0);
  };
  const lsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));

  const body = (k: SubjectKey, i: number) => (
    <tr key={k}>
      <td>{ar(i + 1)}</td>
      <td className="subj">{getSubjectShortName(k, inst)}</td>
      <td>{ar(pct(k))}%</td>
      <td className="pair">
        <Pair
          d={M.cells[sm]?.[k]?.day || 0}
          n={M.cells[sm]?.[k]?.night || 0}
          onD={lsum(`${getSubjectName(k, inst)} — شهر ${monthName} — نهارى`, 'مجموع أسابيع هذا الشهر', wk.weekNumbers.map((w, c) => ({ label: `أسبوع ${w}`, value: wk.b.cells[c]?.[k]?.day || 0 })))}
          onN={lsum(`${getSubjectName(k, inst)} — شهر ${monthName} — ليلى`, 'مجموع أسابيع هذا الشهر', wk.weekNumbers.map((w, c) => ({ label: `أسبوع ${w}`, value: wk.b.cells[c]?.[k]?.night || 0 })))}
        />
      </td>
      {wk.weekNumbers.map((w, c) => (
        <td key={w} className="pair">
          <Pair
            d={wk.b.cells[c]?.[k]?.day || 0}
            n={wk.b.cells[c]?.[k]?.night || 0}
            onD={() => onInspect(auditLink(wk.b, { day: M.cols[sm].day, night: M.cols[sm].night }, Object.fromEntries(allKeys.map(key => [key, M.cells[sm][key]])) as typeof dist.cells, c, k, 'day'))}
            onN={() => onInspect(auditLink(wk.b, { day: M.cols[sm].day, night: M.cols[sm].night }, Object.fromEntries(allKeys.map(key => [key, M.cells[sm][key]])) as typeof dist.cells, c, k, 'night'))}
          />
        </td>
      ))}
    </tr>
  );

  const subtotal = (label: string, side: 'main' | 'general', pc: number) => {
    const keys = side === 'main' ? mainKeys : genKeys;
    const monthCell = M[side][sm];
    return (
      <tr className="sub">
        <td colSpan={2}>{label}</td>
        <td>{ar(pc)}%</td>
        <td className="pair">
          <Pair
            d={monthCell.day}
            n={monthCell.night}
            onD={lsum(`${label} — شهر ${monthName} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة فى هذا الشهر', keys.map(k => ({ label: getSubjectName(k, inst), value: M.cells[sm]?.[k]?.day || 0 })))}
            onN={lsum(`${label} — شهر ${monthName} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة فى هذا الشهر', keys.map(k => ({ label: getSubjectName(k, inst), value: M.cells[sm]?.[k]?.night || 0 })))}
          />
        </td>
        {wk.weekNumbers.map((w, c) => {
          const x = wk.b[side][c];
          return (
            <td key={w} className="pair">
              <Pair
                d={x.day}
                n={x.night}
                onD={lsum(`${label} — أسبوع ${w} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة فى هذا الأسبوع', keys.map(k => ({ label: getSubjectName(k, inst), value: wk.b.cells[c]?.[k]?.day || 0 })))}
                onN={lsum(`${label} — أسبوع ${w} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة فى هذا الأسبوع', keys.map(k => ({ label: getSubjectName(k, inst), value: wk.b.cells[c]?.[k]?.night || 0 })))}
              />
            </td>
          );
        })}
      </tr>
    );
  };

  const mainPctSum = mainKeys.reduce((acc, k) => acc + pct(k), 0);
  const genPctSum = genKeys.reduce((acc, k) => acc + pct(k), 0);

  return (
    <div className="sheet" dir="rtl">
      <Title>
        <div className="u">جدول تفصيل الساعات والموضوعات على أسابيع شهر ( {monthName} )</div>
        <div className="u">عن الفترة التدريبية {PERIOD_AR(inst)} من العام التدريبى {YEARS(inst)} م</div>
      </Title>
      <table className="grid link">
        <thead>
          <tr>
            <th rowSpan={2}>م</th>
            <th rowSpan={2}>الموضوع</th>
            <th rowSpan={2}>النسبة المئوية</th>
            <th rowSpan={2}>شهر {monthName}</th>
            <th colSpan={wk.weekNumbers.length}>أسابيع الشهر</th>
          </tr>
          <tr>
            {wk.weekNumbers.map(w => <th key={w}>{ar(w)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="band"><td colSpan={4 + wk.weekNumbers.length}>الموضوعات الرئيسية : {ar(mainPctSum || inst.pcts.mainPct)} %</td></tr>
          {mainKeys.map(body)}
          {subtotal('إجمالى الموضوعات الرئيسية', 'main', mainPctSum || inst.pcts.mainPct)}
          <tr className="band"><td colSpan={4 + wk.weekNumbers.length}>الموضوعات العامة : {ar(genPctSum || (100 - inst.pcts.mainPct))} %</td></tr>
          {genKeys.map(body)}
          {subtotal('إجمالى الموضوعات العامة', 'general', genPctSum || (100 - inst.pcts.mainPct))}
          <tr className="sub grand">
            <td colSpan={2}>الإجمالى</td>
            <td>١٠٠%</td>
            <td className="pair">
              <Pair
                d={M.cols[sm].day}
                n={M.cols[sm].night}
                onD={lsum(`الإجمالى — شهر ${monthName} — نهارى`, 'الرئيسية + العامة لهذا الشهر', [{ label: 'الموضوعات الرئيسية', value: M.main[sm].day }, { label: 'الموضوعات العامة', value: M.general[sm].day }])}
                onN={lsum(`الإجمالى — شهر ${monthName} — ليلى`, 'الرئيسية + العامة لهذا الشهر', [{ label: 'الموضوعات الرئيسية', value: M.main[sm].night }, { label: 'الموضوعات العامة', value: M.general[sm].night }])}
              />
            </td>
            {wk.weekNumbers.map((w, c) => (
              <td key={w} className="pair">
                <Pair
                  d={wk.b.cols[c].day}
                  n={wk.b.cols[c].night}
                  onD={lsum(`الإجمالى — أسبوع ${w} — نهارى`, 'الرئيسية + العامة لهذا الأسبوع', [{ label: 'الموضوعات الرئيسية', value: wk.b.main[c].day }, { label: 'الموضوعات العامة', value: wk.b.general[c].day }])}
                  onN={lsum(`الإجمالى — أسبوع ${w} — ليلى`, 'الرئيسية + العامة لهذا الأسبوع', [{ label: 'الموضوعات الرئيسية', value: wk.b.main[c].night }, { label: 'الموضوعات العامة', value: wk.b.general[c].night }])}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {(!wk.b.rowsOk || !wk.b.colsOk || (wk.b.parityOk !== undefined && !wk.b.parityOk)) && (
        <div className="checks">
          {!wk.b.rowsOk && <span className="chk bad">✘ الفحص الأفقى</span>}
          {!wk.b.colsOk && <span className="chk bad">✘ الفحص الرأسى</span>}
          {wk.b.parityOk !== undefined && !wk.b.parityOk && (
            <span className="chk bad">
              ✘ {wk.b.conflictMessage || 'تعارض في قيود الفردية والزوجية'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── page 5 ───────────────────────────── */
export function WeeklySheet({ inst, ex, onInspect = noop }: { inst: Instructions; ex: WeeklyExtract | null; onInspect?: Inspect }) {
  if (!ex) return <div className="sheet" dir="rtl"><p>لا توجد بيانات لهذا الأسبوع</p></div>;
  const dn = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const rows = ex.rows.filter(r => r.day + r.night > 0);
  const cellHrs = (r: typeof rows[number], i: number) =>
    [...r.slots[i]].sort((a, b) => parseInt(a.lectures, 10) - parseInt(b.lectures, 10));
  const isNight = (s: { lectures: string; isNight?: boolean } | string, di?: number) => {
    if (typeof s === 'object' && s.isNight !== undefined) return s.isNight;
    const lec = typeof s === 'string' ? s : s.lectures;
    const first = parseInt(lec, 10);
    const dayThreshold = (di !== undefined && ex.days[di]) ? ex.days[di].day : 7;
    return first > dayThreshold;
  };
  const hrs = (r: typeof rows[number], i: number, night: boolean) => sum(r.slots[i].filter(x => isNight(x, i) === night).map(x => x.hours));
  const wsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));
  const hasNightDays = ex.days.some(d => d.night > 0);

  return (
    <div className="sheet framed" dir="rtl">
      <div className="mod">
        <span>وزارة الدفـــاع</span>
        <div style={{ display: 'inline-grid', gridTemplateColumns: 'max-content max-content max-content', alignItems: 'baseline', justifyItems: 'center', rowGap: '4px', textDecoration: 'none' }}>
          <span style={{ textAlign: 'right' }}>قائد&nbsp;</span>
          <span style={{ textAlign: 'center' }}>الكتيبة</span>
          <span style={{ textAlign: 'left' }}>&nbsp;........................</span>
          <span />
          <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>صودق ،،،</span>
          <span />
        </div>
      </div>
      <div className="sheet-title c">
        <div className="u">مستخرج الموضوعات والساعات عن الاسبوع رقم ( {ar(ex.week)} )</div>
        <div className="u">من الفترة التدريبية {PERIOD_AR(inst)} للعام التدريبى {YEARS(inst)}</div>
        <div className="u">خلال المدة من {ar(ex.from.split('-').reverse().join('/'))} إلى {ar(ex.to.split('-').reverse().join('/'))}</div>
      </div>
      <table className="grid weekly">
        <thead>
          <tr>
            <th rowSpan={hasNightDays ? 2 : 1}>م</th>
            <th rowSpan={hasNightDays ? 2 : 1}>الموضوعات</th>
            <th rowSpan={hasNightDays ? 2 : 1}>ساعات الأسبوع</th>
            {dn.map((d, di) => ex.days[di]?.night > 0 ? (
              <th key={d} colSpan={2}>{d}</th>
            ) : (
              <th key={d} rowSpan={hasNightDays ? 2 : 1}>{d}</th>
            ))}
            <th rowSpan={hasNightDays ? 2 : 1}>ملاحظات</th>
          </tr>
          {hasNightDays ? (
            <tr>
              {ex.days.map((d, di) => d.night > 0 ? (
                <Fragment key={di}>
                  <th>نهارى</th>
                  <th className="r">ليلى</th>
                </Fragment>
              ) : null)}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td>{ar(i + 1)}</td><td className="subj">{getSubjectShortName(r.key, inst)}</td>
              <td className="pair"><Pair d={r.day} n={r.night}
                onD={wsum(`${getSubjectName(r.key, inst)} — ساعات الأسبوع النهارية`, 'مجموع محاضرات هذا الموضوع النهارية فى أيام الأسبوع', dn.map((d, di) => ({ label: d, value: hrs(r, di, false) })))}
                onN={wsum(`${getSubjectName(r.key, inst)} — ساعات الأسبوع الليلية`, 'مجموع محاضرات هذا الموضوع الليلية فى أيام الأسبوع', dn.map((d, di) => ({ label: d, value: hrs(r, di, true) })))} /></td>
              {ex.days.map((d, di) => {
                if (d.night > 0) {
                  const daySlots = cellHrs(r, di).filter(s => !isNight(s, di));
                  const nightSlots = cellHrs(r, di).filter(s => isNight(s, di));
                  return (
                    <Fragment key={di}>
                      <td className={daySlots.length ? 'slot' : ''}>
                        {daySlots.length ? daySlots.map((s, j) => (
                          <div key={j} className="tap" onClick={() => onInspect({
                            title: `${getSubjectName(r.key, inst)} — ${dn[di]} (نهارى)`,
                            rule: 'ترتيب محاضرات اليوم النهارية.',
                            steps: [{ label: 'الساعات', value: String(s.hours) }, { label: 'المحاضرات', value: s.lectures }, { label: 'ساعات الموضوع بالأسبوع', value: `${r.day} نهارى + ${r.night} ليلى` }],
                            equation: `${s.hours} / ${s.lectures}`, result: String(s.hours), ok: ex.checks.ok,
                          })}>{ar(s.text)}</div>
                        )) : <span>- / -</span>}
                      </td>
                      <td className={nightSlots.length ? 'slot' : ''}>
                        {nightSlots.length ? nightSlots.map((s, j) => (
                          <div key={j} className="tap r" onClick={() => onInspect({
                            title: `${getSubjectName(r.key, inst)} — ${dn[di]} (ليلى)`,
                            rule: 'ترتيب محاضرات اليوم الليلية.',
                            steps: [{ label: 'الساعات', value: String(s.hours) }, { label: 'المحاضرات', value: s.lectures }, { label: 'ساعات الموضوع بالأسبوع', value: `${r.day} نهارى + ${r.night} ليلى` }],
                            equation: `${s.hours} / ${s.lectures}`, result: String(s.hours), ok: ex.checks.ok,
                          })}>{ar(s.text)}</div>
                        )) : <span>- / -</span>}
                      </td>
                    </Fragment>
                  );
                }
                return (
                  <td key={di} className={cellHrs(r, di).length ? 'slot' : ''}>
                    {cellHrs(r, di).length ? cellHrs(r, di).map((s, j) => (
                      <div key={j} className={'tap' + (isNight(s, di) ? ' r' : '')} onClick={() => onInspect({
                        title: `${getSubjectName(r.key, inst)} — ${dn[di]}`, rule: 'ترتيب محاضرات اليوم: المحاضرة 1 للياقة (والتعليم المنضم يوم الخميس)، وباقى النهار أزواج (2-3 ثم 4-5 ثم 6-7)، والليل (8-9 ثم 10-11).',
                        steps: [{ label: 'الساعات', value: String(s.hours) }, { label: 'المحاضرات', value: s.lectures }, { label: 'ساعات الموضوع بالأسبوع', value: `${r.day} نهارى + ${r.night} ليلى` }],
                        equation: `${s.hours} / ${s.lectures}`, result: String(s.hours), ok: ex.checks.ok,
                      })}>{ar(s.text)}</div>
                    )) : <span>- / -</span>}
                  </td>
                );
              })}
              <td />
            </tr>
          ))}
          <tr className="sub grand">
            <td colSpan={2}>الإجمالــــــــى</td>
            <td className="pair"><Pair d={ex.totals.day} n={ex.totals.night}
              onD={wsum('إجمالى الأسبوع — نهارى', 'مجموع ساعات كل أيام الأسبوع النهارية', ex.days.map((d, i) => ({ label: dn[i], value: d.day })))}
              onN={wsum('إجمالى الأسبوع — ليلى', 'مجموع ساعات كل أيام الأسبوع الليلية', ex.days.map((d, i) => ({ label: dn[i], value: d.night })))} /></td>
            {ex.days.map((d, i) => (
              <td key={i} colSpan={d.night > 0 ? 2 : undefined} className="pair">
                <Pair d={d.day} n={d.night}
                  onD={wsum(`${dn[i]} — ساعات اليوم النهارية`, 'مجموع ساعات مواضيع هذا اليوم', rows.map(r => ({ label: getSubjectShortName(r.key, inst), value: hrs(r, i, false) })))}
                  onN={wsum(`${dn[i]} — ساعات اليوم الليلية`, 'مجموع ساعات مواضيع هذا اليوم', rows.map(r => ({ label: getSubjectShortName(r.key, inst), value: hrs(r, i, true) })))} />
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
      <div className="notes">
        <div className="notes-content">
          <b>ملاحظــات:</b>
          <div>١- يرفق مع هذا كشف للموضوعات والدروس التى ستدرس فى الكتيبة عن هذا الأسبوع .</div>
          <div>٢- يسلم لقائد السرية يوم الأحد صباحا و يعاد الأحد بعد الظهر .</div>
          <div>٣- يتصدق عليه من قائد الكتيبة و يعاد لقائد السرية يوم الإثنين لإعداد البرنامج .</div>
        </div>
        <div className="notes-sig">
          <span className="sig-label">التوقيع</span>
          <span className="sig-paren">(<span>&nbsp;</span>)</span>
          <span className="sig-label">قائد السرية</span>
          <span className="sig-dots">...................................</span>
        </div>
      </div>
      {!ex.checks.ok && (
        <div className="chk bad">✘ عدم تطابق فى توزيع المحاضرات</div>
      )}
    </div>
  );
}

/* ───────────────────────────── page 6 ───────────────────────────── */
export function TrainingProgramSheet({
  inst,
  ex,
  agenda,
  link,
  onUpdateInst,
  isExport = false,
}: {
  inst: Instructions;
  ex: WeeklyExtract | null;
  agenda?: AgendaResult;
  link?: LinkingResult;
  onInspect?: Inspect;
  onUpdateInst?: (next: Instructions) => void;
  isExport?: boolean;
}) {
  const [pickerTarget, setPickerTarget] = useState<{ dayIdx: number; dayName: string; overrideKey: string } | null>(null);

  const schedule = useMemo(
    () => (ex && agenda && link ? computeCourseLessons(inst, agenda, link, ex.week) : null),
    [inst, agenda, link, ex],
  );

  if (!ex) return <div className="sheet" dir="rtl"><p>لا توجد بيانات لهذا الأسبوع</p></div>;

  const days = buildWeekProgram(inst, ex, schedule);
  const fromFormatted = ex.from.split('-').reverse().join('/');
  const toFormatted = ex.to.split('-').reverse().join('/');
  const interactive = !isExport && !!onUpdateInst;

  const activeSlot = pickerTarget
    ? days[pickerTarget.dayIdx]?.slots.find(s => s.overrideKey === pickerTarget.overrideKey) ?? null
    : null;

  const handleSelectLesson = (lessonId: string) => {
    if (!onUpdateInst || !pickerTarget) return;
    const nextOverrides = { ...(inst.lessonOverrides || {}), [pickerTarget.overrideKey]: { lessonId } };
    onUpdateInst({ ...inst, lessonOverrides: nextOverrides });
    setPickerTarget(null);
  };

  const handleResetOverride = (overrideKey: string) => {
    if (!onUpdateInst || !inst.lessonOverrides) return;
    const nextOverrides = { ...inst.lessonOverrides };
    delete nextOverrides[overrideKey];
    onUpdateInst({ ...inst, lessonOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined });
  };

  return (
    <div className="sheet framed program-sheet" dir="rtl">
      <div className="mod">
        <div>
          <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '8px' }}>وزارة الدفـــاع</div>
          <div>الكتيبة / .........................</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, textDecoration: 'underline' }}>سرى جداً</div>
          <div style={{ fontWeight: 700 }}>- ١٥٥ -</div>
        </div>
        <div style={{ textAlign: 'left', fontSize: '11px', fontWeight: 600 }}>
          نموذج رقم ٥٤٦ ((هـ . تد ))
        </div>
      </div>

      <div className="sheet-title c" style={{ margin: '8px 0 16px' }}>
        <div className="u" style={{ fontSize: '16px', fontWeight: 900 }}>برنامج تدريب السرية</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '380px', margin: '6px auto 4px', fontWeight: 700, fontSize: '13px' }}>
          <div>صودق</div>
          <div style={{ direction: 'rtl' }}>قائد الكتيبة : ------------------------</div>
        </div>
        <div style={{ marginTop: '6px', fontWeight: 700, fontSize: '13px' }}>
          عن الأسبوع رقم ( {ar(ex.week)} )
          {inst.prepWeeks.includes(ex.week) && ' — أسبوع الفترة التحضيرية'}
          {inst.opsWeeks.includes(ex.week) && ' — أسبوع تدريب مهام العمليات'}
          {inst.reserveWeeks.includes(ex.week) && ' — أسبوع احتياط'}
          {' من : '}{ar(fromFormatted)}{' إلي : '}{ar(toFormatted)}
        </div>
      </div>

      <table className="grid program">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: '70px' }}>التاريخ</th>
            <th rowSpan={2} style={{ width: '90px' }}>التوقيت</th>
            <th rowSpan={2} style={{ width: '65px' }}>الطابور</th>
            <th colSpan={4} style={{ width: '100px' }}>الفصائل</th>
            <th rowSpan={2}>الموضوعات والدروس ومشتملاتها</th>
            <th rowSpan={2} style={{ width: '105px' }}>المكان</th>
            <th rowSpan={2} style={{ width: '115px' }}>مساعدات التدريب</th>
            <th rowSpan={2} style={{ width: '115px' }}>المعلم المشرف</th>
          </tr>
          <tr>
            <th style={{ width: '25px' }}>١</th>
            <th style={{ width: '25px' }}>٢</th>
            <th style={{ width: '25px' }}>٣</th>
            <th style={{ width: '25px' }}>٤</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, di) => {
            if (d.isRest) {
              const isMaint = d.restLabel === 'يوم صيانة';
              return (
                <tr key={di} className={`rest-row day-last-row ${isMaint ? 'merged-day-row' : ''}`.trim()}>
                  <td className="day-name">
                    <div>{d.dayName}</div>
                    {d.dateStr && <small style={{ display: 'block', fontSize: '10px', color: '#555', marginTop: '2px' }}>{ar(d.dateStr)}</small>}
                  </td>
                  <td colSpan={10} className={isMaint ? 'merged-day-cell' : 'rest-cell'}>{d.restLabel || 'راحـــــــــــــــــــــــــة'}</td>
                </tr>
              );
            }
            return d.slots.map((s, si) => {
              const isLastSlot = si === d.slots.length - 1;
              const lastClass = isLastSlot ? 'day-last-row' : '';

              if (s.isMerged) {
                return (
                  <tr key={`${di}-${si}`} className={`rest-row merged-day-row ${lastClass}`.trim()}>
                    {si === 0 ? (
                      <td rowSpan={d.slots.length} className="day-name">
                        <div>{d.dayName}</div>
                        <small style={{ display: 'block', fontSize: '10px', color: '#555', marginTop: '2px' }}>{ar(d.dateStr)}</small>
                      </td>
                    ) : null}
                    <td colSpan={10} className="rest-cell merged-day-cell">{s.mergedLabel || s.subject}</td>
                  </tr>
                );
              }
              const rowClass = [s.isNight ? 'night-row' : '', lastClass].filter(Boolean).join(' ');
              const hasLesson = !!(s.hasCurriculum && s.lessonText);
              const canPick = interactive && s.hasCurriculum && !!s.overrideKey;
              return (
                <tr key={`${di}-${si}`} className={rowClass || undefined}>
                  {si === 0 ? (
                    <td rowSpan={d.slots.length} className="day-name">
                      <div>{d.dayName}</div>
                      <small style={{ display: 'block', fontSize: '10px', color: '#555', marginTop: '2px' }}>{ar(d.dateStr)}</small>
                    </td>
                  ) : null}
                  <td className={s.isNight ? 'r timing' : 'timing'}>{ar(s.timing)}</td>
                  <td className={s.isNight ? 'r tabour' : 'tabour'}>{ar(s.tabour)}</td>
                  <td className={s.isNight ? 'r' : ''}>✔</td>
                  <td className={s.isNight ? 'r' : ''}>✔</td>
                  <td className={s.isNight ? 'r' : ''}>✔</td>
                  <td className={s.isNight ? 'r' : ''}>✔</td>
                  <td className={s.isNight ? 'r subj-cell' : 'subj-cell'}>
                    {hasLesson ? (
                      <div className="subj-with-lesson">
                        <span className="subj-topic">{s.subject}</span>
                        <span className="subj-hbar" aria-hidden="true" />
                        <span
                          className={`subj-lesson ${canPick ? 'is-clickable' : ''}`}
                          onClick={canPick ? () => setPickerTarget({ dayIdx: di, dayName: d.dayName, overrideKey: s.overrideKey! }) : undefined}
                          role={canPick ? 'button' : undefined}
                          tabIndex={canPick ? 0 : undefined}
                          onKeyDown={canPick ? e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setPickerTarget({ dayIdx: di, dayName: d.dayName, overrideKey: s.overrideKey! });
                            }
                          } : undefined}
                          title={canPick ? 'اضغط لعرض واختيار درس من المنهج' : undefined}
                        >
                          {ar(s.lessonText!)}
                        </span>
                      </div>
                    ) : (
                      s.subject
                    )}
                  </td>
                  <td className={s.isNight ? 'r' : ''}>{s.location}</td>
                  <td className={s.isNight ? 'r' : ''}>{s.aids}</td>
                  <td className={s.isNight ? 'r' : ''}>{s.instructor}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>

      <div className="notes" style={{ marginTop: '12px' }}>
        <div className="notes-content" style={{ visibility: 'hidden' }}>
          <div>&nbsp;</div>
        </div>
        <div className="notes-sig" style={{ alignSelf: 'flex-start' }}>
          <span className="sig-label">التوقيع</span>
          <span className="sig-paren">(<span>&nbsp;</span>)</span>
          <span className="sig-label">قائد السرية</span>
          <span className="sig-dots">...................................</span>
        </div>
      </div>

      {interactive && pickerTarget && activeSlot && (
        <LessonPickerModal
          week={ex.week}
          dayName={pickerTarget.dayName}
          slot={activeSlot}
          schedule={schedule}
          onSelect={handleSelectLesson}
          onResetDefault={() => {
            handleResetOverride(pickerTarget.overrideKey);
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
