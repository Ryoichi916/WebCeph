import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import { Helmet } from 'react-helmet';

import IconPrint from 'material-ui/svg-icons/action/print';
import IconClose from 'material-ui/svg-icons/navigation/close';
import IconImage from 'material-ui/svg-icons/image/photo';

import Props, { TimepointRecord } from './props';
import { sharedBasisIds } from './selectors';

// Geometry: the registration transform, the framing, the figure annotations and
// the change table all come from the shared pure module, and the anatomical
// curves from the very module the editor draws with — never a second
// implementation.
import {
  buildRegistration,
  buildChangeTable,
  buildAnnotations,
  superimpositionFrame,
  transformLandmarks,
  getBasis,
  REGISTRATION_BASES,
  RegistrationBasis,
  RegistrationBasisId,
  SuperimpositionAnnotations,
  formatInterval,
  basisSymbols,
  missingBasisSymbols,
  orphanSymbols,
  orphanOutlineIds,
  IDENTITY,
  PLOTTING_ERROR,
  ChangeRow,
  ChangeTable,
  BarScale,
  Box,
} from 'analyses/superimposition';
import { buildOutlines, outlineToSvgPath, Outline } from 'components/TracingViewer/outlines';
// The honest account of what the registration means, condensed on screen and
// printed in full — the same affordance the treatment simulation uses.
import AboutDisclosure from 'components/AboutDisclosure';

// Number formatting, unit suffixes and the printed sheet's wording are the
// app's, not this view's: the same helpers the Summary dialog and the clinical
// report use.
import { getUnitSuffix, roundToDisplay } from 'components/AnalysisResultsViewer';
import {
  printNumber,
  printSigned,
  formatSymbolList,
  measurementsAre,
  landmarkCount,
} from 'components/ClinicalReport/copy';
import { formatScale } from 'components/TracingToolbar/CalibrationDialog';
// The practice identity is the clinical report's, read back here so the two
// printed sheets are signed to the same standard.
import { readLetterhead, formatClinicianLine } from 'components/ClinicalReport/letterhead';

import {
  getImageTypeLabel,
  getImageTypeShortLabel,
  getTimepointToken,
  formatCaptureDate,
  parseCaptureDate,
} from 'utils/records';
import { formatAgeFull, formatSexFull } from 'utils/patient';
// A saved PDF is named after the document title, so this sheet titles itself
// from the patient and the pair rather than from the image's file name.
import { printDocumentTitle } from 'utils/printTitle';

import {
  renderSuperimpositionSnapshot,
} from 'utils/superimpositionSnapshot';
// `saveBlobAs` replaces `file-saver`'s saveAs(): see its doc comment for why
// (a webpack chunk boundary between file-saver and its caller silently drops
// the filename).
import { sanitizeFilenameStem, saveBlobAs } from 'utils/tracingSnapshot';

const classes = require('./style.scss');

/**
 * Global (unhashed) body class held while the view is open, so the print
 * stylesheet can hide the app and print only the superimposition — the same
 * mechanism the clinical report uses.
 */
const BODY_OPEN_CLASS = 'superimposition-open';

/**
 * Height the print stylesheet gives the figure, in CSS pixels (see
 * `.figure` in the print block of style.scss). Annotation type is sized in
 * viewBox units, so the printed sheet needs its own units-per-pixel — taken
 * from this constant rather than from the on-screen layout, which is a
 * different size and is not re-measured while Chrome paginates.
 */
const PRINT_FIGURE_HEIGHT_MM = 142;
const PRINT_FIGURE_HEIGHT_PX = (PRINT_FIGURE_HEIGHT_MM / 25.4) * 96;

/** Rendered size of annotation labels, in CSS pixels, on screen and on paper. */
const ANNOTATION_PX = 12.5;
const ANNOTATION_PX_PRINT = 10;

/** Clip path for T1's film, so the radiograph stops at the framed region. */
const FILM_CLIP_ID = 'superimposition-film-clip';

interface State {
  t1Id: string | null;
  t2Id: string | null;
  basisId: RegistrationBasisId | null;
  isExporting: boolean;
  exportError: string | null;
  /**
   * Rendered size of the figure box. The SVG scales its viewBox to this box, so
   * it is the only way to give annotation type a real pixel size instead of a
   * size that shrinks with the crop.
   */
  figurePx: { width: number; height: number } | null;
}

/** A timepoint as the legend and the prose name it. */
const describe = (t: TimepointRecord): string => {
  const parts: string[] = [];
  if (t.timepoint !== null && t.timepoint.trim() !== '') {
    parts.push(t.timepoint.trim());
  }
  parts.push(getImageTypeLabel(t.type));
  const date = formatCaptureDate(t.captureDate);
  parts.push(date !== null ? date : 'date not recorded');
  return parts.join(' · ');
};

/**
 * A timepoint as the dropdown names it. The capture date leads: it is the one
 * field that tells two films of the same type apart, so it must never be the
 * part a narrow `<select>` clips. The image type follows in its rail-sized
 * form, for the same reason.
 */
const describeOption = (t: TimepointRecord): string => {
  const date = formatCaptureDate(t.captureDate);
  const parts: string[] = [date !== null ? date : 'undated'];
  if (t.timepoint !== null && t.timepoint.trim() !== '') {
    parts.push(t.timepoint.trim());
  }
  parts.push(getImageTypeShortLabel(t.type));
  return parts.join(' · ');
};

/**
 * Legend/PNG label for a film in a slot: **the film's own timepoint label**, and
 * the slot name only for a film that carries none.
 *
 * The slot name used to lead — a film filed "T3 Debond" in the later slot was
 * legended "T2 (T3 Debond)" — which was defensible while every comparison this
 * view opened was between adjacent visits. It is not defensible now that a
 * non-adjacent pair is a first-class action (the records dashboard's whole-case
 * bracket opens T1 → T3 directly): the legend named the second film T2, the change
 * columns were headed T1/T2 and the difference read "T2 − T1", so a filed sheet
 * comparing T1 with T3 stated T2 three times and T3 once, in brackets. The record's
 * own vocabulary leads everywhere the numbers are named (see `slotToken`).
 */
const shortLabel = (t: TimepointRecord, slot: 'T1' | 'T2'): string => {
  const own = t.timepoint !== null ? t.timepoint.trim() : '';
  const head = own === '' ? slot : own;
  const date = formatCaptureDate(t.captureDate);
  return date !== null ? `${head} · ${date}` : head;
};

/**
 * What this view *calls* a film in a column head, a difference or an audit line:
 * the film's own series token where it has one, and the slot name only where it
 * has none.
 *
 * The slot names used to lead everywhere — a film filed "T3 Debond" placed in the
 * later slot was legended "T2 (T3 Debond)", the change columns were headed T1 and
 * T2, and the panel's own subtitle read "T2 − T1". Opened on a T1-against-T3
 * comparison — which the records dashboard's whole-case bracket now makes a
 * first-class action — that sheet stated "T2 − T1" for a difference between T1 and
 * T3, and it stated it in the two places a reader takes a number from: the column
 * it is under and the heading above it. Exported as a PNG or filed on paper, the
 * slot vocabulary is not recoverable from anything else on the sheet.
 *
 * So the record's own vocabulary heads the numbers, and the slot name survives
 * only as the fallback for a film that carries no timepoint at all — where it is
 * the only name there is.
 */
const slotToken = (t: TimepointRecord, slot: 'T1' | 'T2'): string => {
  const token = getTimepointToken(t.timepoint);
  return token !== null ? token : slot;
};

/**
 * Which of the Change table's two columns holds the chronologically earlier
 * film — from the films' own capture dates, never from which slot (T1/T2)
 * they were dropped into.
 *
 * The column heads already carry the picker's guarantee that this table's
 * *left-to-right layout* is T1-then-T2 (see `slotToken`'s comment), but the
 * words "earlier"/"later" underneath used to be hardcoded to that same
 * left/right position — true only while the T1 dropdown happens to hold the
 * chronologically earlier film. Pick the later-dated film into the T1
 * dropdown (the picker allows it; nothing enforces date order between the
 * two selects) and the table still printed "earlier" over the later film and
 * "later" over the earlier one, one line under a subtitle stating the
 * opposite via the films' own dates. Silent where the comparison cannot be
 * made honestly: either capture date missing, unparseable, or the two films
 * share a date.
 */
const chronologyCaptions = (
  t1: TimepointRecord, t2: TimepointRecord,
): { t1: string | null; t2: string | null } => {
  const d1 = parseCaptureDate(t1.captureDate);
  const d2 = parseCaptureDate(t2.captureDate);
  if (d1 === null || d2 === null || d1.getTime() === d2.getTime()) {
    return { t1: null, t2: null };
  }
  return d1.getTime() < d2.getTime()
    ? { t1: 'earlier', t2: 'later' }
    : { t1: 'later', t2: 'earlier' };
};

/** Which of the two films lack a mm/px calibration, named as prose. */
const uncalibratedFilms = (t1: TimepointRecord, t2: TimepointRecord): string => {
  const missing: string[] = [];
  if (t1.scaleFactor === null) {
    missing.push(slotToken(t1, 'T1'));
  }
  if (t2.scaleFactor === null) {
    missing.push(slotToken(t2, 'T2'));
  }
  if (missing.length === 2) {
    return 'neither film is calibrated';
  }
  if (missing.length === 1) {
    return `${missing[0]} is not calibrated`;
  }
  return 'a measurement is missing a scale on one film';
};

/**
 * What a basis needs, and — when it is unavailable — precisely which of those
 * landmarks are missing and from which film. Naming only the full requirement
 * ("needs S, N on both tracings") is true but not actionable when a film is
 * short a single point: the reader has to open both tracings and compare
 * point lists by hand to find it. This names the film and the point, so the
 * segmented control's tooltip and the hint line beneath it are both
 * answerable from the sentence alone.
 */
const basisMissingSummary = (
  basis: RegistrationBasis, t1: TimepointRecord, t2: TimepointRecord,
): string => {
  const need = basisSymbols(basis).join(', ');
  const missing1 = missingBasisSymbols(basis, t1.landmarks);
  const missing2 = missingBasisSymbols(basis, t2.landmarks);
  const clauses: string[] = [];
  if (missing1.length > 0) {
    clauses.push(`${slotToken(t1, 'T1')} is missing ${missing1.join(', ')}`);
  }
  if (missing2.length > 0) {
    clauses.push(`${slotToken(t2, 'T2')} is missing ${missing2.join(', ')}`);
  }
  // The fallback cannot be reached from `renderControls` — a basis only lands
  // in its `unavailable` list when at least one film is short a landmark —
  // but stays honest rather than silently mis-stating a basis whose
  // unavailability comes from anywhere else in the future.
  return clauses.length > 0
    ? `needs ${need} on both tracings — ${clauses.join('; ')}`
    : `needs ${need} on both tracings`;
};

/**
 * Which measurement kinds carry a Δ/max bar, and what each bar is drawn
 * against. **The single source of truth for both the bars and the sentence that
 * explains them**: the row renderer used to draw a bar for any kind present in
 * `scales` while the footnote listed only two of them, so the ratio bucket got
 * bars against a reference the footnote never named — a −3.0 % change drawn
 * longer than a +1.7 mm one, under a sentence that mentioned only degrees and
 * millimetres.
 *
 * The ratio bucket is excluded rather than given a third clause, because it is
 * not one kind: `measurementKind` puts a percentage (S-Go/N-Me, 72.8 %) and a
 * dimensionless ratio (Holdaway, 0.3) in the same bucket, and a bar comparing
 * those two against one reference length would be a comparison of unlike
 * quantities. Those rows keep their numbers and lose only the reading aid.
 */
const BAR_KINDS: Array<{ kind: string; name: string; unit: string }> = [
  { kind: 'angular', name: 'angular', unit: '°' },
  { kind: 'linear', name: 'linear', unit: ' mm' },
];

/** True when this kind's changes are drawn as bars (see `BAR_KINDS`). */
const hasBars = (kind: string): boolean => (
  BAR_KINDS.filter((k) => k.kind === kind).length > 0
);

/** One clause per kind that carries bars: "angular, against 5.0°". */
const barKindClauses = (scales: { [kind: string]: BarScale }): string[] => {
  const clauses: string[] = [];
  BAR_KINDS.forEach(({ kind, name, unit }) => {
    // The same test the row renderer draws a bar under, `max > 0` included: two
    // tracings that agree to the decimal give a kind a reference length of
    // zero, and the clause then read "angular, against 0.0°" under a column
    // with no bars in it at all.
    const scale = scales[kind];
    if (scale !== undefined && scale.count > 1 && scale.max > 0) {
      clauses.push(`${name}, against ${printNumber(scale.max)}${unit}`);
    }
  });
  return clauses;
};

/**
 * How far the registration landmark had to travel, in the unit the clinician
 * calibrated: millimetres when T1 carries a scale, pixels (named as the machine
 * unit they are) when it does not. A fit that moved nothing is stated as such
 * rather than printed as a row of zeroes that reads like a broken readout.
 */
const formatDisplacement = (
  translationPx: number, scaleFactor: number | null,
): string => {
  if (translationPx < 0.05) {
    return 'registration exact (no displacement)';
  }
  if (scaleFactor !== null) {
    return `registration point moved ${(translationPx * scaleFactor).toFixed(2)} mm`;
  }
  return `registration point moved ${printNumber(translationPx)} px ` +
    '(the earlier film is not calibrated)';
};

/**
 * Cephalometric superimposition of two timepoints.
 *
 * The earliest tracing (T1) and the latest (T2) are brought into one coordinate
 * frame by a rigid registration on a structure both carry — the anterior
 * cranial base by default — and drawn over T1's film, dimmed for context. The
 * table beside it quantifies every measurement both films can compute, as
 * T1, T2 and the signed change.
 *
 * Everything on screen is measured, not modelled: there is no prediction, no
 * growth forecast and no norm here. The change *is* the finding — and a change
 * smaller than hand-plotting error is labelled as one.
 */
export default class Superimposition extends React.PureComponent<Props, State> {
  private figureEl: HTMLDivElement | null = null;

  /**
   * The selection starts wherever the caller pointed it. Opened from the
   * editor's toolbar nothing is named and both slots are null, which `getPair`
   * reads as "earliest against latest" — the comparison this view exists for.
   * Opened from the records dashboard's timeline, the two visits whose interval
   * was clicked are named here, and they seed the very same two slots the
   * chrome's own pickers write to: one selection, one picker, wherever the view
   * was entered from.
   */
  constructor(props: Props) {
    super(props);
    const { initialT1Id, initialT2Id } = props;
    this.state = {
      t1Id: initialT1Id !== undefined && initialT1Id !== null ? initialT1Id : null,
      t2Id: initialT2Id !== undefined && initialT2Id !== null ? initialT2Id : null,
      basisId: null,
      isExporting: false,
      exportError: null,
      figurePx: null,
    };
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.measureFigure);
    document.body.classList.add(BODY_OPEN_CLASS);
    this.measureFigure();
  }

  componentDidUpdate() {
    // Cheap and idempotent: only a real size change sets state, so this cannot
    // loop.
    this.measureFigure();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.measureFigure);
    document.body.classList.remove(BODY_OPEN_CLASS);
  }

  render() {
    return ReactDOM.createPortal(this.renderView(), document.body);
  }

  // ---- Selection ------------------------------------------------------------

  /**
   * The two timepoints on screen: the user's choice when it is still on file,
   * otherwise the default pair — earliest against latest, which is the
   * comparison a clinician opens this view to make.
   */
  private getPair(): { t1: TimepointRecord; t2: TimepointRecord } | null {
    const { timepoints } = this.props;
    if (timepoints.length < 2) {
      return null;
    }
    const find = (id: string | null, fallback: TimepointRecord) => {
      const match = timepoints.filter((t) => t.imageId === id)[0];
      return match !== undefined ? match : fallback;
    };
    const t1 = find(this.state.t1Id, timepoints[0]);
    const t2 = find(this.state.t2Id, timepoints[timepoints.length - 1]);
    if (t1.imageId === t2.imageId) {
      // Never compare a film with itself: fall back to the default pair.
      return { t1: timepoints[0], t2: timepoints[timepoints.length - 1] };
    }
    return { t1, t2 };
  }

  /** The basis in force: the user's choice while both films can supply it. */
  private resolveBasisId(shared: RegistrationBasisId[]): RegistrationBasisId | undefined {
    return this.state.basisId !== null && shared.indexOf(this.state.basisId) !== -1
      ? this.state.basisId
      : shared[0];
  }

  private handleT1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const pair = this.getPair();
    // Picking the film already shown as T2 swaps the two, the way a date-range
    // control does, instead of refusing the click.
    this.setState({
      t1Id: id,
      t2Id: pair !== null && pair.t2.imageId === id ? pair.t1.imageId : this.state.t2Id,
      exportError: null,
    });
  };

  private handleT2Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const pair = this.getPair();
    this.setState({
      t2Id: id,
      t1Id: pair !== null && pair.t1.imageId === id ? pair.t2.imageId : this.state.t1Id,
      exportError: null,
    });
  };

  private selectBasis = (basisId: RegistrationBasisId, isShared: boolean) => {
    if (!isShared) {
      // The control stays focusable and explains itself instead of being a
      // dead `disabled` button whose tooltip the browser suppresses.
      return;
    }
    this.setState({ basisId, exportError: null });
  };

  private setFigureEl = (el: HTMLDivElement | null) => {
    this.figureEl = el;
  };

  private measureFigure = () => {
    const el = this.figureEl;
    if (el === null) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const current = this.state.figurePx;
    if (current === null || current.width !== width || current.height !== height) {
      this.setState({ figurePx: { width, height } });
    }
  };

  // ---- Rendering ------------------------------------------------------------

  private renderView() {
    const pair = this.getPair();
    // A pair can exist and still share no registration basis at all (see
    // `renderNotEnough`'s sibling state inside `renderPair`) — two tracings
    // with, say, S plotted on one film and N on the other, neither alone.
    // Export and Print were gated only on `pair === null`, so in that state
    // both buttons stayed visually identical to the working ones: nothing
    // told a clinician there was nothing to export before they clicked and
    // read the in-view error. This mirrors the same shared-basis test
    // `renderPair` and `handlePrint`/`handleExportPng` already run.
    const canExport = pair !== null
      && sharedBasisIds(pair.t1.availableBasisIds, pair.t2.availableBasisIds).length > 0;

    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Superimposition"
      >
        {/* A saved PDF is named after `document.title`, which the app sets from
            the workspace — the image's file name. Held only while this view is
            mounted; react-helmet restores the app's title on close. */}
        <Helmet
          title={printDocumentTitle(
            this.props.patient,
            'Cephalometric superimposition',
            pair !== null
              ? [
                `${shortLabel(pair.t1, 'T1')} → ${shortLabel(pair.t2, 'T2')}`,
              ]
              : [],
          )}
        />
        {this.renderPrintHead(pair)}

        <div className={classes.chrome}>
          <span className={classes.chrome_title}>
            Superimposition
            <span className={classes.chrome_hint}>
              Two timepoints in one frame · change is measured, not predicted
            </span>
          </span>
          <div className={classes.chrome_actions}>
            {this.state.exportError !== null ? (
              <span className={classes.chrome_error} role="alert">
                {this.state.exportError}
              </span>
            ) : null}
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
              className={classes.chrome_button}
              disabled={!canExport || this.state.isExporting}
              onClick={this.handleExportPng}
            >
              <IconImage color="currentColor" style={{ width: 18, height: 18 }} />
              {this.state.isExporting ? 'Exporting…' : 'Export PNG'}
            </button>
            <button
              type="button"
              className={cx(classes.chrome_button, classes.chrome_button__primary)}
              autoFocus
              disabled={!canExport}
              onClick={this.handlePrint}
            >
              <IconPrint color="currentColor" style={{ width: 18, height: 18 }} />
              Print / Save as PDF
            </button>
          </div>
        </div>

        {pair === null ? this.renderNotEnough() : this.renderPair(pair.t1, pair.t2)}
        {pair !== null ? this.renderPrintTail() : null}
      </div>
    );
  }

  /**
   * Print-only letterhead and patient band, first in flow so they head the
   * paper. A detached clinical sheet must carry the practice it came from, the
   * patient it is about, the demographics its numbers are read against and the
   * day it was produced — the same masthead the clinical report prints, from
   * the same stored identity.
   */
  private renderPrintHead(
    pair: { t1: TimepointRecord; t2: TimepointRecord } | null,
  ) {
    const { patient } = this.props;
    const letterhead = readLetterhead();
    const clinicianLine = formatClinicianLine(letterhead);
    const printedOn = new Date().toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const dateOfBirth = patient !== null && patient.dateOfBirth !== undefined &&
      patient.dateOfBirth !== ''
      ? patient.dateOfBirth
      : null;
    // Age is stated at the later film — the age the change was measured up to —
    // not at the print date, which may be years later.
    const t2Date = pair !== null ? parseCaptureDate(pair.t2.captureDate) : null;
    const ageAtT2 = patient !== null && t2Date !== null
      ? formatAgeFull(patient.dateOfBirth, t2Date)
      : null;
    const age = ageAtT2 !== null
      ? ageAtT2
      : (patient !== null ? formatAgeFull(patient.dateOfBirth) : null);
    const interval = pair !== null
      ? formatInterval(parseCaptureDate(pair.t1.captureDate), t2Date)
      : null;
    const comparison = pair !== null
      ? `${shortLabel(pair.t1, 'T1')} → ${shortLabel(pair.t2, 'T2')}` +
        (interval !== null ? ` (${interval})` : '')
      : '—';

    const cell = (label: string, value: string | null) => (
      <div className={classes.band_cell}>
        <span className={classes.band_label}>{label}</span>
        <span className={classes.band_value}>{value !== null ? value : '—'}</span>
      </div>
    );

    return (
      <div className={classes.print_head} aria-hidden="true">
        <header className={classes.print_masthead}>
          <div className={classes.print_masthead_left}>
            <span className={classes.print_clinic}>
              {letterhead.clinic !== ''
                ? letterhead.clinic
                : 'Cephalometric superimposition'}
            </span>
            {clinicianLine !== '' ? (
              <span className={classes.print_clinic_line}>{clinicianLine}</span>
            ) : null}
          </div>
          <div className={classes.print_masthead_right}>
            <span className={classes.print_kicker}>Superimposition</span>
            <span className={classes.print_date}>{printedOn}</span>
          </div>
        </header>
        <h1 className={classes.print_title}>Cephalometric Superimposition</h1>
        <div className={classes.print_band}>
          <div className={classes.band_row}>
            {cell('Patient', patient !== null && patient.name ? patient.name : null)}
            {cell('Chart ID', patient !== null && patient.chartId ? patient.chartId : null)}
            {cell('Sex', patient !== null ? formatSexFull(patient.sex) : null)}
          </div>
          <div className={classes.band_row}>
            {cell('Date of birth', dateOfBirth)}
            {cell(ageAtT2 !== null ? 'Age at T2 film' : 'Age at printing', age)}
            {cell('Compared', comparison)}
          </div>
        </div>
      </div>
    );
  }

  /**
   * Print-only certification block: the same ruled signature lines the clinical
   * report closes with, so a superimposition handed to a colleague is a signed
   * document rather than a screenshot.
   */
  private renderPrintTail() {
    const letterhead = readLetterhead();
    return (
      <div className={classes.print_tail} aria-hidden="true">
        <div className={classes.sig_label}>Certification</div>
        <div className={classes.sig_row}>
          <div className={cx(classes.sig_field, classes.sig_field__wide)}>
            <div className={classes.sig_line}>{letterhead.clinician}</div>
            <span className={classes.sig_caption}>
              Examined by — name &amp; signature
            </span>
          </div>
          <div className={classes.sig_field}>
            <div className={classes.sig_line}>
              {letterhead.license !== '' ? `License no. ${letterhead.license}` : ''}
            </div>
            <span className={classes.sig_caption}>License no.</span>
          </div>
          <div className={classes.sig_field}>
            <div className={classes.sig_line} />
            <span className={classes.sig_caption}>Date</span>
          </div>
        </div>
        <p className={classes.print_colophon}>
          Produced with WebCeph. Every value on this sheet is measured from the
          two tracings named above; nothing is predicted or simulated. The
          clinician name and license are as entered on this device.
        </p>
      </div>
    );
  }

  private renderNotEnough() {
    return (
      <div className={classes.body}>
        <div className={classes.empty}>
          <span className={classes.empty_title}>
            Two traced timepoints are needed
          </span>
          <span className={classes.empty_hint}>
            A superimposition compares one tracing with another. Add a second
            lateral cephalogram from Records, plot its landmarks, and this view
            will register the two.
          </span>
        </div>
      </div>
    );
  }

  private renderPair(t1: TimepointRecord, t2: TimepointRecord) {
    const shared = sharedBasisIds(t1.availableBasisIds, t2.availableBasisIds);
    const basisId = this.resolveBasisId(shared);

    if (basisId === undefined) {
      return (
        <div className={classes.body}>
          <div className={classes.empty}>
            <span className={classes.empty_title}>
              These two tracings share no registration
            </span>
            <span className={classes.empty_hint}>
              {describe(t1)} and {describe(t2)} do not both carry the landmarks
              of any registration this app implements. Plot the same basis on
              both films — {REGISTRATION_BASES.map((b) => b.label).join(', ')} —
              and they can be superimposed.
            </span>
          </div>
        </div>
      );
    }

    const basis = getBasis(basisId);
    const registration = buildRegistration(
      basis, t1.landmarks, t2.landmarks, t1.scaleFactor, t2.scaleFactor,
    );
    const frame = superimpositionFrame(
      t1.landmarks, t2.landmarks, registration.transform,
    );
    const changes = buildChangeTable(
      t1.landmarks, t2.landmarks, t1.scaleFactor, t2.scaleFactor,
    );
    const interval = formatInterval(
      parseCaptureDate(t1.captureDate), parseCaptureDate(t2.captureDate),
    );

    return (
      <React.Fragment>
        {this.renderControls(t1, t2, shared, basisId, interval)}
        <div className={classes.body}>
          <div className={classes.figure_column}>
            {frame !== null ? (
              <div
                className={classes.figure}
                ref={this.setFigureEl}
                // The frame's own aspect ratio, so the registered anatomy fills
                // the box instead of being letterboxed into the middle third of
                // it by `preserveAspectRatio`.
                style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
              >
                {this.renderSvg(t1, t2, registration.transform, frame, basis)}
              </div>
            ) : (
              <div className={cx(classes.figure, classes.figure__empty)}>
                <div className={classes.empty}>
                  <span className={classes.empty_title}>
                    Not enough plotted geometry to frame
                  </span>
                </div>
              </div>
            )}
            {this.renderLegend(t1, t2, registration, interval, changes)}
          </div>
          {this.renderChanges(changes, t1, t2, interval)}
        </div>
      </React.Fragment>
    );
  }

  private renderControls(
    t1: TimepointRecord,
    t2: TimepointRecord,
    shared: RegistrationBasisId[],
    basisId: RegistrationBasisId,
    interval: string | null,
  ) {
    const { timepoints } = this.props;
    const options = timepoints.map((t) => (
      <option key={t.imageId} value={t.imageId}>{describeOption(t)}</option>
    ));
    // A registration both films cannot supply is explained in plain sight: a
    // `disabled` button's tooltip is suppressed by every major browser, so the
    // requirement would otherwise be unreachable.
    const unavailable = REGISTRATION_BASES.filter(
      (b) => shared.indexOf(b.id) === -1,
    );
    return (
      <div className={classes.controls}>
        <div className={classes.pickers}>
          <label className={classes.picker}>
            {/* The tag is the film's own token, in the colour its tracing is drawn
                in — the same swap the legend and the change columns make (see
                `slotToken`). Left as the slot name, the chip over a picker holding
                T3 read "T2" while the table beside it headed the same film T3. */}
            <span
              className={cx(classes.picker_tag, classes.picker_tag__t1)}
              title="The earlier of the two films"
            >
              {slotToken(t1, 'T1')}
            </span>
            <select
              className={classes.select}
              value={t1.imageId}
              aria-label="Earlier timepoint"
              onChange={this.handleT1Change}
            >
              {options}
            </select>
          </label>
          <span className={classes.picker_arrow} aria-hidden="true">→</span>
          <label className={classes.picker}>
            <span
              className={cx(classes.picker_tag, classes.picker_tag__t2)}
              title="The later of the two films"
            >
              {slotToken(t2, 'T2')}
            </span>
            <select
              className={classes.select}
              value={t2.imageId}
              aria-label="Later timepoint"
              onChange={this.handleT2Change}
            >
              {options}
            </select>
          </label>
          {interval !== null ? (
            <span className={classes.interval} title="Interval between the two capture dates">
              {interval} apart
            </span>
          ) : null}
        </div>

        <div className={classes.seg_group}>
          <span className={classes.seg_label}>Register on</span>
          <div className={classes.seg} role="group" aria-label="Registration basis">
            {REGISTRATION_BASES.map((b) => {
              const isShared = shared.indexOf(b.id) !== -1;
              const title = isShared
                ? `${b.name} — ${b.description}`
                : `${b.name} is unavailable: ${basisMissingSummary(b, t1, t2)}.`;
              return (
                // The tooltip lives on an enabled wrapper, not on the button:
                // browsers do not fire hover on a disabled control.
                <span key={b.id} className={classes.seg_slot} title={title}>
                  <button
                    type="button"
                    className={cx(classes.seg_button, {
                      [classes.seg_button__on]: b.id === basisId,
                      [classes.seg_button__off]: !isShared,
                    })}
                    aria-disabled={!isShared}
                    aria-pressed={b.id === basisId}
                    onClick={this.selectBasis.bind(this, b.id, isShared)}
                  >
                    {b.label}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {unavailable.length > 0 ? (
          <p className={classes.seg_hint}>
            Unavailable:{' '}
            {unavailable.map((b) => (
              `${b.label} ${basisMissingSummary(b, t1, t2)}`
            )).join(' · ')}. Auto-plot does not place these — plot them on each
            film to unlock the registration.
          </p>
        ) : null}
      </div>
    );
  }

  /**
   * The superimposition itself. T1's film sits underneath — clipped to the
   * framed region, dimmed, purely as anatomical context; both tracings are
   * drawn from `buildOutlines` — the same curves the editor draws — over it, T1
   * solid cyan and T2 dashed orange, so a segment where the two coincide still
   * shows T1 through T2's gaps. A landmark or synthesised shape with no
   * counterpart on the other tracing — plotted for one film's analysis but not
   * the other's — is drawn dimmed (see `orphanSymbols`/`orphanOutlineIds`)
   * rather than at full weight, so it reads as context instead of clutter.
   */
  private renderSvg(
    t1: TimepointRecord,
    t2: TimepointRecord,
    transform: ReturnType<typeof buildRegistration>['transform'],
    frame: Box,
    basis: RegistrationBasis,
  ) {
    const t1Points = transformLandmarks(t1.landmarks, IDENTITY);
    const t2Points = transformLandmarks(t2.landmarks, transform);
    const t1Outlines = buildOutlines(t1Points);
    const t2Outlines = buildOutlines(t2Points);
    const t1OrphanSymbols = orphanSymbols(t1Points, t2Points);
    const t2OrphanSymbols = orphanSymbols(t2Points, t1Points);
    const t1OrphanOutlineIds = orphanOutlineIds(t1Outlines, t2Outlines);
    const t2OrphanOutlineIds = orphanOutlineIds(t2Outlines, t1Outlines);
    const dotRadius = frame.width / 190;
    const annotations = buildAnnotations(
      basis, t1Points, t2Points, frame, t1.scaleFactor,
    );

    // Viewbox units per rendered CSS pixel, measured — the only honest way to
    // give figure type a real size, since the same viewBox is scaled to a
    // ~490px box on screen and a 112mm box on paper.
    const { figurePx } = this.state;
    const perPx = figurePx !== null && figurePx.width > 8
      ? frame.width / figurePx.width
      : frame.width / 480;
    const perPxPrint = frame.height / PRINT_FIGURE_HEIGHT_PX;
    const size = ANNOTATION_PX * perPx;
    const sizePrint = ANNOTATION_PX_PRINT * perPxPrint;
    // Label offsets sit between the two, so a label clears its dot in both.
    const offset = 10 * ((perPx + perPxPrint) / 2);
    const svgStyle = {
      '--anno-size': `${size}px`,
      '--anno-halo': `${size / 3}px`,
      '--anno-size-print': `${sizePrint}px`,
      '--anno-halo-print': `${sizePrint / 3}px`,
    } as any as React.CSSProperties;

    return (
      <svg
        className={classes.svg}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={svgStyle}
        role="img"
        aria-label={
          `Superimposition of ${describe(t1)} and ${describe(t2)}, ` +
          `registered at ${basis.origin}`
        }
      >
        <defs>
          <clipPath id={FILM_CLIP_ID}>
            <rect
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
            />
          </clipPath>
        </defs>
        {t1.src !== null && t1.width !== null && t1.height !== null ? (
          <image
            className={classes.film}
            clipPath={`url(#${FILM_CLIP_ID})`}
            xlinkHref={t1.src}
            x={0}
            y={0}
            width={t1.width}
            height={t1.height}
            preserveAspectRatio="none"
          />
        ) : null}
        {this.renderBasisLine(annotations.t1Basis, classes.basis_line__t1)}
        {this.renderBasisLine(annotations.t2Basis, classes.basis_line__t2)}
        {this.renderTracing(
          t1Points, t1Outlines, dotRadius, classes.t1,
          t1OrphanOutlineIds, t1OrphanSymbols,
        )}
        {this.renderTracing(
          t2Points, t2Outlines, dotRadius, classes.t2,
          t2OrphanOutlineIds, t2OrphanSymbols,
        )}
        {this.renderAnnotations(annotations, dotRadius, frame, offset)}
      </svg>
    );
  }

  /**
   * The reference line whose direction the registration matched, at one
   * timepoint. Drawing both is what makes the fit checkable: two coincident
   * lines are the proof, and their absence would leave "T2 rotated 0.0°" to be
   * taken on faith.
   */
  private renderBasisLine(
    ends: [GeoPoint, GeoPoint] | null, hueClass: string,
  ) {
    if (ends === null) {
      return null;
    }
    return (
      <line
        className={cx(classes.basis_line, hueClass)}
        x1={ends[0].x}
        y1={ends[0].y}
        x2={ends[1].x}
        y2={ends[1].y}
      />
    );
  }

  private renderAnnotations(
    annotations: SuperimpositionAnnotations,
    dotRadius: number,
    frame: Box,
    offset: number,
  ) {
    const { origin, scaleBar } = annotations;
    const pad = frame.width * 0.04;
    const barY = frame.y + frame.height - pad;
    const barX = frame.x + pad;
    const tick = offset * 0.4;
    return (
      <g>
        {origin !== null ? (
          // The registration point is fixed by construction — marking it says
          // where the two tracings were made to agree.
          <circle
            className={classes.reg_ring}
            cx={origin.x}
            cy={origin.y}
            r={dotRadius * 3.2}
          />
        ) : null}
        {annotations.labels.map(({ symbol, point }) => (
          <text
            key={symbol}
            className={classes.anno_text}
            x={point.x + offset}
            y={point.y - offset * 1.05}
          >
            {symbol === annotations.originSymbol
              ? `${symbol} — registration`
              : symbol}
          </text>
        ))}
        {scaleBar !== null ? (
          // Only drawn when T1 carries a calibration: a ruler without one would
          // be a fabricated measurement.
          <g className={classes.scale_bar}>
            <line x1={barX} y1={barY} x2={barX + scaleBar.px} y2={barY} />
            <line x1={barX} y1={barY - tick} x2={barX} y2={barY + tick} />
            <line
              x1={barX + scaleBar.px}
              y1={barY - tick}
              x2={barX + scaleBar.px}
              y2={barY + tick}
            />
            <text
              className={classes.anno_text}
              x={barX + scaleBar.px / 2}
              y={barY - tick * 2}
              textAnchor="middle"
            >
              {`${scaleBar.mm} mm`}
            </text>
          </g>
        ) : null}
      </g>
    );
  }

  /**
   * One tracing's curves and landmark dots. `orphanOutlineIdList` and
   * `orphanSymbolList` name the geometry this tracing carries that the other
   * timepoint does not — dimmed via `.geometry__orphan` rather than omitted,
   * so a landmark plotted for only one film's analysis stays visible as
   * context without competing with the paired geometry the change table
   * actually reads (see `orphanSymbols`/`orphanOutlineIds`).
   */
  private renderTracing(
    points: { [symbol: string]: GeoPoint },
    outlines: Outline[],
    dotRadius: number,
    hueClass: string,
    orphanOutlineIdList: string[],
    orphanSymbolList: string[],
  ) {
    return (
      <g className={hueClass}>
        {outlines.map((outline) => {
          const d = outlineToSvgPath(outline);
          const isOrphan = orphanOutlineIdList.indexOf(outline.id) !== -1;
          return (
            <g
              key={outline.id}
              className={cx({ [classes.geometry__orphan]: isOrphan })}
            >
              <path className={classes.casing} d={d} />
              <path className={classes.outline} d={d} />
            </g>
          );
        })}
        {Object.keys(points).map((symbol) => (
          <circle
            key={symbol}
            className={cx(classes.dot, {
              [classes.geometry__orphan]: orphanSymbolList.indexOf(symbol) !== -1,
            })}
            cx={points[symbol].x}
            cy={points[symbol].y}
            r={dotRadius}
          />
        ))}
      </g>
    );
  }

  private renderLegend(
    t1: TimepointRecord,
    t2: TimepointRecord,
    registration: ReturnType<typeof buildRegistration>,
    interval: string | null,
    changes: ChangeTable,
  ) {
    const { basis } = registration;
    const rotation = printSigned(registration.rotationDeg);
    return (
      <div className={classes.legend}>
        <div className={classes.legend_keys}>
          <span className={cx(classes.key, classes.key__t1)}>
            <span className={classes.key_swatch} aria-hidden="true" />
            <span className={classes.key_text}>{shortLabel(t1, 'T1')}</span>
          </span>
          <span className={cx(classes.key, classes.key__t2)}>
            <span className={classes.key_swatch} aria-hidden="true" />
            <span className={classes.key_text}>{shortLabel(t2, 'T2')}</span>
          </span>
          {/* The interval is stated once on screen — in the controls row above.
              It reappears here only on paper, where that row is not printed. */}
          {interval !== null ? (
            <span className={classes.legend_interval}>{interval} apart</span>
          ) : null}
        </div>
        <div className={classes.legend_registration}>
          <span className={classes.legend_basis}>{basis.name}</span>
          <span className={classes.legend_numbers}>
            {slotToken(t2, 'T2')} rotated {rotation}° ·{' '}
            {formatDisplacement(registration.translationPx, t1.scaleFactor)}
            {registration.magnification !== 1
              ? ` · ${slotToken(t2, 'T2')} rescaled ` +
                `×${registration.magnification.toFixed(3)}`
              : ''}
          </span>
        </div>
        {/* One line inline — what was held still, which is what makes the table
            readable — and the fuller account behind the disclosure. */}
        <p className={classes.legend_note}>{basis.summary}</p>
        {registration.isMagnificationAssumed ? (
          <p className={cx(classes.legend_note, classes.legend_note__warn)}>
            The two films are assumed to be at the same magnification:{' '}
            {t1.scaleFactor === null && t2.scaleFactor === null
              ? 'neither carries an mm/px calibration'
              : `only ${t1.scaleFactor === null
                ? slotToken(t2, 'T2') : slotToken(t1, 'T1')} is calibrated ` +
                `(${formatScale((t1.scaleFactor !== null
                  ? t1.scaleFactor
                  : t2.scaleFactor) as number)})`}
            . Calibrate both from the toolbar to have the overlay corrected for
            film magnification.
          </p>
        ) : null}
        <AboutDisclosure
          className={classes.legend_about}
          label="About this view"
        >
          <p>{basis.description}</p>
          <p>
            The film shown is T1’s, dimmed for context and clipped to the framed
            region; T2 contributes its tracing only, drawn dashed so a
            coincident T1 stays visible beneath it. The straight cyan and orange
            line is the {basis.from}–{basis.to} reference whose direction was
            matched: where the two coincide, the registration is exact. A
            landmark or curve plotted on one tracing with no counterpart on the
            other — carried over from a different analysis, say — is drawn
            faded rather than at full weight: it has nothing to compare
            against. Both tracings are the plotted landmarks — nothing here is
            predicted or simulated.
          </p>
          {/* How the Change table is to be read. It is stated here, in the
              column the figure leaves free, rather than under the table: five
              stacked paragraphs of 8pt grey at the foot of a 400px rail were
              longer than several of the table's own groups. On paper this
              disclosure prints open (see AboutDisclosure), so a filed sheet
              still carries every word. */}
          {this.renderTableNotes(changes)}
        </AboutDisclosure>
      </div>
    );
  }

  /**
   * How the Change table is to be read: what the Δ/max bars are drawn against,
   * what is missing from the table and why, and the two things a change figure
   * is not (registration-dependent, or comparable with a norm).
   *
   * Rendered inside the legend's "About this view" disclosure, not under the
   * table: the rail is 400px wide and these were five stacked paragraphs of
   * 8pt grey at the foot of it, longer than several of the table's own groups,
   * while the column beside the figure sat empty. The print stylesheet expands
   * every disclosure, so the printed sheet is unchanged.
   */
  private renderTableNotes(changes: ChangeTable) {
    if (changes.rowCount === 0) {
      return null;
    }
    const barKinds = barKindClauses(changes.scales);
    return (
      <React.Fragment>
        {changes.oneSidedCount > 0 ? (
          <p>
            Another {changes.oneSidedCount}{' '}
            {changes.oneSidedCount === 1 ? 'measurement is' : 'measurements are'}{' '}
            omitted from the table: only one of the two tracings yields{' '}
            {changes.oneSidedCount === 1 ? 'it' : 'them'}, so there is no change
            to report. Plot the missing landmarks on that timepoint.
          </p>
        ) : null}
        {changes.neitherCount > 0 ? (
          <p>
            {measurementsAre(changes.neitherCount)} absent from the table
            entirely — neither film can compute{' '}
            {changes.neitherCount === 1 ? 'it' : 'them'}
            {changes.neitherSymbols.length > 0
              ? ` (${formatSymbolList(changes.neitherSymbols)})`
              : ''}
            {changes.missingBothSymbols.length > 0
              ? `. ${landmarkCount(changes.missingBothSymbols.length)} ` +
                `${changes.missingBothSymbols.length === 1 ? 'is' : 'are'} ` +
                'unplaced on both tracings ' +
                `(${formatSymbolList(changes.missingBothSymbols)}); ` +
                'plotting them on each film unlocks those analyses'
              : ''}
            .
          </p>
        ) : null}
        {barKinds.length > 0 ? (
          <p>
            Δ/max compares each change with the largest change of its own kind
            in the table ({barKinds.join('; ')}) — right of the axis for an
            increase, left for a decrease. Kinds are never drawn against each
            other, and a kind with a single row gets no bar, because it would
            have nothing to compare against.
          </p>
        ) : null}
        <p>
          The values are properties of each tracing on its own, so they do not
          change with the registration: switching the basis rearranges the
          overlay, never the numbers.
        </p>
        <p>
          Norms are not shown: a superimposition reports change, and a change
          has no norm. Read each value against its analysis in the Summary or
          the clinical report.
        </p>
      </React.Fragment>
    );
  }

  private renderChanges(
    changes: ChangeTable,
    t1: TimepointRecord,
    t2: TimepointRecord,
    interval: string | null,
  ) {
    const chronology = chronologyCaptions(t1, t2);
    return (
      <div className={classes.panel}>
        <div className={classes.panel_head}>
          <span className={classes.panel_title}>Change</span>
          {/* "Comparable", because a second count — the measurements only one
              tracing yields — is stated in the notes beside the figure. The
              two are the same number on this pair of films, and an unqualified
              "32 measurements" in both places read as a contradiction. */}
          <span className={classes.panel_sub}>
            {/* The two films' own names, not the slots they were dropped into:
                this line is the one place a reader learns which way the
                difference runs (see `slotToken`). */}
            {slotToken(t2, 'T2')} − {slotToken(t1, 'T1')} · {changes.rowCount}{' '}
            {changes.rowCount === 1
              ? 'comparable measurement'
              : 'comparable measurements'}
            {/* Print-only: on screen the interval is in the controls row. */}
            {interval !== null ? (
              <span className={classes.print_only}>{` over ${interval}`}</span>
            ) : null}
          </span>
        </div>
        <div className={classes.panel_scroll}>
          {changes.rowCount === 0 ? (
            <p className={classes.panel_empty}>
              No measurement can be computed on both films yet. Complete the
              same analysis on each timepoint and its measurements will appear
              here with their change.
            </p>
          ) : (
            <table className={classes.table}>
              <thead>
                <tr>
                  <th className={classes.col_name}>Measurement</th>
                  {/* Which slot each film is in, under its own name. The record's
                      vocabulary leads the numbers (see `slotToken`) — but with the
                      slot names gone from the heads entirely, the guarantee that the
                      left column is the *earlier* film was carried only by a
                      tooltip on a picker chip: a film filed T3 dropped into the
                      earlier slot heads these columns "T3 | T2" over a subtitle
                      reading "T2 − T3", and nothing on an exported PNG or a filed
                      sheet said which way round the pair was. Two words, in the
                      head's own quiet register, and the columns state it
                      themselves — computed from the films' own capture dates (see
                      `chronologyCaptions`), not assumed from column position: the
                      T1 dropdown and the T2 dropdown are two independent selects,
                      and nothing stops a clinician picking the later-dated film
                      into the left one. */}
                  <th className={classes.col_num}>
                    {slotToken(t1, 'T1')}
                    {chronology.t1 !== null ? (
                      <span className={classes.col_slot}>{chronology.t1}</span>
                    ) : null}
                  </th>
                  <th className={classes.col_num}>
                    {slotToken(t2, 'T2')}
                    {chronology.t2 !== null ? (
                      <span className={classes.col_slot}>{chronology.t2}</span>
                    ) : null}
                  </th>
                  <th className={classes.col_num}>Change</th>
                  <th
                    className={classes.col_bar}
                    title={
                      'Magnitude of the change against the largest change of ' +
                      'the same kind in this table. A reading aid, not a ' +
                      'clinical threshold.'
                    }
                  >
                    Δ/max
                  </th>
                </tr>
              </thead>
              {changes.groups.map((group) => (
                <tbody key={group.analysisId}>
                  <tr className={classes.group_row}>
                    <th colSpan={5} className={classes.group_head}>
                      {group.analysisName}
                    </th>
                  </tr>
                  {group.rows.map((row) => this.renderChangeRow(row, changes.scales))}
                </tbody>
              ))}
            </table>
          )}

          {/* Two notes only, and both change how the rows above them must be
              read: the reproducibility floor that dims a row, and the scale the
              millimetre rows are waiting on. Everything else the table needs
              explaining — what is omitted, what Δ/max is drawn against, that a
              change has no norm — is stated in the notes beside the figure (see
              `renderTableNotes`), which is where the free column is. */}
          <div className={classes.footnotes}>
            {changes.rowCount > 0 ? (
              <p className={classes.footnote}>
                Hand landmark plotting reproduces to about ±{PLOTTING_ERROR.linear} mm
                on a point and ±{PLOTTING_ERROR.angular}° on an angle, per
                tracing. A change below that is the same measurement taken
                twice, not a finding
                {changes.withinErrorCount > 0
                  ? `: ${changes.withinErrorCount} of these ` +
                    `${changes.rowCount} rows ${changes.withinErrorCount === 1
                      ? 'is'
                      : 'are'} within it, and are dimmed`
                  : '; every row here exceeds it'}
                .
              </p>
            ) : null}
            {changes.isLinearPendingScale ? (
              <p className={classes.footnote}>
                Linear (mm) measurements are omitted: {uncalibratedFilms(t1, t2)},
                so there is no honest millimetre value to compare. Set the scale
                from the calibration chip in the toolbar. Angular values are
                scale-independent and unaffected.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  private renderChangeRow(
    row: ChangeRow, scales: { [kind: string]: BarScale },
  ) {
    const unit = getUnitSuffix(row.landmark);
    // Bar length is relative to the largest change of the same kind in this
    // table — a reading aid, never a clinical threshold. A kind with a single
    // row has nothing to compare against, so it gets no bar rather than a
    // full-width one that would read as a maximal change; and a change of zero
    // gets no mark at all rather than a stub that reads as dust. Which kinds are
    // drawn at all is `BAR_KINDS`, the same list the explanation is written
    // from — so a bar can never appear against a reference nothing names.
    const scale = hasBars(row.kind) ? scales[row.kind] : undefined;
    const fraction = scale !== undefined && scale.max > 0 && scale.count > 1
      ? Math.min(1, Math.abs(row.change) / scale.max)
      : 0;
    const isForward = row.change >= 0;
    // The printed Change column is derived from T1 and T2 **as printed**, not
    // from the full-precision figure behind them: at one decimal, a true
    // change of e.g. −26.4° can round its endpoints to −11.0° and −37.4° while
    // the raw difference prints as −26.5° — a row that contradicts itself to
    // any reader who subtracts the two visible columns. Rounding T1 and T2
    // first, then differencing, is what makes the row's own arithmetic true on
    // the sheet — the same fix (and the same helper) as the treatment
    // simulation and trend chart use for the identical problem. The bar and
    // the hand-plotting-error dimming above are read straight off the raw
    // `row.change`; they are reading aids and a clinical threshold, not
    // numbers a reader checks by hand, so they are left at full precision.
    const shownChange = roundToDisplay(
      roundToDisplay(row.t2) - roundToDisplay(row.t1),
    );
    const errorNote = row.kind === 'angular'
      ? `Within hand-plotting error (±${PLOTTING_ERROR.angular}°)`
      : `Within hand-plotting error (±${PLOTTING_ERROR.linear} mm)`;
    return (
      <tr
        key={row.symbol}
        className={cx({ [classes.row__within]: row.isWithinError })}
        title={row.isWithinError ? errorNote : undefined}
      >
        <td className={classes.cell_name}>
          <span className={classes.symbol}>{row.symbol}</span>
          {row.name !== null ? (
            <span className={classes.name}>{row.name}</span>
          ) : null}
        </td>
        <td className={classes.cell_num}>{printNumber(row.t1)}{unit}</td>
        <td className={classes.cell_num}>{printNumber(row.t2)}{unit}</td>
        <td className={cx(classes.cell_num, classes.cell_change)}>
          {printSigned(shownChange)}{unit}
        </td>
        <td className={classes.cell_bar}>
          {fraction > 0 ? (
            <span className={classes.bar} aria-hidden="true">
              <span className={classes.bar_axis} />
              <span
                className={cx(classes.bar_fill, {
                  [classes.bar_fill__pos]: isForward,
                  [classes.bar_fill__neg]: !isForward,
                })}
                style={{ width: `${fraction * 50}%` }}
              />
            </span>
          ) : null}
        </td>
      </tr>
    );
  }

  // ---- Actions --------------------------------------------------------------

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.props.onRequestClose();
    }
  };

  private handlePrint = () => {
    window.print();
  };

  /**
   * PNG of the superimposition, rendered by the shared canvas back-end from the
   * same registration, the same outline module and the same annotations the
   * screen uses — including the statements a detached image is read without.
   */
  private handleExportPng = () => {
    const pair = this.getPair();
    if (pair === null) {
      return;
    }
    const { t1, t2 } = pair;
    const shared = sharedBasisIds(t1.availableBasisIds, t2.availableBasisIds);
    const basisId = this.resolveBasisId(shared);
    if (basisId === undefined) {
      this.setState({ exportError: 'These two tracings share no registration.' });
      return;
    }
    const basis = getBasis(basisId);
    const registration = buildRegistration(
      basis, t1.landmarks, t2.landmarks, t1.scaleFactor, t2.scaleFactor,
    );
    const frame = superimpositionFrame(
      t1.landmarks, t2.landmarks, registration.transform,
    );
    if (frame === null || !registration.isAvailable) {
      this.setState({ exportError: 'Nothing to export yet.' });
      return;
    }
    const { patient } = this.props;
    const identity = patient !== null
      ? [patient.chartId, patient.name].filter((p) => !!p).join(' · ')
      : '';
    const t1Points = transformLandmarks(t1.landmarks, IDENTITY);
    const t2Points = transformLandmarks(t2.landmarks, registration.transform);
    const annotations = buildAnnotations(
      basis, t1Points, t2Points, frame, t1.scaleFactor,
    );
    // The exported PNG dims the same orphan geometry the screen does (see
    // `renderSvg`), from the same pure helpers — an export must read the same
    // comparison the screen shows, not a second, undimmed one.
    const t1Outlines = buildOutlines(t1Points);
    const t2Outlines = buildOutlines(t2Points);
    this.setState({ isExporting: true, exportError: null });
    renderSuperimpositionSnapshot({
      filmSrc: t1.src,
      filmWidth: t1.width,
      filmHeight: t1.height,
      t1: t1.landmarks,
      t2: t2.landmarks,
      transform: registration.transform,
      frame,
      annotations,
      t1OrphanDotSymbols: orphanSymbols(t1Points, t2Points),
      t2OrphanDotSymbols: orphanSymbols(t2Points, t1Points),
      t1OrphanOutlineIds: orphanOutlineIds(t1Outlines, t2Outlines),
      t2OrphanOutlineIds: orphanOutlineIds(t2Outlines, t1Outlines),
      t1Label: shortLabel(t1, 'T1'),
      t2Label: shortLabel(t2, 'T2'),
      registrationLabel: `Registered on ${basis.name}`,
      interval: formatInterval(
        parseCaptureDate(t1.captureDate), parseCaptureDate(t2.captureDate),
      ),
      auditLabel: `${slotToken(t2, 'T2')} rotated ` +
        `${printSigned(registration.rotationDeg)}° · ` +
        formatDisplacement(registration.translationPx, t1.scaleFactor) +
        (registration.magnification !== 1
          ? ` · ${slotToken(t2, 'T2')} rescaled ` +
            `×${registration.magnification.toFixed(3)}`
          : ''),
      patientLabel: identity,
      caveat: registration.isMagnificationAssumed
        ? 'Films assumed to be at equal magnification (calibration incomplete)'
        : null,
    }).then((blob) => {
      if (blob === null) {
        this.setState({
          isExporting: false,
          exportError: 'This browser could not render the image.',
        });
        return;
      }
      saveBlobAs(blob, `${this.exportStem()}-superimposition.png`);
      this.setState({ isExporting: false });
    });
  };

  /**
   * File-name stem for the export. Only characters an actual filesystem path
   * cannot carry are sanitised away — same rule as the `.wceph` case file
   * export, via the shared `sanitizeFilenameStem` — so a Japanese name yields
   * `C-0001 山田 太郎-superimposition.png` rather than losing the name entirely.
   */
  private exportStem(): string {
    const { patient } = this.props;
    const stem = patient !== null
      ? sanitizeFilenameStem([patient.chartId, patient.name])
      : '';
    return stem !== '' ? stem : 'superimposition';
  }
}
