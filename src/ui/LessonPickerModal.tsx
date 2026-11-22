import { useEffect, useState } from 'react';
import type { CourseLessonSchedule } from '../engine/lessonScheduler';
import { getLessonsForPicker } from '../engine/lessonScheduler';
import type { ProgramSlot } from '../export/programDocx';
import { ar } from './format';

interface Props {
  week: number;
  dayName: string;
  slot: ProgramSlot;
  schedule: CourseLessonSchedule | null;
  onSelect: (lessonId: string) => void;
  onResetDefault: () => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<'completed' | 'in-progress' | 'next' | 'upcoming', string> = {
  'in-progress': 'قيد الاستكمال',
  next: 'الافتراضى التالى',
  completed: 'تم تدريسه',
  upcoming: 'قادم',
};

export function LessonPickerModal({
  week,
  dayName,
  slot,
  schedule,
  onSelect,
  onResetDefault,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!slot.subjectKey) return null;

  const items = getLessonsForPicker(schedule, week, slot.subjectKey, slot.isNight);
  const q = query.trim();
  const filtered = q
    ? items.filter(it => it.lesson.title.includes(q) || String(it.lesson.order) === q)
    : items;

  return (
    <div className="modal-backdrop no-print" dir="rtl" onClick={onClose}>
      <div className="modal-card lesson-modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-title">
            <h3>دروس مادة: {slot.subject}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>

        <div className="modal-body lesson-modal-body">
          <div className="lesson-slot-meta">
            <span>{dayName}</span>
            <span>·</span>
            <span>{ar(slot.tabour)}</span>
            <span>·</span>
            <span className={slot.isNight ? 'meta-night' : 'meta-day'}>
              {slot.isNight ? 'تدريب ليلى' : 'تدريب نهارى'} ({ar(slot.durationHours ?? 2)} س)
            </span>
          </div>

          <input
            type="search"
            className="lesson-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن اسم الدرس أو رقمه..."
            autoFocus
          />

          <div className="lesson-picker-list">
            {filtered.map(item => {
              const { lesson, status, phaseCompatible } = item;
              const isCurrent = slot.primaryLessonId === lesson.id;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  className={`lesson-opt ${isCurrent ? 'is-selected' : ''} ${!phaseCompatible ? 'is-phase-mismatch' : ''}`}
                  onClick={() => onSelect(lesson.id)}
                >
                  <div className="lesson-opt-top">
                    <span className="lesson-opt-title">
                      <b>{ar(lesson.order)}.</b> {lesson.title}
                    </span>
                    <span className={`lesson-badge st-${status}`}>{STATUS_LABEL[status]}</span>
                  </div>
                  <div className="lesson-opt-meta">
                    <span>الإجمالى: {ar(lesson.totalHours)} س</span>
                    <span>نهارى: {ar(lesson.dayHours)} س</span>
                    <span className={lesson.nightHours > 0 ? 'has-night' : ''}>ليلى: {ar(lesson.nightHours)} س</span>
                    <span>نظري: {ar(lesson.theoryHours)}</span>
                    <span>عملي: {ar(lesson.practicalHours)}</span>
                    {!phaseCompatible && (
                      <span className="mismatch-tag">
                        ⚠ {slot.isNight ? 'نهارى فقط' : 'ليلى فقط'}
                      </span>
                    )}
                  </div>
                  {lesson.reference && <div className="lesson-opt-ref">المرجع: {lesson.reference}</div>}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="hint" style={{ textAlign: 'center' }}>لا توجد دروس مطابقة</p>}
          </div>
        </div>

        <div className="modal-actions">
          {slot.isManualLesson && (
            <button type="button" className="btn ghost" onClick={onResetDefault}>
              إعادة للترتيب التلقائى (الافتراضى)
            </button>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            تم
          </button>
        </div>
      </div>
    </div>
  );
}
