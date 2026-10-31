import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DateRange, Instructions, SubjectPcts } from '../engine/types';
import { LOW } from '../parser/parse';
import { monthNames, defaultWeeksPerMonth } from '../engine/dates';

interface Props {
  inst: Instructions;
  conf: Record<string, number>;
  confirmed: Set<string>;
  notes: string[];
  rawText?: string;
  onChange: (i: Instructions, touched: string) => void;
  onConfirmField: (k: string) => void;
  onAccept: () => void;
  onBack: () => void;
}

const nums = (s: string) => s.split(/[,،\s]+/).filter(Boolean).map(Number).filter(n => Number.isFinite(n));
const hText = (hs: (string | DateRange)[]) => hs.map(x => (typeof x === 'string' ? x : `${x.from} .. ${x.to}`)).join('\n');
const hParse = (s: string): (string | DateRange)[] =>
  s.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/(\d{4}-\d{2}-\d{2})\s*(?:\.\.|حتى|to|-->)\s*(\d{4}-\d{2}-\d{2})/);
    return m ? { from: m[1], to: m[2] } : l.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  }).filter(Boolean) as (string | DateRange)[];

const PCT_LABEL: [keyof SubjectPcts, string][] = [
  ['mainPct', 'الموضوعات الرئيسية'], ['tactics', 'تكتيك عام'], ['tech', 'فنى تخصصى'], ['shooting', 'رماية'], ['fitness', 'تربية بدنية'],
  ['education', 'تعليم منضم'], ['discipline', 'انضباط عسكرى'], ['security', 'أمن حربى'], ['topography', 'طبوغرافيا'], ['morale', 'تدريب معنوي'],
  ['recon', 'سطع وعدو'], ['engineering', 'تدريب هندسى'], ['chemical', 'تدريب كيميائى'], ['admin', 'تدريب إدارى'], ['history', 'تاريخ عسكرى'],
  ['intlLaw', 'قانون دولى'], ['infoWar', 'حرب المعلومات'],
];

interface Ctx { conf: Record<string, number>; low: (k: string) => boolean; confirm: (k: string) => void }
const FieldCtx = createContext<Ctx>({ conf: {}, low: () => false, confirm: () => {} });
function Field({ k, label, children, wide, hint }: { k: string; label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  const { conf, low, confirm } = useContext(FieldCtx);
  const c = conf[k];
  const isLow = low(k);
  return (
    <div className={'fld' + (isLow ? ' low' : '') + (wide ? ' wide' : '')}>
      <label>{label}{c !== undefined && c < LOW && (
        <span className="badge">{isLow ? `راجِع · ${Math.round(c * 100)}٪` : '✔ مؤكَّد'}</span>
      )}</label>
      {hint && <small className="hint2">{hint}</small>}
      {children}
      {isLow && <button type="button" className="mini" onClick={() => confirm(k)}>القيمة صحيحة ✔</button>}
    </div>
  );
}

export function Review({ inst, conf, confirmed, notes, rawText, onChange, onConfirmField, onAccept, onBack }: Props) {
  const names = useMemo(() => monthNames(inst.startSaturday, inst.weeksPerMonth.length), [inst.startSaturday, inst.weeksPerMonth]);
  const low = (k: string) => (conf[k] ?? 1) < LOW && !confirmed.has(k);
  const pending = Object.keys(conf).filter(low);
  const set = <K extends keyof Instructions>(k: K, v: Instructions[K], key: string = k as string) => onChange({ ...inst, [k]: v }, key);

  return (
    <FieldCtx.Provider value={{ conf, low, confirm: onConfirmField }}>
    <div className="panel">
      <div className="bar"><button className="btn ghost" onClick={onBack}>← رجوع</button><h2>مراجعة التعليمات</h2></div>
      {notes.length > 0 && <ul className="notes-list">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="hint">الحقول المظللة استُخرجت بثقة منخفضة (غالباً من التعرف الضوئى). عدّلها أو اضغط «القيمة صحيحة» لتأكيدها قبل الحساب.</p>
      <div className="form">
        <Field k="courseName" label="الدورة / الوحدة" wide><input value={inst.courseName} onChange={e => set('courseName', e.target.value)} /></Field>
        <Field k="yearLabel" label="العام التدريبى (مثل 2025 / 2026)"><input dir="ltr" value={inst.yearLabel ?? ''} placeholder="يُشتق من التواريخ" onChange={e => set('yearLabel', e.target.value || undefined)} /></Field>
        <Field k="startSaturday" label="أول سبت (بداية الأسبوع 1)"><input type="date" value={inst.startSaturday} onChange={e => set('startSaturday', e.target.value)} /></Field>
        <Field k="totalWeeks" label="عدد الأسابيع"><input type="number" min={1} value={inst.totalWeeks} onChange={e => set('totalWeeks', +e.target.value)} /></Field>
        <Field k="firstWeek" label="رقم أول أسبوع (1 للفترة الأولى، 27 للثانية)" hint="الرقم المطبوع على أول أسبوع فى الأجندة."><input type="number" min={1} value={inst.firstWeek} onChange={e => set('firstWeek', +e.target.value)} /></Field>
        <Field k="prepWeeks" label="أسابيع الفترة التحضيرية"><input value={inst.prepWeeks.join('، ')} onChange={e => set('prepWeeks', nums(e.target.value))} /></Field>
        <Field k="opsWeeks" label="أسابيع مهام العمليات"><input value={inst.opsWeeks.join('، ')} onChange={e => set('opsWeeks', nums(e.target.value))} /></Field>
        <Field k="reserveWeeks" label="أسابيع الاحتياط"><input value={inst.reserveWeeks.join('، ')} onChange={e => set('reserveWeeks', nums(e.target.value))} /></Field>
        <Field k="campWeeks" label="أسابيع المعسكر الليلى"><input value={inst.campWeeks.join('، ')} onChange={e => set('campWeeks', nums(e.target.value))} /></Field>
        <Field k="ramadan" label="شهر رمضان (من / إلى)">
          <div className="two">
            <input type="date" value={inst.ramadan?.from ?? ''} onChange={e => set('ramadan', e.target.value ? { from: e.target.value, to: inst.ramadan?.to ?? e.target.value } : null, 'ramadan')} />
            <input type="date" value={inst.ramadan?.to ?? ''} onChange={e => set('ramadan', inst.ramadan ? { ...inst.ramadan, to: e.target.value } : null, 'ramadan')} />
          </div>
        </Field>
        <Field k="holidays" label="الأجازات الرسمية (سطر لكل أجازة: 2024-04-10 .. 2024-04-12)" wide>
          <textarea rows={6} dir="ltr" defaultValue={hText(inst.holidays)} onBlur={e => set('holidays', hParse(e.target.value))} key={hText(inst.holidays).length} />
        </Field>
        <Field k="weeksPerMonth" label="عدد أسابيع كل شهر (قابل للتعديل)" wide hint="كم أسبوعاً يُحسب لكل شهر فى جداول الامتحان. مجموعها يساوى عدد الأسابيع.">
          <div className="two">
            <input value={inst.weeksPerMonth.join('، ')} onChange={e => set('weeksPerMonth', nums(e.target.value))} />
            <button type="button" className="mini" onClick={() => set('weeksPerMonth', defaultWeeksPerMonth(inst.startSaturday, inst.totalWeeks))}>حسب التقويم</button>
          </div>
          <small>{names.map((n, i) => `${n}: ${inst.weeksPerMonth[i]}`).join(' · ')} — المجموع {inst.weeksPerMonth.reduce((a, b) => a + b, 0)}</small>
        </Field>
        <Field k="marchSecurityByMonth" label="طابور السير + الأمن الحربى لكل شهر" wide>
          <table className="mini-table"><thead><tr><th>الشهر</th><th>طابور سير</th><th>أمن حربى</th></tr></thead>
            <tbody>{names.map((n, m) => (
              <tr key={m}><td>{n}</td>
                {[0, 1].map(j => (
                  <td key={j}><input type="number" min={0} max={7} value={inst.marchSecurityByMonth[m]?.[j] ?? 0}
                    onChange={e => { const a = inst.marchSecurityByMonth.map(p => [...p] as [number, number]); while (a.length <= m) a.push([0, 0]); a[m][j] = +e.target.value; set('marchSecurityByMonth', a); }} /></td>
                ))}
              </tr>))}</tbody></table>
        </Field>
        <Field k="marchWeekOfMonth" label="أسبوع الشهر الذى يحمل يوم الطابور" hint="رقم الأسبوع داخل كل شهر الذى يُخصَّص سبته للطابور والأمن الحربى. مثال: 3 تعنى السبت من الأسبوع الثالث فى الشهر."><input type="number" min={1} max={5} value={inst.marchWeekOfMonth} onChange={e => set('marchWeekOfMonth', +e.target.value)} /></Field>
        <Field k="marchWeekExceptions" label="شهور يختلف فيها أسبوع يوم الطابور"
          hint="القاعدة العامة أعلاه تنطبق على كل الشهور. أضف هنا أى شهر يكون فيه يوم الطابور فى أسبوع آخر (مثال: شهر مارس فى الأسبوع الرابع).">
          <div className="exc">
            {Object.entries(inst.marchWeekExceptions).length === 0 && <small>لا توجد استثناءات — كل الشهور تتبع القاعدة العامة.</small>}
            {Object.entries(inst.marchWeekExceptions).map(([m, w]) => (
              <div className="exc-row" key={m}>
                <select aria-label="الشهر" value={m} onChange={e => {
                  const next = { ...inst.marchWeekExceptions }; delete next[+m]; next[+e.target.value] = w;
                  set('marchWeekExceptions', next, 'marchWeekExceptions');
                }}>{names.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
                <span>يكون يوم الطابور فى الأسبوع رقم</span>
                <input aria-label="رقم الأسبوع داخل الشهر" type="number" min={1} max={5} value={w}
                  onChange={e => set('marchWeekExceptions', { ...inst.marchWeekExceptions, [+m]: +e.target.value }, 'marchWeekExceptions')} />
                <button type="button" className="mini danger" onClick={() => {
                  const next = { ...inst.marchWeekExceptions }; delete next[+m];
                  set('marchWeekExceptions', next, 'marchWeekExceptions');
                }}>حذف</button>
              </div>
            ))}
            <button type="button" className="mini" onClick={() => {
              const free = names.findIndex((_, i) => !(i in inst.marchWeekExceptions));
              if (free >= 0) set('marchWeekExceptions', { ...inst.marchWeekExceptions, [free]: inst.marchWeekOfMonth + 1 > 5 ? 4 : inst.marchWeekOfMonth + 1 }, 'marchWeekExceptions');
            }}>+ إضافة شهر مختلف</button>
          </div>
        </Field>
        <Field k="levelWeeks" label="أسابيع المستويات (فرد / طاقم / مركز)" hint="عدد أسابيع التدريب فى كل مستوى بالترتيب، ومجموعها يساوى أسابيع التدريب الفعلية (بعد استبعاد التحضيرى والعمليات والاحتياط).">
          <div className="three">
            {(['individual', 'crew', 'centre'] as const).map(l => (
              <input key={l} type="number" min={0} value={inst.levelWeeks[l]} onChange={e => set('levelWeeks', { ...inst.levelWeeks, [l]: +e.target.value }, 'levelWeeks')} />
            ))}
          </div>
        </Field>
        <Field k="pcts" label="النسب المئوية للموضوعات" wide>
          <div className="pcts">
            {PCT_LABEL.map(([k, l]) => (
              <label key={k}><span>{l}</span><input type="number" min={0} max={100} value={inst.pcts[k]} onChange={e => set('pcts', { ...inst.pcts, [k]: +e.target.value }, 'pcts')} /></label>
            ))}
          </div>
        </Field>
        <Field k="selectedMonth" label="شهر جدول الربط التفصيلى" hint="الشهر الذى يُقسَّم إلى أسابيع فى جدول الربط (المطلوب فى الامتحان).">
          <select value={inst.selectedMonth} onChange={e => set('selectedMonth', +e.target.value)}>{names.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
        </Field>
        <Field k="selectedWeek" label="أسبوع المستخرج" hint="رقم الأسبوع المطلوب عمل مستخرج الموضوعات له."><input type="number" min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} value={inst.selectedWeek} onChange={e => set('selectedWeek', +e.target.value)} /></Field>
      </div>
      {rawText && (
        <details className="raw">
          <summary>النص الذى قرأه التعرف الضوئى (للمقارنة بالصورة الأصلية)</summary>
          <pre dir="rtl">{rawText}</pre>
        </details>
      )}
      <div className="sticky">
        <button className="btn primary big" disabled={pending.length > 0} onClick={onAccept}>
          {pending.length ? `أكّد ${pending.length} حقل أولاً` : 'تأكيد التعليمات وحساب الأجندة'}
        </button>
        {pending.length > 0 && (
          <button type="button" className="btn ghost big" onClick={() => pending.forEach(onConfirmField)}>راجعتُ كل الحقول المظللة وهى صحيحة — أكّد الكل</button>
        )}
      </div>
    </div>
    </FieldCtx.Provider>
  );
}
