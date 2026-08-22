import * as React from 'react';

import map from 'lodash/map';

// Same formatting/severity conventions as the results table and the
// wigglegram (see Wigglegram.tsx): the printed report never invents its own.
import {
  getUnitSuffix,
  formatRange,
  displayMinus,
} from 'components/AnalysisResultsViewer';
import { hasNorm, isSdBand } from 'analyses/helpers';

import { printNumber } from './copy';

const classes = require('./style.scss');

interface Props {
  /** Categorized results of the active analysis, as passed to the report. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions keyed by symbol, for names and units. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /**
   * Whether to print the "Target range profile" section label above the
   * chart. See `Wigglegram`'s identical prop — the combined report suppresses
   * it for the same reason.
   */
  showLabel?: boolean;
  /**
   * Whether to print the key that explains the pill, tick and marker. See
   * `Wigglegram`'s identical prop.
   */
  showKey?: boolean;
}

interface Row {
  symbol: string;
  nameLines: string[];
  valueLabel: string;
  normLabel: string;
  /**
   * Signed position of the value relative to the target, as a fraction of the
   * half-width of the published range: −1 at the lower bound, 0 at the
   * target, +1 at the upper bound. Unclamped — the marker travels past ±1 for
   * a value outside the range and is drawn amber there.
   */
  frac: number;
  /** True once the raw fraction runs past the chart's own drawn domain. */
  offChart: boolean;
  /** True once the value lies outside the published [min, max]. */
  outOfRange: boolean;
}

// ---- Geometry (px, SVG user units at 1:1 on the A4 paper) -------------------
// Identical column geometry to Wigglegram.tsx (WIDTH, LABEL_W, VALUE_W, row
// heights) so the two chart types, printed on the same page width, line up —
// while everything drawn *inside* the chart area is deliberately a different
// shape (a per-row pill and tick, not a shared shaded column and a
// connecting polyline), so this can never be mistaken for the SD wigglegram
// beside it.
const WIDTH = 690;
const LABEL_W = 168;
const VALUE_W = 64;
const AXIS_L = LABEL_W + 12;
const AXIS_R = WIDTH - VALUE_W - 16;
const HEADER_H = 24;
const ROW_H_1 = 30;
const ROW_H_2 = 36;
const FOOT_H = 6;

const NAME_CHARS_PER_LINE = 34;
const NAME_MAX_LINES = 2;

/** Body ink vs. the one severity tone a range component can ever carry: a
 * target-range row never earns stars (see `getSeverityStars`), so — matching
 * the results table's own `cell_value__warn`-only treatment of these rows —
 * there is no second, more severe tier here either. */
const INK_BODY = '#1F2933';
const INK_WARN = '#B26A00';

/**
 * Path `d` for the off-chart marker: an outward-pointing triangle at the
 * clamped edge, the same shape `Wigglegram` draws for a value beyond ±3 SD.
 * A plain function (not inlined into the JSX below) because tslint-react's
 * JSX-alignment walker cannot cross an IIFE inside a JSX expression — it
 * throws on the identical pattern already in `Wigglegram.tsx`'s own history.
 */
const offChartMarkerPath = (x: number, y: number, frac: number): string => {
  const dir = frac > 0 ? 1 : -1;
  const tip = x + dir * 4.5;
  const base = x - dir * 3.5;
  return `M ${base} ${y - 4.5} L ${tip} ${y} L ${base} ${y + 4.5} Z`;
};

/** Fraction of the half-range the chart draws before clamping the marker to
 * an edge arrow — room either side of the target range itself (±1) to show a
 * value that has overshot it without the chart growing unboundedly for one
 * extreme outlier. */
const DOMAIN = 1.6;

const xOf = (frac: number) =>
  AXIS_L + ((frac + DOMAIN) / (2 * DOMAIN)) * (AXIS_R - AXIS_L);

const AXIS_TICKS: Array<{ frac: number; label: string }> = [
  { frac: -1, label: 'Lower bound' },
  { frac: 0, label: 'Target' },
  { frac: 1, label: 'Upper bound' },
];

/** Identical word-wrap rule to Wigglegram.tsx, kept local so neither chart
 * depends on the other's internals. */
const wrapName = (name: string): string[] => {
  const words = name.split(' ');
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (candidate.length <= NAME_CHARS_PER_LINE || line === '') {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line !== '') {
    lines.push(line);
  }
  if (lines.length <= NAME_MAX_LINES) {
    return lines;
  }
  const kept = lines.slice(0, NAME_MAX_LINES);
  const last = kept[NAME_MAX_LINES - 1];
  kept[NAME_MAX_LINES - 1] = `${last.slice(0, NAME_CHARS_PER_LINE - 1)}…`;
  return kept;
};

/**
 * Flattens the categorized results into one target-band row per measurement
 * whose norm is a published **target** — `isTarget` (see `AnalysisComponent`
 * and `TARGET_RANGE` in `analyses/helpers`), currently Tweed's FMA, IMPA and
 * FMIA and no other shipped component. A measurement shared by several
 * findings appears once (first occurrence), mirroring `Wigglegram`'s and the
 * results table's own de-duplication.
 *
 * Deliberately **not** every plain-range component (Björk's gonial halves,
 * Jarabak's ratio): those authors published a bound, not a figure a clinician
 * treats toward, so there is no "target" to draw a tick at — see `RANGE` vs
 * `TARGET_RANGE`. Printing one for them would manufacture a target nobody
 * stated, exactly the invented-figure problem those two constants exist to
 * prevent.
 */
export const buildRows = (
  results: Props['results'],
  landmarksBySymbol: Props['landmarksBySymbol'],
): Row[] => {
  const rows: Row[] = [];
  const seen: { [symbol: string]: true | undefined } = {};
  results.forEach(({ relevantComponents }) => {
    relevantComponents.forEach((component) => {
      const {
        symbol, value, mean, min, max, band, isTarget,
      } = component;
      if (seen[symbol] === true) {
        return;
      }
      seen[symbol] = true;
      if (
        isTarget !== true || isSdBand(band) || !hasNorm(mean, min, max)
      ) {
        return;
      }
      const halfRange = (max - min) / 2;
      if (!(halfRange > 0)) {
        return;
      }
      const landmark = landmarksBySymbol[symbol];
      const unit = getUnitSuffix(landmark);
      const rawName =
        landmark !== undefined &&
        landmark.name !== undefined &&
        landmark.name !== symbol
          ? landmark.name
          : null;
      rows.push({
        symbol,
        nameLines: rawName !== null ? wrapName(rawName) : [],
        valueLabel: `${printNumber(value)}${unit}`,
        normLabel:
          `target ${printNumber(mean)} · range ` +
          `${displayMinus(formatRange(min, max))}`,
        frac: (value - mean) / halfRange,
        offChart: Math.abs((value - mean) / halfRange) > DOMAIN,
        outOfRange: value < min || value > max,
      });
    });
  });
  return rows;
};

/**
 * How to read the chart. Printed under the chart in the single-analysis
 * report and once in the combined report's front matter — exported so the
 * two can never drift apart, matching `WigglegramKey`'s own convention.
 */
export const TargetBandKey = () => (
  <span>
    Target range: green pill is the author's published target range
    <span className={classes.legend_dot}>·</span>
    tick: the target itself
    <span className={classes.legend_dot}>·</span>
    dot: this patient's value, amber outside the range
    <span className={classes.legend_dot}>·</span>
    ◂ ▸ well beyond it
    <span className={classes.legend_dot}>·</span>
    not a standard-deviation chart — these norms are published targets, not a
    mean ± SD (see the note above)
  </span>
);

/**
 * The target-range companion to `Wigglegram`, for the norms this app reports
 * as a published **target** rather than a mean ± SD (Tweed's FMA, IMPA and
 * FMIA — see `buildRows`). One row per measurement: a shaded pill for the
 * author's target range, a tick at the target itself, and the patient's value
 * as a dot that can slide past the pill when the value overshoots it.
 *
 * Deliberately not a wigglegram redrawn on a different scale: there is no
 * standard deviation here to standardize against, so rows are **not** joined
 * by a connecting line (a wigglegram's line is what turns several SD readings
 * into one profile; joining unrelated target ranges the same way would imply
 * the same kind of comparison between them that a real SD profile makes) and
 * the shaded region is a per-row pill rather than one column shaded the same
 * colour as `Wigglegram`'s SD bands. Pure inline SVG — prints exactly.
 */
const TargetBand = ({
  results, landmarksBySymbol, showLabel = true, showKey = true,
}: Props) => {
  const rows = buildRows(results, landmarksBySymbol);
  if (rows.length < 1) {
    return null;
  }

  const rowHeight = rows.some((r) => r.nameLines.length > 1)
    ? ROW_H_2
    : ROW_H_1;
  const chartTop = HEADER_H;
  const chartBottom = HEADER_H + rows.length * rowHeight;
  const height = chartBottom + FOOT_H;
  const centerY = (i: number) => chartTop + i * rowHeight + rowHeight / 2;

  return (
    <div className={classes.tband_section}>
      {showLabel ? (
        <div className={classes.section_label}>Target range profile</div>
      ) : null}
      <svg
        className={classes.wiggle_svg}
        width={WIDTH}
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={
          'Target range chart: each measurement plotted against its ' +
          'published target range, not a standard deviation'
        }
      >
        {/* Row separators and frame — same hairline treatment as
            `Wigglegram`, so the two charts read as one family of furniture
            even though what is drawn inside each row differs. */}
        {map(rows, (r, i) => i > 0 ? (
          <line
            key={`sep-${r.symbol}`}
            x1={0.5}
            y1={chartTop + i * rowHeight}
            x2={WIDTH - 0.5}
            y2={chartTop + i * rowHeight}
            stroke="#EDF1F5"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        ) : null)}
        <line
          x1={0.5} y1={chartTop} x2={WIDTH - 0.5} y2={chartTop}
          stroke="#C3CCD6" strokeWidth={1} shapeRendering="crispEdges"
        />
        <line
          x1={0.5} y1={chartBottom} x2={WIDTH - 0.5} y2={chartBottom}
          stroke="#C3CCD6" strokeWidth={1} shapeRendering="crispEdges"
        />

        {/* Header ticks: "Lower bound / Target / Upper bound", positioned
            where every row's own pill starts, centres and ends — not the SD
            multiples `Wigglegram` prints, because these rows carry no SD. */}
        {map(AXIS_TICKS, ({ frac, label }) => (
          <text
            key={`tick-${frac}`}
            className={classes.wiggle_tick_label}
            x={xOf(frac)}
            y={chartTop - 8}
            textAnchor="middle"
            fill={frac === 0 ? '#2E7D32' : '#7B8794'}
            fontWeight={frac === 0 ? 700 : 500}
          >
            {label}
          </text>
        ))}

        {map(rows, (r, i) => {
          const y = centerY(i);
          const ink = r.outOfRange ? INK_WARN : INK_BODY;
          const nameCount = r.nameLines.length;
          const symbolY = nameCount === 0
            ? y + 3.5
            : (nameCount === 1 ? y - 2 : y - 6);
          const clampedFrac = Math.max(-DOMAIN, Math.min(DOMAIN, r.frac));
          return (
            <g key={`row-${r.symbol}`}>
              {/* The extended track: room either side of the target range
                  for a value that overshoots it, so the marker below always
                  has somewhere to sit rather than pinning to the pill's own
                  edge. */}
              <line
                x1={AXIS_L} y1={y} x2={AXIS_R} y2={y}
                stroke="#DCE3EA" strokeWidth={1.5} strokeLinecap="round"
              />
              {/* The target range itself: a pill, not a full-height shaded
                  column — the shape that keeps this chart from reading as a
                  second wigglegram. */}
              <rect
                x={xOf(-1)}
                y={y - 5}
                width={xOf(1) - xOf(-1)}
                height={10}
                rx={5}
                fill="#E6F4EA"
                stroke="#2E7D32"
                strokeWidth={1}
              />
              {/* The target itself, ticked inside the pill. */}
              <line
                x1={xOf(0)} y1={y - 8} x2={xOf(0)} y2={y + 8}
                stroke="#2E7D32" strokeWidth={1.5}
              />
              <text
                className={classes.wiggle_symbol}
                x={2}
                y={symbolY}
              >
                {r.symbol}
              </text>
              {map(r.nameLines, (lineText, lineIndex) => (
                <text
                  key={`name-${lineIndex}`}
                  className={classes.wiggle_name}
                  x={2}
                  y={symbolY + 12 + lineIndex * 10}
                >
                  {lineText}
                </text>
              ))}
              <text
                className={classes.wiggle_value}
                x={WIDTH - 2}
                y={y - 2}
                textAnchor="end"
                fill={ink}
              >
                {r.valueLabel}
              </text>
              <text
                className={classes.wiggle_norm}
                x={WIDTH - 2}
                y={y + 10}
                textAnchor="end"
              >
                {r.normLabel}
              </text>
              {/* The value marker, on top of the track and pill: a diamond
                  rather than `Wigglegram`'s circle, so the two chart types
                  are distinguishable at a glance even in a photocopy that
                  has lost the colour difference. */}
              {r.offChart ? (
                <path
                  d={offChartMarkerPath(xOf(clampedFrac), y, r.frac)}
                  fill={ink}
                  stroke="#FFFFFF"
                  strokeWidth={1}
                />
              ) : (
                <path
                  d={
                    `M ${xOf(clampedFrac)} ${y - 5} ` +
                    `L ${xOf(clampedFrac) + 5} ${y} ` +
                    `L ${xOf(clampedFrac)} ${y + 5} ` +
                    `L ${xOf(clampedFrac) - 5} ${y} Z`
                  }
                  fill={ink}
                  stroke="#FFFFFF"
                  strokeWidth={1.2}
                />
              )}
            </g>
          );
        })}
      </svg>
      {showKey ? (
        <div className={classes.wiggle_legend}>
          <TargetBandKey />
        </div>
      ) : null}
    </div>
  );
};

export default TargetBand;
