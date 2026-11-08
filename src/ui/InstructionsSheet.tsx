import type { Instructions } from '../engine/types';
import { extractInstructionsData } from '../export/instructionsData';
import { ar } from './format';

const WEEK_ORDINALS: Record<number, string> = {
  1: 'الأول',
  2: 'الثانى',
  3: 'الثالث',
  4: 'الرابع',
  5: 'الخامس',
};

const COLOR_MAP = [
  { letter: 'أ', label: 'فترة تحضيرية', color: 'أصفر', swatch: '#ffff00' },
  { letter: 'ب', label: 'يوم قصير', color: 'أخضر فاتح', swatch: '#90ee90' },
  { letter: 'ج', label: 'يوم طويل', color: 'أزرق فاتح', swatch: '#add8e6' },
  { letter: 'د', label: 'أجازات', color: 'أحمر', swatch: '#ff3333' },
  { letter: 'هـ', label: 'صيانة', color: 'برتقالى', swatch: '#ffa500' },
  { letter: 'و', label: 'طابور سير', color: 'نبيتى', swatch: '#800020' },
  { letter: 'ز', label: 'فرد - طاقم - مركز', color: '(تترك للدارس)', swatch: '#e0e0e0' },
  { letter: 'ح', label: 'مهام العمليات', color: 'بنفسجى', swatch: '#800080' },
  { letter: 'ط', label: 'معسكر ليلى', color: 'أزرق غامق', swatch: '#1e3a8a' },
  { letter: 'ى', label: 'إحتياط', color: 'أخضر غامق', swatch: '#14532d' },
  { letter: 'ك', label: 'شئون أفراد', color: 'رصاصى', swatch: '#a6a6a6' },
  { letter: 'ل', label: 'راحة أسبوعية', color: 'بنى', swatch: '#78350f' },
  { letter: 'م', label: 'شهر رمضان', color: 'لبنى', swatch: '#7dd3fc' },
];

/** Page 1 of the official question/instructions paper */
export function InstructionsPage1({ inst }: { inst: Instructions }) {
  const d = extractInstructionsData(inst);
  const defOrd = WEEK_ORDINALS[d.marchWeekDefault] || `رقم (${ar(d.marchWeekDefault)})`;
  const excOrd = WEEK_ORDINALS[d.marchWeekExceptionWeek] || `رقم (${ar(d.marchWeekExceptionWeek)})`;

  return (
    <div className="sheet inst-sheet inst-page" dir="rtl">
      {/* Student Box */}
      <table className="inst-header-table student-box">
        <tbody>
          <tr>
            <td style={{ width: '38%' }}>
              <div><b>الرتبة /</b></div>
              <div style={{ marginTop: '10px' }}><b>اسم /</b></div>
            </td>
            <td style={{ width: '37%' }}>
              <div><b>الفرقة /</b></div>
              <div style={{ marginTop: '10px' }}><b>الرقم السرى /</b></div>
            </td>
            <td style={{ width: '25%', verticalAlign: 'top' }}>
              <div><b>رقم الجلوس /</b></div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Warning Bar */}
      <div className="inst-warning-band">
        لا تـكـتــــــب خـلـــــف هــذا الـجـــــزء
      </div>

      {/* Exam Header Table */}
      <table className="inst-header-table exam-info-box">
        <tbody>
          <tr>
            <td style={{ width: '38%', textAlign: 'right' }}>
              <div><b>قيادة المعاهد العسكرية التخصصية</b></div>
              <div><b>معهـــــــــــــــــد الإشــــــــــــــــــارة</b></div>
              <div><b>قســــــــــــــــم الامتحـــــــــــــــــانات</b></div>
            </td>
            <td style={{ width: '34%', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#333' }}>( {d.examCode} )</div>
              <div style={{ fontWeight: 'bold', margin: '4px 0', fontSize: '12px' }}>ممنوع اصطحاب الهواتف والساعات الذكية</div>
              <div><b>الرقم السرى /</b></div>
            </td>
            <td style={{ width: '28%', textAlign: 'left', direction: 'rtl' }}>
              <div>الــــزمن ( <b>{ar(d.durationMinutes)}</b> ) دقيقــــة</div>
              <div>الدرجـــة ( <b>{ar(d.totalGrade)}</b> ) درجـــــة</div>
              <div style={{ marginTop: '4px' }}><b>{d.officerName}</b></div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Title */}
      <div className="inst-title-box">
        {d.courseTitle}
      </div>

      {/* Preamble */}
      <p className="inst-preamble">
        {d.preamble}
      </p>

      {/* Section 1 */}
      <div className="inst-sec">
        <div className="inst-sec-head">أولا : تنظيم التدريب :</div>
        <ol className="inst-list">
          <li>
            الفترة التدريبية {d.periodName} فى المدة من <b>{d.startDate}</b> حتى <b>{d.endDate}</b> من الأسبوع رقم (<b>{ar(d.firstWeek)}</b>) حتى الأسبوع رقم (<b>{ar(d.lastWeek)}</b>) .
          </li>
          <li>
            الفترة التحضيرية فى الأسبوع رقم (<b>{d.prepWeeks.map(ar).join(' ، ')}</b>) خلال المدة من <b>{d.prepStartDate}</b> حتى <b>{d.prepEndDate}</b> .
          </li>
          <li>
            التدريب على مهام العمليات فى الأسبوع رقم (<b>{d.opsWeeks.map(ar).join(' ، ')}</b>) خلال المدة من <b>{d.opsStartDate}</b> حتى <b>{d.opsEndDate}</b> .
          </li>
          <li>
            أسبوع الإحتياط رقم (<b>{d.reserveWeeks.map(ar).join(' ، ')}</b>) خلال المدة من <b>{d.reserveStartDate}</b> حتى <b>{d.reserveEndDate}</b> .
          </li>
          <li>
            مستوى الفرد (<b>{ar(d.individualWeeks)}</b>) أسبوع - الطاقم (<b>{ar(d.crewWeeks)}</b>) أسبوع - المركز (<b>{ar(d.centreWeeks)}</b>) أسبوع .
          </li>
          <li>
            الطابور الأول يوميا لياقة بدنية عدا يوم الخميس تعليم منضم .
          </li>
          <li>
            <b>الأجازات الرسمية :</b>
            <div className="inst-holidays-grid">
              {d.holidays.map(h => (
                <div key={h.letter + h.name} className="inst-holiday-item">
                  <b>{h.letter}-</b> {h.name} : <span>{h.dateStr}</span> .
                </div>
              ))}
            </div>
          </li>
          {d.ramadanStart && d.ramadanStart !== '—' && (
            <li>
              شهر رمضان خلال فى المدة من <b>{d.ramadanStart}</b> حتى <b>{d.ramadanEnd}</b> .
            </li>
          )}
          <li>
            <b>(طابور السير + الأمن الحربى) :</b> تخصيص يوم قصير كامل من الأسبوع {defOrd} من كل شهر (يوم {d.marchDayOfWeek}) ({ar(d.shortDayHours)} ساعات) [ عدا شهر ({d.marchWeekExceptionMonth}) (يتم تخصيص يوم السبت من الأسبوع {excOrd}) ] لصالح (طابور السير + الأمن الحربى) كالأتى :
            <div className="inst-sub-list">
              {d.marchSecuritySchedule.slice(0, 4).map((s, idx) => {
                const letter = ['أ', 'ب', 'ج', 'د'][idx];
                const ord = ['الأول', 'الثانى', 'الثالث', 'الرابع'][idx];
                return (
                  <div key={idx}>
                    {letter} - الشهر {ord} (<b>{ar(s.marchHours)}</b>) طابور سير + (<b>{s.securityHours ? ar(s.securityHours) : '٠'}</b>) أمن حربى .
                  </div>
                );
              })}
              <div>هـ- يكرر الشهر الخامس و السادس .</div>
              <div>و- ساعات طابور السير تحتسب وتضاف إلى ساعات اللياقة البدنية .</div>
            </div>
          </li>
        </ol>
      </div>

      {/* Section 2 */}
      <div className="inst-sec">
        <div className="inst-sec-head">ثانيا : حساب أيام وساعات التدريب القتالى :</div>
        <ol className="inst-list">
          <li>يوم (السبت والثلاثاء) يوم قصير (<b>{ar(d.shortDayHours)}</b>) ساعة نهاراً .</li>
          <li>يوم (الأحد والأربعاء) يوم طويل (<b>{ar(d.longDayHours)}</b>) ساعة [ (<b>{ar(d.longDayDayHours)}</b>) ساعة نهاراً + (<b>{ar(d.longDayNightHours)}</b>) ساعة ليلاً ] .</li>
          <li>يوم الإثنين يوم صيانة (<b>{ar(d.maintenanceHours)}</b>) ساعة .</li>
          <li>يوم الخميس يوم شئون أفراد (<b>{ar(d.personnelHours)}</b>) ساعة .</li>
        </ol>
      </div>

      {/* Section 3 */}
      <div className="inst-sec">
        <div className="inst-sec-head">ثالثا : الموضوعات التى بها تدريب ليلى :</div>
        <div className="inst-night-grid">
          {d.nightSubjects.map((s, idx) => (
            <div key={idx} className="inst-night-item">
              <span className="idx">{ar(idx + 1)}-</span> <b>{s}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Page 2 of the official question/instructions paper */
export function InstructionsPage2({ inst }: { inst: Instructions }) {
  const d = extractInstructionsData(inst);

  return (
    <div className="sheet inst-sheet inst-page" dir="rtl">
      {/* Section 4 */}
      <div className="inst-sec">
        <div className="inst-sec-head">رابعا : المطالب :</div>
        <ol className="inst-list">
          <li>
            <b>تلوين الأجندة وحساب إجمالى ساعات التدريب القتالى (نهاراً - ليلاً) (فرد / طاقم / مركز) طبقاً للألوان الآتية :</b>
            <div className="inst-color-table">
              {COLOR_MAP.map(c => (
                <div key={c.letter} className="inst-color-row">
                  <span className="col-swatch" style={{ background: c.swatch }} />
                  <span className="col-let"><b>{c.letter} -</b></span>
                  <span className="col-lbl">{c.label} :</span>
                  <span className="col-val"><b>{c.color}</b> .</span>
                </div>
              ))}
            </div>
          </li>
          <li>
            توزيع الساعات على الموضوعات (نهاراً / ليلاً) ، (فرد / طاقم / مركز) .
          </li>
          <li>
            عمل جدول لربط الساعات الإجمالى عن الفترة التدريبية {d.periodName} من العام التدريبى {d.yearLabel} عن إجمالى الساعات وإجمالى كل شهر .
          </li>
          <li>
            عمل جدول ربط الساعات عن شهر <b>{d.selectedMonthName}</b> {d.yearLabel} .
          </li>
          <li>
            عمل مستخرج الموضوعات و الساعات عن الأسبوع رقم (<b>{ar(d.selectedWeek)}</b>) من <b>{d.selectedWeekStart}</b> حتى <b>{d.selectedWeekEnd}</b> .
          </li>
        </ol>
      </div>

      {/* Camp Note */}
      <div className="inst-note-box">
        <b>ملحوظة :</b>
        <p>
          - يتم تخطيط عدد (<b>{ar(d.campWeeks.length)}</b>) أسبوع معسكر تدريب ليلى لإستعواض ساعات التدريب الليلى (أسبوع فى فترة الطاقم - أسبوع فى فترة المركز) فى الأسبوع رقم ( <b>{d.campWeeks.map(ar).join(' ، ')}</b> ) علما بأن ساعات التدريب بمعسكر التدريب الليلى [ (<b>{ar(d.campDayHours)}</b> ساعة نهاراً - <b>{ar(d.campNightHours)}</b> ساعة ليلاً) بإجمالى (<b>{ar(d.campTotalHours)} ساعة</b>) (٥ أيام × ١١ ساعة) ] وأول طابور لياقة بدنية .
        </p>
      </div>

      {/* Footer Closing */}
      <div className="inst-closing">
        مع أطيب التمنيات بالنجاح والتوفيق ،،،
      </div>
    </div>
  );
}

/** Unified view for on-screen inspection */
export function InstructionsSheet({ inst }: { inst: Instructions }) {
  return (
    <>
      <div className="inst-page-wrapper">
        <InstructionsPage1 inst={inst} />
      </div>
      <div className="inst-page-wrapper" style={{ marginTop: '24px' }}>
        <InstructionsPage2 inst={inst} />
      </div>
    </>
  );
}
