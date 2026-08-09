import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import { Helmet } from 'react-helmet';

import { saveAs } from 'file-saver';

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
  PLOTTING_ERROR,
  ChangeRow,
  ChangeTable,
  BarScale,
  Box,
} from 'analyses/superimposition';
import { buildOutlines, outlineToSvgPath } from 'components/TracingViewer/outlines';
// The honest account of what the registration means, condensed on screen and
// printed in full — the same affordance the treatment simulation uses.
import AboutDisclosure from 'components/AboutDisclosure';

// Number formatting, unit suffixes and the printed sheet's wording are the
// app's, not this view's: the same helpers the Summary dialog and the clinical
// report use.
import { getUnitSuffix } from 'components/AnalysisResultsViewer';
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
 * Legend/PNG label for a film in a slot. The slot name (T1 = earlier, T2 =
 * later) always leads, because that is what the change columns are named after.
 * A film whose own label already begins with that slot name ("T2
 * post-treatment") is printed as it stands — nesting it inside its own tag
 * would read as the stutter "T2 (T2 post-treatment)". Any other label is added
 * in brackets, so a film filed as "T2" but placed in the T1 slot cannot be
 * misread.
 */
const shortLabel = (t: TimepointRecord, slot: 'T1' | 'T2'): string => {
  const own = t.timepoint !== null ? t.timepoint.trim() : '';
  const token = getTimepointToken(own);
  const head = own === ''
    ? slot
    : (token === slot ? own : `${slot} (${own})`);
  const date = formatCaptureDate(t.captureDate);
  return date !== null ? `${head} · ${date}` : head;
};

/** Which of the two films lack a mm/px calibration, named as prose. */
const uncalibratedFilms = (t1: TimepointRecord, t2: TimepointRecord): string => {
  const missing: string[] = [];
  if (t1.scaleFactor === null) {
    missing.push('T1');
  }
  if (t2.scaleFactor === null) {
    missing.push('T2');
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
    '(T1 is not calibrated)';
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
  state: State = {
    t1Id: null,
    t2Id: null,
    basisId: null,
    isExporting: false,
    exportError: null,
    figurePx: null,
  };

  private figureEl: HTMLDivElement | null = null;

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
              disabled={pair === null || this.state.isExporting}
              onClick={this.handleExportPng}
            >
              <IconImage color="currentColor" style={{ width: 18, height: 18 }} />
              {this.state.isExporting ? 'Exporting…' : 'Export PNG'}
            </button>
            <button
              type="button"
              className={cx(classes.chrome_button, classes.chrome_button__primary)}
              autoFocus
              disabled={pair === null}
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
            <span className={cx(classes.picker_tag, classes.picker_tag__t1)}>T1</span>
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
            <span className={cx(classes.picker_tag, classes.picker_tag__t2)}>T2</span>
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
                : `${b.name} is unavailable: both tracings must carry ` +
                  `${basisSymbols(b).join(', ')}.`;
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
              `${b.label} needs ${basisSymbols(b).join(', ')} on both tracings`
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
   * shows T1 through T2's gaps.
   */
  private renderSvg(
    t1: TimepointRecord,
    t2: TimepointRecord,
    transform: ReturnType<typeof buildRegistration>['transform'],
    frame: Box,
    basis: RegistrationBasis,
  ) {
    const t1Points = transformLandmarks(t1.landmarks, {
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    });
    const t2Points = transformLandmarks(t2.landmarks, transform);
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
        {this.renderTracing(t1Points, dotRadius, classes.t1)}
        {this.renderTracing(t2Points, dotRadius, classes.t2)}
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

  private renderTracing(
    points: { [symbol: string]: GeoPoint },
    dotRadius: number,
    hueClass: string,
  ) {
    const outlines = buildOutlines(points);
    return (
      <g className={hueClass}>
        {outlines.map((outline) => {
          const d = outlineToSvgPath(outline);
          return (
            <g key={outline.id}>
              <path className={classes.casing} d={d} />
              <path className={classes.outline} d={d} />
            </g>
          );
        })}
        {Object.keys(points).map((symbol) => (
          <circle
            key={symbol}
            className={classes.dot}
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
            T2 rotated {rotation}° ·{' '}
            {formatDisplacement(registration.translationPx, t1.scaleFactor)}
            {registration.magnification !== 1
              ? ` · T2 rescaled ×${registration.magnification.toFixed(3)}`
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
              : `only ${t1.scaleFactor === null ? 'T2' : 'T1'} is calibrated ` +
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
            matched: where the two coincide, the registration is exact. Both
            tracings are the plotted landmarks — nothing here is predicted or
            simulated.
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
    return (
      <div className={classes.panel}>
        <div className={classes.panel_head}>
          <span className={classes.panel_title}>Change</span>
          {/* "Comparable", because a second count — the measurements only one
              tracing yields — is stated in the notes beside the figure. The
              two are the same number on this pair of films, and an unqualified
              "32 measurements" in both places read as a contradiction. */}
          <span className={classes.panel_sub}>
            T2 − T1 · {changes.rowCount}{' '}
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
                  <th className={classes.col_num}>T1</th>
                  <th className={classes.col_num}>T2</th>
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
          {printSigned(row.change)}{unit}
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
    const annotations = buildAnnotations(
      basis,
      transformLandmarks(t1.landmarks, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      transformLandmarks(t2.landmarks, registration.transform),
      frame,
      t1.scaleFactor,
    );
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
      t1Label: shortLabel(t1, 'T1'),
      t2Label: shortLabel(t2, 'T2'),
      registrationLabel: `Registered on ${basis.name}`,
      interval: formatInterval(
        parseCaptureDate(t1.captureDate), parseCaptureDate(t2.captureDate),
      ),
      auditLabel: `T2 rotated ${printSigned(registration.rotationDeg)}° · ` +
        formatDisplacement(registration.translationPx, t1.scaleFactor) +
        (registration.magnification !== 1
          ? ` · T2 rescaled ×${registration.magnification.toFixed(3)}`
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
      saveAs(blob, `${this.exportStem()}-superimposition.png`);
      this.setState({ isExporting: false });
    });
  };

  /**
   * File-name stem for the export. Characters a file system cannot carry —
   * every CJK name among them — collapse to a single separator and are then
   * trimmed away, so a Japanese name yields `C-0001-superimposition.png` rather
   * than the malformed `C-0001__-superimposition.png`.
   */
  private exportStem(): string {
    const { patient } = this.props;
    const stem = (patient !== null
      ? [patient.chartId, patient.name].filter((p) => !!p).join('_')
      : '')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[_.\-]+|[_.\-]+$/g, '');
    return stem !== '' ? stem : 'superimposition';
  }
}
