# منظومة أجندة التدريب القتالى

Arabic RTL, offline-first PWA. It reads the instructions page of the combat-training exam (DOCX, PDF or image),
lets you confirm the extracted **Instructions** object, solves the four pages for any training year, and exports an
A4-landscape PDF that looks like the official form. No backend, no network call at run time.

```bash
npm install
npm run dev        # development
npm test           # engine + parser unit tests (24)
npm run build      # tsc + vite build + service worker (precaches everything, incl. OCR + fonts)
npm run preview    # serve dist/ to test install / offline
```

Stack: React + Vite + TypeScript, vite-plugin-pwa, Dexie (projects), mammoth (DOCX), pdf.js (PDF text),
Tesseract.js with the Arabic model in `public/tess/` (images and scanned PDFs), jsPDF + html2canvas (PDF), Cairo font bundled.

```
src/engine   pure functions: agenda, distribution, linking, weekly, audit (no UI)
src/parser   text -> Instructions (+ per-field confidence), DOCX/PDF/OCR extraction
src/ui       sheets (the four pages), review form, cell inspector
src/export   PDF export
samples/     (local only, not committed) fixture export + the original exam and answer key for visual comparison
```

## Flow
1. Upload DOCX / PDF / image (or use the course-108 demo, JSON import, or manual entry).
2. The parser fills the Instructions object. Every field has a confidence; anything below 0.8 (OCR, ambiguous digits,
   guessed values) is highlighted and **must be confirmed or fixed** before the calculate button unlocks.
3. Four tabs: Agenda, Distribution, Linking table (month detail selectable), Weekly extract (week selectable).
   Tap any number to open the cell inspector (rule, numbers, equation, check mark).
4. Export PDF (or Print). Projects are saved in IndexedDB; Instructions export/import as JSON.

The parser also copes with documents whose digits are stored reversed (`03/21/3202` = 30/12/2023, `(62)` = 26),
as in the course-108 DOCX.

## Second period / other courses
The engine and parser are not tied to course 108. `firstWeek` (1 for the first period, 27 for the second) numbers the weeks as printed;
dates may be day-first, year-first (`2026/01/03`) or character-reversed; special weeks (prep, ops, reserve) are taken from their printed
date ranges when readable and from the printed numbers otherwise; the march-Saturday week and its exception month are read from the text
(course 111: week 3, March week 4). Presets for both exams are on the home screen (`FIXTURE_108`, `FIXTURE_111`).

**Scanned photos (e.g. CamScanner PDFs).** Tesseract's Arabic model reads the words of such a scan but not its Arabic-Indic digits
(`٢٠٢٦/٠١/٠٣` came out as `٠055/01/86`). So `src/parser/digits.ts` re-reads every number-shaped OCR word itself:
the word is cut into glyphs (connected components of a binarised, upscaled crop), each glyph is classified by shape against the ten digits
rendered from the bundled fonts (slashes and brackets by height: ≈1.2× and ≈1.5× a digit), dates are decoded structurally
(`yyyy/mm/dd` or `dd/mm/yyyy` with fixed separators, runner-up shapes tried until the date is real), and merged words become
`from حتى to` ranges. On the course-111 scan this recovers the period, weeks 27–52, prep / ops / reserve ranges, night-camp weeks,
Ramadan, all ten holidays and the march/security hours (`exam111-ocr.txt` is the real output; its test is in `parse111.test.ts`).
Holiday ranges written as `27 - 2026/05/30` (start day, dash, end date) are decoded as a range; a blessed holiday still read as a single day triggers a warning in the review screen.
Every field read from OCR is still highlighted and must be confirmed, and the raw OCR text is shown next to the form.
Speed: one full-resolution OCR pass per page (sideways table pages are detected with cheap low-resolution passes), several pages in parallel on up to 4 workers — the six-page course-111 scan takes ~25 s on an 8-core machine (it took ~170 s with two full passes per page, two more for table pages, one worker). Keep the tab in the foreground: pdf.js pauses in hidden tabs.

**Night hours are printed in red** in every sheet and in the PDF (agenda night row, distribution, linking cells `day / night`, weekly extract and its night lectures 8–11).

## Rules implemented
**Paint order** (a later layer never overrides an earlier one): 1 holiday (0h) > 2 prep week (0h) > 3 reserve week (0h)
> 4 ops-task week (0h) > 5 night camp > 6 march Saturday > 7 Ramadan colour / Friday (0h) > 8 weekday type.
Ramadan paints every remaining day cyan (the key does this, Mon/Thu/Fri included) but only changes hours of Sun/Wed (long -> short).
Week-number header is coloured only for prep, reserve and ops weeks.

Weekday types: Sat/Tue = 7 day; Sun/Wed = 7 day + 4 night; Mon = 1 (fitness); Thu = 1 (combined education).
Camp week: Sat–Wed 5 day + 6 night each, Thu/Fri 0. Fitness = 1 per day Sat–Wed (and per camp day);
march Saturday = 7 day hours: `march` count as fitness, `security` as military security.
Validation: weekly rows = month columns = grand total (green check / red mismatch).

**Page 2.** `T` = grand total; main = nearest-even(72% T), general = T − main. Every non-balancing product is rounded to the
**nearest even number**. Fitness / education / security come from the agenda. Shooting = main − (tactics + tech + fitness);
information war = general − the rest. Night ratio = night total / hours of the 7 night subjects; night per subject = nearest-even(hours × ratio).
Technical levels: `crew` and `centre` = nearest-even(techHours × levelPeriodHours / periodTotal), **individual = remainder**
(day and night separately). Level periods: the first 9 / next 7 / next 6 *training* weeks (prep, ops and reserve weeks excluded).

**Page 3.** cell = subject total × column total / grand total, in even units with the **largest-remainder** method; then balancing
rows (shooting, information war) absorb the column, a repair step keeps them non-negative, and general night is balanced so every
column hits its target. Horizontal check (row = subject total) and vertical check (column = month/week total) are shown.
The selected month is also split by weeks (ops week = 0).

**Page 4.** Week hours come from the page-3 week split. Day lectures 1–7 (fitness takes lecture 1 daily except Thursday,
combined education Thursday lecture 1), remaining day lectures in pairs `2 / 2-3`, `2 / 4-5`, `2 / 6-7`; night lectures `2 / 8-9`, `2 / 10-11`.
Every day's slots add up to that day's hours, every subject's slots to its weekly hours.

## The three "open points" — answers found in the solved key
| | Finding |
|---|---|
| a) March night 16 / June night 34, April fitness 29 / June 12 | The key's own page 1 and page 3 show **March night = 12 and June night = 38** (our rules already give that), so 16/34 were mis-copied. The fitness figures come from the **march/security pairs**: the exam text gives month 4 (April) = **7 + 0** and says months 5 and 6 repeat months 1 and 2 (**3 + 4**). The earlier fixture had 7+0 on June. With April 7+0 and June 3+4 the key's 29 and 12 are reproduced. |
| b) Levels 74/52/42 vs 76/52/40 | Crew and centre are rounded; **individual is the remainder** (168 − 52 − 40 = 76; night 80 − 20 − 28 = 32). |
| c) Tech night 80 | **Specialised-technical night is the balancing figure** (172 − all other night subjects = 80); chemical is rounded normally (8). |

## Verification
* `npm test`: totals 775 = 603 + 172, fitness 120, education 17, security 18; month day/night/fitness; weeks 19–22 = 29/8, 30/8, 0, 30/8;
  every page-2 subject and the three technical levels; page-3 row/column checks and the key's main-subject month totals;
  page-4 slot checks for all 26 weeks; the parser run on the real DOCX text reproduces the key totals.
* The PDF in `samples/fixture-108-export.pdf` was produced by the app from the fixture; compare it with the original answer key and exam.
  `samples/` and the real-exam text files used by some parser tests are private and not in the repository; those tests are skipped when the files are absent.

## Known limits
* **Page 3 inner cells are not hand-identical to the key.** Row and column checks, all month totals and the main-subject
  month totals match, but the key's individual cells were adjusted by hand (e.g. technical May night 8, shooting January 5);
  the app uses a deterministic largest-remainder + balancing rule instead.
* The PDF is rasterised (html2canvas), so its text is not selectable.
* Offline behaviour is guaranteed by the service-worker precache (all JS, fonts, pdf.js worker, Tesseract worker/wasm/Arabic model, 37 entries);
  test it with `npm run build && npm run preview`, open once online, then switch to airplane mode.
* OCR output on photographed pages is imperfect by nature — that is why low-confidence fields must be confirmed.
