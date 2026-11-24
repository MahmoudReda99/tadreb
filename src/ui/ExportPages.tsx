import type { AgendaResult, DistributionResult, Instructions, LinkingResult, WeeklyExtract } from '../engine/types';
import { AgendaSheet, DistributionSheet, LinkingSheet, MonthDetailSheet, WeeklySheet, TrainingProgramSheet } from './Sheets';

export interface Model {
  inst: Instructions;
  agenda: AgendaResult;
  dist: DistributionResult;
  link: LinkingResult;
  ex: WeeklyExtract | null;
  monthExtracts: WeeklyExtract[];
}

/** the official pages, A4 landscape, white background, black borders — one page each */
export function ExportPages({ m }: { m: Model }) {
  return (
    <>
      <div className="paper"><AgendaSheet inst={m.inst} agenda={m.agenda} /></div>
      <div className="paper"><DistributionSheet inst={m.inst} agenda={m.agenda} dist={m.dist} /></div>
      <div className="paper"><LinkingSheet inst={m.inst} agenda={m.agenda} dist={m.dist} link={m.link} /></div>
      <div className="paper"><MonthDetailSheet inst={m.inst} agenda={m.agenda} dist={m.dist} link={m.link} /></div>
      {m.monthExtracts.length > 0 ? (
        m.monthExtracts.map(wex => (
          <div className="paper" key={wex.week}><WeeklySheet inst={m.inst} ex={wex} /></div>
        ))
      ) : (
        <div className="paper"><WeeklySheet inst={m.inst} ex={m.ex} /></div>
      )}
      {m.monthExtracts.length > 0 ? (
        m.monthExtracts.map(wex => (
          <div className="paper program-paper" key={`prog-${wex.week}`}>
            <TrainingProgramSheet inst={m.inst} ex={wex} agenda={m.agenda} link={m.link} isExport />
          </div>
        ))
      ) : (
        <div className="paper program-paper"><TrainingProgramSheet inst={m.inst} ex={m.ex} agenda={m.agenda} link={m.link} isExport /></div>
      )}
    </>
  );
}
