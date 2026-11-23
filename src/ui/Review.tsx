import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CustomSubject, DateRange, Instructions, SubjectKey, SubjectPcts } from '../engine/types';
import { getNightKeys } from '../engine/types';
import { LOW } from '../parser/parse';
import { DAYS_AR, addDays, defaultWeeksPerMonth, dowOf, monthNames } from '../engine/dates';
import { formatDate, parseDate, parseList, parseNum, toArabic, toLatin, type DateCtx } from './parseInput';

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

/** digits (either kind) and the separators a list or a date needs — letters and symbols are dropped as they are typed */
const keepList = (s: string) => s.replace(/[^0-9٠-٩۰-۹\s,،;؛\-–—/.]/g, '');
const keepDate = (s: string) => s.replace(/[^0-9٠-٩۰-۹\s\-–—/.]/g, '');

/** a whole number: shown in Arabic digits, accepts either kind, a leading zero never sticks, the whole value is selected on focus */
function NumInput({ value, onCommit, min = 0, max = 999, label }: { value: number; onCommit: (n: number) => void; min?: number; max?: number; label?: string }) {
  const safeVal = Number.isFinite(value) ? value : 0;
  const shown = toArabic(String(safeVal));
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(shown); }, [shown, focus]);
  return (
    <input value={text} inputMode="numeric" dir="auto" aria-label={label}
      onFocus={e => { setFocus(true); e.target.select(); }}
      onBlur={() => {
        setFocus(false);
        const n = parseNum(text);
        if (n !== null) {
          const clamped = Math.min(max, Math.max(min, n));
          onCommit(clamped);
          setText(toArabic(String(clamped)));
        } else {
          setText(shown);
        }
      }}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9٠-٩۰-۹]/g, '');
        setText(toArabic(raw));
        const n = parseNum(raw);
        if (n !== null) {
          onCommit(Math.min(max, Math.max(min, n)));
        }
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

type Ctx2 = DateCtx;
const WEEKDAY = (iso: string) => DAYS_AR[dowOf(iso)];

/** a date typed any way (12-7, 3-4-2026, 3/4, 2026-04-03, ٣ أبريل ٢٠٢٦…); auto-completes year on blur/Enter */
function DateInput({
  value,
  onCommit,
  ctx,
  optional,
  placeholder = 'مثال: ٧-١ أو ٦-١٠ أو ٣-٤-٢٠٢٦',
  label,
  onEnter,
  inputRef,
}: {
  value: string | null | undefined;
  onCommit: (iso: string | null) => void;
  ctx?: Ctx2;
  optional?: boolean;
  placeholder?: string;
  label?: string;
  onEnter?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const shown = formatDate(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!focus && !bad) setText(shown);
  }, [shown, focus, bad]);

  const iso = text.trim() ? parseDate(text, ctx) : null;

  const commitDate = () => {
    if (iso) {
      setText(formatDate(iso));
      onCommit(iso);
      setBad(false);
    } else if (!text.trim()) {
      setBad(false);
      if (optional) onCommit(null);
    } else {
      setBad(true);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        value={text}
        inputMode="text"
        dir="auto"
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={bad}
        onFocus={e => {
          setFocus(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocus(false);
          commitDate();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDate();
            if (onEnter) onEnter();
          }
        }}
        onChange={e => {
          const raw = keepDate(e.target.value);
          setText(toArabic(raw));
          if (!raw.trim()) {
            setBad(false);
            if (optional) onCommit(null);
            return;
          }
          const d = parseDate(raw, ctx);
          setBad(false);
          if (d) onCommit(d);
        }}
      />
      {focus && iso && <small className="ok">← {WEEKDAY(iso)} {formatDate(iso)}</small>}
      {bad && <small className="warn">لم أفهم هذا التاريخ — اكتبه أرقاماً مثل ٧-١ أو ٣-٤-٢٠٢٦.</small>}
    </>
  );
}

/** Individual numeric input boxes for week lists (2 boxes by default + "+ إضافة أسبوع" button) */
function WeekFieldsInput({
  value,
  onCommit,
  min,
  max,
  defaultCount = 2,
}: {
  value: number[];
  onCommit: (v: number[]) => void;
  min?: number;
  max?: number;
  defaultCount?: number;
}) {
  const makeInitial = (vals: number[]) => {
    const arr = vals.map(n => toArabic(String(n)));
    while (arr.length < defaultCount) arr.push('');
    return arr;
  };
  const [slots, setSlots] = useState<string[]>(() => makeInitial(value));
  const [warn, setWarn] = useState<string | null>(null);
  const sig = value.join(',');
  const prevSig = useRef(sig);

  useEffect(() => {
    if (prevSig.current !== sig) {
      prevSig.current = sig;
      setSlots(makeInitial(value));
      setWarn(null);
    }
  }, [sig]);

  const commit = (nextSlots: string[]) => {
    const nums: number[] = [];
    const outOfRange: number[] = [];
    for (const s of nextSlots) {
      const n = parseNum(s);
      if (n === null) continue;
      if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
        outOfRange.push(n);
      } else if (!nums.includes(n)) {
        nums.push(n);
      }
    }
    nums.sort((a, b) => a - b);
    setWarn(
      outOfRange.length
        ? `خارج النطاق (${toArabic(String(min ?? ''))}–${toArabic(String(max ?? ''))}): ${outOfRange.map(n => toArabic(String(n))).join('، ')}`
        : null,
    );
    prevSig.current = nums.join(',');
    onCommit(nums);
  };

  return (
    <div className="week-fields">
      <div className="week-fields-grid">
        {slots.map((val, idx) => (
          <div key={idx} className="week-field-item">
            <input
              dir="rtl"
              inputMode="numeric"
              placeholder="رقم الأسبوع"
              value={val}
              onChange={e => {
                const cleaned = toArabic(toLatin(e.target.value).replace(/[^0-9]/g, ''));
                const next = slots.map((s, i) => (i === idx ? cleaned : s));
                setSlots(next);
              }}
              onBlur={() => commit(slots)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit(slots);
                }
              }}
            />
            {slots.length > defaultCount && (
              <button
                type="button"
                className="week-field-del"
                aria-label="حذف"
                onClick={() => {
                  const next = slots.filter((_, i) => i !== idx);
                  setSlots(next);
                  commit(next);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mini"
        onClick={() => setSlots(s => [...s, ''])}
      >
        + إضافة أسبوع
      </button>
      {warn && <small className="warn">{warn}</small>}
    </div>
  );
}

interface HRow { id: number; from: string | null; to: string | null }
/** official holidays: one row per holiday, "from" and an optional "to" for several days */
function HolidayList({
  value,
  onCommit,
  ctx,
}: {
  value: (string | DateRange)[];
  onCommit: (v: (string | DateRange)[]) => void;
  ctx: Ctx2;
}) {
  const seq = useRef(0);
  const [rows, setRows] = useState<HRow[]>(() =>
    value.map(h => ({
      id: ++seq.current,
      from: typeof h === 'string' ? h : h.from,
      to: typeof h === 'string' ? null : h.to,
    }))
  );
  const [focusRowId, setFocusRowId] = useState<number | null>(null);

  const push = (next: HRow[]) => {
    setRows(next);
    onCommit(
      next
        .filter(r => r.from)
        .map(r => (r.to && r.to > r.from! ? { from: r.from!, to: r.to } : r.from!))
    );
  };

  const upd = (id: number, patch: Partial<HRow>) =>
    push(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const days = (r: HRow) =>
    r.from && r.to && r.to >= r.from
      ? Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1
      : 0;

  const addNewRow = () => {
    const newId = ++seq.current;
    push([...rows, { id: newId, from: null, to: null }]);
    setFocusRowId(newId);
  };

  const handleRowEnter = (index: number) => {
    if (index === rows.length - 1) {
      addNewRow();
    } else {
      setFocusRowId(rows[index + 1].id);
    }
  };

  return (
    <div className="hol">

      {rows.length === 0 && <small>لا توجد أجازات — اضغط «إضافة أجازة» أو استخدم «الإضافة السريعة».</small>}

      {rows.map((r, i) => (
        <div className="hol-row" key={r.id}>
          <div className="hol-head">
            <span className="no">{toArabic(String(i + 1))}</span>
            <span className="when">
              {r.from
                ? `${WEEKDAY(r.from)} ${formatDate(r.from)}${days(r) > 1 ? ` ← ${formatDate(r.to)} (${toArabic(String(days(r)))} أيام)` : ''}`
                : 'أجازة جديدة (اكتب اليوم والشهر واضغط Enter)'}
            </span>
            <button
              type="button"
              className="mini danger"
              onClick={() => push(rows.filter(x => x.id !== r.id))}
            >
              حذف
            </button>
          </div>
          <div className="hol-fields">
            <label>
              <small>من (اكتب اليوم والشهر فقط مثل 12-7 أو 6-10 واضغط Enter)</small>
              <DateInput
                value={r.from}
                ctx={ctx}
                placeholder="مثال: ٧-١ أو ٦-١٠"
                onCommit={d => upd(r.id, { from: d })}
                label={`أجازة ${i + 1} من`}
                onEnter={() => handleRowEnter(i)}
                inputRef={el => {
                  if (el && r.id === focusRowId) {
                    el.focus();
                    setFocusRowId(null);
                  }
                }}
              />
            </label>
            <label>
              <small>إلى (اختيارى — لأكثر من يوم)</small>
              <DateInput
                value={r.to}
                ctx={ctx}
                optional
                placeholder="فارغ = يوم واحد"
                onCommit={d => upd(r.id, { to: d })}
                label={`أجازة ${i + 1} إلى`}
                onEnter={() => handleRowEnter(i)}
              />
            </label>
          </div>
          {r.from && r.to && r.to < r.from && (
            <small className="warn">تاريخ النهاية قبل البداية — سيُحسب يوماً واحداً.</small>
          )}
        </div>
      ))}

      <div className="hol-actions">
        <button type="button" className="mini" onClick={addNewRow}>
          + إضافة أجازة
        </button>
      </div>
    </div>
  );
}

const MAIN_SUBJS: [keyof SubjectPcts, string][] = [
  ['tactics', 'تكتيك عام'],
  ['tech', 'تدريب فنى تخصصى'],
  ['shooting', 'رماية أ ص'],
  ['fitness', 'تربية بدنية'],
];

const GEN_SUBJS: [keyof SubjectPcts, string][] = [
  ['education', 'تعليم منضم'],
  ['discipline', 'انضباط عسكرى'],
  ['security', 'أمن حربى'],
  ['topography', 'طبوغرافيا'],
  ['morale', 'تدريب معنوي'],
  ['recon', 'سطع وعدو'],
  ['engineering', 'تدريب هندسى'],
  ['chemical', 'تدريب كيميائى'],
  ['admin', 'تدريب إدارى'],
  ['history', 'تاريخ عسكرى'],
  ['intlLaw', 'قانون دولى إنسانى'],
  ['infoWar', 'حرب المعلومات'],
];

const MANDATORY_KEYS: SubjectKey[] = ['fitness', 'education', 'security', 'shooting', 'infoWar'];

interface DeleteTarget {
  key: string;
  name: string;
  isCustom: boolean;
  isMandatory: boolean;
  category: 'main' | 'general';
  pct: number;
}

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
  const ctx: Ctx2 = {
    from: inst.startSaturday,
    to: addDays(inst.startSaturday, inst.totalWeeks * 7 - 1),
    yearLabel: inst.yearLabel,
    startSaturday: inst.startSaturday,
  };
  const set = <K extends keyof Instructions>(k: K, v: Instructions[K], key: string = k as string) => onChange({ ...inst, [k]: v }, key);

  const currentNightKeys = getNightKeys(inst);
  const toggleNight = (key: string) => {
    const isNight = currentNightKeys.includes(key);
    const nextNight = isNight ? currentNightKeys.filter(k => k !== key) : [...currentNightKeys, key];
    const nextCustom = (inst.customSubjects || []).map(s => (s.id === key ? { ...s, hasNight: !isNight } : s));
    onChange({ ...inst, nightKeys: nextNight, customSubjects: nextCustom }, 'pcts');
  };

  const addCustomSubject = (category: 'main' | 'general' = 'general') => {
    const newId = `custom_${Date.now()}`;
    const newSub: CustomSubject = {
      id: newId,
      name: '',
      category,
      pct: 2,
      hasNight: false,
    };
    const nextCustom = [...(inst.customSubjects || []), newSub];
    onChange({ ...inst, customSubjects: nextCustom }, 'pcts');
  };

  const updateCustomSubject = (id: string, patch: Partial<CustomSubject>) => {
    let nextNight = currentNightKeys;
    if ('hasNight' in patch) {
      if (patch.hasNight && !nextNight.includes(id)) {
        nextNight = [...nextNight, id];
      } else if (patch.hasNight === false) {
        nextNight = nextNight.filter(k => k !== id);
      }
    }
    const nextCustom = (inst.customSubjects || []).map(s => (s.id === id ? { ...s, ...patch } : s));
    onChange({ ...inst, customSubjects: nextCustom, nightKeys: nextNight }, 'pcts');
  };

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const disabledSet = new Set(inst.disabledSubjects || []);
  const visibleMain = MAIN_SUBJS.filter(([k]) => !disabledSet.has(k));
  const visibleGen = GEN_SUBJS.filter(([k]) => !disabledSet.has(k));
  const disabledMain = MAIN_SUBJS.filter(([k]) => disabledSet.has(k));
  const disabledGen = GEN_SUBJS.filter(([k]) => disabledSet.has(k));

  const removeCustomSubject = (id: string) => {
    const nextCustom = (inst.customSubjects || []).filter(s => s.id !== id);
    const nextNight = currentNightKeys.filter(k => k !== id);
    onChange({ ...inst, customSubjects: nextCustom, nightKeys: nextNight }, 'pcts');
  };

  const handleDeleteClick = (key: string, name: string, isCustom: boolean, category: 'main' | 'general', pct: number) => {
    const isMandatory = MANDATORY_KEYS.includes(key as SubjectKey);
    setDeleteTarget({ key, name, isCustom, isMandatory, category, pct });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.isMandatory) {
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.isCustom) {
      removeCustomSubject(deleteTarget.key);
    } else {
      const nextDisabled = Array.from(new Set([...(inst.disabledSubjects || []), deleteTarget.key]));
      const nextPct = { ...inst.pcts, [deleteTarget.key]: 0 };
      const nextNight = currentNightKeys.filter(k => k !== deleteTarget.key);
      onChange({
        ...inst,
        disabledSubjects: nextDisabled,
        pcts: nextPct,
        nightKeys: nextNight,
      }, 'pcts');
    }
    setDeleteTarget(null);
  };

  const handleRestoreSubject = (key: string) => {
    const nextDisabled = (inst.disabledSubjects || []).filter(k => k !== key);
    onChange({
      ...inst,
      disabledSubjects: nextDisabled,
    }, 'pcts');
  };

  const mainSubjectsSum = visibleMain.reduce((acc, [k]) => acc + (inst.pcts[k] || 0), 0)
    + (inst.customSubjects || []).filter(s => s.category === 'main').reduce((acc, s) => acc + (s.pct || 0), 0);
  const genSubjectsSum = visibleGen.reduce((acc, [k]) => acc + (inst.pcts[k] || 0), 0)
    + (inst.customSubjects || []).filter(s => s.category === 'general').reduce((acc, s) => acc + (s.pct || 0), 0);

  const totalSubjectsSum = mainSubjectsSum + genSubjectsSum;
  const targetMain = inst.pcts.mainPct;
  const targetGen = 100 - targetMain;

  const mainOk = mainSubjectsSum === targetMain;
  const genOk = genSubjectsSum === targetGen;
  const totalOk = totalSubjectsSum === 100;
  const allPctsOk = mainOk && genOk && totalOk;
  const canAccept = pending.length === 0 && allPctsOk;

  return (
    <FieldCtx.Provider value={{ conf, low, confirm: onConfirmField }}>
    <div className="panel">
      <div className="bar"><button className="btn ghost" onClick={onBack}>← رجوع</button><h2>مراجعة التعليمات</h2></div>
      {notes.length > 0 && <ul className="notes-list">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {pending.length > 0 && <p className="hint">عدّل الحقول المظللة أو اضغط «القيمة صحيحة» قبل الحساب.</p>}
      <div className="form">
        <Field k="courseName" label="الدورة / الوحدة" wide><input value={inst.courseName} onChange={e => set('courseName', e.target.value)} /></Field>
        <Field k="yearLabel" label="العام التدريبى"><input dir="rtl" inputMode="numeric" value={toArabic(inst.yearLabel ?? '')} placeholder="يُشتق من التواريخ" onChange={e => { const v = toLatin(e.target.value).replace(/[^0-9\s/\-–]/g, ''); set('yearLabel', v.trim() ? v : undefined); }} /></Field>
        <Field k="startSaturday" label="أول سبت في الفترة" hint="أدخل التاريخ (مثال: ٣/١/٢٠٢٦)">
          <DateInput value={inst.startSaturday} ctx={ctx} onCommit={d => d && set('startSaturday', d)} label="أول سبت في الفترة" />
          {dowOf(inst.startSaturday) !== 6 && <small className="warn">هذا اليوم {WEEKDAY(inst.startSaturday)} وليس سبتاً — راجع التاريخ.</small>}
        </Field>
        <Field k="totalWeeks" label="عدد الأسابيع"><NumInput value={inst.totalWeeks} min={1} max={60} onCommit={n => set('totalWeeks', n)} label="عدد الأسابيع" /></Field>
        <Field k="firstWeek" label="رقم أول أسبوع">
          <select
            className="maint-select"
            value={inst.firstWeek || 1}
            onChange={e => {
              const nextFirst = Number(e.target.value);
              const maxW = nextFirst + inst.totalWeeks - 1;
              const nextSel = inst.selectedWeek < nextFirst || inst.selectedWeek > maxW ? nextFirst : inst.selectedWeek;
              onChange({ ...inst, firstWeek: nextFirst, selectedWeek: nextSel }, 'firstWeek');
            }}
          >
            <option value={1}>١ — الفترة الأولى</option>
            <option value={27}>٢٧ — الفترة الثانية</option>
            {inst.firstWeek && inst.firstWeek !== 1 && inst.firstWeek !== 27 && (
              <option value={inst.firstWeek}>{toArabic(String(inst.firstWeek))}</option>
            )}
          </select>
        </Field>
        <Field k="prepWeeks" label="أسابيع الفترة التحضيرية"><WeekFieldsInput value={inst.prepWeeks} onCommit={v => set('prepWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="opsWeeks" label="أسابيع مهام العمليات"><WeekFieldsInput value={inst.opsWeeks} onCommit={v => set('opsWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="reserveWeeks" label="أسابيع الاحتياط"><WeekFieldsInput value={inst.reserveWeeks} onCommit={v => set('reserveWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="campWeeks" label="أسابيع المعسكر الليلى"><WeekFieldsInput value={inst.campWeeks} onCommit={v => set('campWeeks', v)} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} /></Field>
        <Field k="maintenanceDow" label="يوم الصيانة الأسبوعى" hint="اختر اليوم">
          <select className="maint-select" value={inst.maintenanceDow ?? 1} onChange={e => set('maintenanceDow', Number(e.target.value))}>
            <option value={1}>الإثنين</option>
            <option value={2}>الثلاثاء</option>
          </select>
        </Field>
        <Field k="ramadan" label="شهر رمضان (من / إلى)" hint="اتركهما فارغين إن لم يوجد">
          <div className="two">
            <div><small>من</small><DateInput value={inst.ramadan?.from} ctx={ctx} optional onCommit={d => set('ramadan', d ? { from: d, to: inst.ramadan?.to && inst.ramadan.to >= d ? inst.ramadan.to : d } : null, 'ramadan')} label="رمضان من" /></div>
            <div><small>إلى</small><DateInput value={inst.ramadan?.to} ctx={ctx} optional onCommit={d => set('ramadan', inst.ramadan ? { ...inst.ramadan, to: d ?? inst.ramadan.from } : d ? { from: d, to: d } : null, 'ramadan')} label="رمضان إلى" /></div>
          </div>
        </Field>
        <Field k="holidays" label="الأجازات الرسمية" wide hint="أدخل اليوم والشهر (مثال: ٧-١٢)">
          <HolidayList value={inst.holidays} ctx={ctx} onCommit={v => set('holidays', v)} />
        </Field>
        <Field k="weeksPerMonth" label="عدد أسابيع كل شهر" wide>
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
        <Field k="marchWeekOfMonth" label="أسبوع الشهر الذى يحمل يوم طابور السير" hint="رقم الأسبوع داخل الشهر (مثال: ٣)"><NumInput value={inst.marchWeekOfMonth} min={1} max={5} onCommit={n => set('marchWeekOfMonth', n)} label="أسبوع الشهر" /></Field>
        <Field k="marchWeekExceptions" label="شهور يختلف فيها أسبوع يوم طابور السير">
          <div className="exc">
            {Object.entries(inst.marchWeekExceptions).length === 0 && <small>لا توجد استثناءات</small>}
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
        <Field k="levelWeeks" label="أسابيع المستويات (فرد / طاقم / مركز)">
          <div className="three">
            {(['individual', 'crew', 'centre'] as const).map(l => (
              <NumInput key={l} value={inst.levelWeeks[l]} min={0} max={60} label={l === 'individual' ? 'فرد' : l === 'crew' ? 'طاقم' : 'مركز'} onCommit={n => set('levelWeeks', { ...inst.levelWeeks, [l]: n }, 'levelWeeks')} />
            ))}
          </div>
        </Field>
        <Field k="pcts" label="النسب المئوية للموضوعات والدراسة الليلية" wide>
          {/* Status banner - only shown when something is wrong */}
          {!allPctsOk && (
            <div className={`pct-status-banner ${totalSubjectsSum > 100 ? 'danger' : 'warn'}`}>
              <div className="pct-status-main">
                <span className="pct-status-icon">{totalSubjectsSum > 100 ? '⛔' : '⚠️'}</span>
                <div className="pct-status-text">
                  <b>
                    {totalSubjectsSum < 100
                      ? `مجموع النسب: ${toArabic(String(totalSubjectsSum))}% — متبقى ${toArabic(String(100 - totalSubjectsSum))}% للوصول إلى ١٠٠%`
                      : `مجموع النسب: ${toArabic(String(totalSubjectsSum))}% — تجاوز الحد الأقصى بزيادة ${toArabic(String(totalSubjectsSum - 100))}%`}
                  </b>
                  <small>
                    {!mainOk && `الرئيسية: ${toArabic(String(mainSubjectsSum))}% من ${toArabic(String(targetMain))}% (${mainSubjectsSum > targetMain ? '+' : ''}${toArabic(String(mainSubjectsSum - targetMain))}%)`}
                    {!mainOk && !genOk && ' • '}
                    {!genOk && `العامة: ${toArabic(String(genSubjectsSum))}% من ${toArabic(String(targetGen))}% (${genSubjectsSum > targetGen ? '+' : ''}${toArabic(String(genSubjectsSum - targetGen))}%)`}
                  </small>
                </div>
              </div>
            </div>
          )}

          {/* Main Subjects Group */}
          <div className="subj-group">
            <div className="subj-group-head">
              <div className="subj-group-title">
                <span>الموضوعات الرئيسية</span>
                <span
                  className={mainOk ? 'badge' : 'badge bad'}
                  title={mainOk ? 'مجموع نسب الموضوعات الرئيسية مطابق' : `مجموع الرئيسية ${mainSubjectsSum}% لا يطابق النسبة المحددة ${targetMain}%`}
                >
                  {toArabic(String(mainSubjectsSum))}% {mainOk ? '' : `(المطلوب ${toArabic(String(targetMain))}%)`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>إجمالى نسبة الرئيسية:</span>
                  <div style={{ width: '70px' }}>
                    <NumInput value={inst.pcts.mainPct} min={0} max={100} label="نسبة الموضوعات الرئيسية" onCommit={n => set('pcts', { ...inst.pcts, mainPct: n }, 'pcts')} />
                  </div>
                  <span>%</span>
                </label>
                {disabledMain.length > 0 && (
                  <select
                    className="restore-select"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) {
                        handleRestoreSubject(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    title="استعادة أحد الموضوعات الرئيسية التى تم حذفها"
                  >
                    <option value="" disabled>↩ استعادة موضوع رئيسى ({toArabic(String(disabledMain.length))})</option>
                    {disabledMain.map(([k, name]) => (
                      <option key={k} value={k}>استعادة «{name}»</option>
                    ))}
                  </select>
                )}
                <button type="button" className="mini" onClick={() => addCustomSubject('main')}>
                  + إضافة موضوع رئيسى
                </button>
              </div>
            </div>
            <div className="subj-grid">
              {visibleMain.map(([k, l]) => {
                const isNight = currentNightKeys.includes(k);
                const isMandatory = MANDATORY_KEYS.includes(k);
                return (
                  <div className="subj-card" key={k}>
                    <div className="subj-head">
                      <span className="subj-name" title={l}>{l}</span>
                      <div className="subj-head-actions">
                        <button
                          type="button"
                          className={`night-badge-btn ${isNight ? 'is-night' : ''}`}
                          onClick={() => toggleNight(k)}
                          title={isNight ? 'موضوع له تدريب ليلى (اضغط للإلغاء)' : 'موضوع نهارى فقط (اضغط لتفعيل التدريب الليلى)'}
                        >
                          {isNight ? '🌙 دراسة ليلية' : '☀️ نهارى'}
                        </button>
                        <button
                          type="button"
                          className={`subj-delete-btn ${isMandatory ? 'is-mandatory' : ''}`}
                          onClick={() => handleDeleteClick(k, l, false, 'main', inst.pcts[k])}
                          title={isMandatory ? 'موضوع أساسى إلزامى' : `حذف موضوع «${l}»`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="subj-input-row">
                      <span className="subj-pct-label">النسبة:</span>
                      <div className="pct-input-wrap">
                        <NumInput value={inst.pcts[k]} min={0} max={100} label={l} onCommit={n => set('pcts', { ...inst.pcts, [k]: n }, 'pcts')} />
                        <span className="pct-sign">%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(inst.customSubjects || []).filter(s => s.category === 'main').map(s => (
                <div className="subj-card custom" key={s.id}>
                  <div className="subj-head">
                    <input
                      type="text"
                      className="custom-name-input"
                      placeholder="اسم الموضوع..."
                      value={s.name}
                      onChange={e => updateCustomSubject(s.id, { name: e.target.value })}
                      dir="rtl"
                    />
                    <button
                      type="button"
                      className="subj-delete-btn"
                      onClick={() => handleDeleteClick(s.id, s.name || 'موضوع مخصص', true, 'main', s.pct)}
                      title={`حذف موضوع «${s.name || 'موضوع مخصص'}»`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="subj-options-row">
                    <select
                      className="cat-select"
                      value={s.category}
                      onChange={e => updateCustomSubject(s.id, { category: e.target.value as 'main' | 'general' })}
                    >
                      <option value="main">رئيسية</option>
                      <option value="general">عامة</option>
                    </select>
                    <button
                      type="button"
                      className={`night-badge-btn ${s.hasNight ? 'is-night' : ''}`}
                      onClick={() => updateCustomSubject(s.id, { hasNight: !s.hasNight })}
                      title={s.hasNight ? 'موضوع له تدريب ليلى' : 'نهارى فقط'}
                    >
                      {s.hasNight ? '🌙 دراسة ليلية' : '☀️ نهارى'}
                    </button>
                  </div>
                  <div className="subj-input-row">
                    <span className="subj-pct-label">النسبة:</span>
                    <div className="pct-input-wrap">
                      <NumInput value={s.pct} min={0} max={100} label={s.name || 'النسبة'} onCommit={n => updateCustomSubject(s.id, { pct: n })} />
                      <span className="pct-sign">%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* General Subjects Group */}
          <div className="subj-group">
            <div className="subj-group-head">
              <div className="subj-group-title">
                <span>الموضوعات العامة</span>
                <span
                  className={genOk ? 'badge' : 'badge bad'}
                  title={genOk ? 'مجموع نسب الموضوعات العامة مطابق' : `مجموع العامة ${genSubjectsSum}% لا يطابق النسبة المحددة ${targetGen}%`}
                >
                  {toArabic(String(genSubjectsSum))}% {genOk ? '' : `(المطلوب ${toArabic(String(targetGen))}%)`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {disabledGen.length > 0 && (
                  <select
                    className="restore-select"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) {
                        handleRestoreSubject(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    title="استعادة أحد الموضوعات العامة التى تم حذفها"
                  >
                    <option value="" disabled>↩ استعادة موضوع عام ({toArabic(String(disabledGen.length))})</option>
                    {disabledGen.map(([k, name]) => (
                      <option key={k} value={k}>استعادة «{name}»</option>
                    ))}
                  </select>
                )}
                <button type="button" className="mini" onClick={() => addCustomSubject('general')}>
                  + إضافة موضوع عام
                </button>
              </div>
            </div>
            <div className="subj-grid">
              {visibleGen.map(([k, l]) => {
                const isNight = currentNightKeys.includes(k);
                const isMandatory = MANDATORY_KEYS.includes(k);
                return (
                  <div className="subj-card" key={k}>
                    <div className="subj-head">
                      <span className="subj-name" title={l}>{l}</span>
                      <div className="subj-head-actions">
                        <button
                          type="button"
                          className={`night-badge-btn ${isNight ? 'is-night' : ''}`}
                          onClick={() => toggleNight(k)}
                          title={isNight ? 'موضوع له تدريب ليلى (اضغط للإلغاء)' : 'موضوع نهارى فقط (اضغط لتفعيل التدريب الليلى)'}
                        >
                          {isNight ? '🌙 دراسة ليلية' : '☀️ نهارى'}
                        </button>
                        <button
                          type="button"
                          className={`subj-delete-btn ${isMandatory ? 'is-mandatory' : ''}`}
                          onClick={() => handleDeleteClick(k, l, false, 'general', inst.pcts[k])}
                          title={isMandatory ? 'موضوع أساسى إلزامى' : `حذف موضوع «${l}»`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="subj-input-row">
                      <span className="subj-pct-label">النسبة:</span>
                      <div className="pct-input-wrap">
                        <NumInput value={inst.pcts[k]} min={0} max={100} label={l} onCommit={n => set('pcts', { ...inst.pcts, [k]: n }, 'pcts')} />
                        <span className="pct-sign">%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(inst.customSubjects || []).filter(s => s.category === 'general').map(s => (
                <div className="subj-card custom" key={s.id}>
                  <div className="subj-head">
                    <input
                      type="text"
                      className="custom-name-input"
                      placeholder="اسم الموضوع..."
                      value={s.name}
                      onChange={e => updateCustomSubject(s.id, { name: e.target.value })}
                      dir="rtl"
                    />
                    <button
                      type="button"
                      className="subj-delete-btn"
                      onClick={() => handleDeleteClick(s.id, s.name || 'موضوع مخصص', true, 'general', s.pct)}
                      title={`حذف موضوع «${s.name || 'موضوع مخصص'}»`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="subj-options-row">
                    <select
                      className="cat-select"
                      value={s.category}
                      onChange={e => updateCustomSubject(s.id, { category: e.target.value as 'main' | 'general' })}
                    >
                      <option value="main">رئيسية</option>
                      <option value="general">عامة</option>
                    </select>
                    <button
                      type="button"
                      className={`night-badge-btn ${s.hasNight ? 'is-night' : ''}`}
                      onClick={() => updateCustomSubject(s.id, { hasNight: !s.hasNight })}
                      title={s.hasNight ? 'موضوع له تدريب ليلى' : 'نهارى فقط'}
                    >
                      {s.hasNight ? '🌙 دراسة ليلية' : '☀️ نهارى'}
                    </button>
                  </div>
                  <div className="subj-input-row">
                    <span className="subj-pct-label">النسبة:</span>
                    <div className="pct-input-wrap">
                      <NumInput value={s.pct} min={0} max={100} label={s.name || 'النسبة'} onCommit={n => updateCustomSubject(s.id, { pct: n })} />
                      <span className="pct-sign">%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Field>
        <Field k="selectedMonth" label="شهر جدول الربط التفصيلى">
          <select value={inst.selectedMonth} onChange={e => set('selectedMonth', +e.target.value)}>{names.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
        </Field>
        <Field k="selectedWeek" label="أسبوع المستخرج"><NumInput value={inst.selectedWeek} min={inst.firstWeek} max={inst.firstWeek + inst.totalWeeks - 1} onCommit={n => set('selectedWeek', n)} label="أسبوع المستخرج" /></Field>
      </div>
      {rawText && (
        <details className="raw">
          <summary>النص الذى قرأه التعرف الضوئى (للمقارنة بالصورة الأصلية)</summary>
          <pre dir="rtl">{rawText}</pre>
        </details>
      )}
      <div className="sticky">
        <button
          className="btn primary big"
          disabled={!canAccept}
          onClick={canAccept ? onAccept : undefined}
          title={!canAccept ? (!allPctsOk ? 'يجب أن يكون مجموع النسب ١٠٠% لتفعيل الحساب' : 'يجب تأكيد الحقول أولاً') : undefined}
        >
          {pending.length > 0
            ? `أكّد ${toArabic(String(pending.length))} حقل أولاً`
            : !allPctsOk
              ? totalSubjectsSum !== 100
                ? `⚠️ لا يمكن الحساب — إجمالى النسب ${toArabic(String(totalSubjectsSum))}% (يجب أن يكون ١٠٠%)`
                : !mainOk
                  ? `⚠️ لا يمكن الحساب — نسب الرئيسية ${toArabic(String(mainSubjectsSum))}% لا تطابق ${toArabic(String(targetMain))}%`
                  : `⚠️ لا يمكن الحساب — نسب العامة ${toArabic(String(genSubjectsSum))}% لا تطابق ${toArabic(String(targetGen))}%`
              : 'تأكيد التعليمات وحساب الأجندة'}
        </button>
        {pending.length > 0 && (
          <button type="button" className="btn ghost big" onClick={() => pending.forEach(onConfirmField)}>
            راجعتُ كل الحقول المظللة وهى صحيحة — أكّد الكل
          </button>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-head-title">
                <span className="modal-icon warn">{deleteTarget.isMandatory ? 'ℹ️' : '⚠️'}</span>
                <h3>{deleteTarget.isMandatory ? 'موضوع أساسى إلزامى' : 'تحذير قبل حذف الموضوع'}</h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              {deleteTarget.isMandatory ? (
                <div>
                  <p style={{ fontSize: '1rem', lineHeight: '1.7', margin: '0 0 10px' }}>
                    لا يمكن حذف موضوع <strong>«{deleteTarget.name}»</strong> لأنه أحد الموضوعات الأساسية للمنظومة
                    المرتبطة بـ {deleteTarget.key === 'fitness' ? 'ساعات الأجندة اليومية والتربية البدنية الصباحية'
                      : (deleteTarget.key === 'education' || deleteTarget.key === 'security') ? 'ساعات الأجندة وقيود الفردية والزوجية للموضوعات العامة'
                      : 'معادلات الموازنة الحسابية لضمان تطابق إجمالى الساعات والنسب'}.
                  </p>
                  <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: 0 }}>
                    💡 يمكنك تعديل النسبة المئوية للموضوع، لكن لا يمكن حذفه نهائياً من هيكل الدورة.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '1.05rem', lineHeight: '1.6', margin: '0 0 12px' }}>
                    هل أنت متأكد من رغبتك فى حذف موضوع <strong>«{deleteTarget.name}»</strong>؟
                  </p>
                  <ul style={{ margin: '0 0 14px', paddingRight: '20px', lineHeight: '1.8', fontSize: '.9rem', color: 'var(--muted)' }}>
                    <li>سيتم استبعاد هذا الموضوع تماماً من جدول ربط الساعات وكافة جداول الدورة التدريبية.</li>
                    <li>سيتم تصفير نسبته الحالية ({toArabic(String(deleteTarget.pct))}%) لتصبح (٠%).</li>
                    <li>سيتعين عليك موازنة باقى النسب للوصول إلى ١٠٠%.</li>
                  </ul>
                  {!deleteTarget.isCustom && (
                    <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '8px', padding: '8px 12px', fontSize: '.85rem', color: '#fde047' }}>
                      ↩ ملاحظة: يمكنك دائماً استعادة هذا الموضوع لاحقاً عبر زر «استعادة موضوع محذوف» فى رأس المجموعة.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-actions">
              {deleteTarget.isMandatory ? (
                <button type="button" className="btn primary" onClick={() => setDeleteTarget(null)}>
                  فهمت ذلك
                </button>
              ) : (
                <>
                  <button type="button" className="btn danger-btn" onClick={handleConfirmDelete}>
                    🗑️ نعم، احذف الموضوع
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setDeleteTarget(null)}>
                    إلغاء
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </FieldCtx.Provider>
  );
}
