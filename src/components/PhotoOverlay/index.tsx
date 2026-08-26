import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import { Helmet } from 'react-helmet';

import IconClose from 'material-ui/svg-icons/navigation/close';
import IconReset from 'material-ui/svg-icons/av/replay';
import IconPrint from 'material-ui/svg-icons/action/print';
import IconImage from 'material-ui/svg-icons/image/photo';

import Props from './props';
import { EligibleCeph } from './selectors';

import {
  REGISTRATION_SYMBOLS,
  solvePhotoRegistration,
  buildOverlayLines,
  OverlayLine,
} from 'analyses/photoOverlay';
import {
  applyTransform,
  placedPoints,
  toSvgMatrix,
  SuperimpositionAnnotations,
  Transform,
} from 'analyses/superimposition';
import {
  buildOutlines,
  outlineToSvgPath,
  hasSoftTissueProfile,
  missingSoftTissueProfileLandmarks,
  Outline,
} from 'components/TracingViewer/outlines';
// The practice identity is the clinical report's, read back here so every
// printed sheet this app produces is signed to the same standard.
import { readLetterhead, formatClinicianLine } from 'components/ClinicalReport/letterhead';

import { formatCaptureDate, parseCaptureDate } from 'utils/records';
// A saved PDF is named after the document title, so this sheet titles itself
// from the patient and the photograph rather than from the image's file name.
import { printDocumentTitle } from 'utils/printTitle';
import { formatAgeFull, formatSexFull } from 'utils/patient';
import { renderSuperimpositionSnapshot } from 'utils/superimpositionSnapshot';
// `saveBlobAs` replaces `file-saver`'s saveAs(): see its doc comment in
// tracingSnapshot.ts for why (a webpack chunk boundary between file-saver
// and its caller silently drops the filename).
import { saveBlobAs } from 'utils/tracingSnapshot';

const classes = require('./style.scss');

/** Body class held while the view is open, so the app behind it cannot scroll. */
const BODY_OPEN_CLASS = 'photo-overlay-open';

/** What the prompt calls each registration click, in click order. */
const PLACEMENT_PROMPTS: { [symbol: string]: string } = {
  'Pn': 'Click the tip of the nose (Pn) on the photograph',
  "Pog'": 'Click the soft-tissue chin (Pog′)',
};

/** Short marker labels, with the typographic prime the analyses print. */
const MARKER_LABELS: { [symbol: string]: string } = {
  'Pn': 'Pn — nose tip',
  "Pog'": 'Pog′ — chin',
};

/** The overlay's hue, shared with the SCSS ($overlay-hue) and the PNG export. */
const OVERLAY_HUE = '#40C4FF';
/** Legend swatch for the photograph itself — a neutral, not a tracing hue. */
const PHOTO_SWATCH = '#C7D0D9';

interface LayerState {
  soft: boolean;
  eline: boolean;
  sline: boolean;
  skeletal: boolean;
}

interface State {
  layers: LayerState;
  /** Rendered size of the figure box, for the exact-aspect fit. */
  figurePx: { width: number; height: number } | null;
  /** The marker being dragged, or null. */
  dragSymbol: string | null;
  isExporting: boolean;
  exportError: string | null;
}

/**
 * Ceph tracing lines over the profile photograph.
 *
 * The clinician clicks the nose tip (Pn) and the soft-tissue chin (Pog′) on
 * the photograph; a 2-point similarity (see `analyses/photoOverlay`) then
 * carries the traced ceph's soft-tissue profile curve, E-line and S-line onto
 * the photograph. Three things this view is careful about:
 *
 *   * **Nothing is measured on the photograph.** Posture, perspective and
 *     magnification all differ between a projected radiograph and a camera
 *     photograph; the overlay is lines only, and the panel says so.
 *   * **The photograph is never dimmed.** It is the patient's face — the
 *     overlay is drawn over it at full opacity.
 *   * **The fit is checkable by eye.** The transformed ceph copies of Pn and
 *     Pog′ are drawn inside the overlay group, so their coincidence with the
 *     clicked markers is visible proof the registration solved correctly.
 *
 * The registration itself (points, ceph, facing) is part of the record — it
 * is dispatched to the store and persisted with the project.
 */
export default class PhotoOverlay extends React.PureComponent<Props, State> {
  state: State = {
    layers: { soft: true, eline: true, sline: false, skeletal: false },
    figurePx: null,
    dragSymbol: null,
    isExporting: false,
    exportError: null,
  };

  private figureEl: HTMLDivElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  /**
   * Set on the mouseup that ends a marker drag, read and cleared by the click
   * event the same gesture fires on the svg — so releasing a dragged marker
   * cannot also place the next registration point at the release position.
   */
  private suppressClick = false;

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.measureFigure);
    document.body.classList.add(BODY_OPEN_CLASS);
    this.measureFigure();
  }

  componentDidUpdate() {
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

  // ---- Derived state --------------------------------------------------------

  /** The stored registration's fields, defaulted for a photo with none yet. */
  private registrationFields() {
    const { registration } = this.props;
    return {
      points: registration !== null ? registration.points : {},
      isFlipped: registration !== null ? registration.isFlipped : false,
      cephImageId: registration !== null ? registration.cephImageId : '',
    };
  }

  /**
   * The ceph the overlay reads from: the stored choice while it is still on
   * file, else the default — the ceph of the photograph's own visit, else the
   * one whose capture date is nearest the photograph's, else the latest.
   */
  private effectiveCeph(): EligibleCeph | null {
    const { cephs } = this.props;
    if (cephs.length === 0) {
      return null;
    }
    const { cephImageId } = this.registrationFields();
    const stored = cephs.filter((c) => c.imageId === cephImageId)[0];
    if (stored !== undefined) {
      return stored;
    }
    return this.defaultCeph();
  }

  private defaultCeph(): EligibleCeph | null {
    const { cephs, timepoint, captureDate } = this.props;
    if (cephs.length === 0) {
      return null;
    }
    // Same visit first: the overlay is most honest within one timepoint.
    if (timepoint !== null && timepoint.trim() !== '') {
      const sameVisit = cephs.filter(
        (c) => c.timepoint !== null && c.timepoint.trim() === timepoint.trim(),
      )[0];
      if (sameVisit !== undefined) {
        return sameVisit;
      }
    }
    // Else nearest capture date to the photograph's.
    const photoDate = parseCaptureDate(captureDate);
    if (photoDate !== null) {
      let best: EligibleCeph | null = null;
      let bestGap = Infinity;
      cephs.forEach((c) => {
        const d = parseCaptureDate(c.captureDate);
        if (d === null) {
          return;
        }
        const gap = Math.abs(d.getTime() - photoDate.getTime());
        if (gap < bestGap) {
          bestGap = gap;
          best = c;
        }
      });
      if (best !== null) {
        return best;
      }
    }
    // Else the latest (the list is oldest-first).
    return cephs[cephs.length - 1];
  }

  /** The next registration landmark waiting to be clicked, or null. */
  private nextSymbol(): string | null {
    const { points } = this.registrationFields();
    const next = REGISTRATION_SYMBOLS.filter(
      (symbol) => points[symbol] === undefined,
    )[0];
    return next !== undefined ? next : null;
  }

  /**
   * The transform that carries raw ceph coordinates onto the photograph, or
   * null until both markers are placed (or while the geometry is degenerate).
   */
  private solve(ceph: EligibleCeph | null): Transform | null {
    if (ceph === null) {
      return null;
    }
    const { points, isFlipped } = this.registrationFields();
    const photoPn = points['Pn'];
    const photoPog = points["Pog'"];
    if (photoPn === undefined || photoPog === undefined) {
      return null;
    }
    const cephPoints = placedPoints(ceph.landmarks);
    const cephPn = cephPoints['Pn'];
    const cephPog = cephPoints["Pog'"];
    if (cephPn === undefined || cephPog === undefined) {
      return null;
    }
    // The mirror line's exact position only shifts the intermediate frame —
    // the fit re-anchors on the clicked Pn — so an unknown film width falls
    // back to 0 without changing the mapping.
    return solvePhotoRegistration(
      cephPn, cephPog, photoPn, photoPog, isFlipped,
      ceph.width !== null ? ceph.width : 0,
    );
  }

  private setFigureEl = (el: HTMLDivElement | null) => {
    this.figureEl = el;
  };

  private setSvgEl = (el: SVGSVGElement | null) => {
    this.svgEl = el;
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

  // ---- Interaction ----------------------------------------------------------

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.props.onRequestClose();
    }
  };

  /** Client coordinates → the photograph's own pixel grid. */
  private toPhotoCoords(
    e: { clientX: number; clientY: number },
  ): { x: number; y: number } | null {
    const svg = this.svgEl;
    const { width, height } = this.props;
    if (svg === null || width === null || height === null) {
      return null;
    }
    // The svg is sized to the photograph's exact aspect (see `renderFigure`),
    // so one uniform scale relates its box to the natural pixel grid.
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return {
      x: (e.clientX - rect.left) * (width / rect.width),
      y: (e.clientY - rect.top) * (height / rect.height),
    };
  }

  private dispatchPoint(symbol: string, x: number, y: number) {
    const ceph = this.effectiveCeph();
    this.props.onSetRegistration({
      imageId: this.props.imageId,
      // The ceph in use is pinned with the click, so the stored record names
      // the film the registration was made against even if the default picked
      // it silently.
      cephImageId: ceph !== null ? ceph.imageId : undefined,
      point: { symbol, x, y },
    });
  }

  private handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const symbol = this.nextSymbol();
    if (symbol === null) {
      return;
    }
    const p = this.toPhotoCoords(e);
    if (p === null) {
      return;
    }
    this.dispatchPoint(symbol, p.x, p.y);
  };

  private handleMarkerDown = (symbol: string) =>
    (e: React.MouseEvent<SVGElement>) => {
      e.stopPropagation();
      e.preventDefault();
      this.setState({ dragSymbol: symbol });
    };

  private handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const { dragSymbol } = this.state;
    if (dragSymbol === null) {
      return;
    }
    const p = this.toPhotoCoords(e);
    if (p === null) {
      return;
    }
    this.dispatchPoint(dragSymbol, p.x, p.y);
  };

  private endDrag = () => {
    if (this.state.dragSymbol !== null) {
      this.suppressClick = true;
      this.setState({ dragSymbol: null });
    }
  };

  /**
   * A fresh press inside the svg starts a fresh gesture, so no stale
   * suppression may outlive it. `endDrag` also runs on mouseleave, and a drag
   * released *outside* the svg produces no click to consume the flag — without
   * this reset, the next legitimate placement click was silently swallowed.
   * (A marker's own mousedown stops propagation, so a drag that ends inside
   * the svg still gets its click suppressed as before.)
   */
  private handleSvgMouseDown = () => {
    this.suppressClick = false;
  };

  private handleChooseCeph = (cephImageId: string) => () => {
    this.props.onSetRegistration({ imageId: this.props.imageId, cephImageId });
  };

  private handleFacing = (isFlipped: boolean) => () => {
    const ceph = this.effectiveCeph();
    this.props.onSetRegistration({
      imageId: this.props.imageId,
      cephImageId: ceph !== null ? ceph.imageId : undefined,
      isFlipped,
    });
  };

  private handleStartOver = () => {
    this.props.onRemoveRegistration(this.props.imageId);
  };

  private toggleLayer = (layer: keyof LayerState) => () => {
    this.setState(({ layers }) => ({
      layers: { ...layers, [layer]: !layers[layer] } as LayerState,
    }));
  };

  // ---- View -----------------------------------------------------------------

  private renderView() {
    const ceph = this.effectiveCeph();
    const transform = this.solve(ceph);
    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Ceph overlay on the profile photograph"
      >
        {/* A saved PDF is named after `document.title`, which the app sets from
            the workspace — the image's file name. Held only while this view is
            mounted; react-helmet restores the app's title on close. */}
        <Helmet
          title={printDocumentTitle(
            this.props.patient,
            'Ceph photo overlay',
            [this.photoLabel()],
          )}
        />
        {this.renderPrintHead(ceph)}

        <div className={classes.chrome}>
          <span className={classes.chrome_title}>
            <span className={classes.chrome_title_text}>Ceph overlay</span>
            <span className={classes.chrome_hint}>
              Tracing lines over the photograph — approximate; nothing is
              measured here
            </span>
          </span>
          <div className={classes.chrome_actions}>
            <span className={classes.chrome_identity}>{this.identityLine()}</span>
            {this.state.exportError !== null ? (
              <span className={classes.chrome_error} role="alert">
                {this.state.exportError}
              </span>
            ) : null}
            <button
              type="button"
              className={classes.chrome_button}
              disabled={transform === null || this.state.isExporting}
              title={transform !== null
                ? 'Save the overlay as a PNG, stamped with its caveats'
                : 'Place both registration points first'}
              onClick={this.handleExportPng}
            >
              <IconImage color="currentColor" style={{ width: 18, height: 18 }} />
              {this.state.isExporting ? 'Exporting…' : 'Export PNG'}
            </button>
            <button
              type="button"
              className={classes.chrome_button}
              disabled={transform === null}
              title={transform !== null
                ? 'Print the overlay, or save it as a PDF for the chart'
                : 'Place both registration points first'}
              onClick={this.handlePrint}
            >
              <IconPrint color="currentColor" style={{ width: 18, height: 18 }} />
              Print / Save as PDF
            </button>
            <button
              type="button"
              className={cx(classes.chrome_button, classes.chrome_button__primary)}
              autoFocus
              title="Close the overlay — the registration stays with the record"
              onClick={this.props.onRequestClose}
            >
              <IconClose color="currentColor" style={{ width: 18, height: 18 }} />
              Close
            </button>
          </div>
        </div>
        <div className={classes.body}>
          <div className={classes.figure_column}>
            <div className={classes.figure} ref={this.setFigureEl}>
              {this.renderFigure(ceph, transform)}
            </div>
          </div>
          {this.renderPanel(ceph, transform)}
        </div>

        {this.renderPrintCaveats(ceph)}
        {this.renderPrintTail()}
      </div>
    );
  }

  /** "山田 太郎 · C-0001 · T2 · 2026/01/12", as the other launched views. */
  private identityLine(): string {
    const { patient, timepoint, captureDate } = this.props;
    const parts: string[] = [];
    parts.push(patient !== null && patient.name ? patient.name : '—');
    if (patient !== null && patient.chartId) {
      parts.push(patient.chartId);
    }
    if (timepoint !== null && timepoint.trim() !== '') {
      parts.push(timepoint.trim());
    }
    const date = formatCaptureDate(captureDate);
    if (date !== null) {
      parts.push(date);
    }
    return parts.join(' · ');
  }

  /** "T1 · 2026/01/12" for the photograph, when the record carries either. */
  private photoLabel(): string | null {
    const { timepoint, captureDate } = this.props;
    const parts: string[] = [];
    if (timepoint !== null && timepoint.trim() !== '') {
      parts.push(timepoint.trim());
    }
    const date = formatCaptureDate(captureDate);
    if (date !== null) {
      parts.push(date);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  /** The ceph named the way its picker row names it, for legend and band. */
  private cephLabel(ceph: EligibleCeph): string {
    const label = [
      ceph.timepoint !== null && ceph.timepoint.trim() !== ''
        ? ceph.timepoint.trim() : null,
      formatCaptureDate(ceph.captureDate),
      ceph.name,
    ].filter((part) => part !== null).join(' · ');
    return label !== '' ? label : 'Lateral cephalogram';
  }

  /** The stated facing, and what it did to the tracing. */
  private facingLabel(): string {
    return this.registrationFields().isFlipped
      ? 'Photograph faces left — the tracing is mirrored to match'
      : 'Photograph faces right, like the ceph tracing';
  }

  /** The enabled layers, named as their toggles name them. */
  private enabledLayerNames(): string[] {
    const { layers } = this.state;
    const names: string[] = [];
    if (layers.soft) {
      names.push('soft-tissue profile');
    }
    if (layers.eline) {
      names.push('E-line');
    }
    if (layers.sline) {
      names.push('S-line');
    }
    if (layers.skeletal) {
      names.push('skeletal outlines');
    }
    return names;
  }

  // ---- The honest caveats ---------------------------------------------------
  //
  // The same sentences the panel states, as plain strings — stamped verbatim
  // onto the exported PNG's legend and printed in full on the sheet, because a
  // detached image is read without the app (and its panel) around it.

  /** The "About this overlay" statement, split into its two sentences. */
  private aboutSentences(): string[] {
    return [
      'The fit is approximate: posture, perspective and magnification ' +
      'differ between a projected radiograph and a photograph, and a ' +
      'two-point registration cannot correct for any of them.',
      'Nothing is measured on the photograph — the lines are a visual aid ' +
      'for discussing the profile, not a measurement surface.',
    ];
  }

  /** The cross-visit caution's text, or null when the visits match. */
  private timepointCautionText(ceph: EligibleCeph | null): string | null {
    const { timepoint } = this.props;
    if (ceph === null) {
      return null;
    }
    const photoT = timepoint !== null ? timepoint.trim() : '';
    const cephT = ceph.timepoint !== null ? ceph.timepoint.trim() : '';
    if (photoT === cephT) {
      return null;
    }
    const name = (t: string) => t !== '' ? t : 'no timepoint';
    return `Photograph ${name(photoT)} · ceph ${name(cephT)} — the overlay ` +
      'compares different visits.';
  }

  /** The inferred-silhouette caution's text, or null when it does not apply. */
  private silhouetteCautionText(ceph: EligibleCeph | null): string | null {
    if (ceph === null || !this.state.layers.soft) {
      return null;
    }
    if (hasSoftTissueProfile(ceph.landmarks)) {
      return null;
    }
    const missing = missingSoftTissueProfileLandmarks(ceph.landmarks);
    return 'The soft-tissue curve is an inferred silhouette: this tracing ' +
      `is missing ${missing.join(', ')}, so the curve is synthesised from ` +
      'the skeletal profile rather than drawn through plotted soft-tissue ' +
      'points.';
  }

  /** Every caveat that applies right now, in the order the panel states them. */
  private caveatSentences(ceph: EligibleCeph | null): string[] {
    const sentences = this.aboutSentences();
    const timepointCaution = this.timepointCautionText(ceph);
    if (timepointCaution !== null) {
      sentences.push(timepointCaution);
    }
    const silhouetteCaution = this.silhouetteCautionText(ceph);
    if (silhouetteCaution !== null) {
      sentences.push(silhouetteCaution);
    }
    return sentences;
  }

  // ---- Print-only letterhead, caveats and certification ---------------------

  /**
   * Print-only letterhead and patient band, to the same standard as the
   * clinical report, the superimposition and the treatment simulation: a
   * detached sheet must carry the practice it came from, the patient it is
   * about, the day it was produced — and, here, exactly which photograph and
   * which tracing were laid over each other, and how.
   */
  private renderPrintHead(ceph: EligibleCeph | null) {
    const { patient, captureDate } = this.props;
    const letterhead = readLetterhead();
    const clinicianLine = formatClinicianLine(letterhead);
    const printedOn = new Date().toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const dateOfBirth = patient !== null && patient.dateOfBirth !== undefined &&
      patient.dateOfBirth !== ''
      ? patient.dateOfBirth
      : null;
    // Age is stated at the photograph the overlay is drawn on, not at the
    // print date.
    const photoDate = parseCaptureDate(captureDate);
    const ageAtPhoto = patient !== null && photoDate !== null
      ? formatAgeFull(patient.dateOfBirth, photoDate)
      : null;
    const age = ageAtPhoto !== null
      ? ageAtPhoto
      : (patient !== null ? formatAgeFull(patient.dateOfBirth) : null);
    const layerNames = this.enabledLayerNames();

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
                : 'Cephalometric photo overlay'}
            </span>
            {clinicianLine !== '' ? (
              <span className={classes.print_clinic_line}>{clinicianLine}</span>
            ) : null}
          </div>
          <div className={classes.print_masthead_right}>
            <span className={classes.print_kicker}>Photo overlay</span>
            <span className={classes.print_date}>{printedOn}</span>
          </div>
        </header>
        <h1 className={classes.print_title}>
          Ceph Overlay on the Profile Photograph
        </h1>
        <div className={classes.print_band}>
          <div className={classes.band_row}>
            {cell('Patient', patient !== null && patient.name ? patient.name : null)}
            {cell('Chart ID', patient !== null && patient.chartId ? patient.chartId : null)}
            {cell('Sex', patient !== null ? formatSexFull(patient.sex) : null)}
          </div>
          <div className={classes.band_row}>
            {cell('Date of birth', dateOfBirth)}
            {cell(
              ageAtPhoto !== null ? 'Age at photograph' : 'Age at printing', age,
            )}
            {cell('Photograph', this.photoLabel())}
          </div>
          <div className={classes.band_row}>
            {cell('Ceph tracing', ceph !== null ? this.cephLabel(ceph) : null)}
            {cell('Facing', this.facingLabel())}
            {cell(
              'Layers drawn',
              layerNames.length > 0 ? layerNames.join(', ') : 'none',
            )}
          </div>
        </div>
        <p className={classes.print_banner}>
          This sheet is an <strong>approximate visual overlay</strong>, not a
          measurement. The tracing lines were carried onto the photograph by a
          two-point fit on Pn (nose tip) and Pog′ (soft-tissue chin) clicked by
          the clinician; nothing on this sheet was measured on the photograph.
        </p>
      </div>
    );
  }

  /**
   * Print-only caveats, in full — the on-screen panel (with the interactive
   * pickers the caveats live between) is not printed, and a sheet without them
   * would claim more than the view does.
   */
  private renderPrintCaveats(ceph: EligibleCeph | null) {
    return (
      <div className={classes.print_caveats} aria-hidden="true">
        <h2 className={classes.caveats_title}>About this overlay</h2>
        {this.caveatSentences(ceph).map((sentence, index) => (
          <p key={index} className={classes.caveat_line}>{sentence}</p>
        ))}
        <p className={classes.caveat_line}>
          The amber crosshairs are the clinician’s two clicked registration
          points; the cyan dots are the tracing’s own Pn and Pog′ carried by
          the fit — their coincidence is the visible check of the registration.
          No scale bar is drawn: a photograph has no calibration.
        </p>
      </div>
    );
  }

  /** Print-only certification block, matching the other printed sheets. */
  private renderPrintTail() {
    const letterhead = readLetterhead();
    return (
      <div className={classes.print_tail} aria-hidden="true">
        <div className={classes.sig_label}>Certification</div>
        <div className={classes.sig_row}>
          <div className={cx(classes.sig_field, classes.sig_field__wide)}>
            <div className={classes.sig_line}>{letterhead.clinician}</div>
            <span className={classes.sig_caption}>
              Reviewed by — name &amp; signature
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
          Produced with WebCeph. The lines on this sheet come from the
          patient’s own traced cephalogram, carried onto the photograph by a
          two-point registration clicked by the clinician. Nothing was measured
          on the photograph, and nothing here changed the tracing or the
          photograph.
        </p>
      </div>
    );
  }

  // ---- The figure -----------------------------------------------------------

  private renderFigure(ceph: EligibleCeph | null, transform: Transform | null) {
    const { src, width, height } = this.props;
    const { figurePx } = this.state;
    if (src === null || width === null || height === null ||
        width <= 0 || height <= 0) {
      return (
        <div className={classes.empty}>
          <span className={classes.empty_title}>
            The photograph could not be drawn
          </span>
          <span className={classes.empty_hint}>
            Its pixel data is not loaded — reopen it from the records dashboard.
          </span>
        </div>
      );
    }
    // Size the svg to the photograph's exact aspect inside the measured box,
    // so client → photo-pixel conversion is a single uniform scale (the same
    // fit-scale approach the treatment simulation's figure takes).
    const fit = figurePx !== null && figurePx.width > 8 && figurePx.height > 8
      ? Math.min(figurePx.width / width, figurePx.height / height)
      : 0.5;
    const boxWidth = Math.max(1, width * fit);
    const boxHeight = Math.max(1, height * fit);
    const nextSymbol = this.nextSymbol();

    return (
      <svg
        ref={this.setSvgEl}
        className={cx(classes.svg, {
          [classes.svg__placing]: nextSymbol !== null,
          [classes.svg__dragging]: this.state.dragSymbol !== null,
        })}
        style={{ width: boxWidth, height: boxHeight }}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={transform !== null
          ? 'The profile photograph with the ceph tracing lines overlaid'
          : 'The profile photograph, waiting for the registration clicks'}
        onClick={this.handleSvgClick}
        onMouseDown={this.handleSvgMouseDown}
        onMouseMove={this.handleSvgMouseMove}
        onMouseUp={this.endDrag}
        onMouseLeave={this.endDrag}
      >
        {/* The photograph, at full opacity — it is never dimmed. */}
        <image
          xlinkHref={src}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="none"
        />
        {ceph !== null && transform !== null
          ? this.renderOverlay(ceph, transform)
          : null}
        {this.renderMarkers()}
      </svg>
    );
  }

  /**
   * Everything carried over from the ceph, inside one transformed group: the
   * enabled outline curves, the reference lines, and the ceph's own copies of
   * Pn / Pog′ — whose coincidence with the clicked markers is the visible
   * proof of the fit.
   */
  private renderOverlay(ceph: EligibleCeph, transform: Transform) {
    const { layers } = this.state;
    const { width } = this.props;
    const cephPoints = placedPoints(ceph.landmarks);
    const outlines = buildOutlines(cephPoints).filter(({ id }) => (
      id === 'soft-tissue' ? layers.soft : layers.skeletal
    ));
    const lines = buildOverlayLines(ceph.landmarks).filter(({ id }) => (
      id === 'e-line' ? layers.eline : layers.sline
    ));
    // Dot radius in ceph units, chosen so it renders at the size of the
    // clicked markers' inner dot in *photo* units: divide the photo-space
    // radius by the transform's uniform scale.
    const scale = Math.sqrt(Math.abs(
      transform.a * transform.d - transform.b * transform.c,
    ));
    const photoUnit = (width !== null ? width : 1000) / 160;
    const dotR = scale > 1e-9 ? (photoUnit * 0.55) / scale : photoUnit * 0.55;
    return (
      <g className={classes.overlay} transform={toSvgMatrix(transform)}>
        {outlines.map((outline) => {
          const d = outlineToSvgPath(outline);
          return (
            <g key={outline.id}>
              <path className={classes.overlay_casing} d={d} />
              <path
                className={cx(classes.overlay_outline, {
                  [classes.overlay_outline__skeletal]: outline.id !== 'soft-tissue',
                })}
                d={d}
              />
            </g>
          );
        })}
        {lines.map((line) => this.renderLine(line))}
        {REGISTRATION_SYMBOLS.map((symbol) => {
          const p = cephPoints[symbol];
          return p !== undefined ? (
            <circle
              key={symbol}
              className={classes.overlay_dot}
              data-symbol={symbol}
              cx={p.x}
              cy={p.y}
              r={dotR}
            />
          ) : null;
        })}
      </g>
    );
  }

  private renderLine(line: OverlayLine) {
    // The label sits just past the line's lower end, in ceph coordinates —
    // it rides the same group transform as the line itself.
    return (
      <g key={line.id} className={classes.refline}>
        <line
          className={classes.refline_casing}
          x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
        />
        <line
          className={cx(classes.refline_stroke, {
            [classes.refline_stroke__sline]: line.id === 's-line',
          })}
          x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
        />
        <text
          className={classes.refline_label}
          x={line.x2}
          y={line.y2}
          dx={6}
          dy={4}
        >
          {line.label}
        </text>
      </g>
    );
  }

  /** The clinician's own clicked markers, in photo coordinates — draggable. */
  private renderMarkers() {
    const { width } = this.props;
    const { points } = this.registrationFields();
    const u = (width !== null ? width : 1000) / 160;
    return (
      <g className={classes.markers}>
        {REGISTRATION_SYMBOLS.map((symbol) => {
          const p = points[symbol];
          if (p === undefined) {
            return null;
          }
          return (
            <g
              key={symbol}
              className={cx(classes.marker, {
                [classes.marker__dragging]: this.state.dragSymbol === symbol,
              })}
              data-marker={symbol}
              onMouseDown={this.handleMarkerDown(symbol)}
            >
              {/* A generous invisible grab area, then the crosshair. */}
              <circle className={classes.marker_grab} cx={p.x} cy={p.y} r={u * 2.2} />
              <line x1={p.x - u * 1.6} y1={p.y} x2={p.x - u * 0.5} y2={p.y} />
              <line x1={p.x + u * 0.5} y1={p.y} x2={p.x + u * 1.6} y2={p.y} />
              <line x1={p.x} y1={p.y - u * 1.6} x2={p.x} y2={p.y - u * 0.5} />
              <line x1={p.x} y1={p.y + u * 0.5} x2={p.x} y2={p.y + u * 1.6} />
              <circle className={classes.marker_ring} cx={p.x} cy={p.y} r={u * 0.5} />
              <text className={classes.marker_label} x={p.x + u * 1.9} y={p.y - u * 0.7}>
                {symbol === 'Pn' ? 'Pn' : 'Pog′'}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  // ---- The panel ------------------------------------------------------------

  private renderPanel(ceph: EligibleCeph | null, transform: Transform | null) {
    const { cephs } = this.props;
    const { points, isFlipped } = this.registrationFields();
    const nextSymbol = this.nextSymbol();
    const placedCount = REGISTRATION_SYMBOLS.filter(
      (s) => points[s] !== undefined,
    ).length;
    return (
      <div className={classes.panel}>
        <div className={classes.panel_scroll}>
          {/* 1. Which tracing the lines come from. */}
          <section className={classes.section}>
            <h2 className={classes.section_title}>Tracing</h2>
            {cephs.length === 0 ? (
              <p className={classes.caution}>
                No traced lateral ceph of this patient carries Pn and Pog′ —
                plot them from the Soft Tissues analysis, then reopen this view.
              </p>
            ) : (
              <div className={classes.ceph_list}>
                {cephs.map((candidate) => {
                  const isSelected = ceph !== null &&
                    ceph.imageId === candidate.imageId;
                  const label = [
                    candidate.timepoint !== null &&
                      candidate.timepoint.trim() !== ''
                      ? candidate.timepoint.trim() : null,
                    formatCaptureDate(candidate.captureDate),
                    candidate.name,
                  ].filter((part) => part !== null).join(' · ');
                  return (
                    <button
                      key={candidate.imageId}
                      type="button"
                      className={cx(classes.ceph_option, {
                        [classes.ceph_option__selected]: isSelected,
                      })}
                      aria-pressed={isSelected}
                      onClick={this.handleChooseCeph(candidate.imageId)}
                    >
                      {label !== '' ? label : 'Lateral cephalogram'}
                    </button>
                  );
                })}
              </div>
            )}
            {this.renderTimepointCaution(ceph)}
          </section>

          {/* 2. Which way the photograph faces. */}
          <section className={classes.section}>
            <h2 className={classes.section_title}>Photograph faces</h2>
            <div className={classes.facing} role="group" aria-label="Photograph faces">
              <button
                type="button"
                className={cx(classes.facing_option, {
                  [classes.facing_option__selected]: !isFlipped,
                })}
                aria-pressed={!isFlipped}
                title="The profile faces right, like the ceph tracing"
                onClick={this.handleFacing(false)}
              >
                Faces right
              </button>
              <button
                type="button"
                className={cx(classes.facing_option, {
                  [classes.facing_option__selected]: isFlipped,
                })}
                aria-pressed={isFlipped}
                title="The profile faces left — the tracing is mirrored to match"
                onClick={this.handleFacing(true)}
              >
                Faces left
              </button>
            </div>
            <p className={classes.section_note}>
              A two-point fit cannot tell the facing on its own, so it is
              stated here; the tracing is mirrored when the photograph faces
              left.
            </p>
          </section>

          {/* 3. The two registration clicks. */}
          <section className={classes.section}>
            <h2 className={classes.section_title}>
              Registration · {placedCount} of {REGISTRATION_SYMBOLS.length}
            </h2>
            <p
              className={cx(classes.prompt, {
                [classes.prompt__done]: nextSymbol === null,
              })}
              role="status"
            >
              {nextSymbol !== null
                ? PLACEMENT_PROMPTS[nextSymbol]
                : 'Both points placed — drag a marker to refine the fit.'}
            </p>
            <ul className={classes.point_list}>
              {REGISTRATION_SYMBOLS.map((symbol) => (
                <li key={symbol} className={classes.point_row}>
                  <span
                    className={cx(classes.point_state, {
                      [classes.point_state__placed]: points[symbol] !== undefined,
                    })}
                    aria-hidden="true"
                  />
                  <span className={classes.point_name}>
                    {MARKER_LABELS[symbol]}
                  </span>
                  <span className={classes.point_value}>
                    {points[symbol] !== undefined
                      ? `${Math.round(points[symbol].x)}, ${Math.round(points[symbol].y)}`
                      : 'not placed'}
                  </span>
                </li>
              ))}
            </ul>
            {placedCount > 0 ? (
              <button
                type="button"
                className={classes.reset}
                title="Forget the clicked points, the ceph choice and the facing for this photograph"
                onClick={this.handleStartOver}
              >
                <IconReset color="currentColor" style={{ width: 15, height: 15 }} />
                Start over
              </button>
            ) : null}
          </section>

          {/* 4. What is drawn. */}
          <section className={classes.section}>
            <h2 className={classes.section_title}>Layers</h2>
            {this.renderLayerToggle('soft', 'Soft-tissue profile')}
            {this.renderLayerToggle('eline', 'E-line (Ricketts)')}
            {this.renderLayerToggle('sline', 'S-line (Steiner)')}
            {this.renderLayerToggle('skeletal', 'Skeletal outlines')}
            {transform === null && placedCount === REGISTRATION_SYMBOLS.length ? (
              <p className={classes.caution}>
                The two clicks coincide — drag them apart to solve the fit.
              </p>
            ) : null}
          </section>

          {/* 5. What this view is, and is not. */}
          <section className={classes.section}>
            <h2 className={classes.section_title}>About this overlay</h2>
            <p className={classes.about}>
              The fit is <strong>approximate</strong>: posture, perspective and
              magnification differ between a projected radiograph and a
              photograph, and a two-point registration cannot correct for any
              of them. Nothing is measured on the photograph — the lines are a
              visual aid for discussing the profile, not a measurement surface.
            </p>
            {this.renderSilhouetteCaution(ceph)}
          </section>
        </div>
      </div>
    );
  }

  private renderLayerToggle(layer: keyof LayerState, label: string) {
    const isOn = this.state.layers[layer];
    return (
      <label className={classes.layer}>
        <input
          type="checkbox"
          checked={isOn}
          onChange={this.toggleLayer(layer)}
        />
        <span>{label}</span>
      </label>
    );
  }

  /** "Photograph T2 · ceph T1 — the overlay compares different visits." */
  private renderTimepointCaution(ceph: EligibleCeph | null) {
    const text = this.timepointCautionText(ceph);
    if (text === null) {
      return null;
    }
    return <p className={classes.caution}>{text}</p>;
  }

  /** The soft-tissue curve is inferred where the tracing lacks the full set. */
  private renderSilhouetteCaution(ceph: EligibleCeph | null) {
    if (ceph === null || this.silhouetteCautionText(ceph) === null) {
      return null;
    }
    const missing = missingSoftTissueProfileLandmarks(ceph.landmarks);
    return (
      <p className={classes.caution}>
        The soft-tissue curve is an <strong>inferred silhouette</strong>: this
        tracing is missing {missing.join(', ')}, so the curve is synthesised
        from the skeletal profile rather than drawn through plotted soft-tissue
        points.
      </p>
    );
  }

  // ---- Export & print -------------------------------------------------------

  private handlePrint = () => {
    window.print();
  };

  /**
   * PNG of the overlay, rendered by the shared canvas back-end (the very one
   * the superimposition and the treatment simulation export through) from the
   * same geometry the screen draws: the enabled outline curves and reference
   * lines, built in ceph coordinates by the same modules and carried by the
   * same two-point transform, over the photograph at **full opacity** — the
   * film here is the patient's face, and this view never dims it.
   *
   * A detached image is read without the panel around it, so every caveat the
   * panel states is stamped verbatim onto the legend — and no scale bar is
   * drawn: a photograph has no calibration.
   */
  private handleExportPng = () => {
    const { src, width, height } = this.props;
    const ceph = this.effectiveCeph();
    const transform = this.solve(ceph);
    if (ceph === null || transform === null ||
        src === null || width === null || height === null) {
      this.setState({ exportError: 'Place both registration points first.' });
      return;
    }
    const { layers } = this.state;
    const cephPoints = placedPoints(ceph.landmarks);
    // Exactly the screen's filters (see `renderOverlay`): the enabled outline
    // curves, and the enabled reference lines.
    const outlines = buildOutlines(cephPoints).filter(({ id }) => (
      id === 'soft-tissue' ? layers.soft : layers.skeletal
    ));
    const lines = buildOverlayLines(ceph.landmarks).filter(({ id }) => (
      id === 'e-line' ? layers.eline : layers.sline
    ));
    const toPhoto = (x: number, y: number) => applyTransform(transform, { x, y });
    // The curves are transformed point-by-point rather than rebuilt from the
    // transformed landmarks, so the export cannot disagree with the screen —
    // which draws these very curves under an SVG group transform.
    const t2Outlines: Outline[] = outlines.map((outline) => ({
      ...outline,
      points: outline.points.map(([x, y]): [number, number] => {
        const p = toPhoto(x, y);
        return [p.x, p.y];
      }),
    }));
    lines.forEach((line) => {
      const p1 = toPhoto(line.x1, line.y1);
      const p2 = toPhoto(line.x2, line.y2);
      t2Outlines.push({
        id: line.id,
        points: [[p1.x, p1.y], [p2.x, p2.y]],
        closed: false,
      });
    });
    const annotations: SuperimpositionAnnotations = {
      // No registration marker and — deliberately — no scale bar: a photograph
      // carries no calibration, so a millimetre bar on it would be fabricated.
      originSymbol: '',
      origin: null,
      t1Basis: null,
      t2Basis: null,
      labels: lines.map((line) => ({
        symbol: line.label,
        point: toPhoto(line.x2, line.y2),
      })),
      scaleBar: null,
    };
    const layerNames = this.enabledLayerNames();
    this.setState({ isExporting: true, exportError: null });
    renderSuperimpositionSnapshot({
      filmSrc: src,
      filmWidth: width,
      filmHeight: height,
      // The photograph is the patient's face: full opacity, never dimmed.
      filmOpacity: 1,
      t1: {},
      t2: ceph.landmarks,
      transform,
      frame: { x: 0, y: 0, width, height },
      annotations,
      t1Color: PHOTO_SWATCH,
      t2Color: OVERLAY_HUE,
      t2Outlines,
      // The tracing's own Pn and Pog′, carried by the fit — the screen's
      // visible proof of the registration.
      t2DotSymbols: REGISTRATION_SYMBOLS,
      // The screen draws the carried tracing solid; so does the export.
      t2IsDashed: false,
      t1Label: 'Photograph — full opacity, never dimmed',
      t2Label: `Ceph tracing — ${this.cephLabel(ceph)}`,
      registrationLabel:
        'Two-point registration: Pn (nose tip) and Pog′ (chin) clicked on ' +
        'the photograph',
      interval: null,
      auditLabel: `${this.facingLabel()} · Drawn: ${
        layerNames.length > 0 ? layerNames.join(', ') : 'no layers enabled'}`,
      patientLabel: this.identityLine(),
      caveat: null,
      notes: this.caveatSentences(ceph),
    }).then((blob) => {
      if (blob === null) {
        this.setState({
          isExporting: false,
          exportError: 'This browser could not render the image.',
        });
        return;
      }
      saveBlobAs(blob, `${this.exportStem()}-photo-overlay.png`);
      this.setState({ isExporting: false });
    });
  };

  /**
   * File-name stem for the export. Characters a file system cannot carry —
   * every CJK name among them — collapse to a single separator and are then
   * trimmed away, so a Japanese name yields `C-0001-photo-overlay.png` rather
   * than the malformed `C-0001__-photo-overlay.png`.
   */
  private exportStem(): string {
    const { patient } = this.props;
    const stem = (patient !== null
      ? [patient.chartId, patient.name].filter((p) => !!p).join('_')
      : '')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[_.\-]+|[_.\-]+$/g, '');
    return stem !== '' ? stem : 'ceph-photo-overlay';
  }
}
