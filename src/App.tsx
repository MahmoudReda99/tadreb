import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Instructions, WeeklyExtract } from './engine/types';
import { calculateAgenda } from './engine/agenda';
import { calculateDistribution } from './engine/distribution';
import { calculateLinking } from './engine/linking';
import { calculateWeekly } from './engine/weekly';
import { FIXTURE_108, FIXTURE_111 } from './engine/fixtures';
import { emptyInstructions } from './engine/instructions';
import { monthNames } from './engine/dates';
import { listProjects, removeProject, saveProject, type Project } from './db/database';
import { exportPdf } from './export/pdf';
import { Review } from './ui/Review';
import { Inspector } from './ui/Inspector';
import { AgendaSheet, DistributionSheet, LinkingSheet, MonthDetailSheet, WeeklySheet, TrainingProgramSheet } from './ui/Sheets';
import { ExportPages, type Model } from './ui/ExportPages';
import { downloadMonthProgramsDocx, downloadProgramDocx } from './export/programDocx';
import type { Audit } from './engine/audit';
import { ar } from './ui/format';

type View = 'upload' | 'review' | 'results';
type Tab = 'agenda' | 'dist' | 'link' | 'month' | 'week' | 'program';
const TABS: [Tab, string][] = [
  ['agenda', 'الأجندة'],
  ['dist', 'التوزيع'],
  ['link', 'جدول الربط'],
  ['month', 'تفصيل الشهر'],
  ['week', 'المستخرج الأسبوعى'],
  ['program', 'برنامج التدريب الأسبوعى'],
];

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
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<Audit | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>(() => uid());
  const [exporting, setExporting] = useState(false);
  const online = useOnline();

  const refresh = useCallback(() => { listProjects().then(setProjects).catch(() => setProjects([])); }, []);
  useEffect(refresh, [refresh]);

  const model = useMemo<Model | null>(() => {
    if (view !== 'results') return null;
    try {
      const agenda = calculateAgenda(inst);
      const dist = calculateDistribution(inst, agenda);
      const link = calculateLinking(inst, agenda, dist);
      const sm = Math.min(inst.selectedMonth, Math.max(0, link.weeks.length - 1));
      const weekNums = link.weeks[sm]?.weekNumbers ?? [];
      const monthExtracts = weekNums
        .map(w => calculateWeekly(agenda, link, w, inst))
        .filter((x): x is WeeklyExtract => x !== null);
      return { inst, agenda, dist, link, ex: calculateWeekly(agenda, link, inst.selectedWeek, inst), monthExtracts };
    } catch (e) { console.error(e); return null; }
  }, [inst, view]);

  function open(i: Instructions, id?: string) {
    const names = monthNames(i.startSaturday, i.weeksPerMonth.length);
    const janIdx = names.indexOf('يناير');
    const next = id ? i : { ...i, selectedMonth: janIdx >= 0 ? janIdx : 0 };
    setInst(next); setConf({}); setNotes([]); setRawText(''); setConfirmed(new Set()); setPid(id ?? uid()); setView('review');
  }
  async function accept() {
    await saveProject({ id: pid, name: inst.courseName || 'مشروع بدون اسم', instructions: inst, updatedAt: Date.now() }).catch(() => {});
    refresh(); setView('results'); setTab('agenda');
  }
  function updateInstResults(next: Instructions) {
    setInst(next);
    saveProject({ id: pid, name: next.courseName || 'مشروع بدون اسم', instructions: next, updatedAt: Date.now() }).catch(() => {});
  }
  async function doExport() {
    if (!model) return;
    setExporting(true);
    try { await exportPdf(model); } catch (e) { setError(String(e)); } finally { setExporting(false); }
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
          <button type="button" className="enter-inst-cta" onClick={() => open(emptyInstructions())}>
            <span className="enter-inst-icon" aria-hidden="true">✎</span>
            <span className="enter-inst-text">
              <b>إدخال التعليمات</b>
              <small>إعداد دورة تدريبية جديدة وإدخال بيانات وتوجيهات التدريب</small>
            </span>
            <span className="enter-inst-arrow" aria-hidden="true">←</span>
          </button>

          {error && <div className="err" role="alert">{error}</div>}

          <div className="row samples-row">
            <button className="btn" onClick={() => open(FIXTURE_108)}>نموذج الدورة 108</button>
            <button className="btn" onClick={() => open(FIXTURE_111)}>نموذج الدورة 111</button>
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
          <div className="tabs-bar">
            <nav className="tabs" role="tablist">
              {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
            </nav>
            <div className="tabs-export">
              <button className="btn primary" onClick={doExport} disabled={exporting || !model}>{exporting ? 'جارى التصدير…' : 'تصدير PDF'}</button>
              <button className="btn" onClick={() => window.print()}>طباعة</button>
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-edit-inst" onClick={() => setView('review')}>✎ تعديل التعليمات</button>
            {(tab === 'month' || tab === 'week' || tab === 'program') && (
              <label className="sel">
                شهر التفصيل
                <select value={inst.selectedMonth} onChange={e => setInst({ ...inst, selectedMonth: +e.target.value })}>
                  {monthNames(inst.startSaturday, inst.weeksPerMonth.length).map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
                {model && <span className="month-weeks-pill">{ar(model.monthExtracts.length)} أسابيع</span>}
              </label>
            )}
            {tab === 'program' && model && (model.monthExtracts.length > 0 || model.ex) && (
              <button
                className="btn"
                onClick={() =>
                  model.monthExtracts.length > 0
                    ? downloadMonthProgramsDocx(inst, model.monthExtracts, monthLabel, model.agenda, model.link)
                    : downloadProgramDocx(inst, model.ex!, model.agenda, model.link)
                }
              >
                تحميل Word 
              </button>
            )}
          </div>
          {error && <div className="err" role="alert">{error}</div>}
          {!model ? <p className="err">تعذّر الحساب — راجع التعليمات.</p> : (
            <>
              {tab === 'agenda' && (
                <div className="strip">
                  <span>الإجمالى <b>{ar(model.agenda.total)}</b></span><span>نهارى <b>{ar(model.agenda.day)}</b></span><span>ليلى <b className="red">{ar(model.agenda.night)}</b></span>
                  <span>لياقة <b>{ar(model.agenda.fitness)}</b></span><span>تعليم منضم <b>{ar(model.agenda.education)}</b></span><span>أمن حربى <b>{ar(model.agenda.security)}</b></span>
                  {!(model.agenda.checks.ok && model.dist.checks.ok && model.link.checks.ok) && (
                    <span className="bad">✘ توجد فحوص غير مطابقة</span>
                  )}
                </div>
              )}
              {tab !== 'agenda' && !(model.agenda.checks.ok && model.dist.checks.ok && model.link.checks.ok) && (
                <div className="err" role="alert">✘ توجد فحوص غير مطابقة — راجع التعليمات أو الأجندة.</div>
              )}
              <div className="results-tip" role="note">
                <span className="results-tip-icon" aria-hidden="true">💡</span>
                <span>{tab === 'program' ? 'اضغط على اسم الدرس بجانب أى موضوع لاختيار درس آخر من المنهج.' : 'اضغط على أى رقم داخل الجدول لعرض خطوات حسابه بالتفصيل.'}</span>
              </div>
              {tab === 'agenda' && <Paper><AgendaSheet inst={inst} agenda={model.agenda} onInspect={setAudit} /></Paper>}
              {tab === 'dist' && <Paper><DistributionSheet inst={inst} agenda={model.agenda} dist={model.dist} onInspect={setAudit} /></Paper>}
              {tab === 'link' && <Paper><LinkingSheet inst={inst} agenda={model.agenda} dist={model.dist} link={model.link} onInspect={setAudit} /></Paper>}
              {tab === 'month' && <Paper><MonthDetailSheet inst={inst} agenda={model.agenda} dist={model.dist} link={model.link} onInspect={setAudit} /></Paper>}
              {tab === 'week' && (
                <div className="weekly-stack">
                  {model.monthExtracts.length > 0 ? (
                    model.monthExtracts.map(wex => (
                      <Paper key={wex.week}><WeeklySheet inst={inst} ex={wex} onInspect={setAudit} /></Paper>
                    ))
                  ) : (
                    <Paper><WeeklySheet inst={inst} ex={model.ex} onInspect={setAudit} /></Paper>
                  )}
                </div>
              )}
              {tab === 'program' && (
                <div className="weekly-stack">
                  {model.monthExtracts.length > 0 ? (
                    model.monthExtracts.map(wex => (
                      <Paper key={`prog-${wex.week}`}>
                        <TrainingProgramSheet
                          inst={inst}
                          ex={wex}
                          agenda={model.agenda}
                          link={model.link}
                          onInspect={setAudit}
                          onUpdateInst={updateInstResults}
                        />
                      </Paper>
                    ))
                  ) : (
                    <Paper>
                      <TrainingProgramSheet
                        inst={inst}
                        ex={model.ex}
                        agenda={model.agenda}
                        link={model.link}
                        onInspect={setAudit}
                        onUpdateInst={updateInstResults}
                      />
                    </Paper>
                  )}
                </div>
              )}
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
