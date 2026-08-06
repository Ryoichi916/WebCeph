import * as React from 'react';

import map from 'lodash/map';

// Same formatting/severity conventions as the results table (see index.tsx).
import {
  formatNumber,
  getUnitSuffix,
  getSeverityStars,
} from 'components/AnalysisResultsViewer';

const classes = require('./style.scss');

interface Props {
  /** Categorized results of the active analysis, as passed to the report. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions keyed by symbol, for names and units. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
}

interface Row {
  symbol: string;
  name: string | null;
  valueLabel: string;
  normLabel: string;
  /** Standardized deviation (value − mean) / SD, clamped to ±3. */
  z: number;
  /** True when the raw z-score fell outside the ±3 SD chart range. */
  clamped: boolean;
  stars: 0 | 1 | 2 | 3;
}

// ---- Geometry (px, SVG user units at 1:1 on the A4 paper) -------------------

/** Content width of the paper (794px A4 − 2 × 52px padding). */
const WIDTH = 690;
/** Left column for measurement symbol + name. */
const LABEL_W = 168;
/** Right column for the patient's value. */
const VALUE_W = 64;
const AXIS_L = LABEL_W + 12;
const AXIS_R = WIDTH - VALUE_W - 16;
const HEADER_H = 24;
const ROW_H = 30;
const FOOT_H = 6;

/** Longest measurement name that fits the label column at 9.5px. */
const MAX_NAME_CHARS = 34;

// Severity ink indexed by star count; matches the results-table chips.
const SEVERITY_INK = ['#1565C0', '#B26A00', '#C62828', '#C62828'];

/** Chart x-coordinate of a standardized deviation z ∈ [−3, +3]. */
const xOf = (z: number) => AXIS_L + ((z + 3) / 6) * (AXIS_R - AXIS_L);

const AXIS_TICKS: Array<{ z: number; label: string }> = [
  { z: -3, label: '−3 SD' },
  { z: -2, label: '−2' },
  { z: -1, label: '−1' },
  { z: 0, label: 'Mean' },
  { z: 1, label: '+1' },
  { z: 2, label: '+2' },
  { z: 3, label: '+3 SD' },
];

/**
 * Flattens the categorized results into one wigglegram row per measurement.
 * A measurement shared by several findings appears once (first occurrence),
 * mirroring the cross-reference convention of the results table. Measurements
 * without a usable norm (SD ≤ 0) cannot be standardized and are skipped.
 */
const buildRows = (
  results: Props['results'],
  landmarksBySymbol: Props['landmarksBySymbol'],
): Row[] => {
  const rows: Row[] = [];
  const seen: { [symbol: string]: true | undefined } = {};
  results.forEach(({ relevantComponents }) => {
    relevantComponents.forEach(({ symbol, value, mean, min, max }) => {
      if (seen[symbol] === true) {
        return;
      }
      seen[symbol] = true;
      const sd = (max - min) / 2;
      if (sd <= 0) {
        return;
      }
      const landmark = landmarksBySymbol[symbol];
      const unit = getUnitSuffix(landmark);
      const rawZ = (value - mean) / sd;
      const rawName =
        landmark !== undefined &&
        landmark.name !== undefined &&
        landmark.name !== symbol
          ? landmark.name
          : null;
      const name = rawName !== null && rawName.length > MAX_NAME_CHARS
        ? `${rawName.slice(0, MAX_NAME_CHARS - 1)}…`
        : rawName;
      rows.push({
        symbol,
        name,
        valueLabel: `${formatNumber(value)}${unit}`,
        normLabel: `${formatNumber(mean)} ± ${formatNumber(sd)}`,
        z: Math.max(-3, Math.min(3, rawZ)),
        clamped: Math.abs(rawZ) > 3,
        stars: getSeverityStars(value, mean, min, max),
      });
    });
  });
  return rows;
};

/**
 * The classic cephalometric "wigglegram" (norm-deviation polygon): one row per
 * measurement, each scaled to its own standard deviation, with the norm band
 * shaded (±1 SD dark, ±2 SD light) and the patient's standardized values
 * joined dot-to-dot down the rows. Pure inline SVG — prints exactly.
 */
const Wigglegram = ({ results, landmarksBySymbol }: Props) => {
  const rows = buildRows(results, landmarksBySymbol);
  if (rows.length < 2) {
    // A one-point polygon carries no profile information; the table suffices.
    return null;
  }

  const chartTop = HEADER_H;
  const chartBottom = HEADER_H + rows.length * ROW_H;
  const height = chartBottom + FOOT_H;

  const centerY = (i: number) => chartTop + i * ROW_H + ROW_H / 2;
  const polyPoints = map(rows, (r, i) => `${xOf(r.z)},${centerY(i)}`).join(' ');

  return (
    <div className={classes.wiggle_section}>
      <div className={classes.section_label}>Norm deviation profile</div>
      <svg
        className={classes.wiggle_svg}
        width={WIDTH}
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={
          'Wigglegram: each measurement plotted as standard deviations ' +
          'from its norm mean'
        }
      >
        {/* Norm bands: ±2 SD light, ±1 SD dark — the polygon's spine. */}
        <rect
          x={xOf(-2)}
          y={chartTop}
          width={xOf(2) - xOf(-2)}
          height={chartBottom - chartTop}
          fill="#EBF3FB"
        />
        <rect
          x={xOf(-1)}
          y={chartTop}
          width={xOf(1) - xOf(-1)}
          height={chartBottom - chartTop}
          fill="#D6E7F7"
        />

        {/* Row separators (hairlines) and frame. */}
        {map(rows, (r, i) => i > 0 ? (
          <line
            key={`sep-${r.symbol}`}
            x1={0}
            y1={chartTop + i * ROW_H}
            x2={WIDTH}
            y2={chartTop + i * ROW_H}
            stroke="#EDF1F5"
            strokeWidth={1}
          />
        ) : null)}
        <line
          x1={0} y1={chartTop} x2={WIDTH} y2={chartTop}
          stroke="#C3CCD6" strokeWidth={1}
        />
        <line
          x1={0} y1={chartBottom} x2={WIDTH} y2={chartBottom}
          stroke="#C3CCD6" strokeWidth={1}
        />

        {/* SD ticks and header labels; the mean axis is emphasized. */}
        {map(AXIS_TICKS, ({ z, label }) => (
          <g key={`tick-${z}`}>
            <line
              x1={xOf(z)}
              y1={chartTop}
              x2={xOf(z)}
              y2={chartBottom}
              stroke={z === 0 ? '#10538F' : '#C3CCD6'}
              strokeWidth={z === 0 ? 1.25 : 1}
              strokeDasharray={z === 0 || Math.abs(z) === 3 ? undefined : '1 3'}
            />
            <text
              className={classes.wiggle_tick_label}
              x={xOf(z)}
              y={chartTop - 8}
              textAnchor="middle"
              fill={z === 0 ? '#10538F' : '#7B8794'}
              fontWeight={z === 0 ? 700 : 500}
            >
              {label}
            </text>
          </g>
        ))}

        {/* Row labels (left) and patient values (right). */}
        {map(rows, (r, i) => {
          const y = centerY(i);
          const ink = SEVERITY_INK[r.stars];
          return (
            <g key={`row-${r.symbol}`}>
              <text
                className={classes.wiggle_symbol}
                x={2}
                y={r.name !== null ? y - 2 : y + 3.5}
              >
                {r.symbol}
              </text>
              {r.name !== null ? (
                <text className={classes.wiggle_name} x={2} y={y + 10}>
                  {r.name}
                </text>
              ) : null}
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
            </g>
          );
        })}

        {/* The wiggle line, then the severity-colored dots on top. */}
        <polyline
          points={polyPoints}
          fill="none"
          stroke="#52616F"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {map(rows, (r, i) => {
          const y = centerY(i);
          const ink = SEVERITY_INK[r.stars];
          if (r.clamped) {
            // Off-chart value: an outward-pointing marker at the ±3 SD edge.
            const dir = r.z > 0 ? 1 : -1;
            const tip = xOf(r.z) + dir * 4.5;
            const base = xOf(r.z) - dir * 3.5;
            return (
              <path
                key={`dot-${r.symbol}`}
                d={`M ${base} ${y - 4.5} L ${tip} ${y} L ${base} ${y + 4.5} Z`}
                fill={ink}
                stroke="#FFFFFF"
                strokeWidth={1}
              />
            );
          }
          return (
            <circle
              key={`dot-${r.symbol}`}
              cx={xOf(r.z)}
              cy={y}
              r={3.6}
              fill={ink}
              stroke="#FFFFFF"
              strokeWidth={1.2}
            />
          );
        })}
      </svg>
      <div className={classes.wiggle_legend}>
        Each measurement scaled to its own standard deviation
        <span className={classes.legend_dot}>·</span>
        shaded band: norm mean ± 1 SD, lighter ± 2 SD
        <span className={classes.legend_dot}>·</span>
        ▸ beyond ± 3 SD
      </div>
    </div>
  );
};

export default Wigglegram;
