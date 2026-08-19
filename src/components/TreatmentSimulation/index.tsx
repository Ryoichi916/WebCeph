import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import { Helmet } from 'react-helmet';

import { saveAs } from 'file-saver';

import IconClose from 'material-ui/svg-icons/navigation/close';
import IconReset from 'material-ui/svg-icons/av/replay';
import IconPrint from 'material-ui/svg-icons/action/print';
import IconImage from 'material-ui/svg-icons/image/photo';

import Props from './props';

// Geometry: the movements, the value comparison and the framing all come from
// pure shared modules — the outline curves from the very module the editor draws
// with, and every number from the change table that runs `analyses/evaluate`.
import {
  applySimulation,
  buildSimulationTable,
  describeControls,
  describeMovement,
  describePlan,
  activeSoftTissueRatios,
  formatAmount,
  maxSimulatedTravelPx,
  planReferences,
  simulatedOutlines,
  valueForControl,
  withControlValue,
  EMPTY_PLAN,
  isPlanEmpty,
  planKey,
  ControlAvailability,
  ControlId,
  SimulationPlan,
  SimulationRow,
  SimulationTable,
  Simulation,
} from 'analyses/simulation';
import {
  superimpositionFrame,
  chooseScaleBar,
  placedPoints,
  IDENTITY,
  Box,
  ScaleBar,
  SuperimpositionAnnotations,
} from 'analyses/superimposition';
import {
  buildOutlines,
  outlineToSvgPath,
  hasSoftTissueProfile,
  missingSoftTissueProfileLandmarks,
  Outline,
} from 'components/TracingViewer/outlines';
// Honest caveats, condensed on screen and printed in full — the same affordance
// the superimposition legend uses.
import AboutDisclosure from 'components/AboutDisclosure';

// Number formatting and unit suffixes are the app's, not this view's.
import { getUnitSuffix, roundToDisplay } from 'components/AnalysisResultsViewer';
import { printNumber, printSigned, printNorm } from 'components/ClinicalReport/copy';
import { formatScale } from 'components/TracingToolbar/CalibrationDialog';
// The practice identity is the clinical report's, read back here so every
// printed sheet this app produces is signed to the same standard.
import { readLetterhead, formatClinicianLine } from 'components/ClinicalReport/letterhead';

import { formatCaptureDate, parseCaptureDate } from 'utils/records';
// A saved PDF is named after the document title, so this sheet titles itself
// from the patient and the film rather than from the image's file name.
import { printDocumentTitle } from 'utils/printTitle';
import { formatAgeFull, formatSexFull } from 'utils/patient';
import { renderSuperimpositionSnapshot } from 'utils/superimpositionSnapshot';

const classes = require('./style.scss');

/** Body class held while the view is open, so the app behind it cannot scroll. */
const BODY_OPEN_CLASS = 'treatment-simulation-open';

/**
 * Height the print stylesheet gives the figure, in CSS pixels (see `.figure` in
 * the print block of style.scss). Figure type is sized in viewBox units, so the
 * printed sheet needs its own units-per-pixel.
 */
const PRINT_FIGURE_HEIGHT_MM = 104;
const PRINT_FIGURE_HEIGHT_PX = (PRINT_FIGURE_HEIGHT_MM / 25.4) * 96;

/** Rendered size of figure annotations, in CSS pixels, on screen and on paper. */
const ANNOTATION_PX = 12.5;
const ANNOTATION_PX_PRINT = 9.5;

/** Hues of the two layers, shared with the SCSS and the PNG export. */
const CURRENT_HUE = '#40C4FF';
const SIM_HUE = '#C08BFF';

/** "1 landmark moved" / "3 landmarks moved" — singular only at exactly one. */
const movedCountLabel = (count: number): string =>
  `${count} ${count === 1 ? 'landmark' : 'landmarks'} moved`;

interface State {
  plan: SimulationPlan;
  isExporting: boolean;
  exportError: string | null;
  /**
   * Rendered size of the figure box. The SVG scales its viewBox to this box, so
   * it is the only way to give annotation type a real pixel size instead of one
   * that shrinks with the crop.
   */
  figurePx: { width: number; height: number } | null;
}

/**
 * Treatment simulation (VTO-lite).
 *
 * The tracing as plotted is drawn in cyan as the reference, and a second,
 * simulated tracing in violet over it. A few clinically meaningful movements —
 * mandibular advancement/setback, maxillary advancement and impaction, incisor
 * tipping about the root apex — are applied as rigid displacements of the
 * landmark groups they belong to, and the analysis is recomputed live from the
 * moved landmarks.
 *
 * Three things this view is careful about:
 *
 *   * **It is a geometric simulation, not a prediction.** It says what the
 *     numbers would be if the anatomy moved by the amounts entered. It does not
 *     forecast growth, surgical outcome, relapse or remodelling, and it says so
 *     on screen rather than in a manual.
 *   * **The camera never moves.** The frame is computed once from the plotted
 *     tracing and padded for the largest plan the controls can express, so
 *     dragging a slider moves the violet layer and nothing else. A before/after
 *     comparison read off a rescaling frame is not a comparison.
 *   * **It is view-local.** Every movement lives in this component's state.
 *     Nothing is dispatched, so the real tracing, the undo history, the image
 *     exports and the clinical report cannot be affected by anything here.
 *     Closing the view discards the plan.
 */
export default class TreatmentSimulation extends React.PureComponent<Props, State> {
  state: State = {
    plan: EMPTY_PLAN,
    isExporting: false,
    exportError: null,
    figurePx: null,
  };

  /**
   * Last computed simulation, keyed by the plan that produced it. Sliders fire
   * a change per pixel of travel and each recomputation evaluates every lateral
   * analysis twice, so an unchanged plan must not pay for it again.
   */
  private cacheKey: string | null = null;
  private cached: {
    simulation: Simulation;
    table: SimulationTable;
  } | null = null;

  /**
   * The figure's frame, memoized on the *tracing* alone. Keyed separately from
   * the simulation precisely so that changing the plan cannot change it.
   */
  private frameKey: string | null = null;
  private frameCached: Box | null = null;

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

  // ---- Derived state --------------------------------------------------------

  private compute() {
    const { landmarks, scaleFactor } = this.props;
    const { plan } = this.state;
    const key = `${planKey(plan)}#${scaleFactor}#${Object.keys(landmarks).length}`;
    if (this.cacheKey === key && this.cached !== null) {
      return this.cached;
    }
    const simulation = applySimulation(landmarks, plan, scaleFactor);
    const table = buildSimulationTable(landmarks, simulation.landmarks, scaleFactor);
    this.cacheKey = key;
    this.cached = { simulation, table };
    return this.cached;
  }

  /**
   * The viewBox of the figure — computed from the *current* tracing only, then
   * padded by the furthest any plan these controls can express could displace a
   * landmark (`maxSimulatedTravelPx`).
   *
   * Framing on the union of the two tracings, as a superimposition legitimately
   * does, would be wrong here: the second tracing is not a second film, it is
   * this one under a plan the user is still adjusting, and re-framing on it
   * zooms and pans the figure on every slider step. Holding the frame costs a
   * little empty field at rest and buys a still camera, which is the whole
   * point of drawing the two layers together.
   */
  private frame(): Box | null {
    const { landmarks, scaleFactor } = this.props;
    const key = `${scaleFactor}#${Object.keys(landmarks).length}`;
    if (this.frameKey === key) {
      return this.frameCached;
    }
    const base = superimpositionFrame(landmarks, landmarks, IDENTITY);
    let frame: Box | null = null;
    if (base !== null) {
      const margin = maxSimulatedTravelPx(landmarks, scaleFactor);
      frame = {
        x: base.x - margin,
        y: base.y - margin,
        width: base.width + margin * 2,
        height: base.height + margin * 2,
      };
    }
    this.frameKey = key;
    this.frameCached = frame;
    return frame;
  }

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

  // ---- View -----------------------------------------------------------------

  private renderView() {
    const { landmarks, scaleFactor } = this.props;
    const { plan } = this.state;
    const { simulation, table } = this.compute();
    const frame = this.frame();
    const controls = describeControls(landmarks, scaleFactor);

    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Treatment simulation"
      >
        {/* A saved PDF is named after `document.title`, which the app sets from
            the workspace — the image's file name. Held only while this view is
            mounted; react-helmet restores the app's title on close. */}
        <Helmet
          title={printDocumentTitle(
            this.props.patient,
            'Treatment simulation',
            [this.filmLabel()],
          )}
        />
        {this.renderPrintHead()}

        <div className={classes.chrome}>
          <span className={classes.chrome_title}>
            Treatment simulation
            <span className={classes.chrome_hint}>
              Geometric simulation for planning discussion — not a growth or
              outcome prediction
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
              disabled={isPlanEmpty(plan)}
              title="Return every movement to zero"
              onClick={this.reset}
            >
              <IconReset color="currentColor" style={{ width: 18, height: 18 }} />
              Reset
            </button>
            <button
              type="button"
              className={classes.chrome_button}
              disabled={frame === null || this.state.isExporting}
              title="Save the figure as a PNG, stamped with the plan and the disclaimer"
              onClick={this.handleExportPng}
            >
              <IconImage color="currentColor" style={{ width: 18, height: 18 }} />
              {this.state.isExporting ? 'Exporting…' : 'Export PNG'}
            </button>
            <button
              type="button"
              className={classes.chrome_button}
              disabled={frame === null}
              title="Print the simulation, or save it as a PDF for the chart"
              onClick={this.handlePrint}
            >
              <IconPrint color="currentColor" style={{ width: 18, height: 18 }} />
              Print / Save as PDF
            </button>
            <button
              type="button"
              className={cx(classes.chrome_button, classes.chrome_button__primary)}
              autoFocus
              title="Close and discard this simulation — the tracing is untouched"
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
              {frame !== null
                ? this.renderSvg(simulation, frame)
                : (
                  <div className={classes.empty}>
                    <span className={classes.empty_title}>
                      Not enough plotted geometry to draw
                    </span>
                    <span className={classes.empty_hint}>
                      A simulation is drawn from the tracing. Plot the landmarks
                      of an analysis and this view will move them.
                    </span>
                  </div>
                )}
            </div>
            {this.renderLegend()}
          </div>
          {this.renderPanel(controls, table, simulation)}
        </div>

        {this.renderPrintTail()}
      </div>
    );
  }

  /** "山田 太郎 · C-0001 · T1 · 2026/01/12" for the chrome and the export. */
  private identityLine(): string {
    const { patient } = this.props;
    const parts: string[] = [];
    parts.push(patient !== null && patient.name ? patient.name : '—');
    if (patient !== null && patient.chartId) {
      parts.push(patient.chartId);
    }
    const film = this.filmLabel();
    if (film !== null) {
      parts.push(film);
    }
    return parts.join(' · ');
  }

  /** "T1 · 2026/01/12", when the record carries either. */
  private filmLabel(): string | null {
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

  /**
   * Print-only letterhead and patient band. A detached clinical sheet must
   * carry the practice it came from, the patient it is about and the day it was
   * produced — the same masthead the clinical report and the superimposition
   * print, from the same stored identity.
   */
  private renderPrintHead() {
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
    // Age is stated at the film the plan was built on, not at the print date.
    const filmDate = parseCaptureDate(captureDate);
    const ageAtFilm = patient !== null && filmDate !== null
      ? formatAgeFull(patient.dateOfBirth, filmDate)
      : null;
    const age = ageAtFilm !== null
      ? ageAtFilm
      : (patient !== null ? formatAgeFull(patient.dateOfBirth) : null);

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
                : 'Cephalometric treatment simulation'}
            </span>
            {clinicianLine !== '' ? (
              <span className={classes.print_clinic_line}>{clinicianLine}</span>
            ) : null}
          </div>
          <div className={classes.print_masthead_right}>
            <span className={classes.print_kicker}>Treatment simulation</span>
            <span className={classes.print_date}>{printedOn}</span>
          </div>
        </header>
        <h1 className={classes.print_title}>Treatment Simulation (VTO)</h1>
        <div className={classes.print_band}>
          <div className={classes.band_row}>
            {cell('Patient', patient !== null && patient.name ? patient.name : null)}
            {cell('Chart ID', patient !== null && patient.chartId ? patient.chartId : null)}
            {cell('Sex', patient !== null ? formatSexFull(patient.sex) : null)}
          </div>
          <div className={classes.band_row}>
            {cell('Date of birth', dateOfBirth)}
            {cell(ageAtFilm !== null ? 'Age at film' : 'Age at printing', age)}
            {cell('Film', this.filmLabel())}
          </div>
        </div>
        <p className={classes.print_banner}>
          This sheet is a <strong>geometric simulation</strong>, not a
          prediction. It reports what the analysis would measure if the anatomy
          moved by the amounts stated below. It forecasts no growth, no surgical
          outcome, no remodelling and no relapse.
        </p>
      </div>
    );
  }

  /** Print-only certification block, matching the other two printed sheets. */
  private renderPrintTail() {
    const letterhead = readLetterhead();
    return (
      <div className={classes.print_tail} aria-hidden="true">
        <div className={classes.sig_label}>Certification</div>
        <div className={classes.sig_row}>
          <div className={cx(classes.sig_field, classes.sig_field__wide)}>
            <div className={classes.sig_line}>{letterhead.clinician}</div>
            <span className={classes.sig_caption}>
              Planned by — name &amp; signature
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
          Produced with WebCeph. The movements on this sheet were entered by the
          clinician; every value is recomputed from the moved landmarks by the
          same analysis code that produced the patient’s report. Nothing here is
          a growth or outcome prediction, and nothing here was saved to the
          patient’s tracing.
        </p>
      </div>
    );
  }

  // ---- The figure -----------------------------------------------------------

  private renderSvg(simulation: Simulation, frame: Box) {
    const { src, width, height, landmarks, scaleFactor } = this.props;
    const currentPoints = placedPoints(landmarks);
    const simulatedPoints = placedPoints(simulation.landmarks);
    const currentOutlines = buildOutlines(currentPoints);
    const dotRadius = frame.width / 210;

    // ViewBox units per rendered CSS pixel, measured — the only honest way to
    // give figure type a real size, since the same viewBox is scaled to a wide
    // box on screen and a 104 mm box on paper. `preserveAspectRatio` fits the
    // frame inside the box, so the scale is the tighter of the two axes.
    const { figurePx } = this.state;
    const perPx = figurePx !== null && figurePx.width > 8 && figurePx.height > 8
      ? Math.max(frame.width / figurePx.width, frame.height / figurePx.height)
      : frame.width / 700;
    const perPxPrint = frame.height / PRINT_FIGURE_HEIGHT_PX;
    const size = ANNOTATION_PX * perPx;
    const sizePrint = ANNOTATION_PX_PRINT * perPxPrint;
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
          'The current tracing with the simulated tracing overlaid' +
          (simulation.movedSymbols.length === 0
            ? ' — no movement applied yet'
            : `, ${movedCountLabel(simulation.movedSymbols.length)}`)
        }
      >
        {src !== null && width !== null && height !== null ? (
          <image
            className={classes.film}
            xlinkHref={src}
            x={0}
            y={0}
            width={width}
            height={height}
            preserveAspectRatio="none"
          />
        ) : null}
        {this.renderTracing(
          currentOutlines, currentPoints,
          Object.keys(currentPoints), dotRadius, classes.current, null,
        )}
        {this.renderTracing(
          simulatedOutlines(simulation, currentPoints), simulatedPoints,
          simulation.movedSymbols, dotRadius, classes.simulated,
          currentOutlines,
        )}
        {this.renderDisplacements(currentPoints, simulatedPoints, dotRadius)}
        {this.renderScaleBar(frame, chooseScaleBar(frame, scaleFactor), perPx)}
      </svg>
    );
  }

  /**
   * The millimetre scale bar — the same one the superimposition draws, from the
   * same `chooseScaleBar`. Drawn only when the film carries a calibration: a
   * ruler without one would be a fabricated measurement, and a figure whose
   * movements are stated in millimetres has to be checkable by eye.
   */
  private renderScaleBar(frame: Box, bar: ScaleBar | null, perPx: number) {
    if (bar === null) {
      return null;
    }
    const pad = frame.width * 0.04;
    const y = frame.y + frame.height - pad;
    const x = frame.x + pad;
    const tick = perPx * 4;
    return (
      <g className={classes.scale_bar}>
        <line x1={x} y1={y} x2={x + bar.px} y2={y} />
        <line x1={x} y1={y - tick} x2={x} y2={y + tick} />
        <line x1={x + bar.px} y1={y - tick} x2={x + bar.px} y2={y + tick} />
        <text
          className={classes.anno_text}
          x={x + bar.px / 2}
          y={y - tick * 2}
          textAnchor="middle"
        >
          {`${bar.mm} mm`}
        </text>
      </g>
    );
  }

  /**
   * One tracing layer. `dotSymbols` limits which landmark dots are drawn, and
   * `against` — when given — suppresses every outline the plan did not actually
   * change: an unmoved structure drawn twice would read as violet (the upper
   * layer wins), implying the simulation moved something it did not. With this,
   * a violet dashed curve on screen always means "this curve moved".
   */
  private renderTracing(
    built: Outline[],
    points: { [symbol: string]: GeoPoint },
    dotSymbols: string[],
    dotRadius: number,
    hueClass: string,
    against: Outline[] | null,
  ) {
    const outlines = this.movedOutlines(built, against);
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
        {dotSymbols.map((symbol) => (
          points[symbol] !== undefined ? (
            <circle
              key={symbol}
              className={classes.dot}
              cx={points[symbol].x}
              cy={points[symbol].y}
              r={dotRadius}
            />
          ) : null
        ))}
      </g>
    );
  }

  /**
   * Only the curves a plan actually changed, so a violet dashed curve always
   * means "this moved".
   *
   * A movement smaller than a pixel is not a movement. Some outlines are built
   * in a facial frame scaled by the N–Me height (sella, the orbital rim, the
   * ear-rod ring), so moving Menton perturbs them by a hundredth of a pixel —
   * enough to fail an exact comparison, far too little to mean anything. The
   * tolerance keeps those structures honestly single-drawn.
   */
  private movedOutlines(built: Outline[], against: Outline[] | null): Outline[] {
    if (against === null) {
      return built;
    }
    const reference: { [id: string]: Array<[number, number]> } = {};
    against.forEach((outline) => {
      reference[outline.id] = outline.points;
    });
    return built.filter((outline) => {
      const before = reference[outline.id];
      if (before === undefined || before.length !== outline.points.length) {
        return true;
      }
      return outline.points.some(([x, y], i) => (
        Math.abs(x - before[i][0]) > 1 || Math.abs(y - before[i][1]) > 1
      ));
    });
  }

  /**
   * A displacement vector per moved landmark: where the point was, where the
   * plan puts it. Without these the two tracings read as an unexplained double
   * exposure; with them the figure says which structures were moved and by how
   * much in which direction.
   */
  private displacementVectors(
    current: { [symbol: string]: GeoPoint },
    simulated: { [symbol: string]: GeoPoint },
    minLength: number,
  ): Array<{ symbol: string; from: GeoPoint; to: GeoPoint }> {
    const vectors: Array<{ symbol: string; from: GeoPoint; to: GeoPoint }> = [];
    Object.keys(current).forEach((symbol) => {
      const from = current[symbol];
      const to = simulated[symbol];
      if (to === undefined) {
        return;
      }
      // An arrow shorter than its own head is noise, not information.
      if (Math.hypot(to.x - from.x, to.y - from.y) < minLength) {
        return;
      }
      vectors.push({ symbol, from, to });
    });
    return vectors;
  }

  private renderDisplacements(
    current: { [symbol: string]: GeoPoint },
    simulated: { [symbol: string]: GeoPoint },
    dotRadius: number,
  ) {
    const head = dotRadius * 2.4;
    const arrows = this.displacementVectors(current, simulated, dotRadius * 3.5)
      .map(({ symbol, from, to }) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const bx = to.x - ux * head;
        const by = to.y - uy * head;
        const px = -uy * head * 0.45;
        const py = ux * head * 0.45;
        return (
          <g key={symbol}>
            <line
              className={classes.vector}
              x1={from.x}
              y1={from.y}
              x2={bx}
              y2={by}
            />
            <polygon
              className={classes.vector_head}
              points={
                `${to.x},${to.y} ${bx + px},${by + py} ${bx - px},${by - py}`
              }
            />
          </g>
        );
      });
    return <g>{arrows}</g>;
  }

  /**
   * The sentence naming the planes the millimetres are measured along. Built
   * from the tracing, not from the applied plan, so the reader learns what a
   * millimetre here means before moving anything — and so the legend does not
   * grow by a line the moment a slider is touched.
   */
  private planeSentence(): string | null {
    const { scaleFactor, landmarks } = this.props;
    const references = planReferences(landmarks);
    const planes: string[] = [];
    if (references.mandible !== null) {
      planes.push(
        `mandibular movement along the ${references.mandible.name} ` +
        `(${references.mandible.from})`,
      );
    }
    if (references.maxilla !== null) {
      planes.push(
        `maxillary advancement along the ${references.maxilla.name} ` +
        `(${references.maxilla.from}), with impaction moving the same ` +
        `segment superiorly ${references.maxilla.upName}`,
      );
    }
    if (planes.length === 0) {
      return null;
    }
    return (
      'Millimetres are measured on the planes this tracing supplies — ' +
      planes.join('; ') +
      (scaleFactor !== null
        ? `. Converted to pixels at this film’s calibration of ${formatScale(scaleFactor)}`
        : '') +
      '.'
    );
  }

  /**
   * The single sentence the figure states inline: what a millimetre in it is —
   * or, on an uncalibrated film, that no distance in it can be read in
   * millimetres at all. That second case is the one a clinician must not miss,
   * so it is never the thing behind the disclosure.
   */
  private inlineScaleNote(hasPlanes: boolean): string | null {
    const { scaleFactor } = this.props;
    if (scaleFactor === null) {
      return 'This film carries no mm/px calibration: no scale bar is drawn ' +
        'and no distance in the figure can be read in millimetres.';
    }
    if (!hasPlanes) {
      return null;
    }
    return 'Millimetre movements are measured along the plane named under ' +
      `each control · this film is calibrated at ${formatScale(scaleFactor)}.`;
  }

  private renderLegend() {
    const { plan } = this.state;
    const parts = describePlan(plan);
    const planeSentence = this.planeSentence();
    const inlineNote = this.inlineScaleNote(planeSentence !== null);
    return (
      <div className={classes.legend}>
        <div className={classes.legend_keys}>
          <span className={cx(classes.key, classes.key__current)}>
            <span className={classes.key_swatch} aria-hidden="true" />
            <span className={classes.key_text}>Current tracing</span>
          </span>
          <span className={cx(classes.key, classes.key__simulated)}>
            <span className={classes.key_swatch} aria-hidden="true" />
            <span className={classes.key_text}>Simulated</span>
          </span>
          {/* The arrows carry as much of the figure's meaning as the two hues
              do, so they get a key rather than a sentence four lines down. */}
          <span className={cx(classes.key, classes.key__vector)}>
            <svg
              className={classes.key_arrow}
              viewBox="0 0 26 8"
              aria-hidden="true"
            >
              <line x1="0" y1="4" x2="18" y2="4" />
              <polygon points="26,4 17,8 17,0" />
            </svg>
            <span className={classes.key_text}>Landmark displacement</span>
          </span>
          {parts.length > 0 ? (
            <span className={classes.legend_plan}>{parts.join(' · ')}</span>
          ) : (
            <span className={classes.legend_plan}>
              No movement applied — move a slider to simulate
            </span>
          )}
        </div>
        <div className={classes.legend_notes}>
          {/* One line inline. Which plane each movement runs along is already
              stated under the control that makes it, so the figure states only
              the fact the figure itself owns — what a millimetre here is — and
              keeps the rest behind the disclosure. */}
          {inlineNote !== null ? (
            <p className={classes.legend_note}>{inlineNote}</p>
          ) : null}
          <AboutDisclosure
            className={classes.legend_about}
            label="About this figure"
          >
            {planeSentence !== null ? <p>{planeSentence}</p> : null}
            <p>
              Both tracings are the same anatomical curves the editor draws,
              built from landmark positions — the simulated one from the moved
              landmarks. A structure no control moves (the cranial base,
              Articulare, the nasal bones) is drawn once, in cyan: a violet
              dashed curve appears only where this plan actually moves something.
            </p>
            <p>
              The frame is fixed on the plotted tracing and padded for the
              largest movement these controls can express, so the figure never
              rescales or pans while you drag a slider — only the violet layer
              moves.
              {this.props.scaleFactor !== null
                ? ' The bar at the foot of the figure is a true millimetre' +
                  ' scale at this film’s calibration.'
                : ''}
            </p>
          </AboutDisclosure>
        </div>
      </div>
    );
  }

  // ---- The panel ------------------------------------------------------------

  private renderPanel(
    controls: ControlAvailability[],
    table: SimulationTable,
    simulation: Simulation,
  ) {
    const { plan } = this.state;
    const references = planReferences(this.props.landmarks);
    // Controls held back *only* by the missing calibration, as a group: the
    // reason is one fact about the film, so it is stated once above them rather
    // than three times inside them.
    const scaleBlocked = controls.filter((c) => (
      c.needsScale && c.missingSymbols.length === 0 && !c.needsReference
    ));
    const firstScaleBlocked = scaleBlocked.length > 0
      ? scaleBlocked[0].spec.id
      : null;
    return (
      <div className={classes.panel}>
        <div className={classes.panel_head}>
          <span className={classes.panel_title}>Plan</span>
          <span className={classes.panel_sub}>
            {isPlanEmpty(plan)
              ? 'Nothing moved yet'
              : movedCountLabel(simulation.movedSymbols.length)}
          </span>
        </div>
        <div className={classes.panel_scroll}>
          {/* The sentence that must not be missed, and the list of what is not
              modelled one click behind it — condensed, not dropped, and printed
              in full on every sheet (see AboutDisclosure). */}
          <div className={classes.disclaimer}>
            <p className={classes.disclaimer_line}>
              <strong>Geometric simulation, not a prediction.</strong> It moves
              the plotted landmarks by the amounts you set and recomputes the
              analysis from the moved points — a tool for planning discussion.
            </p>
            <AboutDisclosure label="What this does not model">
              <p>
                It is <em>not</em> a growth prediction and not a surgical
                outcome prediction. It models no bone remodelling, no dental
                compensation, no condylar or mandibular autorotation and no
                relapse. Nothing here is fitted to this patient’s own response.
              </p>
            </AboutDisclosure>
          </div>

          {controls.map((control) => (
            <React.Fragment key={control.spec.id}>
              {control.spec.id === firstScaleBlocked ? (
                <p className={classes.group_banner}>
                  {scaleBlocked.length === 1
                    ? 'This movement is'
                    : `These ${scaleBlocked.length} movements are`}{' '}
                  entered in millimetres and need an mm/px calibration for this
                  film — set it from the calibration chip in the toolbar. The
                  incisor controls are scale-independent and stay available.
                </p>
              ) : null}
              {this.renderControl(control, references, firstScaleBlocked !== null)}
            </React.Fragment>
          ))}

          {this.renderSoftTissue()}
        </div>

        {this.renderTable(table)}
      </div>
    );
  }

  /**
   * A slider, with what it moves stated under it at all times and the plane its
   * millimetres are measured along added once it is engaged. The plane is
   * chosen from what the tracing carries (occlusal → palatal → N–Me
   * perpendicular), so the control reports the one that was used rather than
   * the one it prefers.
   */
  private renderControl(
    control: ControlAvailability,
    references: ReturnType<typeof planReferences>,
    hasScaleBanner: boolean,
  ) {
    const { spec, isAvailable, reason } = control;
    const value = valueForControl(this.state.plan, spec.id);
    const described = describeMovement(spec, value);
    const reference = spec.id === 'mandible'
      ? references.mandible
      : (spec.id === 'maxilla' || spec.id === 'impaction')
        ? references.maxilla
        : null;
    // What the control moves, and the plane its millimetres are measured along
    // — rendered at rest as well as engaged, so the panel is readable before it
    // is touched and so touching a slider cannot shift everything below it.
    //
    // Two clauses: the short one under the control (one line, which is all a
    // slider is owed here — the plane is *named*, and the mm/px calibration and
    // the "measured along the plane named under each control" statement are
    // under the film), the full one on the tooltip.
    const planeClause = reference === null
      ? ''
      : (spec.id === 'impaction'
        ? ` Impaction runs superiorly ${reference.upName}; downgraft inferiorly along the same axis.`
        : ` Measured along the ${reference.name} (${reference.from}).`);
    const planeHelp = reference === null
      ? ''
      : (spec.id === 'impaction'
        ? ` Superiorly ${reference.upName}.`
        : ` Along the ${reference.name}.`);
    const help = `${spec.short}${planeHelp}`;
    // The tooltip carries the full statement, which is longer than a line.
    const title = isAvailable
      ? `${spec.description}${planeClause}`
      : (reason || undefined);
    const shownReason = !isAvailable && control.needsScale &&
      control.missingSymbols.length === 0 && !control.needsReference &&
      hasScaleBanner
      ? 'Waiting on the mm/px calibration above.'
      : reason;
    // Zero sits at the middle of every one of these ranges; the fill runs from
    // it to the thumb so a centre-neutral control cannot read as a
    // left-anchored one. The thumb's centre travels inset by half its width, so
    // the stops are expressed against that same travel (see style.scss).
    const span = spec.max - spec.min;
    const zeroAt = span > 0 ? (0 - spec.min) / span : 0.5;
    const at = span > 0 ? (value - spec.min) / span : 0.5;
    const sliderStyle = {
      '--pa': `${Math.min(at, zeroAt)}`,
      '--pb': `${Math.max(at, zeroAt)}`,
      '--zero': `${zeroAt}`,
    } as any as React.CSSProperties;
    return (
      <div
        className={cx(classes.control, {
          [classes.control__off]: !isAvailable,
          [classes.control__on]: isAvailable && value !== 0,
        })}
      >
        <div className={classes.control_head}>
          <label className={classes.control_label} htmlFor={`sim-${spec.id}`}>
            {spec.label}
          </label>
          <span className={classes.control_value}>
            {described !== null ? described : '—'}
          </span>
        </div>
        <input
          id={`sim-${spec.id}`}
          className={classes.slider}
          style={sliderStyle}
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          disabled={!isAvailable}
          title={title}
          aria-label={`${spec.label} — ${spec.negative} to ${spec.positive}, in ${spec.unit}`}
          onChange={this.handleControlChange.bind(this, spec.id)}
        />
        <div className={classes.control_scale} aria-hidden="true">
          <span className={classes.control_min}>
            {`${formatAmount(Math.abs(spec.min), spec.unit)} ${spec.negative}`}
          </span>
          <span className={classes.control_zero}>0</span>
          <span className={classes.control_max}>
            {`${formatAmount(spec.max, spec.unit)} ${spec.positive}`}
          </span>
        </div>
        <p className={classes.control_help}>{help}</p>
        {shownReason !== null ? (
          <p className={classes.control_reason}>{shownReason}</p>
        ) : null}
      </div>
    );
  }

  /**
   * The soft-tissue response, with its ratios on screen. A simulated profile is
   * the most persuasive thing in this view and the least certain, so the numbers
   * behind it are published rather than buried.
   */
  private renderSoftTissue() {
    const { plan } = this.state;
    const rows = activeSoftTissueRatios(plan);
    return (
      <div className={classes.soft}>
        <div className={classes.soft_head}>
          <span className={classes.soft_title}>Soft tissue</span>
          <div className={classes.seg} role="group" aria-label="Soft-tissue response">
            <button
              type="button"
              className={cx(classes.seg_button, {
                [classes.seg_button__on]: plan.isSoftTissueFollowing,
              })}
              aria-pressed={plan.isSoftTissueFollowing}
              title="Move the soft-tissue landmarks by a fraction of the underlying skeletal movement"
              onClick={this.setSoftTissue.bind(this, true)}
            >
              Follows
            </button>
            <button
              type="button"
              className={cx(classes.seg_button, {
                [classes.seg_button__on]: !plan.isSoftTissueFollowing,
              })}
              aria-pressed={!plan.isSoftTissueFollowing}
              title="Leave every soft-tissue landmark exactly where it was plotted"
              onClick={this.setSoftTissue.bind(this, false)}
            >
              Held
            </button>
          </div>
        </div>
        {plan.isSoftTissueFollowing ? (
          <React.Fragment>
            <p className={classes.soft_note}>
              Each soft-tissue landmark moves by a{' '}
              <strong>mean literature ratio</strong> of the hard-tissue movement
              under it; individual response varies by roughly ±0.3, so read the
              simulated profile as a direction, not a measurement.
            </p>
            {/* The ratio table lives *inside* the disclosure it belongs to.
                Rendered inline, ten rows of it sat under a collapsed "About
                these ratios" heading and pushed Key measurements — the reason
                this view exists — below the fold, so five sliders were served
                by two thirds of a panel of prose. Nothing is lost: the numbers
                are one click away on screen and print open on paper. */}
            <AboutDisclosure label="About these ratios">
              <p>
                The ratios are means from the orthognathic and
                incisor-retraction literature, not values fitted to this
                patient. Lip thickness change, lip strain, muscle adaptation and
                relapse are not modelled. Glabella and soft-tissue nasion are
                held — nothing here moves the cranium or the nasal bones.
              </p>
              {rows.length > 0 ? (
                <ul className={classes.soft_list}>
                  {rows.map(({ ratio, drivers }) => (
                    <li key={ratio.symbol} className={classes.soft_row}>
                      <span className={classes.soft_symbol}>{ratio.symbol}</span>
                      <span className={classes.soft_name}>{ratio.name}</span>
                      <span className={classes.soft_ratio}>
                        {drivers
                          .map((d) => `${d.value.toFixed(1)} × ${d.driver}`)
                          .join(' + ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </AboutDisclosure>
            {rows.length === 0 ? (
              <p className={classes.soft_empty}>
                {isPlanEmpty(plan)
                  ? 'No movement is being passed to the soft tissue yet — ' +
                    'move a slider above.'
                  : 'This plan drives no soft-tissue landmark: the movements ' +
                    'set above have a ratio of zero for every point in the ' +
                    'table.'}
              </p>
            ) : null}
            {/* Only once soft tissue is actually being driven. The amber "the
                profile curve is a silhouette inferred from the skeletal
                profile" caution used to print in the zero state as well —
                the panel's most emphatic colour, spent on a caveat about a
                displacement that was not happening yet, directly under "no
                movement is being passed to the soft tissue". */}
            {rows.length > 0 ? this.renderProfileProvenance() : null}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p className={classes.soft_note}>
              Every soft-tissue landmark stays where it was plotted: only the
              skeletal and dental geometry changes.
            </p>
            <AboutDisclosure label="What this means for the profile">
              <p>
                The simulated profile is the patient’s current profile — the
                profile curve in the figure is held with the landmarks it is
                built from, and the lip-to-E-line measurements below, which come
                entirely from soft-tissue landmarks, cannot change at all.
              </p>
            </AboutDisclosure>
          </React.Fragment>
        )}
      </div>
    );
  }

  /**
   * Where the profile curve in the figure comes from. On a tracing that carries
   * the whole soft-tissue landmark set the curve runs through plotted points; on
   * one that does not, the outline module infers a silhouette from the skeletal
   * profile, and the reader is entitled to know which of the two they are
   * looking at before they read a lip position off it.
   */
  private renderProfileProvenance() {
    const { landmarks } = this.props;
    if (hasSoftTissueProfile(landmarks)) {
      return (
        <p className={cx(classes.soft_note, classes.soft_note__spaced)}>
          The profile curve in the figure runs through this tracing’s own
          plotted soft-tissue landmarks, moved by the ratios above.
        </p>
      );
    }
    const missing = missingSoftTissueProfileLandmarks(landmarks);
    return (
      <React.Fragment>
        <p
          className={cx(
            classes.soft_note,
            classes.soft_note__spaced,
            classes.soft_note__caution,
          )}
        >
          The profile curve in the figure is a{' '}
          <strong>silhouette inferred from the skeletal profile</strong>, not a
          traced outline — a lip position must not be measured off it.
        </p>
        <AboutDisclosure label="Why, and what is safe to read">
          <p>
            {missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} not
            plotted on this tracing, so the outline module infers the silhouette
            from the skeletal profile — in the simulation exactly as in the
            editor. It is displaced by the ratios listed above rather than by the
            full skeletal movement, so it does not overstate the response; but it
            is an inference about this patient’s soft tissue drawn from their
            bone. The lip-to-E-line values in the table are computed from the
            plotted soft-tissue landmarks themselves, not from this curve.
          </p>
        </AboutDisclosure>
      </React.Fragment>
    );
  }

  /**
   * The value table, in its own pane.
   *
   * This is the reason the view exists, so it does not live at the bottom of
   * the same scroller as five controls and four paragraphs of prose: it has a
   * labelled header of its own and scrolls independently, and is on screen
   * before anything has been touched.
   */
  private renderTable(table: SimulationTable) {
    return (
      <div className={classes.values}>
        <div className={classes.values_head}>
          <span className={classes.values_title}>Key measurements</span>
          <span className={classes.values_sub}>
            {table.rows.length}{' '}
            {table.rows.length === 1 ? 'measurement' : 'measurements'}
          </span>
        </div>
        <div className={classes.values_scroll}>
          {table.rows.length === 0 ? (
            <p className={classes.values_empty}>
              None of the key measurements can be computed from this tracing yet.
              Complete an analysis and they will appear here with their simulated
              change.
            </p>
          ) : (
            <React.Fragment>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th className={classes.col_name}>Measurement</th>
                    <th className={classes.col_num}>Current</th>
                    <th className={classes.col_num}>Simulated</th>
                    <th className={classes.col_num}>
                      Change
                      <span className={classes.th_sub}>simulated − current</span>
                    </th>
                    <th className={classes.col_norm}>
                      Norm
                      <span className={classes.th_sub}>
                        mean ± SD, or the author's range
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => this.renderValueRow(row))}
                </tbody>
              </table>
              <p className={classes.legend_key}>
                <span className={cx(classes.chip, classes.chip__in)}>green</span>
                a value this plan brings from outside its norm band to inside it{' '}
                <span className={cx(classes.chip, classes.chip__out)}>amber</span>
                outside the norm band — underlined where it was inside before
                this plan{' '}
                <span className={cx(classes.chip, classes.chip__bad)}>red</span>
                outside the range a real head can produce — the plan or the
                tracing is wrong, so check them rather than reading the number.
              </p>
            </React.Fragment>
          )}

          <div className={classes.footnotes}>
            {table.unavailableSymbols.length > 0 ? (
              <p className={classes.footnote}>
                Not computable from this tracing, so absent above:{' '}
                {table.unavailableSymbols.join(', ')}. Plot the landmarks those
                measurements are built from (switch the analysis in the toolbar
                and the missing points are plotted for you) and they will appear.
              </p>
            ) : null}
            {table.isLinearPendingScale ? (
              <p className={cx(classes.footnote, classes.footnote__warn)}>
                Millimetre measurements are withheld
                {table.pendingScaleSymbols.length > 0
                  ? ` — ${table.pendingScaleSymbols.join(', ')} above` : ''}
                : this film carries no mm/px calibration, so there is no honest
                millimetre value to report — and no way to interpret a millimetre
                movement either. The geometry is there; only the scale is missing,
                so set it from the calibration chip in the toolbar rather than
                plotting anything further. Angular values and angular movements are
                scale-independent and unaffected.
              </p>
            ) : null}
            {table.otherChangedCount > 0 ? (
              <p className={classes.footnote}>
                {table.otherChangedCount} further{' '}
                {table.otherChangedCount === 1 ? 'measurement' : 'measurements'} of
                the nine lateral analyses also{' '}
                {table.otherChangedCount === 1 ? 'changes' : 'change'} under this
                plan; only the measurements a treatment plan is judged on are listed
                here. The full set for the <em>current</em> tracing is in Summary.
              </p>
            ) : null}
            <p className={classes.footnote}>
              Every value is computed by the same code path as the Summary dialog
              and the printed report — the analysis modules evaluated against the
              moved landmarks — so the current column always agrees with them.
              Overjet and overbite are signed values measured against the
              functional occlusal plane: a negative overjet is a reverse
              overjet, a negative overbite an open bite.
            </p>
            <p className={classes.footnote}>
              Nothing here is saved. The plan lives in this view only: the tracing,
              its undo history, the image exports and the clinical report are
              untouched, and closing this view discards the plan.
            </p>
          </div>
        </div>
      </div>
    );
  }

  private renderValueRow(entry: SimulationRow) {
    const {
      row, norm, isCurrentInNorm, isSimulatedInNorm,
      isCorrected, isWorsened, isSimulatedImplausible,
    } = entry;
    const unit = getUnitSuffix(row.landmark);
    // The change is derived from the values **as printed**, not from the full
    // precision behind them: at one decimal, a true change of 0.04 printed
    // CURRENT −0.9, SIMULATED −0.8 and CHANGE "—", three cells of one row
    // contradicting each other. Rounding the two columns first makes the row
    // arithmetic true on the face of it — simulated − current — and "—" then
    // means only what it says: the two printed values are the same.
    const shownChange = roundToDisplay(
      roundToDisplay(row.t2) - roundToDisplay(row.t1),
    );
    const hasChange = Math.abs(shownChange) >= 0.05;
    // Green is reserved for a real correction — out of the norm band, then in
    // it. Tinting a value green merely because it happens to sit inside its
    // band, as it already did before the plan, would tell a clinician the plan
    // fixed something it never touched.
    const simulatedTitle = isSimulatedImplausible
      ? 'Outside the range a real head can produce. On a real film a value ' +
        'this far out means the plan or the tracing is wrong — check both ' +
        'before reading this number.'
      : isCorrected
        ? 'This plan brings the value from outside its norm band to inside it.'
        : isWorsened
          ? 'This plan takes the value out of its norm band.'
          : isSimulatedInNorm === false
            ? 'Outside the norm band, before and after this plan.'
            : undefined;
    return (
      <tr key={row.symbol}>
        <td className={classes.cell_name}>
          <span className={classes.symbol}>{row.symbol}</span>
          {row.name !== null ? (
            <span className={classes.name}>{row.name}</span>
          ) : null}
        </td>
        <td
          className={cx(classes.cell_num, {
            [classes.cell_out]: isCurrentInNorm === false,
          })}
          title={
            isCurrentInNorm === false
              ? 'Outside the norm band on the current tracing.'
              : undefined
          }
        >
          {printNumber(row.t1)}{unit}
        </td>
        <td
          className={cx(classes.cell_num, classes.cell_sim, {
            [classes.cell_in]: isCorrected && !isSimulatedImplausible,
            [classes.cell_out]:
              isSimulatedInNorm === false && !isSimulatedImplausible,
            [classes.cell_worse]: isWorsened && !isSimulatedImplausible,
            [classes.cell_bad]: isSimulatedImplausible,
          })}
          title={simulatedTitle}
        >
          {printNumber(row.t2)}{unit}
          {isSimulatedImplausible ? (
            <span className={classes.flag} aria-hidden="true">!</span>
          ) : null}
        </td>
        <td className={cx(classes.cell_num, classes.cell_change)}>
          {hasChange ? `${printSigned(shownChange)}${unit}` : '—'}
        </td>
        <td className={classes.cell_norm}>
          {norm !== null
            ? printNorm(norm.mean, norm.min, norm.max, norm.band)
            : '—'}
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

  private handleControlChange = (
    id: ControlId, e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = parseFloat(e.target.value);
    this.setState({
      plan: withControlValue(
        this.state.plan, id, isFinite(value) ? value : 0,
      ),
      exportError: null,
    });
  };

  private setSoftTissue = (isSoftTissueFollowing: boolean) => {
    this.setState({
      plan: { ...this.state.plan, isSoftTissueFollowing },
    });
  };

  private reset = () => {
    this.setState({
      plan: {
        ...EMPTY_PLAN,
        isSoftTissueFollowing: this.state.plan.isSoftTissueFollowing,
      },
    });
  };

  private handlePrint = () => {
    window.print();
  };

  /**
   * PNG of the simulation, rendered by the shared canvas back-end from the same
   * frame, the same outline module and the same curves the screen uses —
   * including the soft-tissue profile built from the ratio-displaced anchors
   * rather than from the moved skeleton.
   *
   * A detached image is read without the app around it, so the plan line and
   * the "geometric simulation, not a prediction" statement are stamped onto it.
   */
  private handleExportPng = () => {
    const { landmarks, scaleFactor, src, width, height } = this.props;
    const frame = this.frame();
    if (frame === null) {
      this.setState({ exportError: 'Nothing to export yet.' });
      return;
    }
    const { simulation } = this.compute();
    const currentPoints = placedPoints(landmarks);
    const simulatedPoints = placedPoints(simulation.landmarks);
    const built = simulatedOutlines(simulation, currentPoints);
    const parts = describePlan(this.state.plan);
    const planeSentence = this.planeSentence();
    const annotations: SuperimpositionAnnotations = {
      // No registration here: the two layers are one film, so the only
      // annotation the figure carries is the millimetre scale bar — and only
      // when the film is calibrated.
      originSymbol: '',
      origin: null,
      t1Basis: null,
      t2Basis: null,
      labels: [],
      scaleBar: chooseScaleBar(frame, scaleFactor),
    };
    const notes: string[] = [
      'Geometric simulation, not a prediction: the plotted landmarks were ' +
      'moved by the amounts stated and the analysis recomputed from them. ' +
      'It forecasts no growth, no surgical outcome, no remodelling, no relapse.',
    ];
    if (planeSentence !== null) {
      notes.push(planeSentence);
    }
    notes.push(
      this.state.plan.isSoftTissueFollowing
        ? 'The soft tissue follows the hard tissue at published mean ratios ' +
          '(± ~0.3 individual variation); the simulated profile is a ' +
          'direction, not a measurement.'
        : 'The soft tissue is held: every soft-tissue landmark is exactly ' +
          'where it was plotted.',
    );
    notes.push(
      'Not saved to the patient’s record — the tracing this was built from ' +
      'is unchanged.',
    );
    this.setState({ isExporting: true, exportError: null });
    renderSuperimpositionSnapshot({
      filmSrc: src,
      filmWidth: width,
      filmHeight: height,
      t1: landmarks,
      t2: simulation.landmarks,
      transform: IDENTITY,
      frame,
      annotations,
      t1Color: CURRENT_HUE,
      t2Color: SIM_HUE,
      t2Outlines: this.movedOutlines(built, buildOutlines(currentPoints)),
      t2DotSymbols: simulation.movedSymbols,
      vectors: this.displacementVectors(
        currentPoints, simulatedPoints, frame.width / 60,
      ),
      t1Label: 'Current tracing',
      t2Label: 'Simulated',
      registrationLabel: parts.length > 0
        ? parts.join(' · ')
        : 'No movement applied',
      interval: null,
      auditLabel: scaleFactor !== null
        ? `Film calibrated at ${formatScale(scaleFactor)}`
        : 'Film not calibrated — millimetre movements unavailable',
      patientLabel: this.identityLine(),
      caveat: null,
      notes,
    }).then((blob) => {
      if (blob === null) {
        this.setState({
          isExporting: false,
          exportError: 'This browser could not render the image.',
        });
        return;
      }
      saveAs(blob, `${this.exportStem()}-simulation.png`);
      this.setState({ isExporting: false });
    });
  };

  /**
   * File-name stem for the export. Characters a file system cannot carry —
   * every CJK name among them — collapse to a single separator and are then
   * trimmed away, so a Japanese name yields `C-0001-simulation.png` rather than
   * the malformed `C-0001__-simulation.png`.
   */
  private exportStem(): string {
    const { patient } = this.props;
    const stem = (patient !== null
      ? [patient.chartId, patient.name].filter((p) => !!p).join('_')
      : '')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[_.\-]+|[_.\-]+$/g, '');
    return stem !== '' ? stem : 'treatment-simulation';
  }
}
