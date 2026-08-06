import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import IconClose from 'material-ui/svg-icons/navigation/close';
import IconReset from 'material-ui/svg-icons/av/replay';

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
  valueForControl,
  withControlValue,
  EMPTY_PLAN,
  NOT_INTERPRETED,
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
  placedPoints,
  IDENTITY,
  Box,
} from 'analyses/superimposition';
import { buildOutlines, outlineToSvgPath } from 'components/TracingViewer/outlines';

// Number formatting and unit suffixes are the app's, not this view's.
import { getUnitSuffix } from 'components/AnalysisResultsViewer';
import { printNumber, printSigned } from 'components/ClinicalReport/copy';
import { formatMmPx } from 'components/TracingToolbar/CalibrationDialog';

import { formatCaptureDate } from 'utils/records';

const classes = require('./style.scss');

/** Body class held while the view is open, so the app behind it cannot scroll. */
const BODY_OPEN_CLASS = 'treatment-simulation-open';

interface State {
  plan: SimulationPlan;
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
 * Two things this view is careful about:
 *
 *   * **It is a geometric simulation, not a prediction.** It says what the
 *     numbers would be if the anatomy moved by the amounts entered. It does not
 *     forecast growth, surgical outcome, relapse or remodelling, and it says so
 *     on screen rather than in a manual.
 *   * **It is view-local.** Every movement lives in this component's state.
 *     Nothing is dispatched, so the real tracing, the undo history, the image
 *     exports and the clinical report cannot be affected by anything here.
 *     Closing the view discards the plan.
 */
export default class TreatmentSimulation extends React.PureComponent<Props, State> {
  state: State = { plan: EMPTY_PLAN };

  /**
   * Last computed simulation, keyed by the plan that produced it. Sliders fire
   * a change per pixel of travel and each recomputation evaluates every lateral
   * analysis twice, so an unchanged plan must not pay for it again.
   */
  private cacheKey: string | null = null;
  private cached: {
    simulation: Simulation;
    table: SimulationTable;
    frame: Box | null;
  } | null = null;

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    document.body.classList.add(BODY_OPEN_CLASS);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
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
    const frame = superimpositionFrame(landmarks, simulation.landmarks, IDENTITY);
    this.cacheKey = key;
    this.cached = { simulation, table, frame };
    return this.cached;
  }

  // ---- View -----------------------------------------------------------------

  private renderView() {
    const { patient, landmarks, scaleFactor } = this.props;
    const { plan } = this.state;
    const { simulation, table, frame } = this.compute();
    const controls = describeControls(landmarks, scaleFactor);
    const patientName = patient !== null && patient.name ? patient.name : '—';
    const chartId = patient !== null && patient.chartId ? patient.chartId : null;

    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Treatment simulation"
      >
        <div className={classes.chrome}>
          <span className={classes.chrome_title}>
            Treatment simulation
            <span className={classes.chrome_hint}>
              Geometric simulation for planning discussion — not a growth or
              outcome prediction
            </span>
          </span>
          <div className={classes.chrome_actions}>
            <span className={classes.chrome_identity}>
              {patientName}{chartId !== null ? ` · ${chartId}` : ''}
              {this.filmLabel() !== null ? ` · ${this.filmLabel()}` : ''}
            </span>
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
            <div className={classes.figure}>
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
            {this.renderLegend(simulation)}
          </div>
          {this.renderPanel(controls, table, simulation)}
        </div>
      </div>
    );
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

  // ---- The figure -----------------------------------------------------------

  private renderSvg(simulation: Simulation, frame: Box) {
    const { src, width, height, landmarks } = this.props;
    const currentPoints = placedPoints(landmarks);
    const simulatedPoints = placedPoints(simulation.landmarks);
    const dotRadius = frame.width / 210;

    return (
      <svg
        className={classes.svg}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          'The current tracing with the simulated tracing overlaid' +
          (simulation.movedSymbols.length === 0
            ? ' — no movement applied yet'
            : `, ${simulation.movedSymbols.length} landmarks moved`)
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
          currentPoints, Object.keys(currentPoints), dotRadius, classes.current, null,
        )}
        {this.renderTracing(
          simulatedPoints, simulation.movedSymbols, dotRadius, classes.simulated,
          currentPoints,
        )}
        {this.renderDisplacements(currentPoints, simulatedPoints, dotRadius)}
      </svg>
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
    points: { [symbol: string]: GeoPoint },
    dotSymbols: string[],
    dotRadius: number,
    hueClass: string,
    against: { [symbol: string]: GeoPoint } | null,
  ) {
    let outlines = buildOutlines(points);
    if (against !== null) {
      const reference: { [id: string]: Array<[number, number]> } = {};
      buildOutlines(against).forEach((outline) => {
        reference[outline.id] = outline.points;
      });
      // A movement smaller than a pixel is not a movement. Some outlines are
      // built in a facial frame scaled by the N–Me height (sella, the orbital
      // rim, the ear-rod ring), so moving Menton perturbs them by a hundredth of
      // a pixel — enough to fail an exact comparison, far too little to mean
      // anything. The tolerance keeps those structures honestly single-drawn.
      outlines = outlines.filter((outline) => {
        const before = reference[outline.id];
        if (before === undefined || before.length !== outline.points.length) {
          return true;
        }
        return outline.points.some(([x, y], i) => (
          Math.abs(x - before[i][0]) > 1 || Math.abs(y - before[i][1]) > 1
        ));
      });
    }
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
   * A displacement vector per moved landmark: where the point was, where the
   * plan puts it. Without these the two tracings read as an unexplained double
   * exposure; with them the figure says which structures were moved and by how
   * much in which direction.
   */
  private renderDisplacements(
    current: { [symbol: string]: GeoPoint },
    simulated: { [symbol: string]: GeoPoint },
    dotRadius: number,
  ) {
    const head = dotRadius * 2.4;
    const arrows: JSX.Element[] = [];
    Object.keys(current).forEach((symbol) => {
      const from = current[symbol];
      const to = simulated[symbol];
      if (to === undefined) {
        return;
      }
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      // An arrow shorter than its own head is noise, not information.
      if (len < dotRadius * 3.5) {
        return;
      }
      const ux = dx / len;
      const uy = dy / len;
      const bx = to.x - ux * head;
      const by = to.y - uy * head;
      const px = -uy * head * 0.45;
      const py = ux * head * 0.45;
      arrows.push(
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
        </g>,
      );
    });
    return <g>{arrows}</g>;
  }

  private renderLegend(simulation: Simulation) {
    const { plan } = this.state;
    const { scaleFactor } = this.props;
    const parts = describePlan(plan);
    const planes: string[] = [];
    if (simulation.mandibleReference !== null) {
      planes.push(
        `mandibular movement along the ${simulation.mandibleReference.name} ` +
        `(${simulation.mandibleReference.from})`,
      );
    }
    if (simulation.maxillaReference !== null) {
      planes.push(
        `maxillary movement along the ${simulation.maxillaReference.name} ` +
        `(${simulation.maxillaReference.from}), impaction perpendicular to it`,
      );
    }
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
          {parts.length > 0 ? (
            <span className={classes.legend_plan}>{parts.join(' · ')}</span>
          ) : (
            <span className={classes.legend_plan}>
              No movement applied — move a slider to simulate
            </span>
          )}
        </div>
        {planes.length > 0 ? (
          <p className={classes.legend_note}>
            Millimetres are measured on the planes this tracing supplies —{' '}
            {planes.join('; ')}
            {scaleFactor !== null
              ? `. Converted to pixels at this film’s calibration of ${formatMmPx(scaleFactor, 3)} mm/px`
              : ''}
            .
          </p>
        ) : null}
        <p className={classes.legend_note}>
          Both tracings are the same anatomical curves the editor draws, built
          from landmark positions — the simulated one from the moved landmarks. A
          structure no control moves (the cranial base, Articulare, the nasal
          bones) is drawn once, in cyan: a violet dashed curve appears only where
          this plan actually moves something, and each arrow runs from a
          landmark’s plotted position to its simulated one.
        </p>
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
    return (
      <div className={classes.panel}>
        <div className={classes.panel_head}>
          <span className={classes.panel_title}>Plan</span>
          <span className={classes.panel_sub}>
            {isPlanEmpty(plan)
              ? 'Nothing moved yet'
              : `${simulation.movedSymbols.length} landmarks moved`}
          </span>
        </div>
        <div className={classes.panel_scroll}>
          <p className={classes.disclaimer}>
            <strong>This is a geometric simulation.</strong> It moves the plotted
            landmarks — and the tracing derived from them — by the amounts you
            set, and recomputes the analysis from the moved points. It is a tool
            for treatment-planning discussion. It is <em>not</em> a growth
            prediction, not a surgical outcome prediction, and it models no bone
            remodelling, no dental compensation, no autorotation and no relapse.
          </p>

          {controls.map((control) => this.renderControl(control, simulation))}

          {this.renderSoftTissue()}

          {this.renderTable(table)}
        </div>
      </div>
    );
  }

  /**
   * A slider, with the plane its millimetres are actually measured along named
   * in the help text whenever the movement is engaged. The plane is chosen from
   * what the tracing carries (occlusal → palatal → facial line), so the control
   * must report the one that was used rather than the one it prefers.
   */
  private renderControl(control: ControlAvailability, simulation: Simulation) {
    const { spec, isAvailable, reason } = control;
    const value = valueForControl(this.state.plan, spec.id);
    const described = describeMovement(spec, value);
    const reference = spec.id === 'mandible'
      ? simulation.mandibleReference
      : (spec.id === 'maxilla' || spec.id === 'impaction')
        ? simulation.maxillaReference
        : null;
    const help = reference !== null
      ? `${spec.description} ${spec.id === 'impaction' ? 'Perpendicular to' : 'Measured along'}` +
        ` the ${reference.name} (${reference.from}).`
      : spec.description;
    return (
      <div
        key={spec.id}
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
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          disabled={!isAvailable}
          title={isAvailable ? help : (reason || undefined)}
          aria-label={`${spec.label} — ${spec.negative} to ${spec.positive}, in ${spec.unit}`}
          onChange={this.handleControlChange.bind(this, spec.id)}
        />
        <div className={classes.control_scale} aria-hidden="true">
          <span>{`${Math.abs(spec.min)}${spec.unit} ${spec.negative}`}</span>
          <span className={classes.control_zero}>0</span>
          <span>{`${spec.max}${spec.unit} ${spec.positive}`}</span>
        </div>
        {reason !== null ? (
          <p className={classes.control_reason}>{reason}</p>
        ) : value !== 0 ? (
          <p className={classes.control_help}>{help}</p>
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
              Soft-tissue landmarks move by a stated fraction of the hard-tissue
              movement underneath them. These are <strong>mean ratios</strong>{' '}
              from the orthognathic and incisor-retraction literature; individual
              response varies by roughly ±0.3, so read the simulated profile as a
              direction, not a measurement. Lip thickness change, lip strain,
              muscle adaptation and relapse are not modelled. Glabella and
              soft-tissue nasion are held — nothing here moves the cranium or the
              nasal bones.
            </p>
            {rows.length > 0 ? (
              <ul className={classes.soft_list}>
                {rows.map(({ ratio, driver, value }) => (
                  <li key={ratio.symbol} className={classes.soft_row}>
                    <span className={classes.soft_symbol}>{ratio.symbol}</span>
                    <span className={classes.soft_name}>{ratio.name}</span>
                    <span className={classes.soft_ratio}>
                      {value.toFixed(1)} × {driver}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={classes.soft_empty}>
                No movement is being passed to the soft tissue yet.
              </p>
            )}
          </React.Fragment>
        ) : (
          <p className={classes.soft_note}>
            Every soft-tissue landmark stays exactly where it was plotted, so the
            simulated profile is the patient’s current profile and only the
            skeletal and dental geometry changes. The E-line measurements will
            move only insofar as their own landmarks are held still.
          </p>
        )}
      </div>
    );
  }

  private renderTable(table: SimulationTable) {
    return (
      <div className={classes.values}>
        <div className={classes.values_head}>
          <span className={classes.values_title}>Key measurements</span>
          <span className={classes.values_sub}>Simulated − current</span>
        </div>
        {table.rows.length === 0 ? (
          <p className={classes.values_empty}>
            None of the key measurements can be computed from this tracing yet.
            Complete an analysis and they will appear here with their simulated
            change.
          </p>
        ) : (
          <table className={classes.table}>
            <thead>
              <tr>
                <th className={classes.col_name}>Measurement</th>
                <th className={classes.col_num}>Current</th>
                <th className={classes.col_num}>Simulated</th>
                <th className={classes.col_num}>Change</th>
                <th className={classes.col_norm}>Norm</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => this.renderValueRow(row))}
            </tbody>
          </table>
        )}

        <div className={classes.footnotes}>
          {table.unavailableSymbols.length > 0 ? (
            <p className={classes.footnote}>
              Not computable from this tracing, so absent above:{' '}
              {table.unavailableSymbols.join(', ')}. Plot the landmarks those
              measurements are built from (switch the analysis in the toolbar and
              the missing points are plotted for you) and they will appear.
            </p>
          ) : null}
          {table.isLinearPendingScale ? (
            <p className={cx(classes.footnote, classes.footnote__warn)}>
              Millimetre measurements are withheld: this film carries no mm/px
              calibration, so there is no honest millimetre value to report — and
              no way to interpret a millimetre movement either. Set the scale from
              the calibration chip in the toolbar. Angular values and angular
              movements are scale-independent and unaffected.
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
            Also absent, and not because of this tracing:{' '}
            {NOT_INTERPRETED.join(' and ')}. Both are defined by an analysis
            module but interpreted by none, so this app reports them nowhere —
            and this view will not compute them behind the analyses’ back to fill
            the gap.
          </p>
          <p className={classes.footnote}>
            Every value is computed by the same code path as the Summary dialog
            and the printed report — the analysis modules evaluated against the
            moved landmarks — so the current column always agrees with them.
          </p>
          <p className={classes.footnote}>
            Nothing here is saved. The plan lives in this view only: the tracing,
            its undo history, the image exports and the clinical report are
            untouched, and closing this view discards the plan.
          </p>
        </div>
      </div>
    );
  }

  private renderValueRow(entry: SimulationRow) {
    const { row, norm, isCurrentInNorm, isSimulatedInNorm } = entry;
    const unit = getUnitSuffix(row.landmark);
    const hasChange = Math.abs(row.change) >= 0.05;
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
        >
          {printNumber(row.t1)}{unit}
        </td>
        <td
          className={cx(classes.cell_num, classes.cell_sim, {
            [classes.cell_in]: hasChange && isSimulatedInNorm === true,
            [classes.cell_out]: isSimulatedInNorm === false,
          })}
        >
          {printNumber(row.t2)}{unit}
        </td>
        <td className={cx(classes.cell_num, classes.cell_change)}>
          {hasChange ? `${printSigned(row.change)}${unit}` : '—'}
        </td>
        <td className={classes.cell_norm}>
          {norm !== null
            ? `${printNumber(norm.mean)} ± ${printNumber((norm.max - norm.min) / 2)}`
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
}
