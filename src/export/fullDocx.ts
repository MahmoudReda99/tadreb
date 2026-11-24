import JSZip from 'jszip';
import type { Instructions, SubjectKey, WeeklyExtract } from '../engine/types';
import { getGeneralKeys, getMainKeys, getSubjectName, getSubjectShortName } from '../engine/types';
import { DAYS_AR, addDays, dm, monthNames, parseDate } from '../engine/dates';
import { sum } from '../engine/rounding';
import { ar, h, KIND_COLORS, LEVEL_BG } from '../ui/format';
import type { Model } from '../ui/ExportPages';
import { computeCourseLessons } from '../engine/lessonScheduler';
import {
  buildWeekBodyXml,
  CONTENT_TYPES_XML,
  DOC_RELS_XML,
  RELS_XML,
  SECT_PR_XML,
  SETTINGS_XML,
  STYLES_XML,
} from './programDocx';

const LANDSCAPE_W = 15800; // A4 landscape usable width in dxa (16838 - 960 margins ≈ 15878)

const LANDSCAPE_SECT_BREAK = `<w:p><w:pPr><w:sectPr>
  <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
  <w:pgMar w:top="420" w:right="480" w:bottom="380" w:left="480" w:header="300" w:footer="300" w:gutter="0"/>
  <w:bidi/>
</w:sectPr></w:pPr></w:p>`;

const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, c =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '\'' ? '&apos;' : '&quot;',
  );
}

const hex = (c?: string) => (c ? c.replace('#', '').toUpperCase() : undefined);

const periodAr = (i: Instructions) => {
  const p = i.period ?? (i.firstWeek >= 53 ? 3 : i.firstWeek >= 27 ? 2 : 1);
  return p === 3 ? 'الثالثة' : p === 2 ? 'الثانية' : 'الأولى';
};

const yearsAr = (i: Instructions) => {
  if (i.yearLabel) return ar(i.yearLabel);
  const d = parseDate(addDays(i.startSaturday, 3));
  const y = d.getUTCFullYear();
  const from = d.getUTCMonth() >= 6 ? y + 1 : y - 1;
  return `${ar(from)} / ${ar(from + 1)}`;
};

function runXml(text: string, opts: { bold?: boolean; sz?: number; color?: string; underline?: boolean } = {}): string {
  const sz = opts.sz ?? 16;
  return `<w:r><w:rPr><w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/><w:bidi/><w:rtl/>${
    opts.bold ? '<w:b/><w:bCs/>' : ''
  }${opts.color ? `<w:color w:val="${hex(opts.color)}"/>` : ''}${
    opts.underline ? '<w:u w:val="single"/>' : ''
  }<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function titleXml(lines: string[]): string {
  return lines
    .filter(Boolean)
    .map(
      l =>
        `<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="20" w:after="40"/></w:pPr>${runXml(l, {
          bold: true,
          sz: 24,
          underline: true,
        })}</w:p>`,
    )
    .join('\n');
}

interface CellOpts {
  w: number;
  text?: string;
  runs?: string;
  colSpan?: number;
  vMerge?: 'restart' | 'continue';
  bg?: string;
  color?: string;
  bold?: boolean;
  sz?: number;
  align?: 'center' | 'right' | 'left';
  thickLeft?: boolean;
  thickTop?: boolean;
  underline?: boolean;
}

function cellXml(o: CellOpts): string {
  const gs = o.colSpan && o.colSpan > 1 ? `<w:gridSpan w:val="${o.colSpan}"/>` : '';
  const vm = o.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : o.vMerge === 'continue' ? '<w:vMerge/>' : '';
  const shd = o.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(o.bg)}"/>` : '';
  const borders: string[] = [];
  if (o.thickLeft) borders.push('<w:left w:val="single" w:sz="18" w:space="0" w:color="000000"/>');
  if (o.thickTop) borders.push('<w:top w:val="double" w:sz="12" w:space="0" w:color="000000"/>');
  const bdr = borders.length ? `<w:tcBorders>${borders.join('')}</w:tcBorders>` : '';
  const content = o.runs ?? runXml(o.text ?? '', { bold: o.bold ?? true, sz: o.sz ?? 15, color: o.color, underline: o.underline });
  return `<w:tc><w:tcPr><w:tcW w:w="${o.w}" w:type="dxa"/>${gs}${vm}${shd}${bdr}<w:vAlign w:val="center"/><w:tcMar><w:top w:w="22" w:type="dxa"/><w:left w:w="28" w:type="dxa"/><w:bottom w:w="22" w:type="dxa"/><w:right w:w="28" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:bidi/><w:jc w:val="${
    o.align ?? 'center'
  }"/><w:spacing w:before="0" w:after="0" w:line="180" w:lineRule="auto"/></w:pPr>${content}</w:p></w:tc>`;
}

function pairRuns(d: number, n: number, sz = 14): string {
  return (
    runXml(`${h(d)} / `, { bold: true, sz }) +
    runXml(h(n), { bold: true, sz, color: 'D00000' })
  );
}

function tableXml(colWidths: number[], rows: string[]): string {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalW}" w:type="dxa"/>
      <w:bidiVisual/>
      <w:jc w:val="center"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
    ${rows.join('\n')}
  </w:tbl>`;
}

const tr = (cells: string[], height = 240) =>
  `<w:tr><w:trPr><w:trHeight w:val="${height}" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>${cells.join('')}</w:tr>`;

/* ─────────────────────────── Page 1: Agenda ─────────────────────────── */
function buildAgendaPageXml(m: Model): string {
  const { inst, agenda } = m;
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const W = agenda.weeks;
  const monthEndWeeks = new Set<number>();
  let accW = 0;
  for (const n of inst.weeksPerMonth) {
    accW += n;
    if (accW > 0 && accW - 1 < W.length) monthEndWeeks.add(W[accW - 1].week);
  }
  const dayColW = 1100;
  const totColW = 540;
  const wkColW = Math.max(360, Math.floor((LANDSCAPE_W - dayColW - totColW * 3) / Math.max(1, W.length)));
  const colWidths = [dayColW, ...W.map(() => wkColW), totColW, totColW, totColW];

  const rows: string[] = [];
  // Month headers
  rows.push(
    tr(
      [
        cellXml({ w: dayColW, text: 'الشهر / اليوم', vMerge: 'restart', bg: 'E6E6E6', sz: 14 }),
        ...inst.weeksPerMonth.map((n, mi) =>
          cellXml({ w: wkColW * n, text: names[mi] ?? '', colSpan: n, bg: 'E6E6E6', sz: 16, thickLeft: true }),
        ),
        cellXml({ w: totColW * 3, text: 'الإجمالى', colSpan: 3, bg: 'E6E6E6', sz: 16 }),
      ],
      300,
    ),
  );
  // Week number headers
  const hdrKind = (w: number) =>
    inst.prepWeeks.includes(w) ? 'prep' : inst.reserveWeeks.includes(w) ? 'reserve' : inst.opsWeeks.includes(w) ? 'ops' : null;
  rows.push(
    tr(
      [
        cellXml({ w: dayColW, vMerge: 'continue', bg: 'E6E6E6' }),
        ...W.map(w => {
          const k = hdrKind(w.week);
          const bg = k ? KIND_COLORS[k].bg : w.level ? LEVEL_BG[w.level] : 'E6E6E6';
          const color = k ? KIND_COLORS[k].fg : '#111111';
          return cellXml({ w: wkColW, text: ar(w.week), bg, color, sz: 14, thickLeft: monthEndWeeks.has(w.week) });
        }),
        cellXml({ w: totColW, text: 'ن', bg: 'E6E6E6', sz: 14 }),
        cellXml({ w: totColW, text: 'ل', bg: 'E6E6E6', color: 'D00000', sz: 14 }),
        cellXml({ w: totColW, text: 'ج', bg: 'E6E6E6', sz: 14 }),
      ],
      280,
    ),
  );

  // Day rows (Sat..Fri)
  const order = [6, 0, 1, 2, 3, 4, 5];
  const dayLabel = (d: string, first: boolean) => (first || d.endsWith('-01') ? dm(d) : String(+d.slice(8)));
  order.forEach((dow, i) => {
    const ds = W.map(w => w.days[i]);
    const td = sum(ds.map(x => x.day));
    const tn = sum(ds.map(x => x.night));
    rows.push(
      tr(
        [
          cellXml({ w: dayColW, text: DAYS_AR[dow], bg: 'E6E6E6', sz: 15 }),
          ...W.map(w => {
            const d = w.days[i];
            const c = KIND_COLORS[d.kind];
            return cellXml({
              w: wkColW,
              text: ar(dayLabel(d.date, w.week === 1 && i < 2)),
              bg: c.bg,
              color: c.fg,
              sz: 14,
              thickLeft: monthEndWeeks.has(w.week),
            });
          }),
          cellXml({ w: totColW, text: h(td), sz: 14 }),
          cellXml({ w: totColW, text: h(tn), color: 'D00000', sz: 14 }),
          cellXml({ w: totColW, text: h(td + tn), sz: 14 }),
        ],
        310,
      ),
    );
  });

  // Hours rows (day, night, total)
  (['day', 'night', 'total'] as const).forEach((what, idx) => {
    const lbl = what === 'day' ? 'نهاراً' : what === 'night' ? 'ليلاً' : 'الإجمالى';
    const isRed = what === 'night';
    rows.push(
      tr(
        [
          cellXml({ w: dayColW, text: lbl, bg: 'E6E6E6', sz: 15, thickTop: idx === 0 }),
          ...W.map(w =>
            cellXml({
              w: wkColW,
              text: h(what === 'total' ? w.total : w[what]),
              color: isRed ? 'D00000' : undefined,
              sz: 13,
              thickLeft: monthEndWeeks.has(w.week),
              thickTop: idx === 0,
            }),
          ),
          cellXml({ w: totColW, text: what === 'day' ? h(agenda.day) : '-', sz: 14, thickTop: idx === 0 }),
          cellXml({ w: totColW, text: what === 'night' ? h(agenda.night) : '-', color: isRed ? 'D00000' : undefined, sz: 14, thickTop: idx === 0 }),
          cellXml({ w: totColW, text: what === 'total' ? h(agenda.total) : '-', sz: 14, thickTop: idx === 0 }),
        ],
        250,
      ),
    );
  });

  // Extra rows (fitness, education, security)
  const extras: [string, (w: typeof W[number]) => number, number][] = [
    ['ساعات اللياقة البدنية', w => w.fitness, agenda.fitness],
    ['ساعات التعليم المنضم', w => w.education, agenda.education],
    ['ساعات الأمن حربى', w => w.security, agenda.security],
  ];
  extras.forEach(([label, fn, tot], idx) => {
    rows.push(
      tr(
        [
          cellXml({ w: dayColW, text: label, bg: 'E6E6E6', sz: 13, thickTop: idx === 0 }),
          ...W.map(w =>
            cellXml({
              w: wkColW,
              text: h(fn(w)),
              sz: 13,
              thickLeft: monthEndWeeks.has(w.week),
              thickTop: idx === 0,
            }),
          ),
          cellXml({ w: totColW * 3, text: h(tot), colSpan: 3, sz: 14, thickTop: idx === 0 }),
        ],
        260,
      ),
    );
  });

  const summaryP = `<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="120" w:after="0"/></w:pPr>${runXml(
    `إجمالى عدد الساعات : ( ${ar(agenda.total)} ) ساعة   |   نهارى : ( ${ar(agenda.day)} ) ساعة   |   ليلى : ( ${ar(agenda.night)} ) ساعة`,
    { bold: true, sz: 18 },
  )}</w:p>`;

  const lines = [
    'أجندة التدريب',
    `للفترة التدريبية ${periodAr(inst)} من العام التدريبى ${yearsAr(inst)} م`,
    inst.courseName.trim() ? ar(inst.courseName.trim()) : '',
  ];
  return titleXml(lines) + '\n' + tableXml(colWidths, rows) + '\n' + summaryP;
}

/* ─────────────────────────── Page 2: Distribution ─────────────────────────── */
function buildDistributionPageXml(m: Model): string {
  const { inst, agenda, dist } = m;
  const mainKeys = getMainKeys(inst);
  const genKeys = getGeneralKeys(inst);
  const pct = (k: SubjectKey) => {
    const custom = inst.customSubjects?.find(s => s.id === k);
    if (custom) return custom.pct;
    return k === 'fitness' ? inst.pcts.fitness : ((inst.pcts as unknown as Record<string, number>)[k] ?? 0);
  };
  const colWidths = [550, 3200, 1300, 1350, 1200, 1200, 1160, 1160, 1160, 1160, 1160, 1160];
  const rows: string[] = [];

  rows.push(
    tr(
      [
        cellXml({ w: colWidths[0], text: 'م', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[1], text: 'الموضوع', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[2], text: 'النسبة المئوية', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[3], text: 'عدد الساعات', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[4], text: 'نهارى', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[5], text: 'ليلى', vMerge: 'restart', bg: 'E6E6E6', color: 'D00000' }),
        cellXml({ w: colWidths[6] + colWidths[7], text: 'فرد', colSpan: 2, bg: 'E6E6E6' }),
        cellXml({ w: colWidths[8] + colWidths[9], text: 'طاقم', colSpan: 2, bg: 'E6E6E6' }),
        cellXml({ w: colWidths[10] + colWidths[11], text: 'مركز', colSpan: 2, bg: 'E6E6E6' }),
      ],
      280,
    ),
  );
  rows.push(
    tr(
      [
        ...colWidths.slice(0, 6).map(w => cellXml({ w, vMerge: 'continue', bg: 'E6E6E6' })),
        ...[0, 1, 2].flatMap(i => [
          cellXml({ w: colWidths[6 + i * 2], text: 'ن', bg: 'E6E6E6' }),
          cellXml({ w: colWidths[7 + i * 2], text: 'ل', bg: 'E6E6E6', color: 'D00000' }),
        ]),
      ],
      240,
    ),
  );

  const subjRow = (k: SubjectKey, i: number) => {
    const c = dist.cells[k] || { day: 0, night: 0 };
    const bg = i % 2 === 1 ? 'F2F2F2' : undefined;
    return tr([
      cellXml({ w: colWidths[0], text: ar(i + 1), bg }),
      cellXml({ w: colWidths[1], text: getSubjectName(k, inst), align: 'right', bg }),
      cellXml({ w: colWidths[2], text: `${ar(pct(k))} %`, bg }),
      cellXml({ w: colWidths[3], text: h(c.day + c.night), bg }),
      cellXml({ w: colWidths[4], text: h(c.day), bg }),
      cellXml({ w: colWidths[5], text: h(c.night), color: 'D00000', bg }),
      ...(['individual', 'crew', 'centre'] as const).flatMap((l, li) => [
        cellXml({ w: colWidths[6 + li * 2], text: k === 'tech' ? h(dist.techLevels[l].day) : '-', bg }),
        cellXml({ w: colWidths[7 + li * 2], text: k === 'tech' ? h(dist.techLevels[l].night) : '-', color: 'D00000', bg }),
      ]),
    ]);
  };

  const mainPctSum = mainKeys.reduce((a, k) => a + pct(k), 0) || inst.pcts.mainPct;
  const genPctSum = genKeys.reduce((a, k) => a + pct(k), 0) || (100 - inst.pcts.mainPct);

  rows.push(tr([cellXml({ w: LANDSCAPE_W, text: `الموضوعات الرئيسية : ${ar(mainPctSum)} %`, colSpan: 12, align: 'right', underline: true, sz: 16 })]));
  mainKeys.forEach((k, i) => rows.push(subjRow(k, i)));
  rows.push(
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: 'إجمالى الموضوعات الرئيسية', colSpan: 2, bg: 'A5D16B' }),
      cellXml({ w: colWidths[2], text: `${ar(mainPctSum)} %`, bg: 'A5D16B' }),
      cellXml({ w: colWidths[3], text: h(dist.mainCell.day + dist.mainCell.night), bg: 'A5D16B' }),
      cellXml({ w: colWidths[4], text: h(dist.mainCell.day), bg: 'A5D16B' }),
      cellXml({ w: colWidths[5], text: h(dist.mainCell.night), color: 'D00000', bg: 'A5D16B' }),
      cellXml({ w: colWidths.slice(6).reduce((a, b) => a + b, 0), text: '', colSpan: 6, bg: 'A5D16B' }),
    ]),
  );

  rows.push(tr([cellXml({ w: LANDSCAPE_W, text: `الموضوعات العامة : ${ar(genPctSum)} %`, colSpan: 12, align: 'right', underline: true, sz: 16 })]));
  genKeys.forEach((k, i) => rows.push(subjRow(k, i)));
  rows.push(
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: 'إجمالى الموضوعات العامة', colSpan: 2, bg: 'A5D16B' }),
      cellXml({ w: colWidths[2], text: `${ar(genPctSum)} %`, bg: 'A5D16B' }),
      cellXml({ w: colWidths[3], text: h(dist.generalCell.day + dist.generalCell.night), bg: 'A5D16B' }),
      cellXml({ w: colWidths[4], text: h(dist.generalCell.day), bg: 'A5D16B' }),
      cellXml({ w: colWidths[5], text: h(dist.generalCell.night), color: 'D00000', bg: 'A5D16B' }),
      cellXml({ w: colWidths.slice(6).reduce((a, b) => a + b, 0), text: '', colSpan: 6, bg: 'A5D16B' }),
    ]),
  );

  rows.push(
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: 'الإجمالى', colSpan: 2, bg: '4FACF0' }),
      cellXml({ w: colWidths[2], text: '١٠٠ %', bg: '4FACF0' }),
      cellXml({ w: colWidths[3], text: h(dist.total), bg: '4FACF0' }),
      cellXml({ w: colWidths[4], text: h(agenda.day), bg: '4FACF0' }),
      cellXml({ w: colWidths[5], text: h(agenda.night), color: 'D00000', bg: '4FACF0' }),
      ...(['individual', 'crew', 'centre'] as const).flatMap((l, li) => [
        cellXml({ w: colWidths[6 + li * 2], text: h(dist.levelPeriods[l].day), bg: '4FACF0' }),
        cellXml({ w: colWidths[7 + li * 2], text: h(dist.levelPeriods[l].night), color: 'D00000', bg: '4FACF0' }),
      ]),
    ]),
  );

  return titleXml(['توزيع الساعات على الموضوعات']) + '\n' + tableXml(colWidths, rows);
}

/* ─────────────────────────── Page 3: Linking Table ─────────────────────────── */
function buildLinkingPageXml(m: Model): string {
  const { inst, agenda, dist, link, showMonthInLink } = m;
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const M = link.months;
  const sm = Math.min(inst.selectedMonth, Math.max(0, names.length - 1));
  const wk = link.weeks[sm];
  const withDetail = Boolean(showMonthInLink && wk);
  const mainKeys = getMainKeys(inst);
  const genKeys = getGeneralKeys(inst);
  const pct = (k: SubjectKey) => {
    const custom = inst.customSubjects?.find(s => s.id === k);
    if (custom) return custom.pct;
    return k === 'fitness' ? inst.pcts.fitness : ((inst.pcts as unknown as Record<string, number>)[k] ?? 0);
  };

  const extraCols = withDetail ? wk.weekNumbers.length : 0;
  const dynCount = names.length + extraCols;
  const fixedW = [500, 2200, 950, 1250];
  const dynW = Math.floor((LANDSCAPE_W - fixedW.reduce((a, b) => a + b, 0)) / Math.max(1, dynCount));
  const colWidths = [...fixedW, ...Array.from({ length: dynCount }, () => dynW)];
  const totalCols = 4 + dynCount;
  const rows: string[] = [];

  if (withDetail) {
    rows.push(
      tr([
        cellXml({ w: colWidths[0], text: 'م', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[1], text: 'الموضوع', vMerge: 'restart', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[2], text: 'النسبة المئوية', vMerge: 'restart', bg: 'E6E6E6', sz: 13 }),
        cellXml({ w: colWidths[3], text: 'إجمالى الساعات', vMerge: 'restart', bg: 'E6E6E6', sz: 13 }),
        ...names.map((n, mi) =>
          mi === sm
            ? cellXml({ w: dynW * (1 + wk.weekNumbers.length), text: n, colSpan: 1 + wk.weekNumbers.length, bg: 'D9D9D9' })
            : cellXml({ w: dynW, text: n, vMerge: 'restart', bg: 'E6E6E6' }),
        ),
      ]),
    );
    rows.push(
      tr([
        ...fixedW.map(w => cellXml({ w, vMerge: 'continue', bg: 'E6E6E6' })),
        ...names.flatMap((_, mi) =>
          mi === sm
            ? [
                cellXml({ w: dynW, text: 'إجمالى الشهر', bg: 'D9D9D9', sz: 12 }),
                ...wk.weekNumbers.map(w => cellXml({ w: dynW, text: ar(w), bg: 'D9D9D9', sz: 13 })),
              ]
            : [cellXml({ w: dynW, vMerge: 'continue', bg: 'E6E6E6' })],
        ),
      ]),
    );
  } else {
    rows.push(
      tr([
        cellXml({ w: colWidths[0], text: 'م', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[1], text: 'الموضوع', bg: 'E6E6E6' }),
        cellXml({ w: colWidths[2], text: 'النسبة المئوية', bg: 'E6E6E6', sz: 13 }),
        cellXml({ w: colWidths[3], text: 'إجمالى الساعات', bg: 'E6E6E6', sz: 13 }),
        ...names.map(n => cellXml({ w: dynW, text: n, bg: 'E6E6E6' })),
      ]),
    );
  }

  const subjRow = (k: SubjectKey, i: number) => {
    const bg = i % 2 === 1 ? 'F2F2F2' : undefined;
    return tr([
      cellXml({ w: colWidths[0], text: ar(i + 1), bg }),
      cellXml({ w: colWidths[1], text: getSubjectShortName(k, inst), align: 'right', bg }),
      cellXml({ w: colWidths[2], text: `${ar(pct(k))}%`, bg }),
      cellXml({ w: colWidths[3], runs: pairRuns(dist.cells[k]?.day || 0, dist.cells[k]?.night || 0), bg }),
      ...names.flatMap((_, mi) => {
        const mc = M.cells[mi]?.[k] || { day: 0, night: 0 };
        const mBg = withDetail && mi === sm ? 'E8E8E8' : bg;
        const list = [cellXml({ w: dynW, runs: pairRuns(mc.day, mc.night, withDetail ? 12 : 14), bg: mBg })];
        if (withDetail && mi === sm) {
          wk.weekNumbers.forEach((_, ci) => {
            const wc = wk.b.cells[ci]?.[k] || { day: 0, night: 0 };
            list.push(cellXml({ w: dynW, runs: pairRuns(wc.day, wc.night, 12), bg: 'E8E8E8' }));
          });
        }
        return list;
      }),
    ]);
  };

  const subRow = (label: string, side: 'main' | 'general', pc: number, c: { day: number; night: number }) =>
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: label, colSpan: 2, bg: 'A5D16B' }),
      cellXml({ w: colWidths[2], text: `${ar(pc)}%`, bg: 'A5D16B' }),
      cellXml({ w: colWidths[3], runs: pairRuns(c.day, c.night), bg: 'A5D16B' }),
      ...names.flatMap((_, mi) => {
        const list = [cellXml({ w: dynW, runs: pairRuns(M[side][mi].day, M[side][mi].night, withDetail ? 12 : 14), bg: 'A5D16B' })];
        if (withDetail && mi === sm) {
          wk.weekNumbers.forEach((_, ci) => {
            list.push(cellXml({ w: dynW, runs: pairRuns(wk.b[side][ci].day, wk.b[side][ci].night, 12), bg: 'A5D16B' }));
          });
        }
        return list;
      }),
    ]);

  const mainPctSum = mainKeys.reduce((a, k) => a + pct(k), 0) || inst.pcts.mainPct;
  const genPctSum = genKeys.reduce((a, k) => a + pct(k), 0) || (100 - inst.pcts.mainPct);

  rows.push(tr([cellXml({ w: LANDSCAPE_W, text: `الموضوعات الرئيسية : ${ar(mainPctSum)} %`, colSpan: totalCols, align: 'right', underline: true })]));
  mainKeys.forEach((k, i) => rows.push(subjRow(k, i)));
  rows.push(subRow('إجمالى الموضوعات الرئيسية', 'main', mainPctSum, dist.mainCell));

  rows.push(tr([cellXml({ w: LANDSCAPE_W, text: `الموضوعات العامة : ${ar(genPctSum)} %`, colSpan: totalCols, align: 'right', underline: true })]));
  genKeys.forEach((k, i) => rows.push(subjRow(k, i)));
  rows.push(subRow('إجمالى الموضوعات العامة', 'general', genPctSum, dist.generalCell));

  rows.push(
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: 'الإجمالى', colSpan: 2, bg: '4FACF0' }),
      cellXml({ w: colWidths[2], text: '١٠٠%', bg: '4FACF0' }),
      cellXml({ w: colWidths[3], runs: pairRuns(agenda.day, agenda.night), bg: '4FACF0' }),
      ...names.flatMap((_, mi) => {
        const list = [cellXml({ w: dynW, runs: pairRuns(M.cols[mi].day, M.cols[mi].night, withDetail ? 12 : 14), bg: '4FACF0' })];
        if (withDetail && mi === sm) {
          wk.weekNumbers.forEach((_, ci) => {
            list.push(cellXml({ w: dynW, runs: pairRuns(wk.b.cols[ci].day, wk.b.cols[ci].night, 12), bg: '4FACF0' }));
          });
        }
        return list;
      }),
    ]),
  );

  return (
    titleXml([
      'جدول ربط الساعات والموضوعات (نهارى / ليلى)',
      `عن الفترة التدريبية ${periodAr(inst)} من العام التدريبى ${yearsAr(inst)} م`,
    ]) +
    '\n' +
    tableXml(colWidths, rows)
  );
}

/* ─────────────────────────── Page 4: Month Detail ─────────────────────────── */
function buildMonthDetailPageXml(m: Model): string {
  const { inst, link } = m;
  const names = monthNames(inst.startSaturday, inst.weeksPerMonth.length);
  const sm = Math.min(inst.selectedMonth, Math.max(0, names.length - 1));
  const monthName = names[sm] || '';
  const wk = link.weeks[sm];
  if (!wk) return '';
  const M = link.months;
  const mainKeys = getMainKeys(inst);
  const genKeys = getGeneralKeys(inst);
  const pct = (k: SubjectKey) => {
    const custom = inst.customSubjects?.find(s => s.id === k);
    if (custom) return custom.pct;
    return k === 'fitness' ? inst.pcts.fitness : ((inst.pcts as unknown as Record<string, number>)[k] ?? 0);
  };

  const fixedW = [600, 2800, 1200, 1800];
  const wkW = Math.floor((LANDSCAPE_W - fixedW.reduce((a, b) => a + b, 0)) / Math.max(1, wk.weekNumbers.length));
  const colWidths = [...fixedW, ...wk.weekNumbers.map(() => wkW)];
  const totalCols = 4 + wk.weekNumbers.length;
  const rows: string[] = [];

  rows.push(
    tr([
      cellXml({ w: colWidths[0], text: 'م', vMerge: 'restart', bg: 'E6E6E6' }),
      cellXml({ w: colWidths[1], text: 'الموضوع', vMerge: 'restart', bg: 'E6E6E6' }),
      cellXml({ w: colWidths[2], text: 'النسبة المئوية', vMerge: 'restart', bg: 'E6E6E6' }),
      cellXml({ w: colWidths[3], text: `شهر ${monthName}`, vMerge: 'restart', bg: 'E6E6E6' }),
      cellXml({ w: wkW * wk.weekNumbers.length, text: 'أسابيع الشهر', colSpan: wk.weekNumbers.length, bg: 'E6E6E6' }),
    ]),
  );
  rows.push(
    tr([
      ...fixedW.map(w => cellXml({ w, vMerge: 'continue', bg: 'E6E6E6' })),
      ...wk.weekNumbers.map(w => cellXml({ w: wkW, text: ar(w), bg: 'E6E6E6' })),
    ]),
  );

  const subjRow = (k: SubjectKey, i: number) => {
    const bg = i % 2 === 1 ? 'F2F2F2' : undefined;
    return tr([
      cellXml({ w: colWidths[0], text: ar(i + 1), bg }),
      cellXml({ w: colWidths[1], text: getSubjectShortName(k, inst), align: 'right', bg }),
      cellXml({ w: colWidths[2], text: `${ar(pct(k))}%`, bg }),
      cellXml({ w: colWidths[3], runs: pairRuns(M.cells[sm]?.[k]?.day || 0, M.cells[sm]?.[k]?.night || 0), bg }),
      ...wk.weekNumbers.map((_, ci) =>
        cellXml({ w: wkW, runs: pairRuns(wk.b.cells[ci]?.[k]?.day || 0, wk.b.cells[ci]?.[k]?.night || 0), bg }),
      ),
    ]);
  };

  const subRow = (label: string, side: 'main' | 'general', pc: number) =>
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: label, colSpan: 2, bg: 'A5D16B' }),
      cellXml({ w: colWidths[2], text: `${ar(pc)}%`, bg: 'A5D16B' }),
      cellXml({ w: colWidths[3], runs: pairRuns(M[side][sm].day, M[side][sm].night), bg: 'A5D16B' }),
      ...wk.weekNumbers.map((_, ci) => cellXml({ w: wkW, runs: pairRuns(wk.b[side][ci].day, wk.b[side][ci].night), bg: 'A5D16B' })),
    ]);

  const mainPctSum = mainKeys.reduce((a, k) => a + pct(k), 0) || inst.pcts.mainPct;
  const genPctSum = genKeys.reduce((a, k) => a + pct(k), 0) || (100 - inst.pcts.mainPct);

  rows.push(tr([cellXml({ w: LANDSCAPE_W, text: `الموضوعات الرئيسية : ${ar(mainPctSum)} %`, colSpan: totalCols, align: 'right', underline: true })]));
  mainKeys.forEach((k, i) => rows.push(subjRow(k, i)));
  rows.push(subRow('إجمالى الموضوعات الرئيسية', 'main', mainPctSum));

  rows.push(tr([cellXml({ w: LANDSCAPE_W, text: `الموضوعات العامة : ${ar(genPctSum)} %`, colSpan: totalCols, align: 'right', underline: true })]));
  genKeys.forEach((k, i) => rows.push(subjRow(k, i)));
  rows.push(subRow('إجمالى الموضوعات العامة', 'general', genPctSum));

  rows.push(
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: 'الإجمالى', colSpan: 2, bg: '4FACF0' }),
      cellXml({ w: colWidths[2], text: '١٠٠%', bg: '4FACF0' }),
      cellXml({ w: colWidths[3], runs: pairRuns(M.cols[sm].day, M.cols[sm].night), bg: '4FACF0' }),
      ...wk.weekNumbers.map((_, ci) => cellXml({ w: wkW, runs: pairRuns(wk.b.cols[ci].day, wk.b.cols[ci].night), bg: '4FACF0' })),
    ]),
  );

  return (
    titleXml([
      `جدول تفصيل الساعات والموضوعات على أسابيع شهر ( ${monthName} )`,
      `عن الفترة التدريبية ${periodAr(inst)} من العام التدريبى ${yearsAr(inst)} م`,
    ]) +
    '\n' +
    tableXml(colWidths, rows)
  );
}

/* ─────────────────────────── Page 5: Weekly Extract ─────────────────────────── */
function buildWeeklyExtractPageXml(inst: Instructions, ex: WeeklyExtract): string {
  const dn = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const subjRows = ex.rows.filter(r => r.day + r.night > 0);
  const hasNightDays = ex.days.some(d => d.night > 0);
  const isNightSlot = (s: { lectures: string; isNight?: boolean }, di: number) => {
    if (s.isNight !== undefined) return s.isNight;
    const first = parseInt(s.lectures, 10);
    const dayThreshold = ex.days[di] ? ex.days[di].day : 7;
    return first > dayThreshold;
  };

  const daySlotCols = ex.days.reduce((acc, d) => acc + (d.night > 0 ? 2 : 1), 0);
  const fixedStart = [500, 2200, 1250];
  const notesW = 1350;
  const slotW = Math.floor((LANDSCAPE_W - fixedStart.reduce((a, b) => a + b, 0) - notesW) / Math.max(1, daySlotCols));
  const colWidths = [...fixedStart, ...Array.from({ length: daySlotCols }, () => slotW), notesW];

  const rows: string[] = [];
  rows.push(
    tr([
      cellXml({ w: colWidths[0], text: 'م', vMerge: hasNightDays ? 'restart' : undefined, bg: 'A5D16B' }),
      cellXml({ w: colWidths[1], text: 'الموضوعات', vMerge: hasNightDays ? 'restart' : undefined, bg: 'A5D16B' }),
      cellXml({ w: colWidths[2], text: 'ساعات الأسبوع', vMerge: hasNightDays ? 'restart' : undefined, bg: 'A5D16B' }),
      ...dn.map((d, di) =>
        ex.days[di]?.night > 0
          ? cellXml({ w: slotW * 2, text: d, colSpan: 2, bg: 'A5D16B' })
          : cellXml({ w: slotW, text: d, vMerge: hasNightDays ? 'restart' : undefined, bg: 'A5D16B' }),
      ),
      cellXml({ w: notesW, text: 'ملاحظات', vMerge: hasNightDays ? 'restart' : undefined, bg: 'A5D16B' }),
    ]),
  );
  if (hasNightDays) {
    rows.push(
      tr([
        ...fixedStart.map(w => cellXml({ w, vMerge: 'continue', bg: 'A5D16B' })),
        ...ex.days.flatMap(d =>
          d.night > 0
            ? [cellXml({ w: slotW, text: 'نهارى', bg: 'A5D16B', sz: 13 }), cellXml({ w: slotW, text: 'ليلى', bg: 'A5D16B', color: 'D00000', sz: 13 })]
            : [cellXml({ w: slotW, vMerge: 'continue', bg: 'A5D16B' })],
        ),
        cellXml({ w: notesW, vMerge: 'continue', bg: 'A5D16B' }),
      ]),
    );
  }

  subjRows.forEach((r, idx) => {
    const rowBg = idx % 2 === 0 ? 'F4F4F4' : undefined;
    const dayCells = ex.days.flatMap((d, di) => {
      const sorted = [...r.slots[di]].sort((a, b) => parseInt(a.lectures, 10) - parseInt(b.lectures, 10));
      if (d.night > 0) {
        const dayS = sorted.filter(s => !isNightSlot(s, di));
        const nightS = sorted.filter(s => isNightSlot(s, di));
        return [
          cellXml({ w: slotW, text: dayS.length ? dayS.map(s => ar(s.text)).join(' ، ') : '-', bg: dayS.length ? 'FFF59A' : rowBg, sz: 13 }),
          cellXml({ w: slotW, text: nightS.length ? nightS.map(s => ar(s.text)).join(' ، ') : '-', bg: nightS.length ? 'FFF59A' : rowBg, color: 'D00000', sz: 13 }),
        ];
      }
      return [
        cellXml({ w: slotW, text: sorted.length ? sorted.map(s => ar(s.text)).join(' ، ') : '-', bg: sorted.length ? 'FFF59A' : rowBg, sz: 13 }),
      ];
    });
    rows.push(
      tr([
        cellXml({ w: colWidths[0], text: ar(idx + 1), bg: rowBg }),
        cellXml({ w: colWidths[1], text: getSubjectShortName(r.key, inst), align: 'right', bg: rowBg }),
        cellXml({ w: colWidths[2], runs: pairRuns(r.day, r.night), bg: rowBg }),
        ...dayCells,
        cellXml({ w: notesW, text: '', bg: rowBg }),
      ]),
    );
  });

  // Grand total row
  rows.push(
    tr([
      cellXml({ w: colWidths[0] + colWidths[1], text: 'الإجمالى', colSpan: 2, bg: '4FACF0' }),
      cellXml({ w: colWidths[2], runs: pairRuns(ex.totals.day, ex.totals.night), bg: '4FACF0' }),
      ...ex.days.flatMap(d =>
        d.night > 0
          ? [cellXml({ w: slotW, text: h(d.day), bg: '4FACF0' }), cellXml({ w: slotW, text: h(d.night), color: 'D00000', bg: '4FACF0' })]
          : [cellXml({ w: slotW, text: h(d.day), bg: '4FACF0' })],
      ),
      cellXml({ w: notesW, text: '', bg: '4FACF0' }),
    ]),
  );

  const fromStr = ar(ex.from.split('-').reverse().join('/'));
  const toStr = ar(ex.to.split('-').reverse().join('/'));

  return (
    titleXml([
      `مستخرج الموضوعات والساعات عن الأسبوع رقم ( ${ar(ex.week)} )`,
      `من الفترة التدريبية ${periodAr(inst)} للعام التدريبى ${yearsAr(inst)}`,
      `خلال المدة من ${fromStr} إلى ${toStr}`,
    ]) +
    '\n' +
    tableXml(colWidths, rows)
  );
}

/* ─────────────────────────── Full Document Builder ─────────────────────────── */
export function buildFullDocxXml(m: Model): string {
  const extracts = m.monthExtracts.length > 0 ? m.monthExtracts : m.ex ? [m.ex] : [];

  const landscapePages: string[] = [
    buildAgendaPageXml(m),
    buildDistributionPageXml(m),
    buildLinkingPageXml(m),
    buildMonthDetailPageXml(m),
    ...extracts.map(wex => buildWeeklyExtractPageXml(m.inst, wex)),
  ].filter(Boolean);

  const portraitPages: string[] = extracts.map(wex => {
    const schedule = computeCourseLessons(m.inst, m.agenda, m.link, wex.week);
    return buildWeekBodyXml(m.inst, wex, schedule);
  });

  const landscapeBody = landscapePages.join(`\n${PAGE_BREAK}\n`);
  const portraitBody = portraitPages.join(`\n${PAGE_BREAK}\n`);

  const bodyContent =
    portraitPages.length > 0
      ? `${landscapeBody}\n${LANDSCAPE_SECT_BREAK}\n${portraitBody}\n${SECT_PR_XML}`
      : `${landscapeBody}\n<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="420" w:right="480" w:bottom="380" w:left="480" w:header="300" w:footer="300" w:gutter="0"/><w:bidi/></w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${bodyContent}
  </w:body>
</w:document>`;
}

export async function downloadFullDocx(m: Model, filename = 'اجندة-التدريب-القتالى.docx'): Promise<void> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', DOC_RELS_XML);
  zip.file('word/settings.xml', SETTINGS_XML);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', buildFullDocxXml(m));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
