import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Instructions, WeeklyExtract } from './engine/types';
import { calculateAgenda } from './engine/agenda';
import { calculateDistribution } from './engine/distribution';
import { calculateLinking } from './engine/linking';
import { calculateWeekly } from './engine/weekly';
import { FIXTURE_108, FIXTURE_111 } from './engine/fixtures';
import { emptyInstructions } from './engine/instructions';
import { monthNames } from './engine/dates';
import { clearProjects, listProjects, removeProject, saveProject, type Project } from './db/database';
import { exportPdf } from './export/pdf';
import { Review } from './ui/Review';
import { Inspector } from './ui/Inspector';
import { AgendaSheet, DistributionSheet, LinkingSheet, MonthDetailSheet, WeeklySheet, TrainingProgramSheet } from './ui/Sheets';
import { ExportPages, type Model } from './ui/ExportPages';
import { downloadFullDocx } from './export/fullDocx';
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [showMonthInLink, setShowMonthInLink] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('tadreeb-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('tadreeb-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

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
      return { inst, agenda, dist, link, ex: calculateWeekly(agenda, link, inst.selectedWeek, inst), monthExtracts, showMonthInLink };
    } catch (e) { console.error(e); return null; }
  }, [inst, view, showMonthInLink]);

  function open(i: Instructions, id?: string) {
    const hasStart = /^\d{4}-\d{2}-\d{2}$/.test(i.startSaturday);
    const names = hasStart ? monthNames(i.startSaturday, i.weeksPerMonth.length) : [];
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
  async function doExportWord() {
    if (!model) return;
    setExporting(true);
    try { await downloadFullDocx(model); } catch (e) { setError(String(e)); } finally { setExporting(false); }
  }

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="brand" onClick={() => setView('upload')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setView('upload'); }}>
            <span className="brand-emblem" aria-hidden="true">
              <svg viewBox="0 0 40 40" width="36" height="36" fill="none">
                <circle cx="20" cy="20" r="18" stroke="#c9a24b" strokeWidth="1.6" strokeDasharray="3 2" />
                <polygon points="20,7 23.4,15.2 32.2,15.8 25.4,21.5 27.6,30.1 20,25.3 12.4,30.1 14.6,21.5 7.8,15.8 16.6,15.2" fill="#d4af52" />
              </svg>
            </span>
            <div>
              <h1>منظومة أجندة التدريب القتالى</h1>
            </div>
          </div>

          <div className="top-nav-center">
            <span className="offline-pill is-ok">
              <span>تعمل بدون انترنت</span>
              <span className="offline-check" aria-hidden="true">✔</span>
            </span>
          </div>

          <div className="top-nav-actions">
            {view !== 'upload' && (
              <button type="button" className="nav-link-btn" onClick={() => setView('upload')}>
                الرئيسية
              </button>
            )}
            <button
              type="button"
              className="nav-link-btn"
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? 'التبديل إلى الوضع المضئ' : 'التبديل إلى الوضع المظلم'}
              aria-label={theme === 'dark' ? 'التبديل إلى الوضع المضئ' : 'التبديل إلى الوضع المظلم'}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span>{theme === 'dark' ? 'الوضع المضئ' : 'الوضع المظلم'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="app">
      {view === 'upload' && (
        <main className="home">
          <section className="home-hero">
            <div className="home-hero-overlay" />
            <div className="home-hero-content">
              <h2>مرحباً بك في منظومة أجندة التدريب القتالى</h2>
              <p>أداة متكاملة لتخطيط وتنظيم فترة التدريب القتالى على مدار ٢٦ أسبوع</p>
              <button type="button" className="hero-cta" onClick={() => open(emptyInstructions())}>
                <span>إدخال التعليمات</span>
                <span className="hero-cta-arrow" aria-hidden="true">◀</span>
              </button>
            </div>
          </section>

          <ol className="home-steps" aria-label="خطوات العمل">
            <li className="step-item is-active">
              <span className="step-num">١</span>
              <span className="step-label">إدخال التعليمات</span>
            </li>
            <li className="step-line is-active" aria-hidden="true" />
            <li className="step-item">
              <span className="step-num">٢</span>
              <span className="step-label">المراجعة والحساب</span>
            </li>
            <li className="step-line" aria-hidden="true" />
            <li className="step-item">
              <span className="step-num">٣</span>
              <span className="step-label">التصدير والطباعة</span>
            </li>
          </ol>

          {error && <div className="err" role="alert">{error}</div>}

          <section className="home-section">
            <div className="home-section-head">
              <span className="section-ico" aria-hidden="true">📋</span>
              <h3>النماذج الجاهزة</h3>
            </div>
            <div className="templates-grid">
              <div className="tpl-card">
                <div className="tpl-info">
                  <span className="tpl-doc-ico" aria-hidden="true">📄</span>
                  <div>
                    <b>نموذج الدورة 108</b>
                    <small>نموذج فني معتمد للتدريب القتالى</small>
                  </div>
                </div>
                <button type="button" className="btn-outline-gold" onClick={() => open(FIXTURE_108)}>
                  <span aria-hidden="true">👁</span>
                  <span>عرض النموذج</span>
                </button>
              </div>
              <div className="tpl-card">
                <div className="tpl-info">
                  <span className="tpl-doc-ico" aria-hidden="true">📄</span>
                  <div>
                    <b>نموذج الدورة 111</b>
                    <small>نموذج محدث لأجندة التدريب</small>
                  </div>
                </div>
                <button type="button" className="btn-outline-gold" onClick={() => open(FIXTURE_111)}>
                  <span aria-hidden="true">👁</span>
                  <span>عرض النموذج</span>
                </button>
              </div>
            </div>
          </section>

          <section className="home-section">
            <div className="home-section-head has-action">
              <div className="home-section-title">
                <span className="section-ico" aria-hidden="true">💾</span>
                <h3>المشروعات المحفوظة</h3>
              </div>
              {projects.length > 0 && (
                <button
                  type="button"
                  className="btn-del-proj"
                  onClick={() => setConfirmClearAll(true)}
                >
                  <span aria-hidden="true">🗑</span>
                  <span>حذف الكل</span>
                </button>
              )}
            </div>
            {projects.length === 0 ? (
              <p className="home-empty">لا توجد مشروعات محفوظة بعد — اضغط «إدخال التعليمات» للبدء أو اختر أحد النماذج الجاهزة.</p>
            ) : (
              <div className="saved-grid">
                {projects.map((p, idx) => (
                  <div className="saved-card" key={p.id}>
                    <div className="saved-info">
                      <span className="saved-emblem" aria-hidden="true">
                        {idx % 3 === 0 ? '★' : idx % 3 === 1 ? '🛡' : '⚔'}
                      </span>
                      <div className="saved-meta">
                        <b>{p.name}</b>
                        <small>📅 آخر تحديث: {fmtDate(p.updatedAt)}</small>
                      </div>
                    </div>
                    <div className="saved-actions">
                      <button type="button" className="btn-open-proj" onClick={() => open(p.instructions, p.id)}>
                        <span aria-hidden="true">📂</span>
                        <span>فتح</span>
                      </button>
                      <button
                        type="button"
                        className="btn-del-proj"
                        onClick={async () => { await removeProject(p.id); refresh(); }}
                      >
                        <span aria-hidden="true">🗑</span>
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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
          <div className="results-sticky-head">
            <div className="tabs-bar">
              <nav className="tabs" role="tablist">
                {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
              </nav>
              <div className="tabs-export">
                <div className="export-menu-wrap" ref={exportMenuRef}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={exporting || !model}
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                    onClick={() => setExportMenuOpen(o => !o)}
                  >
                    <span>{exporting ? 'جارى التصدير…' : 'تصدير'}</span>
                    {!exporting && <span className="export-caret" aria-hidden="true">▾</span>}
                  </button>
                  {exportMenuOpen && model && (
                    <div className="export-menu" role="menu">
                      <button
                        type="button"
                        className="export-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          doExport();
                        }}
                      >
                        <span className="export-item-ico" aria-hidden="true">📄</span>
                        <span className="export-item-text">
                          <b>تصدير كامل المنظومة (PDF)</b>
                          <small>جميع الصفحات والجداول الرسمية</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="export-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          doExportWord();
                        }}
                      >
                        <span className="export-item-ico" aria-hidden="true">📝</span>
                        <span className="export-item-text">
                          <b>تصدير كامل المنظومة (Word .docx)</b>
                          <small>جميع الصفحات والجداول قابلة للتعديل (أفقى + عمودى)</small>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <button className="btn" onClick={() => window.print()}>طباعة</button>
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-edit-inst" onClick={() => setView('review')}>✎ تعديل التعليمات</button>
              {tab === 'link' && (
                <button
                  type="button"
                  className={`btn btn-toggle-detail ${showMonthInLink ? 'is-on' : ''}`}
                  aria-pressed={showMonthInLink}
                  onClick={() => setShowMonthInLink(v => !v)}
                >
                  {showMonthInLink ? '✔ تفصيل الشهر فى نفس الصفحة' : '+ تفصيل الشهر فى نفس الصفحة'}
                </button>
              )}
              {(tab === 'month' || tab === 'week' || tab === 'program' || (tab === 'link' && showMonthInLink)) && (
                <label className="sel">
                  شهر التفصيل
                  <select value={inst.selectedMonth} onChange={e => setInst({ ...inst, selectedMonth: +e.target.value })}>
                    {monthNames(inst.startSaturday, inst.weeksPerMonth.length).map((n, i) => <option key={i} value={i}>{n}</option>)}
                  </select>
                  {model && <span className="month-weeks-pill">{ar(model.monthExtracts.length)} أسابيع</span>}
                </label>
              )}
            </div>
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
              {tab === 'link' && <Paper><LinkingSheet inst={inst} agenda={model.agenda} dist={model.dist} link={model.link} showMonthDetail={showMonthInLink} onInspect={setAudit} /></Paper>}
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
            </>
          )}
        </main>
      )}
      <Inspector audit={audit} onClose={() => setAudit(null)} />
      </div>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span className="footer-right">🔒 جميع البيانات محفوظة محلياً على جهازك فقط</span>
          <span className="footer-left">
            <button type="button" className="footer-about-btn" onClick={() => setShowAbout(true)}>
              <span aria-hidden="true">📖</span>
              <span>عن التطبيق</span>
            </button>
            <span aria-hidden="true">·</span>
            <span>ⓘ الإصدار 1.0.0</span>
          </span>
        </div>
      </footer>

      {view === 'results' && model && (
        <div className="print-root"><ExportPages m={model} /></div>
      )}

      {confirmClearAll && (
        <div className="modal-backdrop" onClick={() => setConfirmClearAll(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-head-title">
                <span className="modal-icon warn" aria-hidden="true">⚠️</span>
                <h3>تأكيد حذف جميع المشروعات</h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setConfirmClearAll(false)} aria-label="إغلاق">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                هل أنت متأكد من حذف <strong>جميع المشروعات المحفوظة ({ar(projects.length)})</strong> نهائياً من هذا الجهاز؟
              </p>
              <p style={{ marginBottom: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                لا يمكن التراجع عن هذا الإجراء بعد التنفيذ.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn danger-btn"
                onClick={async () => {
                  await clearProjects();
                  setConfirmClearAll(false);
                  refresh();
                }}
              >
                🗑 نعم، احذف الكل
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirmClearAll(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="modal-backdrop" onClick={() => setShowAbout(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-head-title">
                <span className="modal-icon warn" aria-hidden="true">★</span>
                <h3>عن منظومة أجندة التدريب القتالى</h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setShowAbout(false)} aria-label="إغلاق">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                أداة متكاملة تعمل <strong>بدون إنترنت بالكامل</strong> لتخطيط وتنظيم فترة التدريب القتالى على مدار ٢٦ أسبوعاً، وحساب كافة الجداول الرسمية آلياً مع إمكانية التصدير إلى <strong>PDF</strong> و <strong>Word</strong> والطباعة المباشرة.
              </p>
              <ul style={{ margin: '10px 0 0', paddingInlineStart: '20px', lineHeight: 1.8 }}>
                <li>أجندة التدريب القتالى الملونة وتوزيع الساعات على الموضوعات.</li>
                <li>جدول الربط الشهرى وتفصيل أسابيع الشهر المختار.</li>
                <li>المستخرج الأسبوعى وبرنامج تدريب السرية (نموذج ٥٤٦) لجميع أسابيع الشهر.</li>
              </ul>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={() => setShowAbout(false)}>حسناً</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
