import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import { Helmet } from 'react-helmet';

import map from 'lodash/map';
import filter from 'lodash/filter';

import IconPrint from 'material-ui/svg-icons/action/print';
import IconClose from 'material-ui/svg-icons/navigation/close';

import Props from './props';

// The report must match the Summary dialog's conventions exactly (formatting,
// units, severity stars), so it reuses that component's exported helpers.
import {
  ANALYSIS_NAMES, NORMS_NOT_MATCHED,
} from 'components/AnalysisResultsViewer';
import { mapCategoryToString } from 'components/AnalysisResultsViewer/strings';

import { formatMmPx } from 'components/TracingToolbar/CalibrationDialog';

import { buildProfilogram } from 'analyses/profilogram';
import {
  evaluateAnalysis,
  definesMeasurements,
  AnalysisEvaluation,
} from 'analyses/evaluate';
import { LATERAL_ANALYSES, LateralAnalysisEntry } from 'analyses/lateral';
import { getStepsForAnalysis, isStepManual } from 'analyses/helpers';
import { renderTracingSnapshot, ManualLandmarks } from 'utils/tracingSnapshot';
import { isGeoPoint } from 'utils/math';
import {
  formatAgeFull, formatSexFull, getAnalysisContext,
} from 'utils/patient';
import { parseCaptureDate, formatCaptureDate } from 'utils/records';
// A saved PDF is named after the document title, so every printable view titles
// itself from the patient rather than from the image's file name.
import { printDocumentTitle } from 'utils/printTitle';

import Wigglegram, { WigglegramKey } from './Wigglegram';
import ResultsTable, { DeviationKey } from './ResultsTable';
import FindingsOverview from './FindingsOverview';
import { AnalysisSections, PendingNote } from './AnalysisSection';
import NormsNote from './NormsNote';
import { findDivergences, divergentCategorySet } from './divergence';
// The practice identity is shared with every other printable view (the
// superimposition sheet included), so a document from this app is never signed
// to two different standards.
import {
  STORAGE_KEY_CLINIC,
  STORAGE_KEY_CLINICIAN,
  STORAGE_KEY_LICENSE,
  readStored,
  writeStored,
} from './letterhead';

const classes = require('./style.scss');

/**
 * Ruled lines in the "Clinical notes & plan" area.
 *
 * Six, set in two columns (see `.notes_rules`) — six writing lines in the
 * height of three, which is what lets the whole closing block (notes,
 * certification, footer) land under the last table on the sheet that table ends
 * on. Twenty full-width rules made the block taller than any page could ever
 * have left over, so it claimed a sheet of its own every time: the
 * single-analysis report printed four sides for two pages of content, the third
 * of them 31 % full and the fourth twenty blank lines.
 */
const NOTE_RULES: number[] = [0, 1, 2, 3, 4, 5];

/**
 * Ruled lines when the closing block gets a **sheet of its own**.
 *
 * The combined report always ends on one — nine analyses never leave room for
 * the tail under the last table — and that sheet used to carry four short rules,
 * a signature row and 80 % white: the code above called it "a proper signature
 * page" and it read as a printer fault. Given a whole side of A4, the writing
 * area is what should fill it: twenty-four full-width rules at a real writing
 * pitch (see `.tail__own_sheet`), with the certification and the footer settled
 * at the foot of the sheet where a signature belongs.
 *
 * The single-analysis report keeps the six two-column rules above: its tail
 * lands *under* the last table, and growing it there would buy a whole extra
 * side of paper for nothing — which is exactly what this report used to do.
 */
const NOTE_RULES_SHEET: number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
];

/**
 * Global (unhashed) body class toggled while the report is open; the print
 * stylesheet keys off it to hide the app and print only the paper.
 */
const BODY_OPEN_CLASS = 'clinical-report-open';

/** Human-readable caption names for the image types the app knows about. */
const IMAGE_TYPE_NAMES: { [type: string]: string | undefined } = {
  ceph_lateral: 'Lateral cephalometric radiograph',
  ceph_frontal: 'Frontal cephalometric radiograph',
  panoramic: 'Panoramic radiograph',
  photo_lateral: 'Lateral photograph',
  photo_frontal: 'Frontal photograph',
};

interface StoredEditableProps {
  storageKey: string;
  className?: string;
  /** Screen-only hint shown while the field is empty (never printed). */
  placeholder: string;
  ariaLabel: string;
  /**
   * Notified on every edit so the letterhead can echo the identity elsewhere
   * (the clinician's name is typed once, in the certification block, and read
   * back under the practice name in the masthead).
   */
  onChange?(text: string): void;
}

/**
 * A single-line, device-persistent editable field for the report letterhead
 * (clinic name, clinician name, license number). Uncontrolled contentEditable:
 * the initial text is read once from localStorage and every edit is written
 * back, so the identity re-appears on the next report without any dialog.
 * Empty fields render nothing in print — just the ruled signature line.
 */
class StoredEditable extends React.PureComponent<StoredEditableProps> {
  /** Read once; the DOM owns the text afterwards (uncontrolled). */
  private initialText = readStored(this.props.storageKey);

  render() {
    const { className, placeholder, ariaLabel } = this.props;
    return (
      <span
        className={cx(classes.editable, className)}
        contentEditable={true}
        suppressContentEditableWarning={true}
        spellCheck={false}
        role="textbox"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={this.handleInput}
        onBlur={this.handleBlur}
        onKeyDown={this.handleKeyDown}
        onPaste={this.handlePaste}
      >
        {this.initialText}
      </span>
    );
  }

  private handleInput = (e: React.FormEvent<HTMLSpanElement>) => {
    const text = (e.currentTarget.textContent || '').trim();
    writeStored(this.props.storageKey, text);
    if (this.props.onChange !== undefined) {
      this.props.onChange(text);
    }
  };

  /**
   * A contentEditable keeps the caret — and therefore the scroll position — at
   * the end of the text while it is typed. In a field with `overflow: hidden`
   * that leaves the box scrolled right, and the browser prints what is
   * *scrolled into view*: the letterhead came out of the printer missing the
   * beginning of the practice's own name. Rewound whenever the field is left,
   * and again from `resetEditableScroll` immediately before printing.
   */
  private handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    e.currentTarget.scrollLeft = 0;
    // Emptied by hand, a contentEditable is left holding a stray <br> or a
    // whitespace node, and `:empty` — which drives both the placeholder and the
    // print-time "an unfilled field prints nothing" rule — stops matching. The
    // letterhead then showed a blank 24px box with an edit rule under it, which
    // reads as a defect, and printed one too. Cleared on the way out, when the
    // caret is no longer in the field.
    if ((e.currentTarget.textContent || '').trim() === '') {
      e.currentTarget.innerHTML = '';
    }
    this.handleInput(e);
  };

  // Single-line field: Enter confirms (blurs) instead of inserting <div>s.
  private handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  // Paste as plain text so pasted rich content cannot break the letterhead.
  private handlePaste = (e: React.ClipboardEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, text);
  };
}

/** Font stack of the printed page, repeated for the @page margin boxes. */
const PRINT_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", ' +
  '"Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif';

/**
 * The key to every convention that recurs on the printed pages: the severity
 * stars in the DEVIATION column, the wigglegram's shaded bands, **the colour
 * of its dots and the off-chart marker**. Set in the running foot so it is on
 * the page the marks are on, whichever page that is — which matters here,
 * because the combined printout's front-matter key is print-hidden (the
 * running foot is its replacement) and red ◂ ▸ markers appear as early as the
 * Downs section.
 *
 * The marker is keyed as the glyph *pair*: the chart draws it outward-pointing,
 * so a value below −3 SD is marked ◂ and one above +3 SD is marked ▸, and the
 * two real occurrences on the sample report (OP(Downs)-FH at −3.4 SD, L1-OP at
 * +4.5 SD) are one of each. A key that named only ▸ left the commoner of the
 * two unexplained.
 */
const RUNNING_KEY =
  'Deviation: * ** *** = over 1 · 2 · 3 SD  |  Wigglegram: band ±1 SD, ' +
  'lighter ±2 SD; dot amber over 1 SD, red over 2 SD; ◂ ▸ beyond ±3 SD';

/** A CSS string literal, safe to interpolate into a generated stylesheet. */
const cssString = (text: string): string => (
  `"${text.replace(/[\r\n]+/g, ' ').replace(/[\\"]/g, (m) => `\\${m}`)}"`
);

/** `2026-08-06` — the unambiguous form, for the running page header. */
const isoDate = (d: Date): string => {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Which analyses the paper carries. `active` prints the analysis open in the
 * editor (the default); `all` prints one section per lateral analysis, the
 * composite printout a referral packet usually wants.
 */
type ReportScope = 'active' | 'all';

interface Section {
  entry: LateralAnalysisEntry;
  evaluation: AnalysisEvaluation;
}

interface State {
  /** Data URL of the composited radiograph + tracing, once rendered. */
  snapshotUrl: string | null;
  /** Whether the paper shows the active analysis only, or all of them. */
  scope: ReportScope;
  /** Letterhead identity, mirrored from the device-persistent fields. */
  clinic: string;
  clinician: string;
  license: string;
}

/**
 * Full-screen, print-ready clinical report: an A4-portrait paper card with the
 * clinic header, patient block, traced-radiograph snapshot, analysis results
 * table and clinical interpretation — the document an orthodontist hands to
 * a patient or referring colleague. "Print / Save as PDF" prints only the
 * paper (see the @media print rules in style.scss).
 */
export default class ClinicalReport extends React.PureComponent<Props, State> {
  state: State = {
    snapshotUrl: null,
    scope: 'active',
    clinic: readStored(STORAGE_KEY_CLINIC),
    clinician: readStored(STORAGE_KEY_CLINICIAN),
    license: readStored(STORAGE_KEY_LICENSE),
  };

  /**
   * Memoized read-only evaluation of every lateral analysis. Keyed on the
   * landmark set and the scale factor — the only inputs — so switching scope
   * back and forth does not recompute nine analyses.
   */
  private sectionsCache: {
    manualLandmarks: Props['manualLandmarks'];
    scaleFactor: number | null;
    context: AnalysisContext;
    sections: Section[];
  } | null = null;

  /**
   * The same read-only evaluation for the *active* analysis. The store hands
   * this component the analysis' results but not the reason a result is absent,
   * so the empty state is worded from this evaluation instead of guessing.
   */
  private activeCache: {
    manualLandmarks: Props['manualLandmarks'];
    scaleFactor: number | null;
    analysisId: string | null;
    context: AnalysisContext;
    evaluation: AnalysisEvaluation | null;
  } | null = null;

  /** The paper element, for the pre-print housekeeping in `resetEditableScroll`. */
  private paperRef: HTMLDivElement | null = null;

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    // Covers the browser's own Ctrl+P as well as this dialog's Print button.
    window.addEventListener('beforeprint', this.resetEditableScroll);
    document.body.classList.add(BODY_OPEN_CLASS);
    this.renderSnapshot();
    this.ensureLandmarksForAllAnalyses();
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // The completion pass above adds the landmarks the other analyses need
    // (see `ensureLandmarksForAllAnalyses`), which arrive after the first
    // paint. The figure's caption counts them the moment they do, so the
    // figure itself has to be redrawn with them — otherwise the paper says
    // "37 landmarks traced" under a picture of 26.
    //
    // The scope switch changes the film too: the single-analysis paper prints
    // only its own analysis' landmarks and planes.
    if (
      prevProps.manualLandmarks !== this.props.manualLandmarks ||
      prevProps.analysisId !== this.props.analysisId ||
      // The film carries a scale bar drawn from the calibration, so calibrating
      // (or re-calibrating) while the preview is open redraws it.
      prevProps.scaleFactor !== this.props.scaleFactor ||
      prevState.scope !== this.state.scope
    ) {
      this.renderSnapshot();
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('beforeprint', this.resetEditableScroll);
    document.body.classList.remove(BODY_OPEN_CLASS);
  }

  render() {
    return ReactDOM.createPortal(this.renderReport(), document.body);
  }

  private renderReport() {
    const {
      patient, results, analysisId, imageType, timepoint, captureDate,
      scaleFactor, imageSrc, landmarksBySymbol,
    } = this.props;
    const { snapshotUrl, scope, clinic, clinician, license } = this.state;
    const isCombined = scope === 'all';
    // Only the combined printout needs the other analyses evaluated.
    const sectionCount = isCombined ? this.getSections().length : 0;
    // Lateral analyses left out of the combined printout because they define
    // no interpreted measurement. Named on the paper: "all lateral analyses"
    // may not quietly mean "most of them".
    const omitted = isCombined ? this.getOmittedEntries() : [];

    const analysisName = analysisId !== null
      ? (ANALYSIS_NAMES[analysisId] || analysisId)
      : null;
    const now = new Date();
    const date = now.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const imageTypeName =
      (imageType !== null && IMAGE_TYPE_NAMES[imageType]) ||
      'Radiograph';
    // Which landmarks the figure carries, and how many of the ones this paper's
    // analysis needs are placed (see `getFilmLandmarks`).
    const film = this.getFilmLandmarks();
    const hasResults = results.length > 0;

    // Said once, prominently, under the patient block — for either scope. Every
    // section used to repeat the same two lines under its own table, which made
    // the most consequential fact on the paper read like boilerplate.
    const withheldLinear = isCombined
      ? this.getSections().some((s) => s.evaluation.pendingScaleCount > 0)
      : this.props.needsScaleForLinear;
    const scaleBanner = (scaleFactor === null && withheldLinear) ? (
      <p className={classes.caveat}>
        <strong className={classes.caveat_head}>
          Millimetre measurements are withheld from this report.
        </strong>
        This radiograph has no image scale, so no distance on it can be stated
        in millimetres. Set the scale from the calibration chip in the toolbar
        and reprint. Angles and ratios are unaffected and are reported in full
        below.
      </p>
    ) : null;

    // Demographics: DOB printed as recorded (ISO, unambiguous). Age is stated
    // at the *radiograph*, not at the print date — a cephalometric norm is read
    // against the patient's age on the day the film was taken, and a report
    // printed years later must not restate that number. When no capture date is
    // recorded the honest fallback is the age today, labelled as such.
    const dateOfBirth =
      patient !== null && patient.dateOfBirth !== undefined &&
      patient.dateOfBirth !== ''
        ? patient.dateOfBirth
        : null;
    const filmDate = parseCaptureDate(captureDate);
    const filmDateLabel = formatCaptureDate(captureDate);
    const ageAtFilm = (patient !== null && filmDate !== null)
      ? formatAgeFull(patient.dateOfBirth, filmDate)
      : null;
    const age = ageAtFilm !== null
      ? ageAtFilm
      : (patient !== null ? formatAgeFull(patient.dateOfBirth) : null);
    const ageLabel = ageAtFilm !== null ? 'Age at radiograph' : 'Age at report';
    const sex = patient !== null ? formatSexFull(patient.sex) : null;

    // Letterhead identity: the practice owns the masthead, the clinician and
    // license read back under it from the certification block below.
    const identityParts: string[] = [];
    if (clinician !== '') {
      identityParts.push(clinician);
    }
    if (license !== '') {
      identityParts.push(`License no. ${license}`);
    }

    // Running head/foot of every printed page. A detached sheet has to be
    // attributable to a patient, so the identity repeats — with a page count.
    const patientName = patient !== null && patient.name ? patient.name : '—';
    const chartId = patient !== null && patient.chartId ? patient.chartId : '—';

    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Clinical report"
      >
        {/* Chrome's "Save as PDF" names the file after `document.title`, which
            the app sets from the workspace — the image's file name. Every report
            saved itself as `test-ceph.jpg - WebCeph.pdf`. Declared here, this
            title holds only while the report is mounted (react-helmet restores
            the app's on unmount). */}
        <Helmet
          title={printDocumentTitle(
            patient,
            isCombined
              ? 'Cephalometric report — all analyses'
              : 'Cephalometric report',
            [timepoint, filmDateLabel],
          )}
        />
        <div className={classes.chrome}>
          <span className={classes.chrome_title}>
            Clinical report
            <span className={classes.chrome_hint}>
              Print preview · A4 portrait
            </span>
          </span>

          {/* Scope switch. Lives in the chrome, which the print stylesheet
              hides outright, so it can never appear on the paper. */}
          <div
            className={classes.seg}
            role="group"
            aria-label="Analyses included in the report"
          >
            <button
              type="button"
              className={cx(classes.seg_button, {
                [classes.seg_button__on]: !isCombined,
              })}
              aria-pressed={!isCombined}
              onClick={this.showActiveScope}
            >
              This analysis
            </button>
            <button
              type="button"
              className={cx(classes.seg_button, {
                [classes.seg_button__on]: isCombined,
              })}
              aria-pressed={isCombined}
              onClick={this.showAllScope}
            >
              All analyses
            </button>
          </div>

          <div className={classes.chrome_actions}>
            <button
              type="button"
              className={classes.chrome_button}
              onClick={this.props.onRequestClose}
            >
              <IconClose color="currentColor" style={{ width: 18, height: 18 }} />
              Close
            </button>
            <button
              type="button"
              className={cx(classes.chrome_button, classes.chrome_button__primary)}
              autoFocus
              onClick={this.handlePrint}
            >
              <IconPrint color="currentColor" style={{ width: 18, height: 18 }} />
              Print / Save as PDF
            </button>
          </div>
        </div>

        <div className={classes.scroll} onMouseDown={this.handleBackdropMouseDown}>
          <div
            ref={this.setPaperRef}
            className={cx(classes.paper, {
              [classes.paper__combined]: isCombined,
            })}
          >
            {this.renderRunningPageStyle(
              `${patientName} · ${chartId} · ${isoDate(now)}`,
              clinic !== '' ? clinic : 'Cephalometric analysis report',
            )}

            {/* The letterhead belongs to the practice, not to the software:
                the clinic name is the masthead, the clinician and license read
                back beneath it, and WebCeph is credited in the footer. */}
            <header
              className={cx(classes.masthead, {
                // No practice name stored — the default state of a fresh
                // install. The kicker and date come left rather than printing a
                // full-width rule under an empty left two-thirds of the sheet.
                [classes.masthead__anon]: clinic === '',
              })}
            >
              <div className={classes.masthead_left}>
                <StoredEditable
                  storageKey={STORAGE_KEY_CLINIC}
                  // Masthead type steps down as the practice name grows, so a
                  // long name wraps to two readable lines instead of three
                  // cramped ones (see `.clinic_name__long`). Measured in
                  // characters because that is what the line box is spent on.
                  className={cx(classes.clinic_name, {
                    [classes.clinic_name__long]: clinic.length > 26,
                    [classes.clinic_name__longest]: clinic.length > 46,
                  })}
                  placeholder="+ Add clinic name"
                  ariaLabel="Clinic name (click to edit)"
                  onChange={this.handleClinicChange}
                />
                {identityParts.length > 0 ? (
                  <span className={classes.clinic_line}>
                    {identityParts.join(' · ')}
                  </span>
                ) : (
                  <span className={classes.clinic_hint}>
                    Clinician and license appear here from the Certification
                    block below.
                  </span>
                )}
              </div>
              <div className={classes.masthead_right}>
                <span className={classes.doc_kicker}>Clinical report</span>
                <span className={classes.doc_date}>{date}</span>
              </div>
            </header>

            <h1 className={classes.doc_title}>Cephalometric Analysis Report</h1>

            {/* Identity row + demographics row; three aligned columns each.
                Absent optional fields print an em-dash — a clinical report
                states "not recorded" rather than hiding the field. The report
                date lives in the masthead, not here. */}
            <div className={classes.patient_block}>
              <div className={classes.patient_row}>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Patient</span>
                  <span className={classes.patient_value}>
                    {patient !== null && patient.name ? patient.name : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Chart ID</span>
                  <span className={classes.patient_value}>
                    {patient !== null && patient.chartId ? patient.chartId : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>
                    {isCombined ? 'Analyses' : 'Analysis'}
                  </span>
                  <span className={classes.patient_value}>
                    {isCombined
                      ? (omitted.length === 0
                        ? `All lateral (${sectionCount})`
                        : `Computable lateral (${sectionCount} of ` +
                          `${LATERAL_ANALYSES.length})`)
                      : (analysisName !== null ? analysisName : '—')}
                  </span>
                </div>
              </div>
              <div className={classes.patient_row}>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Date of birth</span>
                  <span className={classes.patient_value}>
                    {dateOfBirth !== null ? dateOfBirth : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>{ageLabel}</span>
                  <span className={classes.patient_value}>
                    {age !== null ? age : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Sex</span>
                  <span className={classes.patient_value}>
                    {sex !== null ? sex : '—'}
                  </span>
                </div>
              </div>
              {/* Record row: which film of the series this report is drawn
                  from. Without it a printed sheet cannot be tied to a
                  radiograph once a patient has T1 and T2 on file. */}
              <div className={classes.patient_row}>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Timepoint</span>
                  <span className={classes.patient_value}>
                    {timepoint !== null && timepoint !== '' ? timepoint : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Film date</span>
                  <span className={classes.patient_value}>
                    {filmDateLabel !== null ? filmDateLabel : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Image scale</span>
                  <span className={classes.patient_value}>
                    {scaleFactor !== null
                      ? `1 px = ${formatMmPx(scaleFactor)} mm`
                      : 'Not calibrated'}
                  </span>
                </div>
              </div>
            </div>

            {/* One statement about the image scale for the whole document,
                where the reader meets the patient — not the same two lines
                repeated under every table below. */}
            {scaleBanner}

            <div className={classes.section_label}>Traced radiograph</div>
            <figure
              className={cx(classes.figure, {
                // The calibration banner costs the cover about 16 mm. Without
                // this the figure no longer fits under it and Chromium moves
                // the whole thing to page 2, leaving the cover half empty —
                // so on an uncalibrated film the film prints a little smaller
                // rather than a page later.
                [classes.figure__tight]: scaleBanner !== null,
              })}
            >
              <div className={classes.figure_frame}>
                {(snapshotUrl || imageSrc) ? (
                  <img
                    className={classes.figure_image}
                    src={snapshotUrl || imageSrc || undefined}
                    alt="Traced cephalometric radiograph"
                  />
                ) : (
                  <span className={classes.figure_missing}>
                    No radiograph available
                  </span>
                )}
              </div>
              <figcaption className={classes.figure_caption}>
                {imageTypeName}
                <span className={classes.caption_dot}>·</span>
                {film.placed > 0
                  ? (film.scopeName !== null
                    ? `${film.placed} of ${film.required} landmarks traced ` +
                      `for ${film.scopeName}`
                    // The combined film's denominator is the union of every
                    // lateral analysis' required landmarks, which this app
                    // knows exactly (it is the set it just plotted — see
                    // `ensureLandmarksForAllAnalyses`). Printing a bare
                    // "37 landmarks traced" withheld it, so a referrer could
                    // not tell whether 37 was the whole tracing or part of one
                    // — two pages away from "9 ANALYSES · 89 OF 89
                    // MEASUREMENTS".
                    : `${film.placed} of ${film.required} landmarks traced ` +
                      `across ${LATERAL_ANALYSES.length} analyses`)
                  : 'No landmarks traced'}
                <span className={classes.caption_dot}>·</span>
                {scaleFactor !== null
                  ? `Calibrated: 1 px = ${formatMmPx(scaleFactor)} mm`
                  : 'Not calibrated — angular values unaffected'}
              </figcaption>
              {/* What the reader is looking at. Without a key the tags, the
                  white curves and the pale straight lines are three
                  indistinguishable kinds of ink. */}
              <figcaption className={classes.figure_key}>
                <span className={classes.figkey_item}>
                  <span className={classes.figkey_outline} />
                  Anatomical tracing
                </span>
                <span className={classes.figkey_item}>
                  <span className={classes.figkey_plane} />
                  {/* Precisely what these lines are: profilogram construction
                      lines and reference planes (see analyses/profilogram),
                      drawn between placed landmarks — and on a single-analysis
                      film, only between that analysis' own landmarks. They are
                      not that author's published plane set, and the key may not
                      imply that they are. */}
                  {film.scopeName !== null
                    ? `Reference planes and construction lines ` +
                      `(${film.scopeName} landmarks only)`
                    : 'Reference planes and construction lines'}
                </span>
                <span className={classes.figkey_item}>
                  <span className={classes.figkey_point} />
                  Landmark, labelled with its symbol
                </span>
                {scaleFactor !== null ? (
                  <span className={classes.figkey_item}>
                    <span className={classes.figkey_bar} />
                    {/* The bar's length is chosen to suit the film and is
                        written on it, so this key must not restate a figure. */}
                    Scale bar, labelled in millimetres
                  </span>
                ) : null}
              </figcaption>
            </figure>

            {/* Said once for the whole document, before any number is read.
                Every table below grades a value against some author's sample,
                and not one of those samples is this patient — the single
                statement a printed cephalometric report most needs and the one
                this app used to leave to the reader's own knowledge. */}
            <p className={classes.norms_caveat}>{NORMS_NOT_MATCHED}</p>

            {isCombined ? this.renderCombinedBody() : (
              <div>
                {hasResults ? (
                  <Wigglegram
                    results={results}
                    landmarksBySymbol={landmarksBySymbol}
                  />
                ) : null}

                <div className={classes.section_label}>
                  Analysis results
                  {analysisName !== null ? (
                    <span className={classes.section_badge}>
                      {analysisName} analysis
                    </span>
                  ) : null}
                </div>
                {/* The interpretation chips live in the table's FINDING column;
                    a second identical chip grid three centimetres below said
                    nothing new. */}
                {hasResults
                  ? this.renderActiveResultsTable()
                  : this.renderActiveEmptyState()}
                <NormsNote
                  provenance={this.getActiveProvenance()}
                  context={this.getAnalysisContext()}
                />
              </div>
            )}

            {/* Clinician certification: ruled signature lines, as on any
                clinical letterhead. Name and license persist per device;
                the signature and date rules are signed by hand. */}
            <div
              className={cx(classes.tail, {
                // The combined report's tail always starts a sheet, so it is
                // laid out as the signature page it is (see NOTE_RULES_SHEET).
                [classes.tail__own_sheet]: isCombined,
              })}
            >
              {/* Ruled space for the clinician's own reading of the numbers.
                  A referral sheet needs somewhere to write it, and it gives
                  the closing block height instead of leaving the foot of the
                  last page empty. */}
              <div className={classes.notes}>
                <div className={classes.section_label}>
                  Clinical notes &amp; plan
                  <span className={classes.notes_hint}>
                    to be completed by hand
                  </span>
                </div>
                <div className={classes.notes_rules}>
                  {(isCombined ? NOTE_RULES_SHEET : NOTE_RULES).map((i) => (
                    <span key={i} className={classes.notes_rule} />
                  ))}
                </div>
              </div>

              {/* Certification and footer travel together. The two are the
                  document's signature, and a sheet carrying nothing but
                  "Generated with WebCeph · End of report" reads as a printer
                  fault; if the block does not fit under the notes it moves
                  whole, and the last sheet is a proper signature page. */}
              <div className={classes.tail_close}>
                <div className={classes.sig_section}>
                  <div className={classes.section_label}>Certification</div>
                  <div className={classes.sig_row}>
                    <div className={cx(classes.sig_field, classes.sig_field__wide)}>
                      <div className={classes.sig_line}>
                        <StoredEditable
                          storageKey={STORAGE_KEY_CLINICIAN}
                          placeholder="Clinician name"
                          ariaLabel="Clinician name (click to edit)"
                          onChange={this.handleClinicianChange}
                        />
                      </div>
                      <span className={classes.sig_caption}>
                        Examined by — name &amp; signature
                      </span>
                    </div>
                    <div className={classes.sig_field}>
                      <div className={classes.sig_line}>
                        <StoredEditable
                          storageKey={STORAGE_KEY_LICENSE}
                          placeholder="License no."
                          ariaLabel="License number (click to edit)"
                          onChange={this.handleLicenseChange}
                        />
                      </div>
                      <span className={classes.sig_caption}>License no.</span>
                    </div>
                    <div className={classes.sig_field}>
                      <div className={classes.sig_line}>
                        {/* Screen-only. The two fields beside this one show a
                            grey prompt while they are empty, so a bare rule
                            here read as a field somebody had failed to fill in
                            rather than as space for a hand-written date. It is
                            already correctly blank on paper. */}
                        <span className={classes.sig_hint}>signed by hand</span>
                      </div>
                      <span className={classes.sig_caption}>Date</span>
                    </div>
                  </div>
                </div>

                {/* Two lines, not a three-up row. The caveat is a sentence and
                    it wrapped to two centred lines between two single-line
                    items, so the three had no common baseline; it now owns a
                    full-width line of its own beneath them and reads as the
                    statement it is. */}
                <footer className={classes.foot}>
                  <div className={classes.foot_row}>
                    <span className={classes.foot_brand}>
                      Generated with WebCeph · {date}
                    </span>
                    <span className={classes.foot_page}>
                      {isCombined
                        ? `End of report · ${sectionCount} analyses`
                        : 'End of report'}
                    </span>
                  </div>
                  <span className={classes.foot_note}>
                    Computed values depend on landmark placement and calibration —
                    review before clinical use.
                  </span>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * The combined printout: a summary-of-findings contents page followed by one
   * section per lateral analysis. Every analysis is evaluated read-only from
   * the same placed landmarks (see `analyses/evaluate`), so nothing here
   * depends on — or changes — which analysis is active in the editor.
   */
  private renderCombinedBody() {
    const { analysisId } = this.props;
    const sections = this.getSections();
    const omitted = this.getOmittedEntries();
    // A count of analyses says nothing about how much was actually measured:
    // seven analyses can be "computed" with half their measurements withheld.
    let reported = 0;
    let total = 0;
    sections.forEach(({ evaluation }) => {
      reported += evaluation.reportedCount;
      total += evaluation.totalCount;
    });
    const divergences = findDivergences(sections);

    return (
      <div>
        <div className={classes.section_label}>
          Summary of findings
          <span className={classes.section_badge}>
            {sections.length} analyses · {reported} of {total} measurements
          </span>
        </div>
        <FindingsOverview
          sections={sections}
          divergentCategories={divergentCategorySet(divergences)}
        />
        <p className={classes.ov_caption}>
          All analyses are computed from the same landmark set, so a
          measurement shared between them (SNA, FMA, …) carries the same value
          in every section below. Their norms and standard deviations, however,
          are each author’s own, so one value can deviate — and be graded —
          differently from one section to the next.
          {omitted.length > 0
            ? ` Not included: ${omitted.map((e) => e.name).join(', ')} — ` +
              `${omitted.length === 1 ? 'it defines' : 'they define'} no ` +
              'interpreted measurement in this build.'
            : ''}
        </p>

        {/* The image-scale caveat is stated once, under the patient block —
            see `scaleBanner` in `renderReport`. */}

        {divergences.length > 0 ? (
          <div className={classes.diverge}>
            <span className={cx(classes.diverge_head, classes.diverge_head_keep)}>
              Where the analyses differ
            </span>
            {map(divergences, ({ category, sources }) => (
              <div key={category} className={classes.diverge_row}>
                <span className={classes.diverge_cat}>
                  {mapCategoryToString(category) || category}
                </span>
                <span className={classes.diverge_sources}>
                  {map(sources, (s, i) => (
                    <span key={i} className={classes.diverge_src}>
                      <span className={classes.diverge_src_analysis}>
                        {s.analysis}
                      </span>
                      <span className={classes.diverge_src_ind}>
                        {s.indication}
                      </span>
                      <span className={classes.diverge_src_num}>
                        {s.symbol} {s.value} vs {s.norm}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
            <span className={classes.diverge_note}>
              Each of these analyses grades the category from a different
              measurement against its own author’s norm, so the readings are
              not in conflict and none of them supersedes the others. Tagged
              “differs” in the summary of findings above.
            </span>
          </div>
        ) : null}

        {/* Both keys, once for the document (they used to repeat under all
            fourteen charts and tables). */}
        <div className={classes.keys}>
          <span className={classes.keys_line}><DeviationKey /></span>
          <span className={classes.keys_line}><WigglegramKey /></span>
        </div>

        <AnalysisSections
          sections={sections}
          activeAnalysisId={analysisId}
          context={this.getAnalysisContext()}
        />
      </div>
    );
  }

  /**
   * Completes the tracing for every analysis this document can print, before
   * it prints any of them.
   *
   * The report evaluates all nine lateral analyses from one landmark set, but
   * the app only ever plots the landmarks the *active* analysis needs. An
   * analysis the clinician never opened was therefore reported from a partial
   * tracing — and a partial tracing does not report a partial finding, it
   * reports a *different* one, because a category is graded from whichever of
   * its measurements happen to have computed. The soft-tissue section read
   * "Skeletal profile — Normal" from four of its seven measurements and
   * "Concave" from all seven, and dropped "Chin prominence — Recessive"
   * entirely, on the same tracing, depending only on which analysis was open.
   *
   * This is the pass `store/middleware/analysisSwitch` already runs on every
   * analysis change, for the union of all the analyses instead of for one: the
   * same predictor, the same single undoable batch, and — the part that makes
   * it safe — the same rule that a landmark already placed by hand is never
   * overwritten (see `predictionsToLandmarks`). An untraced image is left
   * untouched: an empty canvas stays empty until the clinician asks for a plot.
   */
  private ensureLandmarksForAllAnalyses() {
    const { manualLandmarks, onPlotMissingLandmarks } = this.props;
    if (Object.keys(manualLandmarks).length === 0) {
      return;
    }
    const missing: { [symbol: string]: true } = {};
    LATERAL_ANALYSES.forEach(({ analysis }) => {
      getStepsForAnalysis(analysis, false).forEach((step) => {
        if (isStepManual(step) && manualLandmarks[step.symbol] === undefined) {
          missing[step.symbol] = true;
        }
      });
    });
    const symbols = Object.keys(missing);
    if (symbols.length > 0) {
      onPlotMissingLandmarks(symbols);
    }
  }

  /** Memoized (landmark set × scale factor × patient) evaluation of every analysis. */
  private getSections(): Section[] {
    const { manualLandmarks, scaleFactor } = this.props;
    const context = this.getAnalysisContext();
    const cache = this.sectionsCache;
    if (
      cache !== null &&
      cache.manualLandmarks === manualLandmarks &&
      cache.scaleFactor === scaleFactor &&
      cache.context.ageInYears === context.ageInYears &&
      cache.context.sex === context.sex
    ) {
      return cache.sections;
    }
    // An analysis module that defines no interpreted measurement has nothing
    // it could ever report; printing an empty section for it would only
    // advertise a gap in the software as a finding about the patient.
    const sections = map(
      filter(LATERAL_ANALYSES, ({ analysis }) => definesMeasurements(analysis)),
      (entry): Section => ({
        entry,
        evaluation: evaluateAnalysis(
          entry.analysis, manualLandmarks, scaleFactor, context,
        ),
      }),
    );
    this.sectionsCache = { manualLandmarks, scaleFactor, context, sections };
    return sections;
  }

  /** Lateral analyses the combined printout leaves out, and must own up to. */
  private getOmittedEntries(): LateralAnalysisEntry[] {
    return filter(
      LATERAL_ANALYSES,
      ({ analysis }) => !definesMeasurements(analysis),
    );
  }

  /**
   * Read-only evaluation of the analysis open in the editor, memoized like the
   * combined report's. Used only to explain an absent result — the printed
   * numbers still come from the store, so the two can never disagree.
   */
  private getActiveEvaluation(): AnalysisEvaluation | null {
    const { analysisId, manualLandmarks, scaleFactor } = this.props;
    const context = this.getAnalysisContext();
    const cache = this.activeCache;
    if (
      cache !== null &&
      cache.manualLandmarks === manualLandmarks &&
      cache.scaleFactor === scaleFactor &&
      cache.analysisId === analysisId &&
      cache.context.ageInYears === context.ageInYears &&
      cache.context.sex === context.sex
    ) {
      return cache.evaluation;
    }
    const entry = analysisId === null ? undefined : LATERAL_ANALYSES.filter(
      (e) => e.id === analysisId || e.analysis.id === analysisId,
    )[0];
    const evaluation = entry === undefined
      ? null
      : evaluateAnalysis(entry.analysis, manualLandmarks, scaleFactor, context);
    this.activeCache = {
      manualLandmarks, scaleFactor, analysisId, context, evaluation,
    };
    return evaluation;
  }

  /**
   * The patient these norms are read against — age on the day of the film and
   * recorded sex — built exactly as the store builds it for the editor, so the
   * report and the Summary dialog can never grade the same tracing against two
   * different norms. See `AnalysisContext`.
   */
  private getAnalysisContext(): AnalysisContext {
    const { patient, captureDate } = this.props;
    return getAnalysisContext(patient, parseCaptureDate(captureDate));
  }

  /**
   * Whose norms the active analysis quotes. Looked up from the same registry
   * the combined report's sections read, so the two scopes of this one
   * document can never cite the same analysis differently.
   */
  private getActiveProvenance(): NormsProvenance | undefined {
    const { analysisId } = this.props;
    if (analysisId === null) {
      return undefined;
    }
    const entry = LATERAL_ANALYSES.filter(
      (e) => e.id === analysisId || e.analysis.id === analysisId,
    )[0];
    return entry === undefined ? undefined : entry.analysis.provenance;
  }

  /** The active analysis' table, with the same footnotes its section gets. */
  private renderActiveResultsTable() {
    const { results, landmarksBySymbol, needsScaleForLinear, analysisId } =
      this.props;
    const evaluation = this.getActiveEvaluation();
    return (
      <ResultsTable
        results={results}
        landmarksBySymbol={landmarksBySymbol}
        analysisName={
          analysisId !== null
            ? (ANALYSIS_NAMES[analysisId] || analysisId)
            : undefined
        }
        needsScaleForLinear={needsScaleForLinear}
        missingLandmarkCount={
          evaluation !== null ? evaluation.missingLandmarkCount : 0
        }
        missingSymbols={
          evaluation !== null ? evaluation.missingSymbols : undefined
        }
        caveats={evaluation !== null ? evaluation.caveats : undefined}
      />
    );
  }

  /**
   * Why the active analysis produced nothing. Worded from the analysis'
   * evaluation, so an analysis that interprets no measurement says exactly
   * that instead of blaming the tracing for it.
   */
  private renderActiveEmptyState() {
    const evaluation = this.getActiveEvaluation();
    if (evaluation !== null) {
      return <PendingNote evaluation={evaluation} />;
    }
    return (
      <p className={classes.empty_note}>
        No measurements have been calculated. This image has no lateral analysis
        selected — choose one from the toolbar, then generate the report again.
      </p>
    );
  }

  /**
   * The running head and foot of every printed page: patient name, chart ID and
   * report date, the star/wigglegram key, plus "Page n of N". Generated at
   * render time because the strings are patient data, and expressed as `@page`
   * margin boxes — the only mechanism that repeats reliably across pages and
   * can count them. Suppressed on page 1, which already carries the letterhead
   * and the patient block in full.
   *
   * The key repeats because the marks it explains do: the deviation stars and
   * the wigglegram bands appear on every analysis section, and a document that
   * defines them once on page 2 leaves pages 3–13 carrying *, ** and ***
   * against nothing.
   */
  private renderRunningPageStyle(patientLine: string, docLine: string) {
    const box = (align: string) => (
      `font: 8.5pt ${PRINT_FONT}; color: #7B8794; ` +
      `text-align: ${align};`
    );
    const css = [
      '@page {',
      '  size: A4 portrait;',
      '  margin: 15mm 12mm 15mm;',
      '  @top-left {',
      `    content: ${cssString(patientLine)};`,
      `    ${box('left')} color: #52616F; font-weight: 600;`,
      '    vertical-align: bottom; padding-bottom: 3.5mm;',
      '  }',
      '  @top-right {',
      `    content: ${cssString(docLine)};`,
      `    ${box('right')}`,
      '    vertical-align: bottom; padding-bottom: 3.5mm;',
      '  }',
      '  @bottom-left {',
      `    content: ${cssString(RUNNING_KEY)};`,
      `    ${box('left')} font-size: 7pt;`,
      '    vertical-align: top; padding-top: 3mm;',
      '  }',
      '  @bottom-right {',
      '    content: "Page " counter(page) " of " counter(pages);',
      `    ${box('right')} color: #52616F; font-weight: 600;`,
      '    vertical-align: top; padding-top: 3mm;',
      '  }',
      '}',
      '@page :first {',
      '  margin-top: 12mm;',
      '  @top-left { content: ""; }',
      '  @top-right { content: ""; }',
      '}',
    ].join('\n');
    return <style type="text/css" dangerouslySetInnerHTML={{ __html: css }} />;
  }

  private showActiveScope = () => {
    this.setState({ scope: 'active' });
  };

  private showAllScope = () => {
    this.setState({ scope: 'all' });
  };

  private handleClinicChange = (clinic: string) => {
    this.setState({ clinic });
  };

  private handleClinicianChange = (clinician: string) => {
    this.setState({ clinician });
  };

  private handleLicenseChange = (license: string) => {
    this.setState({ license });
  };

  /**
   * The manual landmarks the analysis in `scope` actually uses, and how many of
   * them are placed. In `active` scope that is the open analysis' own step
   * list: a film captioned "Downs" may not carry the other eight analyses'
   * points and planes, and its caption may not count them. In `all` scope every
   * placed landmark belongs to the document.
   */
  private getFilmLandmarks(): {
    landmarks: ManualLandmarks;
    placed: number;
    required: number;
    /** The analysis the film is scoped to, or null when it carries all of them. */
    scopeName: string | null;
  } {
    const { manualLandmarks, analysisId } = this.props;
    const placedAll = Object.keys(manualLandmarks)
      .filter((s) => isGeoPoint(manualLandmarks[s]));
    const entry = this.state.scope === 'all' || analysisId === null
      ? undefined
      : LATERAL_ANALYSES.filter(
        (e) => e.id === analysisId || e.analysis.id === analysisId,
      )[0];
    if (entry === undefined) {
      // The film carries every placed landmark, so its denominator is the union
      // of what all the lateral analyses need — the set this report completes
      // before it prints (see `ensureLandmarksForAllAnalyses`). It is known, so
      // it is stated: "37 landmarks traced" left the reader unable to tell a
      // complete tracing from a partial one.
      const union: string[] = [];
      LATERAL_ANALYSES.forEach(({ analysis }) => {
        getStepsForAnalysis(analysis, false).forEach((step) => {
          if (isStepManual(step) && union.indexOf(step.symbol) === -1) {
            union.push(step.symbol);
          }
        });
      });
      return {
        landmarks: manualLandmarks,
        placed: placedAll.length,
        // A tracing may legitimately carry a point no lateral analysis asks
        // for; the denominator must never read as smaller than the numerator.
        required: Math.max(union.length, placedAll.length),
        scopeName: null,
      };
    }
    const required: string[] = [];
    getStepsForAnalysis(entry.analysis, false).forEach((step) => {
      if (isStepManual(step) && required.indexOf(step.symbol) === -1) {
        required.push(step.symbol);
      }
    });
    const landmarks: ManualLandmarks = {};
    let placed = 0;
    required.forEach((symbol) => {
      const value = manualLandmarks[symbol];
      if (isGeoPoint(value)) {
        landmarks[symbol] = value;
        placed += 1;
      }
    });
    return {
      landmarks, placed, required: required.length, scopeName: entry.name,
    };
  }

  private renderSnapshot() {
    const {
      imageSrc, imageWidth, imageHeight, manualLandmarks, scaleFactor,
    } = this.props;
    if (imageSrc === null || !imageWidth || !imageHeight) {
      return;
    }
    const film = this.getFilmLandmarks();
    // The anatomical outlines are always built from the whole tracing — the
    // anatomy is not one analysis' property — but the dots, the tags and the
    // planes are those of the analysis this paper reports on.
    renderTracingSnapshot(
      imageSrc, imageWidth, imageHeight,
      manualLandmarks, buildProfilogram(film.landmarks),
      {
        // Cropped to the traced region: the report has one figure and a fixed
        // amount of page for it.
        crop: true,
        pointLandmarks: film.landmarks,
        labels: true,
        // A ruler on the film, from the image calibration only — the figure is
        // reproduced at whatever scale the page allows, so without it no
        // distance on the printed film can be judged by eye. An uncalibrated
        // film gets no bar (see `drawScaleBar`).
        scaleMmPerPx: scaleFactor !== null ? scaleFactor : undefined,
      },
    ).then((url) => {
      if (url !== null) {
        this.setState({ snapshotUrl: url });
      }
    });
  }

  /**
   * Rewinds every letterhead field to the start of its text before the page is
   * rasterised. A contentEditable that has just been typed into is scrolled to
   * the caret, and the print output shows the *scrolled* content — which is how
   * a practice's own name came out of the printer with its first characters
   * missing. The clinic name now wraps instead of scrolling (see `.clinic_name`),
   * so this is the belt to that brace, and it still matters for the clinician
   * and license fields, which are single-line by design.
   */
  private resetEditableScroll = () => {
    const paper = this.paperRef;
    if (paper === null) {
      return;
    }
    const fields = paper.querySelectorAll('[contenteditable]');
    for (let i = 0; i < fields.length; i++) {
      (fields[i] as HTMLElement).scrollLeft = 0;
    }
  };

  private setPaperRef = (el: HTMLDivElement | null) => {
    this.paperRef = el;
  };

  private handlePrint = () => {
    this.resetEditableScroll();
    window.print();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      // While a letterhead field is being edited, Escape leaves the field
      // rather than closing the whole report.
      const target = e.target as HTMLElement | null;
      if (target !== null && target.isContentEditable) {
        target.blur();
        return;
      }
      this.props.onRequestClose();
    }
  };

  // Clicking the dark backdrop (not the paper) closes the preview.
  private handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      this.props.onRequestClose();
    }
  };
}
