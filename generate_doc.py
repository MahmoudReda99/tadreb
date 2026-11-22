#!/usr/bin/env python3
"""
Generate نموذج رقم ٥٤٦ — برنامج تدريب السرية (Company Weekly Training Program)

This script generates a Word document (.docx) that maps weekly extract data
(subjects, hours, lecture slots) into the military training program table format.

Table columns (RTL order, right-to-left):
  التاريخ | التوقيت | الطابور | الفصائل (١ ٢ ٣ ٤) | الموضوعات والدروس | المكان | مساعدات التدريب | المعلم المشرف

Each day (Sat-Thu) gets 4 daytime rows:
  ط ١      (٦٠٠ - ٨٠٠)   → lecture 1 (fitness / education)
  ط ٢ / ٣  (٩٠٠ - ١٠٣٠)  → lectures 2-3
  ط ٤ / ٥  (١٠٤٥ - ١٢١٥) → lectures 4-5
  ط ٦ / ٧  (١٢٣٠ - ١٤٠٠) → lectures 6-7

Days with night training get 2 additional rows (ALL IN RED):
  ط ٨ / ٩  (١٦٠٠ - ١٧٣٠) → lectures 8-9
  ط ١٠ / ١١ (١٧٤٥ - ١٩١٥) → lectures 10-11

Friday = راحة (single merged row)

Footer: التوقيع ( ) / قائد السرية
"""

import zipfile
import os

doc_filename = "/Users/mahmoudreda/Desktop/My Projects/تدريب/نموذج_546_برنامج_تدريب_السرية.docx"

# ─── OpenXML boilerplate ─────────────────────────────────────────────────

content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>"""

rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

doc_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>"""

settings_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:evenAndOddHeaders/>
</w:settings>"""

styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/>
        <w:sz w:val="18"/>
        <w:szCs w:val="18"/>
        <w:rtl/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:bidi/>
        <w:jc w:val="center"/>
        <w:spacing w:line="200" w:lineRule="auto" w:before="0" w:after="0"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>"""

# ─── Grid definition (9 logical columns) ────────────────────────────────
# A4 landscape usable width ≈ 15200 twips (16838 - 2*820 margins)
# For portrait A4 with small margins: ~10200 twips

# Columns (RTL — first = rightmost):
# 0: التاريخ     1100
# 1: التوقيت     1200
# 2: الطابور      800
# 3-6: الفصائل    4 × 420 = 1680
# 7: الموضوعات   2800
# 8: المكان       800
# 9: مساعدات      900
# 10: المعلم المشرف 920
# Total = 10200

COL_W = [1100, 1200, 800, 420, 420, 420, 420, 2800, 800, 900, 920]

# ─── Timings ─────────────────────────────────────────────────────────────
# Normal week
DAY_TIMINGS = [
    ("٦٠٠ - ٨٠٠",    "ط ١"),
    ("٩٠٠ – ١٠٣٠",   "ط ٢ / ٣"),
    ("١٠٤٠ - ١٢١٠",  "ط ٤ / ٥"),
    ("١٢٢٠ - ١٣٥٠",  "ط ٦ / ٧"),
]

NIGHT_TIMINGS = [
    ("١٦٠٠ - ١٧٣٠",  "ط ٨ / ٩"),
    ("١٧٤٥ - ١٩١٥",  "ط ١٠ / ١١"),
]

# Ramadan month
RAMADAN_TIMINGS = [
    ("٩٠٠ - ٠٩٣٥",   "ط ١"),
    ("١٠٠٠ - ١١١٠",  "ط ٢ / ٣"),
    ("١١٢٠ - ١٢٣٠",  "ط ٤ / ٥"),
    ("١٢٤٠ - ١٣٥٠",  "ط ٦ / ٧"),
]

# External / Concentrated Camp weeks (أسابيع معسكرات التدريب الخارجية / المُركزة)
CAMP_DAY_TIMINGS = [
    ("٠٧٣٥ - ٠٩٠٠",  "ط ١"),
    ("١٠٠٠ - ١١٣٠",  "ط ٢ / ٣"),
    ("١١٤٠ - ١٣١٠",  "ط ٤ / ٥"),
]

CAMP_NIGHT_TIMINGS = [
    ("١٨٠٠ - ١٩٣٠",  "ط ٦ / ٧"),
    ("١٩٤٠ - ٢١١٠",  "ط ٨ / ٩"),
    ("٢١٥٠ - ٢٣٢٠",  "ط ١٠ / ١١"),
]

# Day names
DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

# Lecture-slot to timing index mapping
# lecture "1" → timing index 0 (ط ١)
# lecture "2-3" → timing index 1 (ط ٢/٣)
# lecture "4-5" → timing index 2 (ط ٤/٥)
# lecture "4-7" → timing indices 2+3 merged (ط ٤/٧)
# lecture "6-7" → timing index 3 (ط ٦/٧)
# lecture "8-9" → night timing index 0 (ط ٨/٩)
# lecture "10-11" → night timing index 1 (ط ١٠/١١)


def tc(w, text="", gridSpan=1, vMerge=None, bold=False, sz=16, align="center", red=False, thick_bottom=False):
    """Generate a table cell XML element."""
    p_align = f'<w:jc w:val="{align}"/>'
    r_bold = '<w:b/><w:bCs/>' if bold else ''
    r_color = '<w:color w:val="FF0000"/>' if red else ''
    
    vm_tag = ''
    if vMerge == "restart":
        vm_tag = '<w:vMerge w:val="restart"/>'
    elif vMerge == "continue":
        vm_tag = '<w:vMerge/>'
    
    gs_tag = f'<w:gridSpan w:val="{gridSpan}"/>' if gridSpan > 1 else ''
    bdr_tag = '<w:tcBorders><w:bottom w:val="single" w:sz="18" w:space="0" w:color="000000"/></w:tcBorders>' if thick_bottom else ''
    
    return f"""<w:tc>
      <w:tcPr>
        <w:tcW w:w="{w}" w:type="dxa"/>
        {gs_tag}{vm_tag}{bdr_tag}
        <w:vAlign w:val="center"/>
        <w:tcMar><w:top w:w="20" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tcMar>
      </w:tcPr>
      <w:p>
        <w:pPr><w:bidi/>{p_align}<w:spacing w:before="0" w:after="0" w:line="180" w:lineRule="auto"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/>
            <w:bidi/><w:rtl/>
            {r_bold}{r_color}
            <w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>
          </w:rPr>
          <w:t xml:space="preserve">{text}</w:t>
        </w:r>
      </w:p>
    </w:tc>"""


def build_table(week_data=None):
    """
    Build the main training program table.
    
    week_data: if provided, a dict with:
      - days: list of 6 dicts (Sat-Thu), each with:
          - night: int (number of night hours)
          - slots: list of dicts with keys: timing_idx, subject, location, is_night
      If None, generates an empty template.
    """
    rows = []
    total_cols = len(COL_W)
    
    # ── Header Row 1: Main Headers ──
    h1_cells = [
        tc(COL_W[0], "التاريخ", vMerge="restart", bold=True, sz=18),
        tc(COL_W[1], "التوقيت", vMerge="restart", bold=True, sz=18),
        tc(COL_W[2], "الطابور", vMerge="restart", bold=True, sz=18),
        tc(sum(COL_W[3:7]), "الفصائل", gridSpan=4, bold=True, sz=18),
        tc(COL_W[7], "الموضوعات والدروس ومشتملاتها", vMerge="restart", bold=True, sz=16),
        tc(COL_W[8], "المكان", vMerge="restart", bold=True, sz=18),
        tc(COL_W[9], "مساعدات التدريب", vMerge="restart", bold=True, sz=14),
        tc(COL_W[10], "المعلم المشرف", vMerge="restart", bold=True, sz=14),
    ]
    rows.append(f"""<w:tr>
      <w:trPr><w:tblHeader/><w:trHeight w:val="340" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
      {''.join(h1_cells)}
    </w:tr>""")
    
    # ── Header Row 2: Platoon Sub-headers ──
    h2_cells = [
        tc(COL_W[0], "", vMerge="continue"),
        tc(COL_W[1], "", vMerge="continue"),
        tc(COL_W[2], "", vMerge="continue"),
        tc(COL_W[3], "١", bold=True, sz=16),
        tc(COL_W[4], "٢", bold=True, sz=16),
        tc(COL_W[5], "٣", bold=True, sz=16),
        tc(COL_W[6], "٤", bold=True, sz=16),
        tc(COL_W[7], "", vMerge="continue"),
        tc(COL_W[8], "", vMerge="continue"),
        tc(COL_W[9], "", vMerge="continue"),
        tc(COL_W[10], "", vMerge="continue"),
    ]
    rows.append(f"""<w:tr>
      <w:trPr><w:tblHeader/><w:trHeight w:val="260" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
      {''.join(h2_cells)}
    </w:tr>""")
    
    # ── Day rows (Sat → Thu) ──
    for di in range(6):
        day_name = DAYS[di]

        # Check if day is non-training (prep, ops, reserve, holiday)
        if week_data and di < len(week_data.get('days', [])):
            day_info = week_data['days'][di]
            if day_info.get('is_rest'):
                rest_label = day_info.get('rest_label', 'لا يوجد تدريب')
                if (is_camp or week_data.get('is_ops', False)) and di == 5:
                    rest_label = 'يوم صيانة'
                is_maint = (rest_label == 'يوم صيانة')
                tr_h = "750" if is_maint else "260"
                rest_cells = [
                    tc(COL_W[0], day_name, bold=True, sz=18, thick_bottom=True),
                    tc(sum(COL_W[1:]), rest_label, gridSpan=len(COL_W)-1, bold=True, sz=20 if is_maint else 18, thick_bottom=True),
                ]
                rows.append(f"""<w:tr>
                  <w:trPr><w:trHeight w:val="{tr_h}" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
                  {''.join(rest_cells)}
                </w:tr>""")
                continue

        has_night = False
        if week_data and di < len(week_data.get('days', [])):
            has_night = week_data['days'][di].get('night', 0) > 0
        
        is_camp = week_data.get('is_camp', False) if week_data else False
        is_ramadan = day_info.get('is_ramadan', False) if (week_data and di < len(week_data.get('days', []))) else False

        if is_camp:
            all_timings = list(CAMP_DAY_TIMINGS) + list(CAMP_NIGHT_TIMINGS)
            night_start = 3
        elif is_ramadan:
            all_timings = list(RAMADAN_TIMINGS)
            night_start = 999
        else:
            all_timings = list(DAY_TIMINGS) + (list(NIGHT_TIMINGS) if has_night else [])
            night_start = 4
        
        is_monday = (di == 2)
        is_thursday = (di == 5)
        is_march = day_info.get('kind') == 'march' or day_info.get('is_march', False) if (week_data and di < len(week_data.get('days', []))) else False

        if not is_camp and is_march:
            march_h = day_info.get('march_hours', 3)
            sec_h = day_info.get('sec_hours', 4)
            t1 = "٩٠٠ - ٠٩٣٥" if is_ramadan else "٦٠٠ - ٨٠٠"
            t23 = "١٠٠٠ - ١١١٠" if is_ramadan else "٩٠٠ – ١٠٣٠"
            t45 = "١١٢٠ - ١٢٣٠" if is_ramadan else "١٠٤٠ - ١٢١٠"
            t47 = "١١٢٠ - ١٣٥٠" if is_ramadan else "١٠٤٠ - ١٣٥٠"
            t67 = "١٢٤٠ - ١٣٥٠" if is_ramadan else "١٢٢٠ - ١٣٥٠"

            # Row 1: ط ١ (طابور سير)
            day_cell = tc(COL_W[0], day_name, vMerge="restart", bold=True, sz=18)
            timing_cell = tc(COL_W[1], t1, bold=True, sz=14)
            tabour_cell = tc(COL_W[2], "ط ١", bold=True, sz=14)
            platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12) for j in range(4))
            subject_cell = tc(COL_W[7], "طابور سير", bold=False, sz=14)
            location_cell = tc(COL_W[8], "خارج المعسكر / خط السير", bold=False, sz=14)
            aids_cell = tc(COL_W[9], "مهمات القتال والميدان كاملة", sz=12)
            instructor_cell = tc(COL_W[10], "قائد السرية", sz=12)
            rows.append(f"""<w:tr><w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>{day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}</w:tr>""")

            # Row 2: ط ٢ / ٣ (طابور سير)
            is_last_2 = (sec_h == 0 and march_h <= 3)
            day_cell = tc(COL_W[0], "", vMerge="continue", thick_bottom=is_last_2)
            timing_cell = tc(COL_W[1], t23, bold=True, sz=14, thick_bottom=is_last_2)
            tabour_cell = tc(COL_W[2], "ط ٢ / ٣", bold=True, sz=14, thick_bottom=is_last_2)
            platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12, thick_bottom=is_last_2) for j in range(4))
            subject_cell = tc(COL_W[7], "طابور سير", bold=False, sz=14, thick_bottom=is_last_2)
            location_cell = tc(COL_W[8], "خارج المعسكر / خط السير", bold=False, sz=14, thick_bottom=is_last_2)
            aids_cell = tc(COL_W[9], "مهمات القتال والميدان كاملة", sz=12, thick_bottom=is_last_2)
            instructor_cell = tc(COL_W[10], "قائد السرية", sz=12, thick_bottom=is_last_2)
            rows.append(f"""<w:tr><w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>{day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}</w:tr>""")

            if sec_h >= 4:
                # Row 3: ط ٤ / ٧ (أمن حربى)
                day_cell = tc(COL_W[0], "", vMerge="continue", thick_bottom=True)
                timing_cell = tc(COL_W[1], t47, bold=True, sz=14, thick_bottom=True)
                tabour_cell = tc(COL_W[2], "ط ٤ / ٧", bold=True, sz=14, thick_bottom=True)
                platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12, thick_bottom=True) for j in range(4))
                subject_cell = tc(COL_W[7], "أمن حربى", bold=False, sz=14, thick_bottom=True)
                location_cell = tc(COL_W[8], "قاعة المحاضرات", bold=False, sz=14, thick_bottom=True)
                aids_cell = tc(COL_W[9], "لوحات إرشادية وتوعوية", sz=12, thick_bottom=True)
                instructor_cell = tc(COL_W[10], "ضابط الأمن الحربى", sz=12, thick_bottom=True)
                rows.append(f"""<w:tr><w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>{day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}</w:tr>""")
            else:
                # Row 3: ط ٤ / ٥
                subj_3 = "طابور سير" if march_h > 3 else "أمن حربى"
                loc_3 = "خارج المعسكر / خط السير" if march_h > 3 else "قاعة المحاضرات"
                aids_3 = "مهمات القتال والميدان كاملة" if march_h > 3 else "لوحات إرشادية وتوعوية"
                inst_3 = "قائد السرية" if march_h > 3 else "ضابط الأمن الحربى"
                day_cell = tc(COL_W[0], "", vMerge="continue")
                timing_cell = tc(COL_W[1], t45, bold=True, sz=14)
                tabour_cell = tc(COL_W[2], "ط ٤ / ٥", bold=True, sz=14)
                platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12) for j in range(4))
                subject_cell = tc(COL_W[7], subj_3, bold=False, sz=14)
                location_cell = tc(COL_W[8], loc_3, bold=False, sz=14)
                aids_cell = tc(COL_W[9], aids_3, sz=12)
                instructor_cell = tc(COL_W[10], inst_3, sz=12)
                rows.append(f"""<w:tr><w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>{day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}</w:tr>""")

                # Row 4: ط ٦ / ٧
                subj_4 = "طابور سير" if sec_h == 0 else "أمن حربى"
                loc_4 = "خارج المعسكر / خط السير" if sec_h == 0 else "قاعة المحاضرات"
                aids_4 = "مهمات القتال والميدان كاملة" if sec_h == 0 else "لوحات إرشادية وتوعوية"
                inst_4 = "قائد السرية" if sec_h == 0 else "ضابط الأمن الحربى"
                day_cell = tc(COL_W[0], "", vMerge="continue", thick_bottom=True)
                timing_cell = tc(COL_W[1], t67, bold=True, sz=14, thick_bottom=True)
                tabour_cell = tc(COL_W[2], "ط ٦ / ٧", bold=True, sz=14, thick_bottom=True)
                platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12, thick_bottom=True) for j in range(4))
                subject_cell = tc(COL_W[7], subj_4, bold=False, sz=14, thick_bottom=True)
                location_cell = tc(COL_W[8], loc_4, bold=False, sz=14, thick_bottom=True)
                aids_cell = tc(COL_W[9], aids_4, sz=12, thick_bottom=True)
                instructor_cell = tc(COL_W[10], inst_4, sz=12, thick_bottom=True)
                rows.append(f"""<w:tr><w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>{day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}</w:tr>""")
            continue

        if not is_camp and is_monday:
            # First row: ط ١ (تربية بدنية)
            t1 = "٩٠٠ - ٠٩٣٥" if is_ramadan else "٦٠٠ - ٨٠٠"
            day_cell = tc(COL_W[0], day_name, vMerge="restart", bold=True, sz=18)
            timing_cell = tc(COL_W[1], t1, bold=True, sz=14)
            tabour_cell = tc(COL_W[2], "ط ١", bold=True, sz=14)
            platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12) for j in range(4))
            subject_cell = tc(COL_W[7], "تربية بدنية", bold=False, sz=14)
            location_cell = tc(COL_W[8], "أرض الطابور", bold=False, sz=14)
            aids_cell = tc(COL_W[9], "أدوات لياقة بدنية", sz=12)
            instructor_cell = tc(COL_W[10], "معلم اللياقة البدنية", sz=12)
            rows.append(f"""<w:tr>
              <w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
              {day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}
            </w:tr>""")
            # Second row: يوم صيانة (merged across 10 cols)
            day_cont = tc(COL_W[0], "", vMerge="continue", thick_bottom=True)
            maint_cell = tc(sum(COL_W[1:]), "يوم صيانة", gridSpan=len(COL_W)-1, bold=True, sz=20, thick_bottom=True)
            rows.append(f"""<w:tr>
              <w:trPr><w:trHeight w:val="750" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
              {day_cont + maint_cell}
            </w:tr>""")
            continue
        if is_camp and is_thursday:
            # In camp week, Thursday is "يوم صيانة"
            day_cell = tc(COL_W[0], day_name, bold=True, sz=18, thick_bottom=True)
            maint_cell = tc(sum(COL_W[1:]), "يوم صيانة", gridSpan=len(COL_W)-1, bold=True, sz=20, thick_bottom=True)
            rows.append(f"""<w:tr>
              <w:trPr><w:trHeight w:val="750" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
              {day_cell + maint_cell}
            </w:tr>""")
            continue
        elif not is_camp and is_thursday:
            # First row: ط ١ (تعليم منضم)
            t1 = "٩٠٠ - ٠٩٣٥" if is_ramadan else "٦٠٠ - ٨٠٠"
            day_cell = tc(COL_W[0], day_name, vMerge="restart", bold=True, sz=18)
            timing_cell = tc(COL_W[1], t1, bold=True, sz=14)
            tabour_cell = tc(COL_W[2], "ط ١", bold=True, sz=14)
            platoon_cells = ''.join(tc(COL_W[3+j], "✔", sz=12) for j in range(4))
            subject_cell = tc(COL_W[7], "تعليم منضم", bold=False, sz=14)
            location_cell = tc(COL_W[8], "أرض الطابور", bold=False, sz=14)
            aids_cell = tc(COL_W[9], "السلاح الشخصى", sz=12)
            instructor_cell = tc(COL_W[10], "قائد الفصيلة", sz=12)
            rows.append(f"""<w:tr>
              <w:trPr><w:trHeight w:val="250" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
              {day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell}
            </w:tr>""")
            # Second row: شئون أفراد (merged across 10 cols)
            day_cont = tc(COL_W[0], "", vMerge="continue", thick_bottom=True)
            personnel_cell = tc(sum(COL_W[1:]), "شئون أفراد", gridSpan=len(COL_W)-1, bold=True, sz=20, thick_bottom=True)
            rows.append(f"""<w:tr>
              <w:trPr><w:trHeight w:val="750" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
              {day_cont + personnel_cell}
            </w:tr>""")
            continue

        for ti, (timing, tabour) in enumerate(all_timings):
            is_night_row = ti >= night_start
            is_last_row = (ti == len(all_timings) - 1)
            
            # Day name cell (merged vertically for all rows of this day)
            if ti == 0:
                day_cell = tc(COL_W[0], day_name, vMerge="restart", bold=True, sz=18, thick_bottom=is_last_row)
            else:
                day_cell = tc(COL_W[0], "", vMerge="continue", thick_bottom=is_last_row)
            
            # Timing cell
            timing_cell = tc(COL_W[1], timing, bold=True, sz=14, red=is_night_row, thick_bottom=is_last_row)
            
            # Tabour cell
            tabour_cell = tc(COL_W[2], tabour, bold=True, sz=14, red=is_night_row, thick_bottom=is_last_row)
            
            # Platoon cells (empty for now)
            platoon_cells = ''.join(tc(COL_W[3+j], "", sz=14, red=is_night_row, thick_bottom=is_last_row) for j in range(4))
            
            # Subject, Location, Aids, Instructor cells
            subject = ""
            location = ""
            if week_data and di < len(week_data.get('days', [])):
                day_info = week_data['days'][di]
                for slot in day_info.get('slots', []):
                    if slot['timing_idx'] == ti:
                        subject = slot.get('subject', '')
                        location = slot.get('location', '')
                        break
            
            subject_cell = tc(COL_W[7], subject, bold=False, sz=14, red=is_night_row, thick_bottom=is_last_row)
            location_cell = tc(COL_W[8], location, bold=False, sz=14, red=is_night_row, thick_bottom=is_last_row)
            aids_cell = tc(COL_W[9], "", sz=14, red=is_night_row, thick_bottom=is_last_row)
            instructor_cell = tc(COL_W[10], "", sz=14, red=is_night_row, thick_bottom=is_last_row)
            
            row_cells = day_cell + timing_cell + tabour_cell + platoon_cells + subject_cell + location_cell + aids_cell + instructor_cell
            
            row_h = "240" if is_night_row else "260"
            rows.append(f"""<w:tr>
              <w:trPr><w:trHeight w:val="{row_h}" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
              {row_cells}
            </w:tr>""")
    
    # ── Friday row (راحة — single merged row) ──
    friday_cells = [
        tc(COL_W[0], "الجمعة", bold=True, sz=18, thick_bottom=True),
        tc(sum(COL_W[1:]), "راحة", gridSpan=len(COL_W)-1, bold=True, sz=18, thick_bottom=True),
    ]
    rows.append(f"""<w:tr>
      <w:trPr><w:trHeight w:val="260" w:hRule="atLeast"/><w:jc w:val="center"/></w:trPr>
      {''.join(friday_cells)}
    </w:tr>""")
    
    # ── Assemble table ──
    table_xml = f"""<w:tbl>
      <w:tblPr>
        <w:tblW w:w="{sum(COL_W)}" w:type="dxa"/>
        <w:bidiVisual/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:left w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:bottom w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:right w:val="double" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        {''.join(f'<w:gridCol w:w="{w}"/>' for w in COL_W)}
      </w:tblGrid>
      {''.join(rows)}
    </w:tbl>"""
    
    return table_xml


def build_document(week_data=None):
    """Build the complete document XML."""
    table_xml = build_table(week_data)
    
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    
    <!-- Top 3-column Layout Table (Borderless) -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="{sum(COL_W)}" w:type="dxa"/>
        <w:bidiVisual/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3400"/>
        <w:gridCol w:w="3400"/>
        <w:gridCol w:w="3400"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="140"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/><w:u w:val="single"/></w:rPr><w:t>وزارة الدفاع</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>الكتيبة / .........................</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/><w:u w:val="single"/></w:rPr><w:t>سرى جداً</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>- ١٥٥ -</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="left"/><w:spacing w:after="0"/></w:pPr>
            <w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>نموذج رقم ٥٤٦ ((هـ . تد رماية))</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Title -->
    <w:p>
      <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="80" w:after="40"/></w:pPr>
      <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/></w:rPr><w:t>برنامج تدريب السرية</w:t></w:r>
    </w:p>

    <!-- صودق / قائد الكتيبة -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5600" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:bidiVisual/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="2800"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:jc w:val="center"/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>صودق</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="left"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>قائد الكتيبة : ------------------------</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- عن الأسبوع -->
    <w:p>
      <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="60" w:after="180"/></w:pPr>
      <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>عن الأسبوع من : -------------------- إلي --------------------</w:t></w:r>
    </w:p>

    <!-- The Main Table -->
    {table_xml}

    <!-- Signature Footer -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="{sum(COL_W)}" w:type="dxa"/>
        <w:bidiVisual/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="6000"/>
        <w:gridCol w:w="4200"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>
          <w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t></w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4200" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="60" w:after="20"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>(                  ) التوقيع</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
            <w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>قائد السرية / ....................................</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Section: A4 Portrait, tight margins for 1-page fit -->
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
      <w:pgMar w:top="500" w:right="600" w:bottom="400" w:left="600" w:header="400" w:footer="400" w:gutter="0"/>
      <w:bidi/>
    </w:sectPr>
  </w:body>
</w:document>"""
    
    return document_xml


def generate_docx(document_xml, filename=doc_filename):
    """Write the .docx zip package."""
    with zipfile.ZipFile(filename, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types_xml)
        z.writestr('_rels/.rels', rels_xml)
        z.writestr('word/_rels/document.xml.rels', doc_rels_xml)
        z.writestr('word/settings.xml', settings_xml)
        z.writestr('word/styles.xml', styles_xml)
        z.writestr('word/document.xml', document_xml)
    print(f"Generated: {filename} ({os.path.getsize(filename)} bytes)")


# ─── Sample data: empty template with 2 days having night training ──────
# This generates an empty form for now. 
# The React app will call this with actual weekly extract data.

sample_data = {
    'days': [
        # Saturday: 4 day + 0 night slots
        {'night': 0, 'slots': [
            {'timing_idx': 0, 'subject': 'تربية بدنية', 'location': 'أرض الطابور'},
            {'timing_idx': 1, 'subject': '', 'location': ''},
            {'timing_idx': 2, 'subject': '', 'location': ''},
            {'timing_idx': 3, 'subject': '', 'location': ''},
        ]},
        # Sunday: 4 day + 0 night
        {'night': 0, 'slots': [
            {'timing_idx': 0, 'subject': 'تربية بدنية', 'location': 'أرض الطابور'},
            {'timing_idx': 1, 'subject': '', 'location': ''},
            {'timing_idx': 2, 'subject': '', 'location': ''},
            {'timing_idx': 3, 'subject': '', 'location': ''},
        ]},
        # Monday: 4 day + 2 night
        {'night': 4, 'slots': [
            {'timing_idx': 0, 'subject': 'تربية بدنية', 'location': 'أرض الطابور'},
            {'timing_idx': 1, 'subject': '', 'location': ''},
            {'timing_idx': 2, 'subject': '', 'location': ''},
            {'timing_idx': 3, 'subject': '', 'location': ''},
            {'timing_idx': 4, 'subject': '', 'location': ''},
            {'timing_idx': 5, 'subject': '', 'location': ''},
        ]},
        # Tuesday: 4 day + 2 night
        {'night': 4, 'slots': [
            {'timing_idx': 0, 'subject': 'تربية بدنية', 'location': 'أرض الطابور'},
            {'timing_idx': 1, 'subject': '', 'location': ''},
            {'timing_idx': 2, 'subject': '', 'location': ''},
            {'timing_idx': 3, 'subject': '', 'location': ''},
            {'timing_idx': 4, 'subject': '', 'location': ''},
            {'timing_idx': 5, 'subject': '', 'location': ''},
        ]},
        # Wednesday: 4 day + 0 night
        {'night': 0, 'slots': [
            {'timing_idx': 0, 'subject': 'تربية بدنية', 'location': 'أرض الطابور'},
            {'timing_idx': 1, 'subject': '', 'location': ''},
            {'timing_idx': 2, 'subject': '', 'location': ''},
            {'timing_idx': 3, 'subject': '', 'location': ''},
        ]},
        # Thursday: 4 day + 0 night (short day example)
        {'night': 0, 'slots': [
            {'timing_idx': 0, 'subject': 'تعليم منضم', 'location': 'أرض الطابور'},
            {'timing_idx': 1, 'subject': '', 'location': ''},
            {'timing_idx': 2, 'subject': '', 'location': ''},
            {'timing_idx': 3, 'subject': '', 'location': ''},
        ]},
    ]
}

if __name__ == '__main__':
    doc = build_document(sample_data)
    generate_docx(doc)
