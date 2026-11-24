import { useEffect, useRef, useState, type Ref } from 'react';
import { DAYS_AR, MONTHS_AR, dowOf, parseDate } from '../engine/dates';
import { formatDate, toArabic } from './parseInput';

const WEEKDAYS_SAT_FIRST = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];
// Maps JS getUTCDay() (0=Sun..6=Sat) to column index 0..6 where 0=Sat
const dowToCol = (dow: number) => (dow + 1) % 7;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

interface Props {
  value: string | null | undefined;
  onCommit: (iso: string | null) => void;
  optional?: boolean;
  label?: string;
  defaultMonthIso?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}

export function ArabicDatePicker({ value, onCommit, optional, label, defaultMonthIso, triggerRef }: Props) {
  const isoVal = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const initRefIso = isoVal || defaultMonthIso || new Date().toISOString().slice(0, 10);
  const initDate = parseDate(initRefIso);
  const [viewYear, setViewYear] = useState(() => initDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(() => initDate.getUTCMonth());

  useEffect(() => {
    if (!open) return;
    const refIso = isoVal || defaultMonthIso || new Date().toISOString().slice(0, 10);
    const d = parseDate(refIso);
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  }, [open, isoVal, defaultMonthIso]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const leadingBlanks = dowToCol(firstOfMonth.getUTCDay());
  const todayIso = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  };

  const baseYear = Math.min(viewYear, new Date().getFullYear()) - 3;
  const years = Array.from({ length: 15 }, (_, i) => baseYear + i);

  const displayLabel = isoVal
    ? `${DAYS_AR[dowOf(isoVal)]} ${formatDate(isoVal)}`
    : 'اختر التاريخ';

  return (
    <div className="ar-dp" ref={wrapRef} dir="rtl">
      <div className="ar-dp-row">
        <button
          ref={triggerRef}
          type="button"
          className={`ar-dp-trigger ${isoVal ? '' : 'is-empty'}`}
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span>{displayLabel}</span>
          <span className="ar-dp-icon" aria-hidden="true">📅</span>
        </button>
        {optional && isoVal && (
          <button
            type="button"
            className="date-clear-btn"
            aria-label="مسح التاريخ"
            title="مسح التاريخ"
            onClick={() => {
              onCommit(null);
              setOpen(false);
            }}
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="ar-dp-pop" role="dialog" aria-label={label || 'التقويم'}>
          <div className="ar-dp-head">
            <button type="button" className="ar-dp-nav" onClick={() => shiftMonth(-1)} aria-label="الشهر السابق">
              ›
            </button>
            <div className="ar-dp-ym">
              <select
                aria-label="الشهر"
                value={viewMonth}
                onChange={e => setViewMonth(Number(e.target.value))}
              >
                {MONTHS_AR.map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>
              <select
                aria-label="السنة"
                value={viewYear}
                onChange={e => setViewYear(Number(e.target.value))}
              >
                {years.map(y => (
                  <option key={y} value={y}>{toArabic(String(y))}</option>
                ))}
              </select>
            </div>
            <button type="button" className="ar-dp-nav" onClick={() => shiftMonth(1)} aria-label="الشهر التالى">
              ‹
            </button>
          </div>

          <div className="ar-dp-weekdays">
            {WEEKDAYS_SAT_FIRST.map((wd, i) => (
              <span key={wd} className={i === 0 ? 'is-sat' : undefined}>{wd}</span>
            ))}
          </div>

          <div className="ar-dp-grid">
            {cells.map((day, idx) => {
              if (day === null) return <span key={`b-${idx}`} className="ar-dp-blank" />;
              const cellIso = toIso(viewYear, viewMonth, day);
              const isSelected = cellIso === isoVal;
              const isToday = cellIso === todayIso;
              const isSat = idx % 7 === 0;
              return (
                <button
                  key={cellIso}
                  type="button"
                  className={`ar-dp-day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${isSat ? 'is-sat' : ''}`.trim()}
                  onClick={() => {
                    onCommit(cellIso);
                    setOpen(false);
                  }}
                >
                  {toArabic(String(day))}
                </button>
              );
            })}
          </div>

          <div className="ar-dp-foot">
            <button
              type="button"
              className="ar-dp-foot-btn"
              onClick={() => {
                onCommit(todayIso);
                setOpen(false);
              }}
            >
              اليوم
            </button>
            {optional && (
              <button
                type="button"
                className="ar-dp-foot-btn danger"
                onClick={() => {
                  onCommit(null);
                  setOpen(false);
                }}
              >
                مسح
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
