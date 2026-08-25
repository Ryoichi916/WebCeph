import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import IconClose from 'material-ui/svg-icons/navigation/close';
import IconReset from 'material-ui/svg-icons/av/replay';

import Props from './props';
import { EligibleCeph } from './selectors';

import {
  REGISTRATION_SYMBOLS,
  solvePhotoRegistration,
  buildOverlayLines,
  OverlayLine,
} from 'analyses/photoOverlay';
import {
  placedPoints,
  toSvgMatrix,
  Transform,
} from 'analyses/superimposition';
import {
  buildOutlines,
  outlineToSvgPath,
  hasSoftTissueProfile,
  missingSoftTissueProfileLandmarks,
} from 'components/TracingViewer/outlines';

import { formatCaptureDate, parseCaptureDate } from 'utils/records';

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
    return (
      <p className={classes.caution}>
        Photograph {name(photoT)} · ceph {name(cephT)} — the overlay compares
        different visits.
      </p>
    );
  }

  /** The soft-tissue curve is inferred where the tracing lacks the full set. */
  private renderSilhouetteCaution(ceph: EligibleCeph | null) {
    if (ceph === null || !this.state.layers.soft) {
      return null;
    }
    if (hasSoftTissueProfile(ceph.landmarks)) {
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
}
