import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CustomSubject, DateRange, Instructions, SubjectKey, SubjectPcts } from '../engine/types';
import { getNightKeys } from '../engine/types';
import { LOW } from '../parser/parse';
import { DAYS_AR, addDays, dowOf, monthNames, weeksByCalendar } from '../engine/dates';
import { formatDate, parseList, parseNum, toArabic, toLatin, type DateCtx } from './parseInput';
import { ArabicDatePicker } from './ArabicDatePicker';

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

/** digits (either kind) and the separators a list needs — letters and symbols are dropped as they are typed */
const keepList = (s: string) => s.replace(/[^0-9٠-٩۰-۹\s,،;؛\-–—/.]/g, '');

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

/** Arabic RTL calendar date picker working directly with ISO YYYY-MM-DD strings */
function DateInput({
  value,
  onCommit,
  ctx,
  optional,
  label,
  inputRef,
}: {
  value: string | null | undefined;
  onCommit: (iso: string | null) => void;
  ctx?: Ctx2;
  optional?: boolean;
  placeholder?: string;
  label?: string;
  onEnter?: () => void;
  inputRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <ArabicDatePicker
      value={value}
      onCommit={onCommit}
      optional={optional}
      label={label}
      defaultMonthIso={ctx?.startSaturday || ctx?.from}
      triggerRef={inputRef}
    />
  );
}

/** Controlled training-year pair: enter first 4-digit year (e.g. 2025) and auto-compute next year (2026) in a disabled field separated by / */
function TrainingYearInput({
  value,
  onCommit,
}: {
  value: string | undefined;
  onCommit: (v: string | undefined) => void;
}) {
  const extractFirstYear = (raw?: string): string => {
    if (!raw) return '';
    const first = toLatin(raw).split(/\s*[/\-–]\s*/)[0] ?? '';
    return first.replace(/[^0-9]/g, '').slice(0, 4);
  };

  const [y1, setY1] = useState(() => extractFirstYear(value));

  useEffect(() => {
    setY1(extractFirstYear(value));
  }, [value]);

  const y2 = y1.length === 4 ? String(Number(y1) + 1) : '';

  return (
    <div className="year-pair" dir="rtl">
      <input
        dir="ltr"
        inputMode="numeric"
        maxLength={4}
        placeholder="٢٠٢٥"
        aria-label="السنة الأولى"
        value={toArabic(y1)}
        onChange={e => {
          const digits = toLatin(e.target.value).replace(/[^0-9]/g, '').slice(0, 4);
          setY1(digits);
          if (!digits) {
            onCommit(undefined);
          } else if (digits.length === 4) {
            const nextYear = String(Number(digits) + 1);
            onCommit(`${digits} / ${nextYear}`);
          } else {
            onCommit(digits);
          }
        }}
      />
      <span className="year-sep" aria-hidden="true">/</span>
      <input
        dir="ltr"
        disabled
        tabIndex={-1}
        placeholder="٢٠٢٦"
        aria-label="السنة الثانية (تلقائى)"
        value={toArabic(y2)}
      />
    </div>
  );
}

/** Individual numeric input boxes for week lists (2 boxes by default + "+ إضافة أسبوع" button) */
function WeekFieldsInput({
  value,
  onCommit,
  min,
  max,
  periodLabel,
  defaultCount = 2,
}: {
  value: number[];
  onCommit: (v: number[]) => void;
  min?: number;
  max?: number;
  periodLabel?: string;
  defaultCount?: number;
}) {
  const makeInitial = (vals: number[]) => {
    const arr = vals.map(n => toArabic(String(n)));
    while (arr.length < defaultCount) arr.push('');
    return arr;
  };
  const [slots, setSlots] = useState<string[]>(() => makeInitial(value));
  const sig = value.join(',');
  const prevSig = useRef(sig);

  useEffect(() => {
    if (prevSig.current !== sig) {
      prevSig.current = sig;
      setSlots(makeInitial(value));
    }
  }, [sig]);

  const isOutOfRange = (n: number | null) =>
    n !== null && ((min !== undefined && n < min) || (max !== undefined && n > max));

  const outOfRangeNums = Array.from(
    new Set(
      slots
        .map(s => parseNum(s))
        .filter((n): n is number => isOutOfRange(n)),
    ),
  ).sort((a, b) => a - b);

  const commit = (nextSlots: string[]) => {
    const nums: number[] = [];
    for (const s of nextSlots) {
      const n = parseNum(s);
      if (n !== null && !nums.includes(n)) nums.push(n);
    }
    nums.sort((a, b) => a - b);
    prevSig.current = nums.join(',');
    onCommit(nums);
  };

  return (
    <div className="week-fields">
      <div className={`week-fields-grid ${slots.length === 1 ? 'is-single' : ''}`.trim()}>
        {slots.map((val, idx) => {
          const invalid = isOutOfRange(parseNum(val));
          return (
            <div key={idx} className="week-field-item">
              <input
                dir="rtl"
                inputMode="numeric"
                placeholder="رقم الأسبوع"
                className={invalid ? 'is-invalid' : undefined}
                aria-invalid={invalid || undefined}
                value={val}
                onChange={e => {
                  const cleaned = toArabic(toLatin(e.target.value).replace(/[^0-9]/g, ''));
                  const next = slots.map((s, i) => (i === idx ? cleaned : s));
                  setSlots(next);
                  commit(next);
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
          );
        })}
      </div>
      <button
        type="button"
        className="mini"
        onClick={() => setSlots(s => [...s, ''])}
      >
        + إضافة أسبوع
      </button>
      {outOfRangeNums.length > 0 && (
        <small className="week-err" role="alert">
          ⚠️ الأسبوع ({outOfRangeNums.map(n => toArabic(String(n))).join('، ')}) خارج نطاق الفترة {periodLabel ?? ''} ({toArabic(String(min ?? ''))} إلى {toArabic(String(max ?? ''))}) — يرجى إدخال رقم ضمن نطاق الفترة.
        </small>
      )}
    </div>
  );
}

interface HRow { id: number; from: string | null; to: string | null }
/** official holidays: one row per holiday, "from" and an optional "to" for several days */
function HolidayList({
  value,
  onCommit,
  ctx,
  yearRange,
}: {
  value: (string | DateRange)[];
  onCommit: (v: (string | DateRange)[]) => void;
  ctx: Ctx2;
  yearRange?: [number, number];
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

      {rows.length === 0 && <small>لا توجد أجازات — اضغط «إضافة أجازة».</small>}

      {rows.map((r, i) => (
        <div className="hol-row" key={r.id}>
          <div className="hol-head">
            <span className="no">{toArabic(String(i + 1))}</span>
            <span className="when">
              {r.from
                ? `${WEEKDAY(r.from)} ${formatDate(r.from)}${days(r) > 1 ? ` ← ${formatDate(r.to)} (${toArabic(String(days(r)))} أيام)` : ''}`
                : 'أجازة جديدة'}
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
              <small>من</small>
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
          {yearRange && (() => {
            const badFrom = r.from && /^\d{4}-/.test(r.from) && (+r.from.slice(0, 4) < yearRange[0] || +r.from.slice(0, 4) > yearRange[1]);
            const badTo = r.to && /^\d{4}-/.test(r.to) && (+r.to.slice(0, 4) < yearRange[0] || +r.to.slice(0, 4) > yearRange[1]);
            if (!badFrom && !badTo) return null;
            return (
              <small className="week-err" role="alert">
                ⚠️ تاريخ الأجازة خارج نطاق العام التدريبى ({toArabic(String(yearRange[0]))} / {toArabic(String(yearRange[1]))}) — يرجى اختيار تاريخ ضمن العام التدريبى.
              </small>
            );
          })()}
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
function Field({ k, label, children, wide, span2, invalid, hint }: { k: string; label: string; children: ReactNode; wide?: boolean; span2?: boolean; invalid?: boolean; hint?: string }) {
  const { conf, low, confirm } = useContext(FieldCtx);
  const c = conf[k];
  const isLow = low(k);
  return (
    <div className={'fld' + (isLow ? ' low' : '') + (wide ? ' wide' : '') + (span2 ? ' span2' : '') + (invalid ? ' is-invalid' : '')}>
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
  const hasStart = /^\d{4}-\d{2}-\d{2}$/.test(inst.startSaturday);
  const names = useMemo(
    () =>
      hasStart
        ? monthNames(inst.startSaturday, inst.weeksPerMonth.length)
        : Array.from({ length: inst.weeksPerMonth.length }, (_, i) => `الشهر ${toArabic(String(i + 1))}`),
    [hasStart, inst.startSaturday, inst.weeksPerMonth],
  );
  const low = (k: string) => (conf[k] ?? 1) < LOW && !confirmed.has(k);
  const pending = Object.keys(conf).filter(low);
  const parsedYearsForCtx = (toLatin(inst.yearLabel ?? '').match(/\d{4}/g) ?? []).map(Number);
  const ctx: Ctx2 = {
    from: hasStart ? inst.startSaturday : (parsedYearsForCtx[0] ? `${parsedYearsForCtx[0]}-01-01` : undefined),
    to: hasStart ? addDays(inst.startSaturday, inst.totalWeeks * 7 - 1) : undefined,
    yearLabel: inst.yearLabel,
    startSaturday: hasStart ? inst.startSaturday : undefined,
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

  const [triedSubmit, setTriedSubmit] = useState(false);
  const [showSubmitToast, setShowSubmitToast] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const periodNum = inst.period ?? (inst.firstWeek >= 53 ? 3 : inst.firstWeek >= 27 ? 2 : 1);
  const periodName = periodNum === 3 ? 'الثالثة' : periodNum === 2 ? 'الثانية' : 'الأولى';
  const periodMinWeek = inst.firstWeek;
  const periodMaxWeek = inst.firstWeek + inst.totalWeeks - 1;

  const parsedYears = (toLatin(inst.yearLabel ?? '').match(/\d{4}/g) ?? []).map(Number);
  const tyStart = parsedYears[0] ?? null;
  const tyEnd = parsedYears[1] ?? (tyStart !== null ? tyStart + 1 : null);
  const tyRange: [number, number] | undefined = tyStart !== null && tyEnd !== null ? [tyStart, tyEnd] : undefined;
  const tyLabelAr = tyRange ? `${toArabic(String(tyRange[0]))} / ${toArabic(String(tyRange[1]))}` : '';
  const yearOfIso = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Number(iso.slice(0, 4)) : null);
  const inTrainingYear = (iso: string | null | undefined, allowWeekEnd = false) => {
    if (!tyRange) return true;
    const y = yearOfIso(iso);
    if (y === null) return true;
    if (y >= tyRange[0] && y <= tyRange[1]) return true;
    if (allowWeekEnd && iso) {
      const endY = yearOfIso(addDays(iso, 6));
      if (endY !== null && endY >= tyRange[0] && endY <= tyRange[1]) return true;
    }
    return false;
  };

  const startSatOutOfYear = Boolean(inst.startSaturday) && !inTrainingYear(inst.startSaturday, true);
  const ramadanOutOfYear = Boolean(inst.ramadan) && (!inTrainingYear(inst.ramadan!.from) || !inTrainingYear(inst.ramadan!.to));
  const holidaysOutOfYear = inst.holidays.some(h =>
    typeof h === 'string' ? !inTrainingYear(h) : (!inTrainingYear(h.from) || !inTrainingYear(h.to)),
  );
  const badDateCards = [
    startSatOutOfYear ? 'تاريخ أول سبت في الفترة' : null,
    ramadanOutOfYear ? 'شهر رمضان' : null,
    holidaysOutOfYear ? 'الأجازات الرسمية' : null,
  ].filter((x): x is string => x !== null);
  const allDatesOk = badDateCards.length === 0;

  const missingCourseName = !inst.courseName.trim();
  const missingYearLabel = tyStart === null;
  const missingStartSat = !hasStart;
  const missingPrepWeeks = inst.prepWeeks.length === 0;
  const missingOpsWeeks = inst.opsWeeks.length === 0;
  const missingReserveWeeks = inst.reserveWeeks.length === 0;
  const missingCampWeeks = inst.campWeeks.length === 0;
  const missingMarchSec = names.some(
    (_, m) => (inst.marchSecurityByMonth[m]?.[0] ?? 0) + (inst.marchSecurityByMonth[m]?.[1] ?? 0) === 0,
  );
  const weeksPerMonthSum = inst.weeksPerMonth.reduce((a, b) => a + b, 0);
  const badWeeksPerMonthSum = weeksPerMonthSum !== inst.totalWeeks;
  const missingFields = [
    missingCourseName ? 'الدورة / الوحدة' : null,
    missingYearLabel ? 'العام التدريبى' : null,
    missingStartSat ? 'تاريخ أول سبت في الفترة' : null,
    missingPrepWeeks ? 'أسابيع الفترة التحضيرية' : null,
    missingOpsWeeks ? 'أسابيع مهام العمليات' : null,
    missingReserveWeeks ? 'أسابيع الاحتياط' : null,
    missingCampWeeks ? 'أسابيع المعسكر الليلى' : null,
    missingMarchSec ? 'طابور السير + الأمن الحربى لكل شهر' : null,
    badWeeksPerMonthSum ? `عدد أسابيع كل شهر (المجموع الحالى ${toArabic(String(weeksPerMonthSum))} ويجب أن يساوى ${toArabic(String(inst.totalWeeks))})` : null,
  ].filter((x): x is string => x !== null);

  const badWeekCards = [
    { label: 'أسابيع الفترة التحضيرية', bad: inst.prepWeeks.filter(w => w < periodMinWeek || w > periodMaxWeek) },
    { label: 'أسابيع مهام العمليات', bad: inst.opsWeeks.filter(w => w < periodMinWeek || w > periodMaxWeek) },
    { label: 'أسابيع الاحتياط', bad: inst.reserveWeeks.filter(w => w < periodMinWeek || w > periodMaxWeek) },
    { label: 'أسابيع المعسكر الليلى', bad: inst.campWeeks.filter(w => w < periodMinWeek || w > periodMaxWeek) },
  ].filter(c => c.bad.length > 0);
  const allWeeksOk = badWeekCards.length === 0;

  const mainOk = mainSubjectsSum === targetMain;
  const genOk = genSubjectsSum === targetGen;
  const totalOk = totalSubjectsSum === 100;
  const allPctsOk = mainOk && genOk && totalOk;
  const liveValid = pending.length === 0 && allPctsOk && allWeeksOk && allDatesOk;
  const canAccept = liveValid && missingFields.length === 0;

  const handleConfirmClick = () => {
    if (!canAccept) {
      setTriedSubmit(true);
      setShowSubmitToast(true);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setShowSubmitToast(false), 3000);
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector<HTMLElement>('.fld.is-invalid');
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    onAccept();
  };

  return (
    <FieldCtx.Provider value={{ conf, low, confirm: onConfirmField }}>
    <div className="panel">
      <div className="bar"><h2>مراجعة التعليمات</h2><button className="btn ghost" onClick={onBack}>رجوع ←</button></div>
      {notes.length > 0 && <ul className="notes-list">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {pending.length > 0 && <p className="hint">عدّل الحقول المظللة أو اضغط «القيمة صحيحة» قبل الحساب.</p>}
      <div className="form">
        <Field k="courseName" label="الدورة / الوحدة" wide invalid={triedSubmit && missingCourseName}>
          <input value={inst.courseName} placeholder="مثال: الدورة المتقدمة رقم (١١١) — الكتيبة الأولى" onChange={e => set('courseName', e.target.value)} />
          {triedSubmit && missingCourseName && <small className="week-err" role="alert">⚠️ يرجى إدخال اسم الدورة / الوحدة.</small>}
        </Field>
        <Field k="yearLabel" label="العام التدريبى" invalid={triedSubmit && missingYearLabel}>
          <TrainingYearInput value={inst.yearLabel} onCommit={v => set('yearLabel', v)} />
          {triedSubmit && missingYearLabel && <small className="week-err" role="alert">⚠️ يرجى إدخال العام التدريبى (مثال: ٢٠٢٥).</small>}
        </Field>
        <Field k="firstWeek" label="الفترة التدريبية" hint={`نطاق الأسابيع: من ${periodMinWeek} إلى ${periodMaxWeek}`}>
          <select
            className="maint-select"
            value={periodNum}
            onChange={e => {
              const period = Number(e.target.value) as 1 | 2 | 3;
              const nextFirst = period === 3 ? 53 : period === 2 ? 27 : 1;
              const maxW = nextFirst + inst.totalWeeks - 1;
              const nextSel = inst.selectedWeek < nextFirst || inst.selectedWeek > maxW ? nextFirst : inst.selectedWeek;
              onChange({ ...inst, period, firstWeek: nextFirst, selectedWeek: nextSel }, 'firstWeek');
            }}
          >
            <option value={1}>الأولى</option>
            <option value={2}>الثانية</option>
            <option value={3}>الثالثة</option>
          </select>
        </Field>
        <Field k="totalWeeks" label="عدد أسابيع الفترة"><NumInput value={inst.totalWeeks} min={1} max={60} onCommit={n => set('totalWeeks', n)} label="عدد أسابيع الفترة" /></Field>
        <Field k="startSaturday" label="تاريخ أول سبت في الفترة" invalid={startSatOutOfYear || (triedSubmit && missingStartSat)}>
          <DateInput value={inst.startSaturday} ctx={ctx} onCommit={d => d && set('startSaturday', d)} label="تاريخ أول سبت في الفترة" />
          {hasStart && dowOf(inst.startSaturday) !== 6 && <small className="warn">هذا اليوم {WEEKDAY(inst.startSaturday)} وليس سبتاً — راجع التاريخ.</small>}
          {startSatOutOfYear && (
            <small className="week-err" role="alert">
              ⚠️ تاريخ أول سبت خارج نطاق العام التدريبى ({tyLabelAr}) — يرجى اختيار تاريخ ضمن العام التدريبى.
            </small>
          )}
          {triedSubmit && missingStartSat && <small className="week-err" role="alert">⚠️ يرجى اختيار تاريخ أول سبت فى الفترة.</small>}
        </Field>
        <Field k="prepWeeks" label="أسابيع الفترة التحضيرية" invalid={triedSubmit && missingPrepWeeks}>
          <WeekFieldsInput value={inst.prepWeeks} onCommit={v => set('prepWeeks', v)} min={periodMinWeek} max={periodMaxWeek} periodLabel={periodName} />
          {triedSubmit && missingPrepWeeks && <small className="week-err" role="alert">⚠️ يرجى إدخال أسابيع الفترة التحضيرية.</small>}
        </Field>
        <Field k="opsWeeks" label="أسابيع مهام العمليات" invalid={triedSubmit && missingOpsWeeks}>
          <WeekFieldsInput value={inst.opsWeeks} onCommit={v => set('opsWeeks', v)} min={periodMinWeek} max={periodMaxWeek} periodLabel={periodName} defaultCount={1} />
          {triedSubmit && missingOpsWeeks && <small className="week-err" role="alert">⚠️ يرجى إدخال أسابيع مهام العمليات.</small>}
        </Field>
        <Field k="reserveWeeks" label="أسابيع الاحتياط" invalid={triedSubmit && missingReserveWeeks}>
          <WeekFieldsInput value={inst.reserveWeeks} onCommit={v => set('reserveWeeks', v)} min={periodMinWeek} max={periodMaxWeek} periodLabel={periodName} defaultCount={1} />
          {triedSubmit && missingReserveWeeks && <small className="week-err" role="alert">⚠️ يرجى إدخال أسابيع الاحتياط.</small>}
        </Field>
        <Field k="campWeeks" label="أسابيع المعسكر الليلى" invalid={triedSubmit && missingCampWeeks}>
          <WeekFieldsInput value={inst.campWeeks} onCommit={v => set('campWeeks', v)} min={periodMinWeek} max={periodMaxWeek} periodLabel={periodName} />
          {triedSubmit && missingCampWeeks && <small className="week-err" role="alert">⚠️ يرجى إدخال أسابيع المعسكر الليلى.</small>}
        </Field>
        <Field k="maintenanceDow" label="يوم الصيانة الأسبوعى" hint="اختر اليوم">
          <select className="maint-select" value={inst.maintenanceDow ?? 1} onChange={e => set('maintenanceDow', Number(e.target.value))}>
            <option value={1}>الإثنين</option>
            <option value={2}>الثلاثاء</option>
          </select>
        </Field>
        <Field k="ramadan" label="شهر رمضان (من / إلى)" hint="اتركهما فارغين إن لم يوجد" span2 invalid={ramadanOutOfYear}>
          <div className="two">
            <div><small>من</small><DateInput value={inst.ramadan?.from} ctx={ctx} optional onCommit={d => set('ramadan', d ? { from: d, to: inst.ramadan?.to && inst.ramadan.to >= d ? inst.ramadan.to : d } : null, 'ramadan')} label="رمضان من" /></div>
            <div><small>إلى</small><DateInput value={inst.ramadan?.to} ctx={ctx} optional onCommit={d => set('ramadan', inst.ramadan ? { ...inst.ramadan, to: d ?? inst.ramadan.from } : d ? { from: d, to: d } : null, 'ramadan')} label="رمضان إلى" /></div>
          </div>
          {ramadanOutOfYear && (
            <small className="week-err" role="alert">
              ⚠️ تواريخ شهر رمضان خارج نطاق العام التدريبى ({tyLabelAr}) — يرجى اختيار تواريخ ضمن العام التدريبى.
            </small>
          )}
        </Field>
        <Field k="holidays" label="الأجازات الرسمية" wide invalid={holidaysOutOfYear}>
          <HolidayList value={inst.holidays} ctx={ctx} yearRange={tyRange} onCommit={v => set('holidays', v)} />
        </Field>
        <Field k="weeksPerMonth" label="عدد أسابيع كل شهر" wide invalid={triedSubmit && badWeeksPerMonthSum}>
          <div className="two">
            <ListInput value={inst.weeksPerMonth} onCommit={v => set('weeksPerMonth', v)} sorted={false} />
            <button type="button" className="mini" disabled={!hasStart} onClick={() => hasStart && set('weeksPerMonth', weeksByCalendar(inst.startSaturday, inst.totalWeeks))}>حسب التقويم</button>
          </div>
          <small>{names.map((n, i) => `${n}: ${inst.weeksPerMonth[i]}`).join(' · ')} — المجموع {weeksPerMonthSum}</small>
          {triedSubmit && badWeeksPerMonthSum && (
            <small className="week-err" role="alert">
              ⚠️ مجموع أسابيع الشهور ({toArabic(String(weeksPerMonthSum))}) لا يساوى عدد أسابيع الفترة ({toArabic(String(inst.totalWeeks))}) — اضغط «حسب التقويم» أو عدّل القيم.
            </small>
          )}
        </Field>
        <Field k="marchSecurityByMonth" label="طابور السير + الأمن الحربى لكل شهر" wide invalid={triedSubmit && missingMarchSec}>
          <table className="mini-table"><thead><tr><th>الشهر</th><th>طابور سير</th><th>أمن حربى</th></tr></thead>
            <tbody>{names.map((n, m) => (
              <tr key={m}><td>{n}</td>
                {[0, 1].map(j => (
                  <td key={j}><NumInput value={inst.marchSecurityByMonth[m]?.[j] ?? 0} min={0} max={7} label={`${names[m]} ${j ? 'أمن حربى' : 'طابور سير'}`}
                    onCommit={n => { const a = inst.marchSecurityByMonth.map(p => [...p] as [number, number]); while (a.length <= m) a.push([0, 0]); a[m][j] = n; set('marchSecurityByMonth', a); }} /></td>
                ))}
              </tr>))}</tbody></table>
          {triedSubmit && missingMarchSec && (
            <small className="week-err" role="alert">
              ⚠️ يرجى إدخال ساعات طابور السير والأمن الحربى لجميع شهور الفترة.
            </small>
          )}
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
      </div>
      {rawText && (
        <details className="raw">
          <summary>النص الذى قرأه التعرف الضوئى (للمقارنة بالصورة الأصلية)</summary>
          <pre dir="rtl">{rawText}</pre>
        </details>
      )}
      <div className="sticky">
        {showSubmitToast && missingFields.length > 0 && (
          <div className="submit-err-box" role="alert">
            <b>⚠️ يرجى استكمال الحقول المطلوبة قبل الحساب</b>
          </div>
        )}
        <button
          className="btn primary big"
          disabled={!liveValid}
          onClick={handleConfirmClick}
          title={
            !liveValid
              ? !allDatesOk
                ? `توجد تواريخ خارج العام التدريبى (${tyLabelAr})`
                : !allWeeksOk
                  ? `يجب أن تكون جميع الأسابيع ضمن نطاق الفترة ${periodName} (${toArabic(String(periodMinWeek))} إلى ${toArabic(String(periodMaxWeek))})`
                  : !allPctsOk
                    ? 'يجب أن يكون مجموع النسب ١٠٠% لتفعيل الحساب'
                    : 'يجب تأكيد الحقول أولاً'
              : undefined
          }
        >
          {pending.length > 0
            ? `أكّد ${toArabic(String(pending.length))} حقل أولاً`
            : !allDatesOk
              ? `⚠️ لا يمكن الحساب — توجد تواريخ خارج العام التدريبى (${tyLabelAr}) فى: ${badDateCards.join('، ')}`
              : !allWeeksOk
                ? `⚠️ لا يمكن الحساب — توجد أسابيع خارج نطاق الفترة ${periodName} (${toArabic(String(periodMinWeek))}–${toArabic(String(periodMaxWeek))}) فى: ${badWeekCards.map(c => c.label).join('، ')}`
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
