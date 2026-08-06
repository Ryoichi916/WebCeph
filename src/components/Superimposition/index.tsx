import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import { saveAs } from 'file-saver';

import IconPrint from 'material-ui/svg-icons/action/print';
import IconClose from 'material-ui/svg-icons/navigation/close';
import IconImage from 'material-ui/svg-icons/image/photo';

import Props, { TimepointRecord } from './props';
import { sharedBasisIds } from './selectors';

// Geometry: the registration transform, the framing and the change table all
// come from the shared pure module, and the anatomical curves from the very
// module the editor draws with — never a second implementation.
import {
  buildRegistration,
  buildChangeTable,
  superimpositionFrame,
  transformLandmarks,
  getBasis,
  REGISTRATION_BASES,
  RegistrationBasisId,
  formatInterval,
  basisSymbols,
  ChangeRow,
  BarScale,
  Box,
} from 'analyses/superimposition';
import { buildOutlines, outlineToSvgPath } from 'components/TracingViewer/outlines';

// Number formatting and unit suffixes are the app's, not this view's: the same
// helpers the Summary dialog and the printed report use.
import { getUnitSuffix } from 'components/AnalysisResultsViewer';
import { printNumber, printSigned } from 'components/ClinicalReport/copy';
import { formatMmPx } from 'components/TracingToolbar/CalibrationDialog';

import {
  getImageTypeLabel,
  formatCaptureDate,
  parseCaptureDate,
} from 'utils/records';

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

interface State {
  t1Id: string | null;
  t2Id: string | null;
  basisId: RegistrationBasisId | null;
  isExporting: boolean;
  exportError: string | null;
}

/** A timepoint as the dropdown and the legend name it. */
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
 * Legend/PNG label for a film in a slot. The slot name (T1 = earlier, T2 =
 * later) always leads, because that is what the change columns are named after;
 * the film's own timepoint label is added whenever it differs, so a film filed
 * as "T2" but placed in the T1 slot cannot be misread.
 */
const shortLabel = (t: TimepointRecord, slot: 'T1' | 'T2'): string => {
  const own = t.timepoint !== null ? t.timepoint.trim() : '';
  const head = own !== '' && own !== slot ? `${slot} (${own})` : slot;
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
 * Cephalometric superimposition of two timepoints.
 *
 * The earliest tracing (T1) and the latest (T2) are brought into one coordinate
 * frame by a rigid registration on a structure both carry — the anterior
 * cranial base by default — and drawn over T1's film, dimmed for context. The
 * table beside it quantifies every measurement both films can compute, as
 * T1, T2 and the signed change.
 *
 * Everything on screen is measured, not modelled: there is no prediction, no
 * growth forecast and no norm here. The change *is* the finding.
 */
export default class Superimposition extends React.PureComponent<Props, State> {
  state: State = {
    t1Id: null,
    t2Id: null,
    basisId: null,
    isExporting: false,
    exportError: null,
  };

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

  private selectBasis = (basisId: RegistrationBasisId) => {
    this.setState({ basisId, exportError: null });
  };

  // ---- Rendering ------------------------------------------------------------

  private renderView() {
    const { patient } = this.props;
    const pair = this.getPair();
    const patientName = patient !== null && patient.name ? patient.name : '—';
    const chartId = patient !== null && patient.chartId ? patient.chartId : null;

    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Superimposition"
      >
        {/* Print-only running identity, first in flow so it heads the paper.
            A detached sheet must be attributable to a patient. */}
        <div className={classes.print_head} aria-hidden="true">
          <span className={classes.print_head_title}>
            Cephalometric superimposition
          </span>
          <span className={classes.print_head_id}>
            {patientName}{chartId !== null ? ` · ${chartId}` : ''}
          </span>
        </div>

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
    // Honour the user's choice while both films can supply it; otherwise fall
    // back to the first registration they share (cranial base when possible).
    const basisId = this.state.basisId !== null &&
      shared.indexOf(this.state.basisId) !== -1
      ? this.state.basisId
      : shared[0];

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
            <div className={classes.figure}>
              {frame !== null
                ? this.renderSvg(t1, t2, registration.transform, frame, basis.origin)
                : (
                  <div className={classes.empty}>
                    <span className={classes.empty_title}>
                      Not enough plotted geometry to frame
                    </span>
                  </div>
                )}
            </div>
            {this.renderLegend(t1, t2, registration, interval)}
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
      <option key={t.imageId} value={t.imageId}>{describe(t)}</option>
    ));
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
              return (
                <button
                  key={b.id}
                  type="button"
                  className={cx(classes.seg_button, {
                    [classes.seg_button__on]: b.id === basisId,
                  })}
                  disabled={!isShared}
                  aria-pressed={b.id === basisId}
                  title={isShared
                    ? `${b.name} — ${b.description}`
                    : `${b.name} is unavailable: both tracings must carry ` +
                      `${basisSymbols(b).join(', ')}.`}
                  onClick={this.selectBasis.bind(this, b.id)}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /**
   * The superimposition itself. T1's film sits underneath, dimmed, purely as
   * anatomical context; both tracings are drawn from `buildOutlines` — the same
   * curves the editor draws — over it, T1 in cyan and T2 in orange.
   */
  private renderSvg(
    t1: TimepointRecord,
    t2: TimepointRecord,
    transform: ReturnType<typeof buildRegistration>['transform'],
    frame: Box,
    originSymbol: string,
  ) {
    const t1Points = transformLandmarks(t1.landmarks, {
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    });
    const t2Points = transformLandmarks(t2.landmarks, transform);
    const dotRadius = frame.width / 190;
    const fontSize = frame.width / 40;
    const origin = t1Points[originSymbol];

    return (
      <svg
        className={classes.svg}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          `Superimposition of ${describe(t1)} and ${describe(t2)}, ` +
          `registered at ${originSymbol}`
        }
      >
        {t1.src !== null && t1.width !== null && t1.height !== null ? (
          <image
            className={classes.film}
            xlinkHref={t1.src}
            x={0}
            y={0}
            width={t1.width}
            height={t1.height}
            preserveAspectRatio="none"
          />
        ) : null}
        {this.renderTracing(t1Points, dotRadius, classes.t1)}
        {this.renderTracing(t2Points, dotRadius, classes.t2)}
        {origin !== undefined ? (
          <g>
            {/* The registration point is fixed by construction — marking it
                says where the two tracings were made to agree. */}
            <circle
              className={classes.reg_ring}
              cx={origin.x}
              cy={origin.y}
              r={dotRadius * 3.2}
            />
            <text
              className={classes.reg_text}
              x={origin.x + dotRadius * 4.4}
              y={origin.y - dotRadius * 4}
              fontSize={fontSize}
              strokeWidth={fontSize / 3.5}
            >
              {`registered at ${originSymbol}`}
            </text>
          </g>
        ) : null}
      </svg>
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
          {interval !== null ? (
            <span className={classes.legend_interval}>{interval} apart</span>
          ) : null}
        </div>
        <div className={classes.legend_registration}>
          <span className={classes.legend_basis}>{basis.name}</span>
          <span className={classes.legend_numbers}>
            T2 rotated {rotation}° · registration point moved{' '}
            {printNumber(registration.translationPx)} px
            {registration.magnification !== 1
              ? ` · T2 rescaled ×${registration.magnification.toFixed(3)}`
              : ''}
          </span>
        </div>
        <p className={classes.legend_note}>{basis.description}</p>
        {registration.isMagnificationAssumed ? (
          <p className={cx(classes.legend_note, classes.legend_note__warn)}>
            The two films are assumed to be at the same magnification:{' '}
            {t1.scaleFactor === null && t2.scaleFactor === null
              ? 'neither carries an mm/px calibration'
              : `only ${t1.scaleFactor === null ? 'T2' : 'T1'} is calibrated ` +
                `(${formatMmPx((t1.scaleFactor !== null
                  ? t1.scaleFactor
                  : t2.scaleFactor) as number, 3)} mm/px)`}
            . Calibrate both from the toolbar to have the overlay corrected for
            film magnification.
          </p>
        ) : null}
        <p className={classes.legend_note}>
          The film shown is T1’s, dimmed for context; T2 contributes its tracing
          only. Both tracings are the plotted landmarks — nothing here is
          predicted or simulated.
        </p>
      </div>
    );
  }

  private renderChanges(
    changes: ReturnType<typeof buildChangeTable>,
    t1: TimepointRecord,
    t2: TimepointRecord,
    interval: string | null,
  ) {
    return (
      <div className={classes.panel}>
        <div className={classes.panel_head}>
          <span className={classes.panel_title}>Change</span>
          <span className={classes.panel_sub}>
            T2 − T1 · {changes.rowCount}{' '}
            {changes.rowCount === 1 ? 'measurement' : 'measurements'}
            {interval !== null ? ` over ${interval}` : ''}
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
                  <th className={classes.col_bar} />
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

          <div className={classes.footnotes}>
            {changes.oneSidedCount > 0 ? (
              <p className={classes.footnote}>
                {changes.oneSidedCount}{' '}
                {changes.oneSidedCount === 1 ? 'measurement is' : 'measurements are'}{' '}
                omitted: only one of the two tracings yields{' '}
                {changes.oneSidedCount === 1 ? 'it' : 'them'}, so there is no
                change to report. Plot the missing landmarks on that timepoint.
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
            <p className={classes.footnote}>
              These values are properties of each tracing on its own, so they do
              not change with the registration: switching the basis rearranges
              the overlay, never the numbers.
            </p>
            <p className={classes.footnote}>
              Norms are not shown: a superimposition reports change, and a
              change has no norm. Read each value against its analysis in the
              Summary or the clinical report.
            </p>
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
    // full-width one that would read as a maximal change.
    const scale = scales[row.kind];
    const fraction = scale !== undefined && scale.max > 0 && scale.count > 1
      ? Math.min(1, Math.abs(row.change) / scale.max)
      : 0;
    const isForward = row.change >= 0;
    return (
      <tr key={row.symbol}>
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
   * same registration and the same outline module the screen uses.
   */
  private handleExportPng = () => {
    const pair = this.getPair();
    if (pair === null) {
      return;
    }
    const { t1, t2 } = pair;
    const shared = sharedBasisIds(t1.availableBasisIds, t2.availableBasisIds);
    const basisId = this.state.basisId !== null &&
      shared.indexOf(this.state.basisId) !== -1
      ? this.state.basisId
      : shared[0];
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
    this.setState({ isExporting: true, exportError: null });
    renderSuperimpositionSnapshot({
      filmSrc: t1.src,
      filmWidth: t1.width,
      filmHeight: t1.height,
      t1: t1.landmarks,
      t2: t2.landmarks,
      transform: registration.transform,
      frame,
      t1Label: shortLabel(t1, 'T1'),
      t2Label: shortLabel(t2, 'T2'),
      registrationLabel: `Registered on ${basis.name}`,
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
      const stem = (patient !== null
        ? [patient.chartId, patient.name].filter((p) => !!p).join('_')
        : 'superimposition').replace(/[^\w.\-]+/g, '_');
      saveAs(blob, `${stem || 'superimposition'}-superimposition.png`);
      this.setState({ isExporting: false });
    });
  };
}
