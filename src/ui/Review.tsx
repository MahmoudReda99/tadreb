import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DateRange, Instructions, SubjectPcts } from '../engine/types';
import { LOW } from '../parser/parse';
import { DAYS_AR, addDays, defaultWeeksPerMonth, dowOf, monthNames } from '../engine/dates';
import { formatDate, parseDate, parseList, parseNum, toArabic, toLatin } from './parseInput';

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

const LIST_HINT = 'اكتب رقم الأسبوع أو أكثر، وافصل بينها بفاصلة أو مسافة أو أى علامة (مثال: 12، 13). كل رقم أسبوع مستقل: 19-23 تعنى الأسبوعين 19 و23 فقط وليس ما بينهما. تقبل الأرقام الهندية والعادية.';

/** digits (either kind) and the separators a list or a date needs — letters and symbols are dropped as they are typed */
const keepList = (s: string) => s.replace(/[^0-9٠-٩۰-۹\s,،;؛\-–—/.]/g, '');
const keepDate = (s: string) => s.replace(/[^0-9٠-٩۰-۹\s\-–—/.]/g, '');

/** a whole number: shown in Arabic digits, accepts either kind, a leading zero never sticks, the whole value is selected on focus */
function NumInput({ value, onCommit, min = 0, max = 999, label }: { value: number; onCommit: (n: number) => void; min?: number; max?: number; label?: string }) {
  const shown = toArabic(String(value));
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(shown); }, [shown, focus]);
  return (
    <input value={text} inputMode="numeric" dir="auto" aria-label={label}
      onFocus={e => { setFocus(true); e.target.select(); }}
      onBlur={() => { setFocus(false); setText(shown); }}
      onChange={e => {
        const n = parseNum(e.target.value);
        if (n === null) { setText(''); return; } // empty while typing is fine; the old value stays
        setText(toArabic(String(n))); // 05 becomes 5 immediately
        onCommit(Math.min(max, Math.max(min, n)));
      }} />
  );
}

/** keeps what the user types as typed (commas included) and only parses it; the text is tidied when the field loses focus */
function ListInput({ value, onCommit, sorted = true, min, max }: { value: number[]; onCommit: (v: number[]) => void; sorted?: boolean; min?: number; max?: number }) {
  const shown = toArabic(value.join('، '));
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(shown); }, [shown, focus]);
  const bad = min !== undefined && max !== undefined ? value.filter(n => n < min || n > max) : [];
  return (
    <>
      <input value={text} inputMode="text" dir="rtl" placeholder="مثال: ١٢، ١٣"
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setText(shown); }}
        onChange={e => { const v = keepList(e.target.value); setText(toArabic(v)); onCommit(parseList(v, sorted)); }} />
      {bad.length > 0 && <small className="warn">الأسبوع {toArabic(bad.join('، '))} خارج الفترة ({toArabic(String(min))} إلى {toArabic(String(max))}) — تأكد من الرقم.</small>}
    </>
  );
}

type Ctx2 = { from?: string; to?: string };
const WEEKDAY = (iso: string) => DAYS_AR[dowOf(iso)];

/** a date typed any way (3-4-2026, 3/4, 2026-04-03, ٣ أبريل ٢٠٢٦…); shows what it understood while typing */
function DateInput({ value, onCommit, ctx, optional, placeholder = 'مثال: ٣-٤-٢٠٢٦', label }: { value: string | null | undefined; onCommit: (iso: string | null) => void; ctx?: Ctx2; optional?: boolean; placeholder?: string; label?: string }) {
  const shown = formatDate(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus && !bad) setText(shown); }, [shown, focus, bad]);
  const iso = text.trim() ? parseDate(text, ctx) : null;
  return (
    <>
      <input value={text} inputMode="text" dir="auto" placeholder={placeholder} aria-label={label} aria-invalid={bad}
        onFocus={e => { setFocus(true); e.target.select(); }}
        onBlur={() => { setFocus(false); if (!bad) setText(shown); }}
        onChange={e => {
          const raw = keepDate(e.target.value); setText(toArabic(raw));
          if (!raw.trim()) { setBad(false); if (optional) onCommit(null); return; }
          const d = parseDate(raw, ctx);
          setBad(!d);
          if (d) onCommit(d);
        }} />
      {focus && iso && <small className="ok">← {WEEKDAY(iso)} {formatDate(iso)}</small>}
      {bad && <small className="warn">لم أفهم هذا التاريخ — اكتبه أرقاماً مثل ٣-٤-٢٠٢٦ أو ٣/٤/٢٠٢٦.</small>}
    </>
  );
}

interface HRow { id: number; from: string | null; to: string | null }
/** official holidays: one row per holiday, "from" and an optional "to" for several days */
function HolidayList({ value, onCommit, ctx }: { value: (string | DateRange)[]; onCommit: (v: (string | DateRange)[]) => void; ctx: Ctx2 }) {
  const seq = useRef(0);
  const [rows, setRows] = useState<HRow[]>(() => value.map(h => ({ id: ++seq.current, from: typeof h === 'string' ? h : h.from, to: typeof h === 'string' ? null : h.to })));
  const push = (next: HRow[]) => {
    setRows(next);
    onCommit(next.filter(r => r.from).map(r => (r.to && r.to > r.from! ? { from: r.from!, to: r.to } : r.from!)));
  };
  const upd = (id: number, patch: Partial<HRow>) => push(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const days = (r: HRow) => (r.from && r.to && r.to >= r.from ? Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1 : 0);
  return (
    <div className="hol">
      {rows.length === 0 && <small>لا توجد أجازات — اضغط «إضافة أجازة».</small>}
      {rows.map((r, i) => (
        <div className="hol-row" key={r.id}>
          <div className="hol-head">
            <span className="no">{toArabic(String(i + 1))}</span>
            <span className="when">{r.from ? `${WEEKDAY(r.from)} ${formatDate(r.from)}${days(r) > 1 ? ` ← ${formatDate(r.to)} (${toArabic(String(days(r)))} أيام)` : ''}` : 'أجازة جديدة'}</span>
            <button type="button" className="mini danger" onClick={() => push(rows.filter(x => x.id !== r.id))}>حذف</button>
          </div>
          <div className="hol-fields">
            <label><small>من</small><DateInput value={r.from} ctx={ctx} onCommit={d => upd(r.id, { from: d })} label={`أجازة ${i + 1} من`} /></label>
            <label><small>إلى (اختيارى — لأكثر من يوم)</small><DateInput value={r.to} ctx={ctx} optional placeholder="فارغ = يوم واحد" onCommit={d => upd(r.id, { to: d })} label={`أجازة ${i + 1} إلى`} /></label>
          </div>
          {r.from && r.to && r.to < r.from && <small className="warn">تاريخ النهاية قبل البداية — سيُحسب يوماً واحداً.</small>}
        </div>
      ))}
      <button type="button" className="mini" onClick={() => push([...rows, { id: ++seq.current, from: null, to: null }])}>+ إضافة أجازة</button>
    </div>
  );
}

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
      <label>{toArabic(label)}{c !== undefined && c < LOW && (
        <span className="badge">{isLow ? `راجِع · ${Math.round(c * 100)}٪` : '✔ مؤكَّد'}</span>
      )}</label>
      {hint && <small className="hint2">{toArabic(hint)}</small>}
      {children}
      {isLow && <button type="button" className="mini" onClick={() => confirm(k)}>القيمة صحيحة ✔</button>}
    </div>
  );
}

export function Review({ inst, conf, confirmed, notes, rawText, onChange, onConfirmField, onAccept, onBack }: Props) {
  const names = useMemo(() => monthNames(inst.startSaturday, inst.weeksPerMonth.length), [inst.startSaturday, inst.weeksPerMonth]);
  const low = (k: string) => (conf[k] ?? 1) < LOW && !confirmed.has(k);
  const pending = Object.keys(conf).filter(low);
  const ctx: Ctx2 = { from: inst.startSaturday, to: addDays(inst.startSaturday, inst.totalWeeks * 7 - 1) };
  const set = <K extends keyof Instructions>(k: K, v: Instructions[K], key: string = k as string) => onChange({ ...inst, [k]: v }, key);

  return (
    <FieldCtx.Provider value={{ conf, low, confirm: onConfirmField }}>
    <div className="panel">
      <div className="bar"><button className="btn ghost" onClick={onBack}>← رجوع</button><h2>مراجعة التعليمات</h2></div>
      {notes.length > 0 && <ul className="notes-list">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="hint">الحقول المظللة استُخرجت بثقة منخفضة (غالباً من التعرف الضوئى). عدّلها أو اضغط «القيمة صحيحة» لتأكيدها قبل الحساب.</p>
      <div className="form">
        <Field k="courseName" label="الدورة / الوحدة" wide><input value={inst.courseName} onChange={e => set('courseName', e.target.value)} /></Field>
        <Field k="yearLabel" label="العام التدريبى (مثل 2025 / 2026)"><input dir="rtl" inputMode="numeric" value={toArabic(inst.yearLabel ?? '')} placeholder="يُشتق من التواريخ" onChange={e => { const v = toLatin(e.target.value).replace(/[^0-9\s/\-–]/g, ''); set('yearLabel', v.trim() ? v : undefined); }} /></Field>
        <Field k="startSaturday" label="أول سبت (بداية الأسبوع 1)" hint="اكتب التاريخ أرقاماً فقط بأى شكل: ٣-٤-٢٠٢٦ أو ٣/٤/٢٠٢٦ أو ٣.٤.٢٠٢٦.">
          <DateInput value={inst.startSaturday} ctx={ctx} onCommit={d => d && set('startSaturday', d)} label="أول سبت" />
          {dowOf(inst.startSaturday) !== 6 && <small className="warn">هذا اليوم {WEEKDAY(inst.startSaturday)} وليس سبتاً — راجع التاريخ.</small>}
        </Field>
        <Field k="totalWeeks" label="عدد الأسابيع"><NumInput value={inst.totalWeeks} min={1} max={60} onCommit={n => set('totalWeeks', n)} label="عدد الأسابيع" /></Field>
        <Field k="firstWeek" label="رقم أول أسبوع (1 للفترة الأولى، 27 للثانية)" hint="الرقم المطبوع على أول أسبوع فى الأجندة."><NumInput value={inst.firstWeek} min={1} max={200} onCommit={n => set('firstWeek', n)} label="رقم أول أسبوع" /></Field>
        <Field k="prepWeeks" label="أسابيع الفترة التحضيرية" hint={LIST_HINT}><ListInput value={inst.prepWeeks} onCommit={v => set('prepWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="opsWeeks" label="أسابيع مهام العمليات" hint={LIST_HINT}><ListInput value={inst.opsWeeks} onCommit={v => set('opsWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="reserveWeeks" label="أسابيع الاحتياط" hint={LIST_HINT}><ListInput value={inst.reserveWeeks} onCommit={v => set('reserveWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="campWeeks" label="أسابيع المعسكر الليلى" hint={LIST_HINT}><ListInput value={inst.campWeeks} onCommit={v => set('campWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="ramadan" label="شهر رمضان (من / إلى)" hint="اتركهما فارغين إن لم يقع رمضان فى هذه الفترة.">
          <div className="two">
            <div><small>من</small><DateInput value={inst.ramadan?.from} ctx={ctx} optional onCommit={d => set('ramadan', d ? { from: d, to: inst.ramadan?.to && inst.ramadan.to >= d ? inst.ramadan.to : d } : null, 'ramadan')} label="رمضان من" /></div>
            <div><small>إلى</small><DateInput value={inst.ramadan?.to} ctx={ctx} optional onCommit={d => set('ramadan', inst.ramadan ? { ...inst.ramadan, to: d ?? inst.ramadan.from } : d ? { from: d, to: d } : null, 'ramadan')} label="رمضان إلى" /></div>
          </div>
        </Field>
        <Field k="holidays" label="الأجازات الرسمية" wide hint="أجازة لكل صف. اكتب تاريخ البداية بأى شكل (٣-٤-٢٠٢٦ أو ٣/٤ فقط وسيُفهم العام من الفترة). ولأجازة أكثر من يوم اكتب تاريخ النهاية أيضاً.">
          <HolidayList value={inst.holidays} ctx={ctx} onCommit={v => set('holidays', v)} />
        </Field>
        <Field k="weeksPerMonth" label="عدد أسابيع كل شهر (قابل للتعديل)" wide hint="كم أسبوعاً يُحسب لكل شهر فى جداول الامتحان. مجموعها يساوى عدد الأسابيع.">
          <div className="two">
            <ListInput value={inst.weeksPerMonth} onCommit={v => set('weeksPerMonth', v)} sorted={false} />
            <button type="button" className="mini" onClick={() => set('weeksPerMonth', defaultWeeksPerMonth(inst.startSaturday, inst.totalWeeks))}>حسب التقويم</button>
          </div>
          <small>{names.map((n, i) => `${n}: ${inst.weeksPerMonth[i]}`).join(' · ')} — المجموع {inst.weeksPerMonth.reduce((a, b) => a + b, 0)}</small>
        </Field>
        <Field k="marchSecurityByMonth" label="طابور السير + الأمن الحربى لكل شهر" wide>
          <table className="mini-table"><thead><tr><th>الشهر</th><th>طابور سير</th><th>أمن حربى</th></tr></thead>
            <tbody>{names.map((n, m) => (
              <tr key={m}><td>{n}</td>
                {[0, 1].map(j => (
                  <td key={j}><NumInput value={inst.marchSecurityByMonth[m]?.[j] ?? 0} min={0} max={7} label={`${names[m]} ${j ? 'أمن حربى' : 'طابور سير'}`}
                    onCommit={n => { const a = inst.marchSecurityByMonth.map(p => [...p] as [number, number]); while (a.length <= m) a.push([0, 0]); a[m][j] = n; set('marchSecurityByMonth', a); }} /></td>
                ))}
              </tr>))}</tbody></table>
        </Field>
        <Field k="marchWeekOfMonth" label="أسبوع الشهر الذى يحمل يوم طابور السير" hint="رقم الأسبوع داخل كل شهر الذى يُخصَّص سبته للطابور والأمن الحربى. مثال: 3 تعنى السبت من الأسبوع الثالث فى الشهر."><NumInput value={inst.marchWeekOfMonth} min={1} max={5} onCommit={n => set('marchWeekOfMonth', n)} label="أسبوع الشهر" /></Field>
        <Field k="marchWeekExceptions" label="شهور يختلف فيها أسبوع يوم طابور السير"
          hint="القاعدة العامة أعلاه تنطبق على كل الشهور. أضف هنا أى شهر يكون فيه يوم طابور السير فى أسبوع آخر (مثال: شهر مارس فى الأسبوع الرابع).">
          <div className="exc">
            {Object.entries(inst.marchWeekExceptions).length === 0 && <small>لا توجد استثناءات — كل الشهور تتبع القاعدة العامة.</small>}
            {Object.entries(inst.marchWeekExceptions).map(([m, w]) => (
              <div className="exc-row" key={m}>
                <select aria-label="الشهر" value={m} onChange={e => {
                  const next = { ...inst.marchWeekExceptions }; delete next[+m]; next[+e.target.value] = w;
                  set('marchWeekExceptions', next, 'marchWeekExceptions');
                }}>{names.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
                <span>يكون يوم طابور السير فى الأسبوع رقم</span>
                <NumInput label="رقم الأسبوع داخل الشهر" value={w} min={1} max={5}
                  onCommit={n => set('marchWeekExceptions', { ...inst.marchWeekExceptions, [+m]: n }, 'marchWeekExceptions')} />
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
              <NumInput key={l} value={inst.levelWeeks[l]} min={0} max={60} label={l === 'individual' ? 'فرد' : l === 'crew' ? 'طاقم' : 'مركز'} onCommit={n => set('levelWeeks', { ...inst.levelWeeks, [l]: n }, 'levelWeeks')} />
            ))}
          </div>
        </Field>
        <Field k="pcts" label="النسب المئوية للموضوعات" wide>
          <div className="pcts">
            {PCT_LABEL.map(([k, l]) => (
              <label key={k}><span>{l}</span><NumInput value={inst.pcts[k]} min={0} max={100} label={l} onCommit={n => set('pcts', { ...inst.pcts, [k]: n }, 'pcts')} /></label>
            ))}
          </div>
        </Field>
        <Field k="selectedMonth" label="شهر جدول الربط التفصيلى" hint="الشهر الذى يُقسَّم إلى أسابيع فى جدول الربط (المطلوب فى الامتحان).">
          <select value={inst.selectedMonth} onChange={e => set('selectedMonth', +e.target.value)}>{names.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
        </Field>
        <Field k="selectedWeek" label="أسبوع المستخرج" hint="رقم الأسبوع المطلوب عمل مستخرج الموضوعات له."><NumInput value={inst.selectedWeek} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} onCommit={n => set('selectedWeek', n)} label="أسبوع المستخرج" /></Field>
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
