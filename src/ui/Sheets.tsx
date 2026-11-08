import type { AgendaResult, DistributionResult, Instructions, LinkingResult, SubjectKey, WeeklyExtract } from '../engine/types';
import { ALL_KEYS, GENERAL_KEYS, MAIN_KEYS, SUBJECT_AR, SUBJECT_SHORT } from '../engine/types';
import { DAYS_AR, addDays, dm, monthNames, parseDate } from '../engine/dates';
import { auditDay, auditLink, auditSubject, auditSum, type Audit } from '../engine/audit';
import { ar, h, KIND_COLORS, LEVEL_BG, LEVEL_SWATCH } from './format';
import { sum } from '../engine/rounding';

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
const dayLabel = (d: string, first: boolean) => (first || d.endsWith('-01') ? dm(d) : String(+d.slice(8)));

/* ───────────────────────────── page 1 ───────────────────────────── */
export function AgendaSheet({ inst, agenda, onInspect = noop }: { inst: Instructions; agenda: AgendaResult; onInspect?: Inspect }) {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const W = agenda.weeks;
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
        <div className="u">للفترة التدريبية الأولى من العام التدريبى {YEARS(inst)} م</div>
        <div className="u">{inst.courseName || '—'}</div>
      </Title>
      <table className="grid agenda">
        <thead>
          <tr>
            <th className="corner" rowSpan={2}><span className="c1">الشهر</span><span className="c2">اليوم</span></th>
            {inst.weeksPerMonth.map((n, m) => <th key={m} colSpan={n} className="mh">{names[m]}</th>)}
            <th colSpan={3} className="mh">الإجمالى</th>
          </tr>
          <tr>
            {W.map(w => {
              const k = hdrKind(w.week);
              // prep / reserve / ops weeks keep their own colour; every other week takes the colour of its level (فرد / طاقم / مركز)
              const style = k ? { background: KIND_COLORS[k].bg, color: KIND_COLORS[k].fg } : w.level ? { background: LEVEL_BG[w.level], color: '#111' } : undefined;
              return <th key={w.week} style={style}>{ar(w.week)}</th>;
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
                    <td key={w.week} className="daycell tap" style={{ background: c.bg, color: c.fg }} onClick={() => onInspect(auditDay(d))}
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
              {W.map(w => <td key={w.week} className={what === 'night' ? 'r' : undefined}><Num v={what === 'total' ? w.total : w[what]} on={weekSum(w, what)} /></td>)}
              <td colSpan={3} className={'gt' + (what === 'night' ? ' r' : '')}>
                <Num v={0} text={ar(what === 'total' ? agenda.total : agenda[what])} on={() => onInspect(auditSum(
                  `إجمالى الفترة — ${what === 'day' ? 'نهارى' : what === 'night' ? 'ليلى' : 'الكلى'}`, 'مجموع الأسابيع، ويساوى مجموع الشهور',
                  W.map(w => ({ label: `أسبوع ${w.week}`, value: what === 'total' ? w.total : w[what] }))))} />
              </td>
            </tr>
          ))}
        </tbody>
        <tbody className="extra">
          {bottom.map(b => (
            <tr key={b.label}>
              <th className="rowh">{b.label}</th>
              {W.map(w => (
                <td key={w.week}><Num v={b.f(w)} on={tap(`${b.label} — أسبوع ${ar(w.week)}`, 'مجموع هذه الساعات فى أيام الأسبوع',
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
          <div className={'chk ' + (agenda.checks.ok ? 'ok' : 'bad')}>{agenda.checks.ok ? '✔ مجموع الأسابيع = مجموع الشهور = الإجمالى' : '✘ عدم تطابق بين الأسابيع والشهور'}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── page 2 ───────────────────────────── */
export function DistributionSheet({ inst, agenda, dist, onInspect = noop }: { inst: Instructions; agenda: AgendaResult; dist: DistributionResult; onInspect?: Inspect }) {
  const p = inst.pcts;
  const pct = (k: SubjectKey) => (k === 'fitness' ? p.fitness : k === 'education' ? p.education : k === 'security' ? p.security : p[k as keyof typeof p]);
  const cell = (k: SubjectKey, part: 'day' | 'night' | 'total') => {
    const c = dist.cells[k];
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
      <td>{ar(i + 1)}</td><td className="subj">{SUBJECT_AR[k]}</td><td>{ar(pct(k))} %</td>
      <td>{cell(k, 'total')}</td><td>{cell(k, 'day')}</td><td className="r">{cell(k, 'night')}</td>
      {(['individual', 'crew', 'centre'] as const).map(l => (
        <><td key={l + 'd'}>{lv(k, l, 'day')}</td><td key={l + 'n'} className="r">{lv(k, l, 'night')}</td></>
      ))}
    </tr>
  );
  const dsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));
  const sub = (label: string, c: { day: number; night: number }, pc: number, keys: SubjectKey[]) => {
    const parts = (f: (k: SubjectKey) => number) => keys.map(k => ({ label: SUBJECT_AR[k], value: f(k) }));
    return (
      <tr className="sub"><td colSpan={2}>{label}</td><td>{ar(pc)} %</td>
        <td><Num v={c.day + c.night} on={dsum(`${label} — عدد الساعات`, 'مجموع ساعات موضوعات هذه المجموعة', parts(k => dist.cells[k].day + dist.cells[k].night))} /></td>
        <td><Num v={c.day} on={dsum(`${label} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة', parts(k => dist.cells[k].day))} /></td>
        <td className="r"><Num v={c.night} on={dsum(`${label} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة', parts(k => dist.cells[k].night))} /></td>
        <td colSpan={6} /></tr>
    );
  };
  const gparts = (f: (c: { day: number; night: number }) => number) => [{ label: 'الموضوعات الرئيسية', value: f(dist.mainCell) }, { label: 'الموضوعات العامة', value: f(dist.generalCell) }];
  const gen = GENERAL_KEYS;
  return (
    <div className="sheet" dir="rtl">
      <Title><div className="u">توزيع الساعات على الموضوعات</div></Title>
      <table className="grid dist">
        <thead>
          <tr><th rowSpan={2}>م</th><th rowSpan={2}>الموضوع</th><th rowSpan={2}>النسبة المئوية</th><th rowSpan={2}>عدد الساعات</th><th rowSpan={2}>نهارى</th><th rowSpan={2}>ليلى</th>
            <th colSpan={2}>فرد</th><th colSpan={2}>طاقم</th><th colSpan={2}>مركز</th></tr>
          <tr>{[0, 1, 2].map(i => <><th key={'n' + i}>ن</th><th key={'l' + i}>ل</th></>)}</tr>
        </thead>
        <tbody>
          <tr className="band"><td colSpan={12}>الموضوعات الرئيسية : {ar(p.mainPct)} %</td></tr>
          {MAIN_KEYS.map(row)}
          {sub('إجمالى الموضوعات الرئيسية', dist.mainCell, p.mainPct, MAIN_KEYS)}
          <tr className="band"><td colSpan={12}>الموضوعات العامة : {ar(100 - p.mainPct)} %</td></tr>
          {gen.map(row)}
          {sub('إجمالى الموضوعات العامة', dist.generalCell, 100 - p.mainPct, GENERAL_KEYS)}
          <tr className="sub grand"><td colSpan={2}>الإجمالى</td><td>١٠٠ %</td>
            <td><Num v={dist.total} on={dsum('الإجمالى — عدد الساعات', 'الرئيسية + العامة، وتساوى إجمالى ساعات الأجندة', gparts(c => c.day + c.night))} /></td>
            <td><Num v={agenda.day} on={dsum('الإجمالى — نهارى', 'الرئيسية + العامة، وتساوى ساعات الأجندة النهارية', gparts(c => c.day))} /></td>
            <td className="r"><Num v={agenda.night} on={dsum('الإجمالى — ليلى', 'الرئيسية + العامة، وتساوى ساعات الأجندة الليلية', gparts(c => c.night))} /></td><td colSpan={6} /></tr>
        </tbody>
      </table>
      <div className={'chk ' + (dist.checks.ok ? 'ok' : 'bad')}>{dist.checks.ok ? '✔ مجموع الموضوعات = إجمالى الأجندة (نهارى وليلى)' : '✘ مجموع الموضوعات لا يساوى إجمالى الأجندة'}</div>
    </div>
  );
}

/* ───────────────────────────── page 3 ───────────────────────────── */
export function LinkingSheet({ inst, agenda, dist, link, onInspect = noop }: { inst: Instructions; agenda: AgendaResult; dist: DistributionResult; link: LinkingResult; onInspect?: Inspect }) {
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const sm = Math.min(inst.selectedMonth, names.length - 1);
  const wk = link.weeks[sm];
  const grand = { day: agenda.day, night: agenda.night };
  const M = link.months;
  const pair = (b: typeof M, col: number, k: SubjectKey) => {
    const c = b.cells[col][k];
    return (
      <Pair d={c.day} n={c.night}
        onD={() => onInspect(auditLink(b, grand, rowsOf(b, dist), col, k, 'day'))}
        onN={() => onInspect(auditLink(b, grand, rowsOf(b, dist), col, k, 'night'))} />
    );
  };
  const rowsOf = (b: typeof M, d: DistributionResult) => (b === M ? d.cells : Object.fromEntries(ALL_KEYS.map(k => [k, M.cells[sm][k]])) as typeof d.cells);
  const body = (k: SubjectKey, i: number) => (
    <tr key={k}>
      <td>{ar(i + 1)}</td><td className="subj">{SUBJECT_SHORT[k]}</td><td>{ar(k === 'fitness' ? inst.pcts.fitness : (inst.pcts as unknown as Record<string, number>)[k])}%</td>
      <td className="pair"><Pair d={dist.cells[k].day} n={dist.cells[k].night}
        onD={lsum(`${SUBJECT_AR[k]} — إجمالى النهارى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cells[m][k].day })))}
        onN={lsum(`${SUBJECT_AR[k]} — إجمالى الليلى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cells[m][k].night })))} /></td>
      {names.map((_, m) => m === sm
        ? <><td key={m} className="mh2">{pair(M, m, k)}</td>{wk.b.cells.map((_c, c) => <td key={m + 'w' + c}>{pair(wk.b, c, k)}</td>)}</>
        : <td key={m}>{pair(M, m, k)}</td>)}
    </tr>
  );
  const lsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));
  const subtotal = (label: string, side: 'main' | 'general', pc: number, c: { day: number; night: number }) => {
    const keys = side === 'main' ? MAIN_KEYS : GENERAL_KEYS;
    // one subtotal cell: day and night each explain themselves from the subjects of the group in that column
    const cellOf = (b: typeof M, col: number, name: string, x: { day: number; night: number }) => (
      <Pair d={x.day} n={x.night}
        onD={lsum(`${label} — ${name} — نهارى`, 'مجموع الساعات النهارية لموضوعات المجموعة فى هذا العمود', keys.map(k => ({ label: SUBJECT_AR[k], value: b.cells[col][k].day })))}
        onN={lsum(`${label} — ${name} — ليلى`, 'مجموع الساعات الليلية لموضوعات المجموعة فى هذا العمود', keys.map(k => ({ label: SUBJECT_AR[k], value: b.cells[col][k].night })))} />
    );
    return (
      <tr className="sub"><td colSpan={2}>{label}</td><td>{ar(pc)}%</td>
        <td className="pair"><Pair d={c.day} n={c.night}
          onD={lsum(`${label} — إجمالى النهارى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M[side][m].day })))}
          onN={lsum(`${label} — إجمالى الليلى`, 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M[side][m].night })))} /></td>
        {names.map((n, m) => m === sm
          ? <><td key={m}>{cellOf(M, m, n, M[side][m])}</td>{wk.b[side].map((x, c) => <td key={'w' + c}>{cellOf(wk.b, c, `أسبوع ${wk.weekNumbers[c]}`, x)}</td>)}</>
          : <td key={m}>{cellOf(M, m, n, M[side][m])}</td>)}</tr>
    );
  };
  const grandCell = (b: typeof M, col: number, name: string) => (
    <Pair d={b.cols[col].day} n={b.cols[col].night}
      onD={lsum(`الإجمالى — ${name} — نهارى`, 'الرئيسية + العامة، وتساوى ساعات هذا العمود فى الأجندة', [{ label: 'الموضوعات الرئيسية', value: b.main[col].day }, { label: 'الموضوعات العامة', value: b.general[col].day }])}
      onN={lsum(`الإجمالى — ${name} — ليلى`, 'الرئيسية + العامة، وتساوى ساعات هذا العمود فى الأجندة', [{ label: 'الموضوعات الرئيسية', value: b.main[col].night }, { label: 'الموضوعات العامة', value: b.general[col].night }])} />
  );
  return (
    <div className="sheet" dir="rtl">
      <Title>
        <div className="u">جدول ربط الساعات والموضوعات (نهارى / ليلى)</div>
        <div className="u">عن الفترة التدريبية الأولى من العام التدريبى {YEARS(inst)} م</div>
      </Title>
      <table className="grid link">
        <thead>
          <tr><th rowSpan={2}>م</th><th rowSpan={2}>الموضوع</th><th rowSpan={2}>النسبة المئوية</th><th rowSpan={2}>إجمالى الساعات</th>
            {names.map((n, m) => <th key={m} colSpan={m === sm ? 1 + wk.weekNumbers.length : 1} rowSpan={m === sm ? 1 : 2}>{n}</th>)}</tr>
          <tr><th>الشهر</th>{wk.weekNumbers.map(w => <th key={w}>{ar(w)}</th>)}</tr>
        </thead>
        <tbody>
          <tr className="band"><td colSpan={4 + names.length + wk.weekNumbers.length}>الموضوعات الرئيسية : {ar(inst.pcts.mainPct)} %</td></tr>
          {MAIN_KEYS.map(body)}
          {subtotal('إجمالى الموضوعات الرئيسية', 'main', inst.pcts.mainPct, dist.mainCell)}
          <tr className="band"><td colSpan={4 + names.length + wk.weekNumbers.length}>الموضوعات العامة : {ar(100 - inst.pcts.mainPct)} %</td></tr>
          {GENERAL_KEYS.map(body)}
          {subtotal('إجمالى الموضوعات العامة', 'general', 100 - inst.pcts.mainPct, dist.generalCell)}
          <tr className="sub grand"><td colSpan={2}>الإجمالى</td><td>١٠٠%</td><td><Pair d={agenda.day} n={agenda.night}
            onD={lsum('الإجمالى العام — نهارى', 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cols[m].day })))}
            onN={lsum('الإجمالى العام — ليلى', 'مجموع الشهور', names.map((n, m) => ({ label: n, value: M.cols[m].night })))} /></td>
            {names.map((n, m) => m === sm
              ? <><td key={m}>{grandCell(M, m, n)}</td>{wk.b.cols.map((_c, i) => <td key={'w' + i}>{grandCell(wk.b, i, `أسبوع ${wk.weekNumbers[i]}`)}</td>)}</>
              : <td key={m}>{grandCell(M, m, n)}</td>)}</tr>
        </tbody>
      </table>
      <div className="checks">
        <span className={'chk ' + (link.checks.rows ? 'ok' : 'bad')}>{link.checks.rows ? '✔ الفحص الأفقى: مجموع كل صف = إجمالى الموضوع' : '✘ الفحص الأفقى'}</span>
        <span className={'chk ' + (link.checks.cols ? 'ok' : 'bad')}>{link.checks.cols ? '✔ الفحص الرأسى: مجموع كل عمود = إجمالى الشهر / الأسبوع' : '✘ الفحص الرأسى'}</span>
      </div>
    </div>
  );
}

/* ───────────────────────────── page 4 ───────────────────────────── */
export function WeeklySheet({ inst, ex, onInspect = noop }: { inst: Instructions; ex: WeeklyExtract | null; onInspect?: Inspect }) {
  if (!ex) return <div className="sheet" dir="rtl"><p>لا توجد بيانات لهذا الأسبوع</p></div>;
  const dn = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const rows = ex.rows.filter(r => r.day + r.night > 0);
  const cellHrs = (r: typeof rows[number], i: number) => r.slots[i];
  const isNight = (lectures: string) => parseInt(lectures, 10) >= 8;
  const hrs = (r: typeof rows[number], i: number, night: boolean) => sum(r.slots[i].filter(x => isNight(x.lectures) === night).map(x => x.hours));
  const wsum = (title: string, rule: string, parts: { label: string; value: number }[]) => () => onInspect(auditSum(title, rule, parts));
  return (
    <div className="sheet framed" dir="rtl">
      <div className="mod"><span>وزارة الدفـــاع</span></div>
      <div className="cmd">قائد الكتيبة ........................ <br />صودق ،،،</div>
      <div className="sheet-title c">
        <div className="u">مستخرج الموضوعات والساعات عن الاسبوع رقم ( {ar(ex.week)} )</div>
        <div className="u">من الفترة التدريبية الأولى للعام التدريبى {YEARS(inst)}</div>
        <div className="u">خلال المدة من {ar(ex.from.split('-').reverse().join('/'))} إلى {ar(ex.to.split('-').reverse().join('/'))}</div>
      </div>
      <table className="grid weekly">
        <thead><tr><th>م</th><th>الموضوعات</th><th>ساعات الأسبوع</th>{dn.map(d => <th key={d}>{d}</th>)}<th>ملاحظات</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td>{ar(i + 1)}</td><td className="subj">{SUBJECT_SHORT[r.key]}</td>
              <td className="pair"><Pair d={r.day} n={r.night}
                onD={wsum(`${SUBJECT_AR[r.key]} — ساعات الأسبوع النهارية`, 'مجموع محاضرات هذا الموضوع النهارية فى أيام الأسبوع', dn.map((d, di) => ({ label: d, value: hrs(r, di, false) })))}
                onN={wsum(`${SUBJECT_AR[r.key]} — ساعات الأسبوع الليلية`, 'مجموع محاضرات هذا الموضوع الليلية فى أيام الأسبوع', dn.map((d, di) => ({ label: d, value: hrs(r, di, true) })))} /></td>
              {ex.days.map((_, di) => (
                <td key={di} className={cellHrs(r, di).length ? 'slot' : ''}>
                  {cellHrs(r, di).length ? cellHrs(r, di).map((s, j) => (
                    <div key={j} className={'tap' + (parseInt(s.lectures, 10) >= 8 ? ' r' : '')} onClick={() => onInspect({
                      title: `${SUBJECT_AR[r.key]} — ${dn[di]}`, rule: 'ترتيب محاضرات اليوم: المحاضرة 1 للياقة (والتعليم المنضم يوم الخميس)، وباقى النهار أزواج (2-3 ثم 4-5 ثم 6-7)، والليل (8-9 ثم 10-11).',
                      steps: [{ label: 'الساعات', value: String(s.hours) }, { label: 'المحاضرات', value: s.lectures }, { label: 'ساعات الموضوع بالأسبوع', value: `${r.day} نهارى + ${r.night} ليلى` }],
                      equation: `${s.hours} / ${s.lectures}`, result: String(s.hours), ok: ex.checks.ok,
                    })}>{ar(s.text)}</div>
                  )) : <span>- / -</span>}
                </td>
              ))}
              <td />
            </tr>
          ))}
          <tr className="sub grand">
            <td colSpan={2}>الإجمالــــــــى</td>
            <td className="pair"><Pair d={ex.totals.day} n={ex.totals.night}
              onD={wsum('إجمالى الأسبوع — نهارى', 'مجموع ساعات كل أيام الأسبوع النهارية', ex.days.map((d, i) => ({ label: dn[i], value: d.day })))}
              onN={wsum('إجمالى الأسبوع — ليلى', 'مجموع ساعات كل أيام الأسبوع الليلية', ex.days.map((d, i) => ({ label: dn[i], value: d.night })))} /></td>
            {ex.days.map((d, i) => (
              <td key={i} className="pair"><Pair d={d.day} n={d.night}
                onD={wsum(`${dn[i]} — ساعات اليوم النهارية`, 'مجموع ساعات مواضيع هذا اليوم', rows.map(r => ({ label: SUBJECT_SHORT[r.key], value: hrs(r, i, false) })))}
                onN={wsum(`${dn[i]} — ساعات اليوم الليلية`, 'مجموع ساعات مواضيع هذا اليوم', rows.map(r => ({ label: SUBJECT_SHORT[r.key], value: hrs(r, i, true) })))} /></td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
      <div className="notes">
        <b>ملاحظــات:</b>
        <div>١- يرفق مع هذا كشف للموضوعات والدروس التى ستدرس فى الكتيبة عن هذا الأسبوع .<span className="sig">التوقيع (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></div>
        <div>٢- يسلم لقائد السرية يوم الأحد صباحا و يعاد الأحد بعد الظهر .<span className="sig">قائد السرية .............................</span></div>
        <div>٣- يتصدق عليه من قائد الكتيبة و يعاد لقائد السرية يوم الإثنين لإعداد البرنامج .</div>
      </div>
      <div className={'chk ' + (ex.checks.ok ? 'ok' : 'bad')}>{ex.checks.ok ? '✔ ساعات كل يوم = مجموع محاضراته، وساعات كل موضوع = ساعاته الأسبوعية' : '✘ عدم تطابق فى توزيع المحاضرات'}</div>
    </div>
  );
}
