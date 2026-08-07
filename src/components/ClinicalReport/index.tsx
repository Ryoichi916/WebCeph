import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import map from 'lodash/map';
import filter from 'lodash/filter';

import IconPrint from 'material-ui/svg-icons/action/print';
import IconClose from 'material-ui/svg-icons/navigation/close';

import Props from './props';

// The report must match the Summary dialog's conventions exactly (formatting,
// units, severity stars), so it reuses that component's exported helpers.
import { ANALYSIS_NAMES } from 'components/AnalysisResultsViewer';
import { mapCategoryToString } from 'components/AnalysisResultsViewer/strings';

import { formatMmPx } from 'components/TracingToolbar/CalibrationDialog';

import { buildProfilogram } from 'analyses/profilogram';
import {
  evaluateAnalysis,
  definesMeasurements,
  AnalysisEvaluation,
} from 'analyses/evaluate';
import { LATERAL_ANALYSES, LateralAnalysisEntry } from 'analyses/lateral';
import { renderTracingSnapshot } from 'utils/tracingSnapshot';
import { isGeoPoint } from 'utils/math';
import { formatAgeFull, formatSexFull } from 'utils/patient';
import { parseCaptureDate, formatCaptureDate } from 'utils/records';

import Wigglegram, { WigglegramKey } from './Wigglegram';
import ResultsTable, { DeviationKey } from './ResultsTable';
import FindingsOverview from './FindingsOverview';
import { AnalysisSections, PendingNote } from './AnalysisSection';
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
        onBlur={this.handleInput}
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
    evaluation: AnalysisEvaluation | null;
  } | null = null;

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    document.body.classList.add(BODY_OPEN_CLASS);
    this.renderSnapshot();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.body.classList.remove(BODY_OPEN_CLASS);
  }

  render() {
    return ReactDOM.createPortal(this.renderReport(), document.body);
  }

  private renderReport() {
    const {
      patient, results, analysisId, imageType, timepoint, captureDate,
      scaleFactor, manualLandmarks, imageSrc, landmarksBySymbol,
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
    const landmarkCount = Object.keys(manualLandmarks)
      .filter((s) => isGeoPoint(manualLandmarks[s]))
      .length;
    const hasResults = results.length > 0;

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
            <header className={classes.masthead}>
              <div className={classes.masthead_left}>
                <StoredEditable
                  storageKey={STORAGE_KEY_CLINIC}
                  className={classes.clinic_name}
                  placeholder="+ Clinic or practice name"
                  ariaLabel="Clinic name (click to edit)"
                  onChange={this.handleClinicChange}
                />
                {identityParts.length > 0 ? (
                  <span className={classes.clinic_line}>
                    {identityParts.join(' · ')}
                  </span>
                ) : (
                  <span className={classes.clinic_hint}>
                    Clinician name and license are typed in the Certification
                    block below and appear here.
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

            <div className={classes.section_label}>Traced radiograph</div>
            <figure className={classes.figure}>
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
                {landmarkCount > 0
                  ? `${landmarkCount} landmarks traced`
                  : 'No landmarks traced'}
                <span className={classes.caption_dot}>·</span>
                {scaleFactor !== null
                  ? `Calibrated: 1 px = ${formatMmPx(scaleFactor)} mm`
                  : 'Not calibrated — angular values unaffected'}
              </figcaption>
            </figure>

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
              </div>
            )}

            {/* Clinician certification: ruled signature lines, as on any
                clinical letterhead. Name and license persist per device;
                the signature and date rules are signed by hand. */}
            <div className={classes.tail}>
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
                  <span className={classes.notes_rule} />
                  <span className={classes.notes_rule} />
                  <span className={classes.notes_rule} />
                  <span className={classes.notes_rule} />
                  <span className={classes.notes_rule} />
                </div>
              </div>

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
                    <div className={classes.sig_line} />
                    <span className={classes.sig_caption}>Date</span>
                  </div>
                </div>
              </div>

              <footer className={classes.foot}>
                <span className={classes.foot_brand}>
                  Generated with WebCeph · {date}
                </span>
                <span className={classes.foot_note}>
                  Computed values depend on landmark placement and calibration —
                  review before clinical use.
                </span>
                <span className={classes.foot_page}>
                  {isCombined
                    ? `End of report · ${sectionCount} analyses`
                    : 'End of report'}
                </span>
              </footer>
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
    // Only worth saying when a millimetre measurement was actually withheld.
    const anyPendingScale = sections.some(
      (s) => s.evaluation.pendingScaleCount > 0,
    );
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

        {anyPendingScale ? (
          // The most consequential caveat on the page: it must not be the
          // quietest text on it.
          <p className={classes.caveat}>
            Millimetre measurements are withheld throughout: this radiograph
            has no image scale. Set it from the calibration chip in the toolbar
            and reprint — angular values and ratios are unaffected.
          </p>
        ) : null}

        {divergences.length > 0 ? (
          <div className={classes.diverge}>
            <span className={classes.diverge_head}>
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
              not in conflict and none of them supersedes the others. Marked
              ≠ in the summary above.
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
        />
      </div>
    );
  }

  /** Memoized (landmark set × scale factor) evaluation of every analysis. */
  private getSections(): Section[] {
    const { manualLandmarks, scaleFactor } = this.props;
    const cache = this.sectionsCache;
    if (
      cache !== null &&
      cache.manualLandmarks === manualLandmarks &&
      cache.scaleFactor === scaleFactor
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
          entry.analysis, manualLandmarks, scaleFactor,
        ),
      }),
    );
    this.sectionsCache = { manualLandmarks, scaleFactor, sections };
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
    const cache = this.activeCache;
    if (
      cache !== null &&
      cache.manualLandmarks === manualLandmarks &&
      cache.scaleFactor === scaleFactor &&
      cache.analysisId === analysisId
    ) {
      return cache.evaluation;
    }
    const entry = analysisId === null ? undefined : LATERAL_ANALYSES.filter(
      (e) => e.id === analysisId || e.analysis.id === analysisId,
    )[0];
    const evaluation = entry === undefined
      ? null
      : evaluateAnalysis(entry.analysis, manualLandmarks, scaleFactor);
    this.activeCache = {
      manualLandmarks, scaleFactor, analysisId, evaluation,
    };
    return evaluation;
  }

  /** The active analysis' table, with the same footnotes its section gets. */
  private renderActiveResultsTable() {
    const { results, landmarksBySymbol, needsScaleForLinear } = this.props;
    const evaluation = this.getActiveEvaluation();
    return (
      <ResultsTable
        results={results}
        landmarksBySymbol={landmarksBySymbol}
        needsScaleForLinear={needsScaleForLinear}
        missingLandmarkCount={
          evaluation !== null ? evaluation.missingLandmarkCount : 0
        }
        missingSymbols={
          evaluation !== null ? evaluation.missingSymbols : undefined
        }
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
   * report date, plus "Page n of N". Generated at render time because the
   * strings are patient data, and expressed as `@page` margin boxes — the only
   * mechanism that repeats reliably across pages and can count them.
   * Suppressed on page 1, which already carries the letterhead and the patient
   * block in full.
   */
  private renderRunningPageStyle(patientLine: string, docLine: string) {
    const box = (align: string) => (
      `font: 8.5pt ${PRINT_FONT}; color: #7B8794; ` +
      `text-align: ${align};`
    );
    const css = [
      '@page {',
      '  size: A4 portrait;',
      '  margin: 15mm 12mm 14mm;',
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
      `    content: ${cssString('Cephalometric analysis report')};`,
      `    ${box('left')}`,
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

  private renderSnapshot() {
    const { imageSrc, imageWidth, imageHeight, manualLandmarks } = this.props;
    if (imageSrc === null || !imageWidth || !imageHeight) {
      return;
    }
    // The report always shows the full tracing (profilogram + points),
    // independent of the on-screen profilogram toggle — the tracing is what
    // the report documents.
    renderTracingSnapshot(
      imageSrc, imageWidth, imageHeight,
      manualLandmarks, buildProfilogram(manualLandmarks),
      // Cropped to the traced region: the report has one figure and a fixed
      // amount of page for it.
      true,
    ).then((url) => {
      if (url !== null) {
        this.setState({ snapshotUrl: url });
      }
    });
  }

  private handlePrint = () => {
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
