import { useEffect, useRef } from 'react';
import type { Audit } from '../engine/audit';
import { ar } from './format';

/** bottom sheet: rule → numbers → equation → check mark, revealed step by step */
export function Inspector({ audit, onClose }: { audit: Audit | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!audit) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [audit, onClose]);
  if (!audit) return null;
  let i = 0;
  const d = () => ({ style: { animationDelay: `${i++ * 140}ms` } });
  return (
    <div className="insp-back" onClick={onClose}>
      <div className="insp" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={audit.title} onClick={e => e.stopPropagation()} key={audit.title + audit.equation}>
        <div className="grab" />
        <h3 className="step" {...d()}>{ar(audit.title)}</h3>
        <section className="step" {...d()}><small>القاعدة</small><p>{ar(audit.rule)}</p></section>
        <section className="step" {...d()}>
          <small>الأرقام</small>
          <ul>{audit.steps.map((s, j) => <li key={j}><span>{ar(s.label)}</span><b>{ar(s.value)}</b></li>)}</ul>
        </section>
        <section className="step eq" {...d()}><small>المعادلة</small><p dir="ltr">{audit.equation}</p></section>
        <section className={'step res ' + (audit.ok ? 'ok' : 'bad')} {...d()}>
          <span className="tick">{audit.ok ? '✔' : '✘'}</span><b>{ar(audit.result)}</b>
        </section>
        <button className="btn ghost" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}
