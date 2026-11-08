import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Instructions } from './engine/types';
import { calculateAgenda } from './engine/agenda';
import { calculateDistribution } from './engine/distribution';
import { calculateLinking } from './engine/linking';
import { calculateWeekly } from './engine/weekly';
import { FIXTURE_108, FIXTURE_111 } from './engine/fixtures';
import { emptyInstructions } from './engine/instructions';
import { monthNames } from './engine/dates';
import { parseInstructions } from './parser/parse';
import { extractText } from './parser/extract';
import { importJson, listProjects, removeProject, saveProject, type Project } from './db/database';
import { exportPdf } from './export/pdf';
import { exportWord } from './export/word';
import { Review } from './ui/Review';
import { Inspector } from './ui/Inspector';
import { AgendaSheet, DistributionSheet, LinkingSheet, WeeklySheet } from './ui/Sheets';
import { ExportPages, type Model } from './ui/ExportPages';
import type { Audit } from './engine/audit';
import { ar } from './ui/format';

type View = 'upload' | 'review' | 'results';
type Tab = 'agenda' | 'dist' | 'link' | 'week';
const TABS: [Tab, string][] = [['agenda', 'الأجندة'], ['dist', 'التوزيع'], ['link', 'جدول الربط'], ['week', 'المستخرج الأسبوعى']];

/** scales the 1123px paper to the screen width (never below 0.6, then it scrolls) */
function Paper({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(1);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const f = () => setZ(Math.max(0.6, Math.min(1.25, (el.clientWidth - 2) / 1123)));
    f();
    const ro = new ResizeObserver(f); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div className="paper-scroll" ref={box}><div className="paper on-screen" style={{ zoom: z }}>{children}</div></div>;
}

/** crypto.randomUUID needs iOS 15.4+ and https; fall back so an older phone never crashes */
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export default function App() {
  const [view, setView] = useState<View>('upload');
  const [tab, setTab] = useState<Tab>('agenda');
  const [inst, setInst] = useState<Instructions>(emptyInstructions());
  const [conf, setConf] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<string[]>([]);
  const [rawText, setRawText] = useState('');
  const [queue, setQueue] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<Audit | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>(() => uid());
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const online = useOnline();

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [exportMenuOpen]);

  const refresh = useCallback(() => { listProjects().then(setProjects).catch(() => setProjects([])); }, []);
  useEffect(refresh, [refresh]);

  const model = useMemo<Model | null>(() => {
    if (view !== 'results') return null;
    try {
      const agenda = calculateAgenda(inst);
      const dist = calculateDistribution(inst, agenda);
      const link = calculateLinking(inst, agenda, dist);
      return { inst, agenda, dist, link, ex: calculateWeekly(agenda, link, inst.selectedWeek, inst) };
    } catch (e) { console.error(e); return null; }
  }, [inst, view]);

  /** photos are collected first (instructions usually span several pages); documents start reading at once */
  function onPick(files: File[]) {
    setError('');
    if (files.every(f => f.type.startsWith('image/'))) setQueue(q => [...q, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))]);
    else onFiles(files);
  }
  function startQueue() {
    const files = queue.map(q => q.file);
    queue.forEach(q => URL.revokeObjectURL(q.url));
    setQueue([]);
    onFiles(files);
  }
  function moveQ(i: number, d: -1 | 1) {
    setQueue(q => { const a = [...q]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  }
  function dropQ(i: number) {
    setQueue(q => { URL.revokeObjectURL(q[i].url); return q.filter((_, k) => k !== i); });
  }
  async function onFiles(files: File[]) {
    setError(''); setBusy({ label: 'جارى قراءة الملف…', p: 0 });
    try {
      const x = await extractText(files, p => setBusy({ label: 'التعرف الضوئى على النص العربى…', p }));
      const r = parseInstructions(x.text, x.source === 'docx' || x.source === 'txt' || x.source === 'pdf' ? x.confidence : Math.max(0.6, x.confidence));
      setInst(r.instructions); setConf(r.conf); setNotes([...(x.errors?.length ? [`تعذّرت قراءة بعض الصفحات على هذا الجهاز: ${x.errors.join(' — ')}`] : []), ...r.notes]); setRawText(x.source === 'docx' || x.source === 'txt' ? '' : x.text); setConfirmed(new Set());
      setPid(uid()); setView('review');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  function open(i: Instructions, id?: string) {
    setInst(i); setConf({}); setNotes([]); setRawText(''); setConfirmed(new Set()); setPid(id ?? uid()); setView('review');
  }
  async function accept() {
    await saveProject({ id: pid, name: inst.courseName || 'مشروع بدون اسم', instructions: inst, updatedAt: Date.now() }).catch(() => {});
    refresh(); setView('results'); setTab('agenda');
  }
  async function doExportPdf() {
    if (!model) return;
    setExportMenuOpen(false);
    setExporting(true);
    try { await exportPdf(model); } catch (e) { setError(String(e)); } finally { setExporting(false); }
  }
  async function doExportWord() {
    if (!model) return;
    setExportMenuOpen(false);
    setExporting(true);
    try { await exportWord(model); } catch (e) { setError(String(e)); } finally { setExporting(false); }
  }
  async function importFile(f: File) {
    try { open(importJson(await f.text())); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const monthLabel = useMemo(() => monthNames(inst.startSaturday, inst.weeksPerMonth.length)[inst.selectedMonth] ?? '', [inst]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="star">★</span><div><h1>منظومة أجندة التدريب القتالى</h1><small>تعمل بدون إنترنت {online ? '' : '· غير متصل'}</small></div></div>
        {view !== 'upload' && <button className="btn ghost" onClick={() => setView('upload')}>الرئيسية</button>}
      </header>

      {view === 'upload' && (
        <main className="panel">
          <label className="drop">
            <input type="file" multiple accept=".docx,.pdf,image/*,.txt" hidden onChange={e => { const fs = [...(e.target.files ?? [])]; if (fs.length) onPick(fs); e.target.value = ''; }} />
            <div className="big">⬆</div>
            <b>ارفع صفحة التعليمات</b>
            <span>DOCX أو PDF، أو صور (اختر عدة صور إن كانت التعليمات أكثر من صفحة) — تُعالَج على جهازك فقط</span>
          </label>
          <label className="btn ghost cam">📷 التقاط صفحة بالكاميرا
            <input type="file" accept="image/*" capture="environment" hidden onChange={e => { const fs = [...(e.target.files ?? [])]; if (fs.length) onPick(fs); e.target.value = ''; }} />
          </label>
          {queue.length > 0 && (
            <section className="tray" aria-label="صفحات التعليمات">
              <h3>صفحات التعليمات ({queue.length}) — بالترتيب</h3>
              <p className="hint">أضف باقى الصفحات بنفس الطريقة (رفع صور أو كاميرا)، ورتّبها ثم اضغط «قراءة».</p>
              <ol>
                {queue.map((q, i) => (
                  <li key={q.url}>
                    <img src={q.url} alt={`صفحة ${i + 1}`} />
                    <span className="no">{i + 1}</span>
                    <div className="ctl">
                      <button type="button" className="mini" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label="قبل">▲</button>
                      <button type="button" className="mini" onClick={() => moveQ(i, 1)} disabled={i === queue.length - 1} aria-label="بعد">▼</button>
                      <button type="button" className="mini danger" onClick={() => dropQ(i)} aria-label="حذف">✕</button>
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn primary big" onClick={startQueue} disabled={!!busy}>قراءة التعليمات من {queue.length === 1 ? 'الصورة' : queue.length === 2 ? 'الصفحتين' : queue.length <= 10 ? `${queue.length} صفحات` : `${queue.length} صفحة`}</button>
            </section>
          )}
          {busy && <div className="busy"><span>{busy.label}</span><progress value={busy.p || undefined} max={1} /></div>}
          {error && <div className="err" role="alert">{error}</div>}
          <div className="row">
            <button className="btn" onClick={() => open(FIXTURE_108)}>نموذج الدورة 108</button>
            <button className="btn" onClick={() => open(FIXTURE_111)}>نموذج الدورة 111</button>
            <label className="btn ghost">استيراد JSON<input type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} /></label>
            <button className="btn ghost" onClick={() => open(emptyInstructions())}>إدخال يدوى</button>
          </div>
          <h2>المشروعات المحفوظة</h2>
          {projects.length === 0 ? <p className="hint">لا توجد مشروعات محفوظة بعد.</p> : (
            <ul className="projects">
              {projects.map(p => (
                <li key={p.id}>
                  <button className="lnk" onClick={() => { open(p.instructions, p.id); }}>{p.name}<small>{new Date(p.updatedAt).toLocaleString('ar-EG')}</small></button>
                  <button className="mini danger" onClick={async () => { await removeProject(p.id); refresh(); }}>حذف</button>
                </li>
              ))}
            </ul>
          )}
        </main>
      )}

      {view === 'review' && (
        <Review inst={inst} conf={conf} confirmed={confirmed} notes={notes} rawText={rawText}
          onChange={(i, k) => { setInst(i); setConfirmed(s => new Set(s).add(k)); }}
          onConfirmField={k => setConfirmed(s => new Set(s).add(k))}
          onAccept={accept} onBack={() => setView('upload')} />
      )}

      {view === 'results' && (
        <main className="results">
          <nav className="tabs" role="tablist">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </nav>
          <div className="actions">
            <div className="export-dropdown" ref={exportRef}>
              <button
                className="btn primary"
                onClick={() => setExportMenuOpen(o => !o)}
                disabled={exporting || !model}
                aria-expanded={exportMenuOpen}
              >
                {exporting ? 'جارى التصدير…' : 'تصدير ▾'}
              </button>
              {exportMenuOpen && (
                <div className="export-menu">
                  <button type="button" className="export-item" onClick={doExportPdf}>
                    <span className="icon">📄</span>
                    <div>
                      <b>تصدير PDF</b>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: '.75rem' }}>مستند PDF للعرض والطباعة</small>
                    </div>
                  </button>
                  <button type="button" className="export-item" onClick={doExportWord}>
                    <span className="icon">📝</span>
                    <div>
                      <b>تصدير Word</b>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: '.75rem' }}>مستند وورد قابل للتعديل (.doc)</small>
                    </div>
                  </button>
                </div>
              )}
            </div>
            <button className="btn" onClick={() => window.print()}>طباعة</button>
            <button className="btn ghost" onClick={() => setView('review')}>تعديل التعليمات</button>
            {tab === 'link' && (
              <label className="sel">شهر التفصيل <select value={inst.selectedMonth} onChange={e => setInst({ ...inst, selectedMonth: +e.target.value })}>
                {monthNames(inst.startSaturday, inst.weeksPerMonth.length).map((n, i) => <option key={i} value={i}>{n}</option>)}</select></label>
            )}
            {tab === 'week' && (
              <label className="sel">الأسبوع <select value={inst.selectedWeek} onChange={e => setInst({ ...inst, selectedWeek: +e.target.value })}>
                {Array.from({ length: inst.totalWeeks }, (_, i) => i + inst.firstWeek).map(w => <option key={w} value={w}>{ar(w)}</option>)}</select></label>
            )}
          </div>
          {error && <div className="err" role="alert">{error}</div>}
          {!model ? <p className="err">تعذّر الحساب — راجع التعليمات.</p> : (
            <>
              <div className="strip">
                <span>الإجمالى <b>{ar(model.agenda.total)}</b></span><span>نهارى <b>{ar(model.agenda.day)}</b></span><span>ليلى <b className="red">{ar(model.agenda.night)}</b></span>
                <span>لياقة <b>{ar(model.agenda.fitness)}</b></span><span>تعليم منضم <b>{ar(model.agenda.education)}</b></span><span>أمن حربى <b>{ar(model.agenda.security)}</b></span>
                <span className={model.agenda.checks.ok && model.dist.checks.ok && model.link.checks.ok ? 'good' : 'bad'}>
                  {model.agenda.checks.ok && model.dist.checks.ok && model.link.checks.ok ? '✔ كل الفحوص سليمة' : '✘ توجد فحوص غير مطابقة'}</span>
                {tab === 'link' && <span>التفصيل: {monthLabel}</span>}
              </div>
              <p className="hint">اضغط أى رقم لعرض خطوات حسابه.</p>
              {tab === 'agenda' && <Paper><AgendaSheet inst={inst} agenda={model.agenda} onInspect={setAudit} /></Paper>}
              {tab === 'dist' && <Paper><DistributionSheet inst={inst} agenda={model.agenda} dist={model.dist} onInspect={setAudit} /></Paper>}
              {tab === 'link' && <Paper><LinkingSheet inst={inst} agenda={model.agenda} dist={model.dist} link={model.link} onInspect={setAudit} /></Paper>}
              {tab === 'week' && <Paper><WeeklySheet inst={inst} ex={model.ex} onInspect={setAudit} /></Paper>}
              <div className="print-root"><ExportPages m={model} /></div>
            </>
          )}
        </main>
      )}
      <Inspector audit={audit} onClose={() => setAudit(null)} />
    </div>
  );
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true); const b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}
