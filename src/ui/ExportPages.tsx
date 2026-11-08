import type { AgendaResult, DistributionResult, Instructions, LinkingResult, WeeklyExtract } from '../engine/types';
import { AgendaSheet, DistributionSheet, LinkingSheet, WeeklySheet } from './Sheets';
import { InstructionsSheet } from './InstructionsSheet';

export interface Model {
  inst: Instructions;
  agenda: AgendaResult;
  dist: DistributionResult;
  link: LinkingResult;
  ex: WeeklyExtract | null;
}

/** the four official solution pages, A4 landscape, white background, black borders — one page each */
export function ExportPages({ m }: { m: Model }) {
  return (
    <>
      <div className="paper page-frame"><AgendaSheet inst={m.inst} agenda={m.agenda} /></div>
      <div className="paper page-frame"><DistributionSheet inst={m.inst} agenda={m.agenda} dist={m.dist} /></div>
      <div className="paper page-frame"><LinkingSheet inst={m.inst} agenda={m.agenda} dist={m.dist} link={m.link} /></div>
      <div className="paper page-frame"><WeeklySheet inst={m.inst} ex={m.ex} /></div>
    </>
  );
}

/** all pages including the official instructions question paper (portrait) and the four solution pages (landscape) */
export function ExportAllPages({ m }: { m: Model }) {
  return (
    <>
      <div className="paper portrait-paper page-frame"><InstructionsSheet inst={m.inst} /></div>
      <div className="paper page-frame"><AgendaSheet inst={m.inst} agenda={m.agenda} /></div>
      <div className="paper page-frame"><DistributionSheet inst={m.inst} agenda={m.agenda} dist={m.dist} /></div>
      <div className="paper page-frame"><LinkingSheet inst={m.inst} agenda={m.agenda} dist={m.dist} link={m.link} /></div>
      <div className="paper page-frame"><WeeklySheet inst={m.inst} ex={m.ex} /></div>
    </>
  );
}
