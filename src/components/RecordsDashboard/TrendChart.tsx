import * as React from 'react';

import * as cx from 'classnames';

import RaisedButton from 'material-ui/RaisedButton';
import IconAdd from 'material-ui/svg-icons/content/add';

import { PatientRecord } from 'store/reducers/workspace';

// The same formatters the Summary dialog, the printed report and the findings
// table beside this chart use. A chart that rounded or signed a value its own
// Summary sets differently would be a second opinion, not a second view.
import {
  caveatMarkers,
  displayDeviation,
  displayNorm,
  displayNumber,
  displaySigned,
  roundToDisplay,
} from 'components/AnalysisResultsViewer';

// What a *change* between two films may be read as. The superimposition view
// owns this rule, the findings table reads it from there, and so does this
// chart: one reproducibility floor for the whole app.
import {
  isWithinPlottingError,
  MeasurementKind,
  PLOTTING_ERROR,
} from 'analyses/superimposition';

import {
  formatCaptureDate,
  formatInterval,
  getTimepointToken,
  parseCaptureDate,
} from 'utils/records';

import { formatAgeFull, getAgeInYears } from 'utils/patient';

// The rows this chart plots are the rows that panel tabulates — built by its
// own builder, from the same read-only evaluation, so a value cannot be graded
// one way in the table and another way in the chart above it.
import { buildValueRows, FilmFindings, ValueRow } from './AnalysisFindings';

const classes = require('./style.scss');

/**
 * How many cells the grid opens on.
 *
 * *Which* cells is not a list this file keeps (it used to be: seven symbols, of
 * which Steiner reported three and Downs two, so one cell in four of the opening
 * board was whatever came next in the analysis and the picker had to explain
 * itself in prose). It is read off the analysis, by two rules:
 *
 *  1. A measurement its author attached a **diagnosis** to — a skeletal pattern,
 *     an incisor inclination, a lip position — is a measurement that analysis is
 *     read for. The analysis states that itself, per component (see `Categories`
 *     in `webceph.d.ts`; the neutral `measurement` bucket is what everything else
 *     carries).
 *  2. **One measurement per finding.** Steiner reads the mandible with both SNB
 *     and SND, and a board that spent two of its five cells on one finding is a
 *     board of three findings — which is how SND, a figure nobody follows across
 *     a course of treatment, took a quarter of the opening grid.
 *
 * So Steiner opens on SNA · SNB · ANB · Go-Gn/SN · U1-NA and Downs on its own
 * facial angle, convexity, A-B plane, FMPA and IMPA, and neither needs a sentence
 * under the chips saying why.
 */
const BOARD = 5;

/**
 * Which region of the face a measurement belongs to, from the finding its own
 * analysis grouped it under — the picker's headings, so 15 chips are three short
 * runs rather than one undifferentiated wall.
 */
type Region = 'skeletal' | 'dental' | 'soft' | 'other';

const REGION_LABEL: { [region: string]: string } = {
  skeletal: 'Skeletal',
  dental: 'Dental',
  soft: 'Soft tissue',
  other: 'Measurements',
};

const REGION_ORDER: Region[] = ['skeletal', 'dental', 'soft', 'other'];

const REGION_OF_CATEGORY: { [category: string]: Region | undefined } = {
  skeletalPattern: 'skeletal',
  maxilla: 'skeletal',
  mandible: 'skeletal',
  skeletalProfile: 'skeletal',
  mandibularRotation: 'skeletal',
  growthPattern: 'skeletal',
  skeletalBite: 'skeletal',
  chin: 'skeletal',
  upperIncisorInclination: 'dental',
  lowerIncisorInclination: 'dental',
  upperIncisorPosition: 'dental',
  lowerIncisorPosition: 'dental',
  overbite: 'dental',
  overjet: 'dental',
  upperLipProminence: 'soft',
  lowerLipProminence: 'soft',
};

// ---- the plot's coordinate space -------------------------------------------
// One viewBox per cell for the *marks* — the bands, the line, the dots — scaled
// by CSS to whatever width the cell gets, so a visit is at the same x in every
// cell of the grid. Every piece of *type* around the plot is HTML positioned in
// per cent over the same box (`.tc_plotbox`), at a fixed px size: inside the
// viewBox the tick labels were set in user units, which meant ~5.5pt on an A4
// sheet and ~1.7× the design brief's size at 420px.
const W = 200;
/** Plot height in user units, and the shorter one a two-film board uses. */
const H_MANY = 96;
const H_TWO = 72;
const PAD_Y = 6;
/** The y axis rule, and the right end of the plot. */
const AX_X = 3;
const PLOT_R = W - 3;
/**
 * How far inside the plot the first and last film sit. A point on the frame's
 * own edge has half its dot outside the drawing, and its printed value nowhere
 * to go.
 */
const INSET = 15;
const PLOT_L = AX_X + INSET;

/** One film of the record, as this chart needs to place it on an axis. */
interface TrendFilm {
  record: PatientRecord;
  rows: ValueRow[];
  analysisName: string | null;
  /** The timepoint's token ("T2"), or null on an unlabelled film. */
  token: string | null;
  /** The film's own capture day, `null` when it carries none. */
  date: string | null;
  /** The patient's age on that day, in years — the x axis when it is known. */
  ageInYears: number | null;
  /** …and as it is written everywhere else in this app ("14 y 9 m"). */
  ageLabel: string | null;
}

/** One film's reading of one measurement, with the norm it was read against. */
interface TrendPoint {
  /** Index into the chart's plotted films. */
  film: number;
  value: number;
  /** 0 inside the norm, 1 over 1 SD or outside a published range, 2 over 2 SD. */
  tone: 0 | 1 | 2;
  row: ValueRow;
  /** The norm band at *this* film — age-indexed norms move with the patient. */
  norm: { mean: number; min: number; max: number; isSd: boolean } | null;
}

/** One measurement across the record: a sparkline's worth of data. */
interface TrendSeries {
  symbol: string;
  /** The measurement's full name, when the analysis states one. */
  name: string | null;
  unit: string;
  kind: MeasurementKind;
  points: TrendPoint[];
  /** Last film − first film, rounded as both values are printed. */
  net: { change: number; isWithinError: boolean } | null;
  /** Which region of the face the analysis grouped this measurement under. */
  region: Region;
  /**
   * The findings the analysis groups this measurement under, minus its neutral
   * bucket — empty on a measurement it states a norm for but no diagnosis about.
   * What the opening board is chosen by (see `BOARD`).
   */
  findings: string[];
}

/** The one x axis the whole grid is drawn on. */
interface TrendAxis {
  /** What the axis measures — an age in years, or a capture day. */
  mode: 'age' | 'date';
  /** Position of each plotted film, 0 at the axis' left end and 1 at its right. */
  positions: number[];
}

const toneOf = (row: ValueRow): 0 | 1 | 2 => (
  row.stars >= 2 ? 2 : ((row.stars === 1 || row.outOfRange) ? 1 : 0)
);

const regionOf = (row: ValueRow): Region => {
  let region: Region = 'other';
  row.categories.forEach((category) => {
    const named = REGION_OF_CATEGORY[category];
    if (named !== undefined && region === 'other') {
      region = named;
    }
  });
  return region;
};

/**
 * The films this chart can honestly place on an axis: the ones that report a
 * measurement at all, and that carry the capture date an axis needs. A film with
 * no day cannot be put in a chronology — it is counted and named in the note
 * instead of being dropped silently.
 */
const buildFilms = (
  films: FilmFindings[], dateOfBirth: string | undefined,
): TrendFilm[] => films
  .filter(({ analysis }) => analysis.results.length > 0)
  .map((film): TrendFilm => {
    const { record, analysis, analysisName } = film;
    const date = formatCaptureDate(record.captureDate);
    const day = parseCaptureDate(record.captureDate);
    return {
      record,
      // The findings panel's own builder, on the store's own results array,
      // with the analysis' own caveat markers — the rows are that panel's rows
      // to the field, not a second reading of the same results.
      rows: buildValueRows(
        analysis.results, analysis.landmarksBySymbol,
        caveatMarkers(analysis.caveats),
      ),
      analysisName,
      token: getTimepointToken(record.timepoint),
      date,
      ageInYears: day !== null ? getAgeInYears(dateOfBirth, day) : null,
      ageLabel: day !== null ? formatAgeFull(dateOfBirth, day) : null,
    };
  });

/**
 * Every measurement two or more of the plotted films report, in the analyses'
 * own component order — which is the order the findings table below keeps, and
 * the order the picker's chips and the grid's cells are both laid out in, so a
 * cell is always where its chip is.
 *
 * A measurement reported on one film only is not a trend and is not offered:
 * a sparkline through a single dot is the thing this chart exists instead of.
 */
const buildSeries = (films: TrendFilm[], axis: TrendAxis): TrendSeries[] => {
  const order: string[] = [];
  const bySymbol: { [symbol: string]: TrendSeries | undefined } = {};
  films.forEach((film, index) => {
    film.rows.forEach((row) => {
      const { symbol, component } = row;
      if (!isFinite(component.value)) {
        return;
      }
      let series = bySymbol[symbol];
      if (series === undefined) {
        series = {
          symbol,
          name: row.name,
          unit: row.unit,
          kind: row.kind,
          points: [],
          net: null,
          region: regionOf(row),
          findings: row.categories.filter(
            (category) => category !== 'measurement',
          ),
        };
        bySymbol[symbol] = series;
        order.push(symbol);
      }
      const { mean, min, max } = component;
      // A norm this app can draw a band from: a mean with two bounds either
      // side of it. Anything else is a measured value with nothing behind it,
      // and the cell says so rather than shading a guess.
      const usable = isFinite(mean) && isFinite(min) && isFinite(max) &&
        max > min;
      series.points.push({
        film: index,
        value: component.value,
        tone: toneOf(row),
        row,
        norm: usable
          ? { mean, min, max, isSd: row.z !== null }
          : null,
      });
    });
  });
  return order
    .map((symbol) => bySymbol[symbol] as TrendSeries)
    // Two readings, and at two different places on the axis: two films captured
    // on the same day sit on one x, and a "trend" between them is a vertical
    // pair of dots, not a course over time.
    .filter((series) => {
      if (series.points.length < 2) {
        return false;
      }
      const first = axis.positions[series.points[0].film];
      return series.points.some(
        (point) => axis.positions[point.film] !== first,
      );
    })
    .map((series) => {
      const first = series.points[0].value;
      const last = series.points[series.points.length - 1].value;
      // Rounded first, so the printed change is the difference between the two
      // printed values — the rule the findings table and the superimposition's
      // change table both follow.
      const change = roundToDisplay(
        roundToDisplay(last) - roundToDisplay(first),
      );
      return {
        ...series,
        points: levelTones(series),
        net: {
          change,
          // Exactly nothing first, and for every kind: a dimensionless ratio has
          // no published reproducibility floor, but two films reporting the same
          // figure is not a change on any measurement.
          isWithinError: change === 0 ||
            isWithinPlottingError(series.kind, change),
        },
      };
    });
};

/**
 * The severity tones of one series, with the knife edge taken off them.
 *
 * The grade of a reading steps at exactly 1 and 2 SD, which on a *course* of
 * readings put two visually identical figures at two different alarm levels:
 * NAPog at −10.2° (2.00 SD) painted red and −10.1° (1.98 SD) beside it amber,
 * 0.1° apart, inside the ±1° hand-plotting error this very panel prints under
 * its own change figures. Where two adjacent readings differ by less than that
 * floor, they carry the same tone — the more severe of the two, because the step
 * is an artefact of plotting and the safer reading of an artefact is the louder
 * one. The position of each dot against the visible ±1/±2 SD envelope is what
 * says how far out it is; the fill is a flag, not a measurement.
 */
const levelTones = (series: TrendSeries): TrendPoint[] => {
  const points = series.points.map((point) => ({ ...point }));
  // Both directions, so the levelling does not depend on which end it starts
  // from: a run of readings inside one plotting error takes the run's own worst.
  for (let pass = 0; pass < 2; pass += 1) {
    const indexes = points.map((_, i) => (pass === 0 ? i : points.length - 1 - i));
    indexes.forEach((i) => {
      const other = points[pass === 0 ? i + 1 : i - 1];
      if (other === undefined) {
        return;
      }
      const step = roundToDisplay(
        roundToDisplay(points[i].value) - roundToDisplay(other.value),
      );
      if (step !== 0 && !isWithinPlottingError(series.kind, step)) {
        return;
      }
      const worst = Math.max(points[i].tone, other.tone) as 0 | 1 | 2;
      points[i].tone = worst;
      other.tone = worst;
    });
  }
  return points;
};

/**
 * The axis every cell of the grid is drawn on: the patient's age on the day of
 * each film where the record holds a date of birth, and the capture day itself
 * where it does not.
 *
 * Both are real scales, so a two-year gap is twice the width of a one-year gap
 * in every cell — the whole reason to plot a record rather than list it. The
 * axis is named on the page (see `renderAxisNote`), because "age" and "date"
 * are not interchangeable readings of the same chart.
 */
const buildAxis = (films: TrendFilm[]): TrendAxis => {
  const ages = films.map(({ ageInYears }) => ageInYears);
  const mode: 'age' | 'date' = ages.every((age) => age !== null)
    ? 'age' : 'date';
  const values = mode === 'age'
    ? ages.map((age) => age as number)
    : films.map(({ record }) => {
      const day = parseCaptureDate(record.captureDate);
      // Dated films only ever reach this point (see `buildFilms`).
      return day !== null ? day.getTime() / 86400000 : 0;
    });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return {
    mode,
    positions: values.map(
      (value) => (span > 0 ? (value - min) / span : 0.5),
    ),
  };
};

// ---- the y scale of one cell -----------------------------------------------

/** One tick of a cell's y axis: where it sits, and what it reads. */
interface CellTick {
  at: number;
  /** The figure printed against it, or null for a tick mark on its own. */
  label: string | null;
}

/**
 * The y scale of one cell. Two of them exist, and which one a cell is on is a
 * fact about its *norm*, not a preference:
 *
 *  - **`sd`** — the cell is plotted in standard deviations from its own norm's
 *    mean, on the fixed ±3 SD axis the report's wigglegram and the findings
 *    table's strips are drawn on. This is the scale that makes the grid a grid:
 *    ±1 SD is the same band and the same height in every cell, so SNB +2.3° and
 *    ANB −2.3° are drawn as the same slope instead of 25% and 39% of a cell.
 *    (Independent per-cell domains fitted to their own data ±12% were what made
 *    two identical changes two different pictures.) The native figures are not
 *    lost — they are printed at the dots, which is where a figure is read.
 *  - **`native`** — the measurement's own unit, for a norm published as a
 *    *range* (no standard deviation to divide by; halving the range to make one
 *    is what this app refuses to do everywhere else) or for a measurement with
 *    no published norm at all. These cells are put on a **common span for their
 *    unit** — 8° for an angle, 4 mm for a length — widened in whole ticks only
 *    where the data needs it, so a change is comparable between them too, and
 *    every tick carries its unit so no figure floats unlabelled.
 */
interface CellScale {
  mode: 'sd' | 'native';
  min: number;
  max: number;
  ticks: CellTick[];
  /** Where a point sits on this scale, clamped into the domain. */
  at(point: TrendPoint): number;
  /** −1 below the axis, +1 above it, 0 on it. */
  off(point: TrendPoint): -1 | 0 | 1;
  /** The ±1 and ±2 SD envelopes in scale units — `sd` mode only. */
  band: { inner: [number, number]; outer: [number, number] } | null;
}

const SD_LIMIT = 3;
/** Air beyond ±3 SD, so a clamped marker is drawn inside the frame. */
const SD_PAD = 0.55;

const sdScale = (): CellScale => ({
  mode: 'sd',
  min: -(SD_LIMIT + SD_PAD),
  max: SD_LIMIT + SD_PAD,
  // The wigglegram's own ladder: a mark at every standard deviation, the mean
  // and the ±2 bound named (the two boundaries the dot colour steps at), and
  // ±3 the frame.
  ticks: [
    { at: 3, label: null },
    { at: 2, label: '+2 SD' },
    { at: 1, label: null },
    { at: 0, label: 'MEAN' },
    { at: -1, label: null },
    { at: -2, label: '−2 SD' },
    { at: -3, label: null },
  ],
  at: (point) => Math.max(
    -SD_LIMIT, Math.min(SD_LIMIT, point.row.z as number),
  ),
  off: (point) => {
    const z = point.row.z as number;
    return z > SD_LIMIT ? 1 : (z < -SD_LIMIT ? -1 : 0);
  },
  band: { inner: [-1, 1], outer: [-2, 2] },
});

/**
 * The tick a unit family opens on: four of them make the family's own span, so
 * two angular cells are on 8° apiece and two linear cells on 4 mm apiece and a
 * change in one is the same height as the same change in the other.
 *
 * A dimensionless quantity has no family — Jarabak's facial-height ratio in per
 * cent and Holdaway's 1 : 1 are not two readings of one scale — so a `ratio` cell
 * takes its tick from its own data instead of a figure invented for it here.
 */
const TARGET_STEP: { [kind: string]: number | undefined } = {
  angular: 2,
  linear: 1,
};

const NICE_MANTISSAS = [1, 2, 2.5, 5];

/** The next round tick size up from this one (1 → 2 → 2.5 → 5 → 10 → …). */
const coarserStep = (step: number): number => {
  const exponent = Math.floor(Math.log10(step) + 1e-9);
  const decade = Math.pow(10, exponent);
  const mantissa = step / decade;
  for (let i = 0; i < NICE_MANTISSAS.length; i += 1) {
    if (NICE_MANTISSAS[i] > mantissa + 1e-9) {
      return NICE_MANTISSAS[i] * decade;
    }
  }
  return 10 * decade;
};

/** The smallest round tick at least this big — 0.37 → 0.5, 3.1 → 5. */
const niceStep = (target: number): number => {
  if (!(target > 0)) {
    return 1;
  }
  const decade = Math.pow(10, Math.floor(Math.log10(target)));
  for (let i = 0; i < NICE_MANTISSAS.length; i += 1) {
    const candidate = NICE_MANTISSAS[i] * decade;
    if (candidate >= target - 1e-9) {
      return candidate;
    }
  }
  return 10 * decade;
};

const nativeScale = (series: TrendSeries): CellScale => {
  const values: number[] = [];
  series.points.forEach(({ value, norm }) => {
    values.push(value);
    if (norm !== null) {
      values.push(norm.min, norm.max, norm.mean);
    }
  });
  const low = Math.min(...values);
  const high = Math.max(...values);
  const family = TARGET_STEP[series.kind];
  let step = family !== undefined ? family : niceStep((high - low) / 6);
  // Four ticks across is the family's span; a series that needs more than eight
  // coarsens its tick rather than growing a ladder of twenty.
  const half = Math.max((high - low) / 2 * 1.16, step * 0.55);
  while (half / step > 4 && step < 1e5) {
    step = coarserStep(step);
  }
  const centre = Math.round(((low + high) / 2) / step) * step;
  let steps = 2;
  while (
    steps < 8 &&
    (centre + steps * step < high || centre - steps * step > low)
  ) {
    steps += 1;
  }
  const ticks: CellTick[] = [];
  for (let i = steps; i >= -steps; i -= 1) {
    const at = centre + i * step;
    ticks.push({
      at,
      // The extremes and the middle carry a figure, each with its unit on it:
      // a foot tick reading a bare "−9.2" is a number of unstated quantity.
      label: (i === steps || i === -steps || i === 0)
        ? `${displayNumber(roundToDisplay(at))}${series.unit}`
        : null,
    });
  }
  return {
    mode: 'native',
    min: centre - steps * step,
    max: centre + steps * step,
    ticks,
    at: (point) => point.value,
    off: () => 0,
    band: null,
  };
};

/**
 * Which scale a cell is on — decided by the norm, not by the chart: every film's
 * reading of this measurement must have a standard deviation behind it for the
 * cell to be measured in standard deviations.
 */
const scaleOf = (series: TrendSeries): CellScale => (
  series.points.every(({ row }) => row.z !== null && isFinite(row.z))
    ? sdScale() : nativeScale(series)
);

/** A per cent, for the HTML type layer laid over the plot. */
const pc = (fraction: number): string => `${(fraction * 100).toFixed(3)}%`;

/**
 * One measurement across the record's films: the norm band shaded behind the
 * patient's own readings, the norm's mean as a hairline through it, and the
 * values joined in the order they were taken with each dot carrying the grade
 * the table below prints for it — and **its own figure printed beside it**,
 * because a slope with no number on it is not a reading.
 *
 * In `native` mode the band follows the *film's own* norm rather than one figure
 * for the whole chart, because an age-indexed norm moves with the patient:
 * Ricketts' four corrected figures are a different band at T1 and at T3. In `sd`
 * mode that movement is already inside the scale — a value is plotted against
 * the norm it was read against — so the envelope is one field behind the cell.
 */
const Sparkline = (
  { series, films, axis, index, twoPoint }: {
    series: TrendSeries;
    films: TrendFilm[];
    axis: TrendAxis;
    index: number;
    /** A board whose whole record is two films: the dumbbell case. */
    twoPoint: boolean;
  },
) => {
  const scale = scaleOf(series);
  const H = twoPoint ? H_TWO : H_MANY;
  const PY0 = PAD_Y;
  const PY1 = H - PAD_Y;
  const span = scale.max - scale.min;
  const x = (position: number) => PLOT_L + position * (PLOT_R - INSET - PLOT_L);
  const y = (value: number) => PY1 - ((value - scale.min) / span) * (PY1 - PY0);
  const at = series.points.map((point) => scale.at(point));
  const px = series.points.map((point) => x(axis.positions[point.film]));
  const py = at.map((value) => y(value));
  // Each pair of adjacent films with a band at both ends is one quad of shading:
  // constant norms make a rectangle, an age-indexed norm a wedge, and a film
  // with no published norm leaves an honest gap rather than a straight edge
  // borrowed from its neighbour. (`sd` mode has no wedges to draw — see below.)
  const bands: Array<{ points: string; isSd: boolean }> = [];
  if (scale.mode === 'native') {
    series.points.forEach((point, i) => {
      const next = series.points[i + 1];
      if (point.norm === null || next === undefined || next.norm === null) {
        return;
      }
      bands.push({
        isSd: point.norm.isSd && next.norm.isSd,
        points: [
          `${px[i]},${y(point.norm.max)}`,
          `${px[i + 1]},${y(next.norm.max)}`,
          `${px[i + 1]},${y(next.norm.min)}`,
          `${px[i]},${y(point.norm.min)}`,
        ].join(' '),
      });
    });
  }
  const meanPoints = scale.mode === 'native' &&
    series.points.every(({ norm }) => norm !== null && norm.isSd)
    ? series.points.map(
      (point, i) => `${px[i]},${y((point.norm as { mean: number }).mean)}`,
    ).join(' ')
    : null;
  const hatchId = `records-trend-hatch-${index}`;
  // Which points carry their figure on the face of the chart. Two or three
  // readings: all of them. More: the two the net change is measured between,
  // with the rest a hover or a focus away — twelve figures in a 190px cell is a
  // table, and the table is below.
  const labelled = series.points.map(
    (_, i) => series.points.length <= 3 ||
      i === 0 || i === series.points.length - 1,
  );
  return (
    <div className={classes.tc_plotbox}>
      <svg
        className={cx(classes.tc_plot, {
          [classes.tc_plot__short]: twoPoint,
        })}
        viewBox={`0 0 ${W} ${H}`}
        // The box is a fixed height at every window width (see `.tc_plot`), so
        // the drawing is stretched to it rather than the cell being stretched to
        // the drawing: at 480px an aspect-locked cell was 175px of plot and the
        // panel 1846px tall. Nothing distortable is inside — the bands, the
        // rules and the line are all that scale, and the dots and every figure
        // are HTML at a fixed size over the same box.
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.symbol} across ${films.length} films`}
      >
        <defs>
          {/* A published range gets the hatch the findings table's range strip
              gets, for the same reason: its author stated no standard deviation,
              so it must not be drawn as though the shading were one. */}
          <pattern
            id={hatchId}
            width="4" height="4"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line className={classes.tc_hatch} x1="0" y1="0" x2="0" y2="4" />
          </pattern>
        </defs>

        {/* The norm, as one field behind the whole cell: the ±1 SD band, the
            lighter ±2 SD envelope behind it and a drawn boundary at ±2 — the
            report's wigglegram's own nested vocabulary. The colour of a dot
            steps at both of those bounds, and until the outer one was drawn
            there was nothing on the page to say why one dot was amber and the
            next red. */}
        {scale.band !== null ? (
          <g>
            <rect
              className={classes.tc_band__outer}
              x={AX_X} y={y(scale.band.outer[1])}
              width={PLOT_R - AX_X}
              height={y(scale.band.outer[0]) - y(scale.band.outer[1])}
            />
            <rect
              className={classes.tc_band}
              x={AX_X} y={y(scale.band.inner[1])}
              width={PLOT_R - AX_X}
              height={y(scale.band.inner[0]) - y(scale.band.inner[1])}
            />
            {[scale.band.outer[0], scale.band.outer[1]].map((edge) => (
              <line
                key={edge}
                className={classes.tc_edge}
                x1={AX_X} y1={y(edge)} x2={PLOT_R} y2={y(edge)}
              />
            ))}
            <line
              className={classes.tc_mean}
              x1={AX_X} y1={y(0)} x2={PLOT_R} y2={y(0)}
            />
          </g>
        ) : null}

        {bands.map((band, i) => (
          <polygon
            key={i}
            className={cx(classes.tc_band, {
              [classes.tc_band__range]: !band.isSd,
            })}
            points={band.points}
            // Inline, not in the stylesheet, and not as a presentation attribute:
            // the pattern's id is per-cell, and a `fill` declared in a class beats
            // a `fill=` attribute on the element, so the hatch would never paint.
            style={band.isSd ? undefined : { fill: `url(#${hatchId})` }}
          />
        ))}
        {meanPoints !== null ? (
          <polyline className={classes.tc_mean} points={meanPoints} />
        ) : null}

        {/* One hairline per film, so the same visit is at the same place in every
            cell of the grid and the columns can be read across. */}
        {films.map((_, i) => (
          <line
            key={i}
            className={classes.tc_guide}
            x1={x(axis.positions[i])} y1={PY0}
            x2={x(axis.positions[i])} y2={PY1}
          />
        ))}

        {/* The two rules the ticks are measured against. A figure in the gutter
            with no axis to attach it to is a floating number. */}
        <line className={classes.tc_axis} x1={AX_X} y1={PY0} x2={AX_X} y2={PY1} />
        <line
          className={classes.tc_axis} x1={AX_X} y1={PY1} x2={PLOT_R} y2={PY1}
        />
        {scale.ticks.map((tick) => (
          <line
            key={tick.at}
            className={classes.tc_tick}
            x1={AX_X} y1={y(tick.at)}
            x2={AX_X + (tick.label !== null ? 4 : 2.4)} y2={y(tick.at)}
          />
        ))}

        <polyline
          className={classes.tc_line}
          points={series.points.map((_, i) => `${px[i]},${py[i]}`).join(' ')}
        />
      </svg>

      {/* ---- the type, outside the scaled drawing ---- */}
      {scale.ticks.map((tick) => (
        tick.label !== null ? (
          <span
            key={tick.at}
            className={cx(classes.tc_ytick, {
              [classes.tc_ytick__mean]: scale.mode === 'sd' && tick.at === 0,
            })}
            style={{ top: pc(y(tick.at) / H) }}
          >
            {tick.label}
          </span>
        ) : null
      ))}
      {films.map((film, i) => (
        <span
          key={i}
          className={classes.tc_xtick}
          style={{ left: pc(x(axis.positions[i]) / W) }}
        >
          {film.token !== null
            ? film.token
            : (film.date !== null ? film.date.slice(2) : '—')}
        </span>
      ))}

      {/* What the record most practices hold looks like: two films, one segment.
          There is no shape to read at n = 2, so the cell is a dumbbell instead —
          both readings printed at their dots and the step between them printed
          on the segment, over the norm band both were graded against. */}
      {twoPoint && series.net !== null ? (
        <span
          className={cx(classes.tc_delta, {
            [classes.tc_delta__within]: series.net.isWithinError,
          })}
          style={{
            left: pc(((px[0] + px[1]) / 2) / W),
            top: pc(((py[0] + py[1]) / 2) / H),
          }}
        >
          {displaySigned(series.net.change)}{series.unit}
        </span>
      ) : null}

      {series.points.map((point, i) => {
        const film = films[point.film];
        const when = [
          film.token !== null ? film.token : null,
          film.date,
          film.ageLabel !== null ? `age ${film.ageLabel}` : null,
        ].filter((part) => part !== null).join(' · ');
        const { mean, min, max, band } = point.row.component;
        const norm = point.norm !== null
          ? `norm ${displayNorm(mean, min, max, band)}${series.unit} · ` +
            `${displayDeviation(point.value, mean, min, max, series.unit, band)}`
          : 'no published norm';
        const reading = `${displayNumber(roundToDisplay(point.value))}` +
          `${series.unit}`;
        // Which side of its dot the figure sits on, so it never lands on the line
        // it belongs to: away from wherever the line goes next, and away from the
        // frame when the dot is near one of the two edges.
        const neighbours = [at[i - 1], at[i + 1]].filter(
          (value) => value !== undefined,
        );
        const rises = neighbours.length > 0 &&
          neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length >
            at[i];
        const height = py[i] / H;
        const isBelow = height < 0.3 ? true : (height > 0.72 ? false : rises);
        const position = axis.positions[point.film];
        const offAxis = scale.off(point);
        return (
          <span
            key={i}
            className={cx(classes.tc_pt, {
              [classes.tc_pt__lead]: position < 0.2,
              [classes.tc_pt__trail]: position > 0.8,
              [classes.tc_pt__below]: isBelow,
              // A dot near the top has no room above it for a readout.
              [classes.tc_pt__high]: height < 0.45,
            })}
            style={{ left: pc(px[i] / W), top: pc(py[i] / H) }}
            tabIndex={0}
            title={`${when} — ${reading} · ${norm}` +
              (point.row.marker !== null
                ? ' · the analysis raised a caveat about this measurement on ' +
                  'this film — see its block below'
                : '')}
            aria-label={`${series.symbol} at ${when}: ${reading}, ${norm}`}
          >
            <span className={classes.tc_pt_halo} aria-hidden="true" />
            {/* The patient's reading, carrying the severity ink the value carries
                in the table below — and drawn here rather than in the plot, so it
                is a circle of one size at every window width and on paper. */}
            <span
              className={cx(classes.tc_pt_dot, {
                [classes.tc_pt_dot__warn]: point.tone === 1,
                [classes.tc_pt_dot__error]: point.tone === 2,
                // A reading the analysis itself raised a caveat about is drawn
                // hollow: the findings table demotes those rows below the clean
                // ones, and a trend drawn through one may be an artefact of a
                // single misplaced landmark rather than a change in the patient.
                [classes.tc_pt_dot__flagged]: point.row.marker !== null,
                // Off the ±3 SD axis: the wigglegram's outward-pointing marker,
                // so a reading beyond the frame is never drawn as one on it.
                [classes.tc_pt_dot__up]: offAxis > 0,
                [classes.tc_pt_dot__down]: offAxis < 0,
              })}
              aria-hidden="true"
            />
            {labelled[i] ? (
              <span className={classes.tc_val} aria-hidden="true">{reading}</span>
            ) : null}
            {/* The readout, on hover and on keyboard focus. A dot whose only
                statement of itself was an SVG `<title>` could not be read on
                paper, on a touch screen, or in under a second. */}
            <span className={classes.tc_read} aria-hidden="true">
              <span className={classes.tc_read_when}>
                {when !== '' ? when : 'this film'}
              </span>
              <span className={classes.tc_read_val}>{reading}</span>
              <span className={classes.tc_read_dev}>{norm}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
};

/**
 * The empty state's mark: the chart this panel would draw, ghosted — a norm band,
 * one film's reading on it, and a second stop with nothing at it yet. Drawn
 * rather than described, exactly as the records panel's own empty state draws a
 * folder holding a film.
 */
const TrendEmptyArt = () => (
  <svg
    className={cx(classes.empty_art, classes.tea)}
    width={200} height={92} viewBox="0 0 200 92"
    role="img"
    aria-label="A trend needs two traced films at two different dates"
  >
    <rect className={classes.tea_band} x={14} y={34} width={172} height={26} />
    <line className={classes.tea_mean} x1={14} y1={47} x2={186} y2={47} />
    <line className={classes.tea_axis} x1={14} y1={76} x2={186} y2={76} />
    <line className={classes.tea_axis} x1={14} y1={12} x2={14} y2={76} />
    <line className={classes.tea_guide} x1={58} y1={12} x2={58} y2={76} />
    <line className={classes.tea_guide} x1={142} y1={12} x2={142} y2={76} />
    <line className={classes.tea_seg} x1={58} y1={54} x2={142} y2={30} />
    <circle className={classes.tea_dot} cx={58} cy={54} r={4.5} />
    <circle className={classes.tea_ghost} cx={142} cy={30} r={4.5} />
  </svg>
);

export interface TrendChartProps {
  /** One entry per traceable film, oldest capture date first. */
  films: FilmFindings[];
  /** The patient's date of birth, which is what makes the x axis an age axis. */
  dateOfBirth?: string;
  /**
   * Files a lateral cephalogram at the record's next unused timepoint — the very
   * action the empty state asks for, wired to the same slot path the records
   * panel's own "+" affordances use, rather than named in a sentence and left in
   * another panel.
   */
  onAddFilmAtNextTimepoint?(): void;
  /** That timepoint's label ("T2"), so the button says where it will file. */
  nextTimepointLabel?: string;
  /** Opens a film in the editor — the empty state's action on an untraced film. */
  onOpenFilm?(record: PatientRecord): void;
}

interface State {
  /**
   * The measurements the clinician has chosen, or null while the chart is
   * showing its own defaults. Null rather than a copy of the defaults, so a
   * record that gains a film (and with it a measurement that is now plottable)
   * shows it without the reader having to notice and tick it.
   */
  selected: string[] | null;
}

/**
 * The record's measurements across its timepoints — the reading of a chart that
 * only a records layer can give, and the one the per-film blocks below cannot:
 * whether a value is moving, in which direction, and whether it is moving
 * towards its norm or away from it.
 *
 * A **small-multiples grid**, one cell per measurement, never one axis with
 * several measurements on it. Every cell is drawn on the *same* y scale —
 * standard deviations from that measurement's own norm, the ±3 SD axis the
 * report's wigglegram and the findings table's strips already use — so a slope
 * in one cell is directly comparable with a slope in the next. The measurement's
 * own figures are printed at its dots, which is where a figure is read.
 *
 * Every number arrives through the same read-only evaluation path as the
 * findings table below it — the store's own categorized results for each film,
 * built into rows by that panel's own builder (`buildValueRows`) and formatted
 * by the app's one set of formatters. Nothing is recomputed, no norm is
 * re-derived, and a value's grade is the grade its Summary gives it.
 *
 * With fewer than two comparable films the grid is not drawn at all: the panel
 * offers the action that would make one instead. An axis with one dot on it is a
 * chart that claims a chronology the record does not have.
 */
export default class TrendChart extends React.PureComponent<TrendChartProps, State> {
  state: State = { selected: null };

  render() {
    const { films: allFilms, dateOfBirth } = this.props;
    const films = buildFilms(allFilms, dateOfBirth);
    const axis = buildAxis(films);
    const series = buildSeries(films, axis);
    const days: string[] = [];
    films.forEach(({ date }) => {
      if (date !== null && days.indexOf(date) < 0) {
        days.push(date);
      }
    });
    if (days.length < 2 || series.length === 0) {
      return this.renderEmpty(allFilms, films, days, series.length);
    }
    const selected = this.getSelected(series);
    const shown = series.filter(({ symbol }) => selected.indexOf(symbol) >= 0);
    const twoPoint = films.length === 2;
    return (
      <section className={classes.trend} aria-label="Measurement trend">
        <div className={classes.findings_head}>
          <h3 className={classes.findings_title}>Measurement trend</h3>
          <span className={classes.records_count}>
            {shown.length} of {series.length} across {films.length} films
          </span>
          <span className={classes.records_spacer} />
          {/* One clause. The axis strip states the chronology, the mark key
              states the marks, and each cell states its own unit — said here as
              well, this was two more lines of grey type around four 150px
              charts. */}
          <p className={classes.records_note}>
            Every measurement reported on two or more of these films, in standard
            deviations from its own norm.
          </p>
        </div>
        {this.renderAxisNote(films, axis)}
        {this.renderPicker(series, selected)}
        {shown.length > 0 ? (
          <div className={classes.trend_grid}>
            {shown.map((one, i) => (
              <article
                key={one.symbol}
                className={classes.tc}
                title={this.cellTitle(one, films)}
              >
                <div className={classes.tc_head}>
                  <span className={classes.tc_symbol}>{one.symbol}</span>
                  {/* Which axis this cell is on, where it is not the standard
                      deviation axis the rest of the grid shares: a cell measured
                      in its own unit says which unit, once, here — its ticks
                      carry the figures. */}
                  {this.axisTag(one) !== null ? (
                    <span className={classes.tc_unit}>{this.axisTag(one)}</span>
                  ) : null}
                  <span className={classes.tc_spacer} />
                  {/* A measurement its films do not all report says so, rather
                      than leaving the reader to notice that one of the axis'
                      stops carries no dot: a film read with another analysis, or
                      one whose landmarks for this measurement are unplaced,
                      contributes nothing to a trend and must not look as though
                      it contributed a zero. */}
                  {one.points.length < films.length ? (
                    <span
                      className={classes.tc_gap}
                      title={`Reported on ${one.points.length} of the ` +
                        `${films.length} films on this axis`}
                    >
                      {one.points.length}/{films.length}
                    </span>
                  ) : null}
                  {/* The span this figure is measured over, named on it. The
                      table directly below carries a CHANGE column measured
                      against the *previous* film; an unlabelled signed figure up
                      here could be read as that one. */}
                  <span className={classes.tc_span}>
                    {this.spanLabel(one, films)}
                  </span>
                  {/* …and on a two-film board the figure itself is on the
                      segment, between the two readings it is the difference of
                      (see `Sparkline`). */}
                  {one.net !== null && !twoPoint ? (
                    <span
                      className={cx(classes.tc_net, {
                        [classes.tc_net__within]: one.net.isWithinError,
                      })}
                    >
                      {displaySigned(one.net.change)}{one.unit}
                    </span>
                  ) : null}
                </div>
                <Sparkline
                  series={one} films={films} axis={axis} index={i}
                  twoPoint={twoPoint}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className={classes.trend_none}>
            No measurement selected — choose one above, or press All.
          </p>
        )}
        {shown.length > 0 ? this.renderLegend(shown, films.length) : null}
      </section>
    );
  }

  /**
   * What the whole grid's x axis measures, stated once with every film on it:
   * the patient's age on the day of each film where the record holds a date of
   * birth, the capture day itself where it does not.
   *
   * This is the line that makes the tick labels ("T1", "T2") readable as
   * positions rather than as an ordering — the spacing between them is a real
   * interval, and this says what of.
   */
  private renderAxisNote = (films: TrendFilm[], axis: TrendAxis) => {
    const first = films[0];
    const last = films[films.length - 1];
    const interval = formatInterval(
      parseCaptureDate(first.record.captureDate),
      parseCaptureDate(last.record.captureDate),
    );
    return (
      <div className={classes.trend_axis}>
        <span className={classes.trend_axis_key}>
          {axis.mode === 'age' ? 'Age at capture' : 'Capture date'}
        </span>
        {films.map((film, i) => (
          <span key={i} className={classes.trend_axis_stop}>
            {film.token !== null ? (
              <span className={classes.trend_axis_token}>{film.token}</span>
            ) : null}
            {/* The axis is spaced on the age where there is one, so the age is
                the figure printed first; the day is what it was read from. */}
            {axis.mode === 'age' && film.ageLabel !== null ? (
              <span className={classes.trend_axis_value}>{film.ageLabel}</span>
            ) : null}
            {film.date !== null ? (
              <span className={classes.trend_axis_date}>{film.date}</span>
            ) : null}
          </span>
        ))}
        {/* …and the whole of what the axis spans, named at both ends: "1 y 2 mo"
            on its own is an interval between two unstated things. */}
        {interval !== null ? (
          <span className={classes.trend_axis_span}>
            {first.token !== null && last.token !== null
              ? `${interval} from ${first.token} to ${last.token}`
              : `${interval} across the record`}
          </span>
        ) : null}
        {/* Age is derived from a recorded birthday, never invented: with none on
            file the axis is the capture date and says so. */}
        {axis.mode === 'date' ? (
          <span className={classes.trend_axis_note}>
            No date of birth on record, so the axis is the capture date rather
            than the patient’s age.
          </span>
        ) : null}
        {/* …and the one thing that can make a shaded band step for a reason that
            has nothing to do with the patient. Each film carries its own
            analysis, and two authors' norms for the same quantity are not the
            same figure — Tweed grades FMPA against 25 ± 5° where Downs grades it
            against 21.9 ± 3.2°. A record read with one analysis throughout says
            nothing here, because there is nothing to warn about. */}
        {this.getMixedAnalyses(films) !== null ? (
          <span className={classes.trend_axis_note}>
            These films are read with different analyses
            ({this.getMixedAnalyses(films)}): a measurement common to two of them
            is graded against each analysis’ own norm, so its standard deviation
            is that analysis’ own.
          </span>
        ) : null}
      </div>
    );
  };

  /**
   * The films' analyses, named, when they are not all the same one — and null
   * when they are, which is the case on a record traced consistently.
   */
  private getMixedAnalyses = (films: TrendFilm[]): string | null => {
    const names: string[] = [];
    films.forEach(({ analysisName }) => {
      const name = analysisName !== null ? analysisName : 'no analysis';
      if (names.indexOf(name) < 0) {
        names.push(name);
      }
    });
    if (names.length < 2) {
      return null;
    }
    return films.map(({ token, date, analysisName }) => {
      const when = token !== null ? token : (date !== null ? date : 'a film');
      return `${when} ${analysisName !== null ? analysisName : 'no analysis'}`;
    }).join(', ');
  };

  /**
   * The unit a cell measured in its own unit is measured in — null on a cell on
   * the standard-deviation axis, whose ticks say so themselves and whose printed
   * figures carry the unit at every dot.
   */
  private axisTag = (series: TrendSeries): string | null => {
    if (scaleOf(series).mode === 'sd') {
      return null;
    }
    const unit = series.unit.trim();
    return unit !== '' ? unit : 'ratio';
  };

  /** The span a cell's net figure is measured over: "T1→T3", or the two days. */
  private spanLabel = (series: TrendSeries, films: TrendFilm[]): string => {
    const ends = [
      films[series.points[0].film],
      films[series.points[series.points.length - 1].film],
    ];
    const named = ends.map(
      (film) => (film.token !== null
        ? film.token
        : (film.date !== null ? film.date.slice(2) : '?')),
    );
    return `${named[0]}→${named[1]}`;
  };

  /**
   * Which measurements are plotted — the clinician's choice, from everything the
   * record reports twice, grouped by the region of the face its own analysis
   * grouped it under.
   *
   * Screen only: on the filed chart the chips are not controls, and the grid
   * below them is the answer to the question they ask.
   */
  private renderPicker = (series: TrendSeries[], selected: string[]) => {
    const groups = REGION_ORDER
      .map((region) => ({
        region,
        list: series.filter((one) => one.region === region),
      }))
      .filter(({ list }) => list.length > 0);
    // A heading over the only group there is names nothing: Björk reports five
    // angles and no diagnosis, and "MEASUREMENTS" over all five of them is a
    // label, not a grouping.
    const isGrouped = groups.length > 1;
    const isAll = selected.length === series.length;
    return (
      <div className={classes.trend_pick}>
        <span className={classes.slots_label}>Plot</span>
        <span className={classes.trend_pick_list}>
          {groups.map(({ region, list }) => (
            <span key={region} className={classes.trend_pick_group}>
              {isGrouped ? (
                <span className={classes.trend_pick_region}>
                  {REGION_LABEL[region]}
                </span>
              ) : null}
              {list.map((one) => {
                const isOn = selected.indexOf(one.symbol) >= 0;
                return (
                  <button
                    key={one.symbol}
                    type="button"
                    className={cx(classes.trend_chip, {
                      [classes.trend_chip__on]: isOn,
                    })}
                    aria-pressed={isOn}
                    title={`${one.name !== null ? `${one.name} — ` : ''}` +
                      `reported on ${one.points.length} of these films` +
                      (isOn ? ' · plotted' : '')}
                    onClick={this.toggle(one.symbol, series)}
                  >
                    {/* Selection is not colour alone: a ticked chip is ticked.
                        Fifteen chips in two tints of the same blue is a state a
                        reader has to compare across the row to read. */}
                    <span className={classes.trend_chip_tick} aria-hidden="true">
                      ✓
                    </span>
                    {one.symbol}
                  </button>
                );
              })}
            </span>
          ))}
        </span>
        <span className={classes.trend_pick_acts}>
          <button
            type="button"
            className={classes.trend_act}
            disabled={isAll}
            onClick={this.selectAll(series)}
          >
            All
          </button>
          <button
            type="button"
            className={classes.trend_act}
            disabled={selected.length === 0}
            onClick={this.selectNone}
          >
            None
          </button>
          {this.state.selected !== null ? (
            <button
              type="button"
              className={cx(classes.trend_act, classes.trend_act__reset)}
              onClick={this.resetSelection}
            >
              Reset
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  /**
   * The marks, **drawn** — the findings panel's own key, in its own classes: a
   * sample of the cell's y axis with its two envelopes and its mean on it, and a
   * dot of each tone beside its own two words. This key used to describe them
   * instead, in two 1270px lines of 11px grey prose that named four colours and
   * showed none of them.
   */
  private renderLegend = (shown: TrendSeries[], filmCount: number) => {
    const hasRange = shown.some(
      ({ points }) => points.some(
        (point) => point.norm !== null && !point.norm.isSd,
      ),
    );
    const hasNative = shown.some((one) => scaleOf(one).mode === 'native');
    const hasChange = shown.some(({ net }) => net !== null);
    const hasPartial = shown.some(({ points }) => points.length < filmCount);
    const hasFlagged = shown.some(
      ({ points }) => points.some((point) => point.row.marker !== null),
    );
    return (
      <div className={classes.trend_legend}>
        <div className={classes.fk}>
          <span className={cx(classes.fk_group, classes.tk_group)}>
            <span className={classes.fk_label}>Axis</span>
            <span className={classes.tk_strip}>
              <span className={classes.tk_mean} />
            </span>
            <span className={classes.fk_note}>
              ±1 SD band, ±2 SD envelope, mean
            </span>
          </span>
          <span className={classes.fk_group}>
            <span className={classes.fk_label}>Dot</span>
            <span className={classes.tk_dot} />
            <span className={classes.fk_note}>within norm</span>
            <span className={cx(classes.tk_dot, classes.tk_dot__warn)} />
            <span className={classes.fk_note}>over 1 SD</span>
            <span className={cx(classes.tk_dot, classes.tk_dot__error)} />
            <span className={classes.fk_note}>over 2 SD</span>
          </span>
          {hasFlagged ? (
            <span className={classes.fk_group}>
              <span className={classes.fk_label}>Hollow</span>
              <span className={cx(classes.tk_dot, classes.tk_dot__flagged)} />
              <span className={classes.fk_note}>caveat raised</span>
            </span>
          ) : null}
          {hasRange || hasNative ? (
            <span className={cx(classes.fk_group, classes.tk_group)}>
              <span className={classes.fk_label}>Own unit</span>
              <span className={classes.tk_hatch} />
              <span className={classes.fk_note}>
                published range or no norm — no SD to plot, so the cell is in its
                own unit on its family’s span
              </span>
            </span>
          ) : null}
        </div>
        {/* The one line of prose this key keeps: the reproducibility floor is a
            fact about hand plotting and cannot be drawn. */}
        {hasChange ? (
          <span className={classes.trend_legend_line}>
            <span className={classes.fk_label}>Change</span> first film to last,
            dimmed under hand-plotting error (±{PLOTTING_ERROR.linear} mm on a
            point, ±{PLOTTING_ERROR.angular}° on an angle); two readings closer
            than that carry the same tone.
            {hasPartial ? (
              <span>
                {' '}<span className={classes.fk_label}>2/3</span> is the films
                that report a measurement out of the films on the axis.
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  };

  /**
   * Why there is no chart — in the record's own terms, and with the control that
   * fixes it. The records panel's own empty state sets the construction: a mark,
   * a headline, a hint and one primary action. This panel used to state the
   * precondition in two grey sentences and leave the buttons that would meet it
   * in another panel.
   */
  private renderEmpty = (
    allFilms: FilmFindings[], films: TrendFilm[], days: string[],
    seriesCount: number,
  ) => {
    const {
      onAddFilmAtNextTimepoint, nextTimepointLabel, onOpenFilm,
    } = this.props;
    const undated = films.filter(({ date }) => date === null).length;
    const named = films.map(({ token, date, analysisName }) => {
      const when = token !== null ? token : (date !== null ? date : 'a film');
      return analysisName !== null ? `${when} ${analysisName}` : when;
    }).join(', ');
    const reason = films.length === 0
      ? (allFilms.length === 1
        ? 'The film on record reports nothing yet — trace it, or run Auto-plot ' +
          'from its toolbar, and its measurements appear here.'
        : `No film of this record reports a measurement yet — trace two of ` +
          'them, at two different dates, and the trend is drawn from what they ' +
          'report in common.')
      : films.length === 1
        ? `One film reports (${named}). A trend needs a second traced film, ` +
          'captured on a different day.'
        : days.length < 2
          ? `${films.length} films report, all captured on ` +
            `${days.length === 1 ? days[0] : 'the same day'} — a trend is ` +
            'measured over time, so it needs films from different days.'
          : `${named} — no measurement is reported on two of these films, so ` +
            'there is nothing to follow across them.' +
            (seriesCount === 0 && films.length > 1
              ? ' Setting one analysis on both films gives them measurements in' +
                ' common.'
              : '');
    // A film on file that reports nothing is the one case where the action is
    // not "add a film": it is to trace the film already there.
    const untraced = allFilms.filter(
      ({ analysis }) => analysis.results.length === 0,
    )[0];
    const canTrace = untraced !== undefined && onOpenFilm !== undefined;
    const canAdd = onAddFilmAtNextTimepoint !== undefined;
    const addLabel = `Add a film at ${nextTimepointLabel !== undefined
      ? nextTimepointLabel : 'a new timepoint'}`;
    return (
      <section className={classes.trend} aria-label="Measurement trend">
        <div className={classes.findings_head}>
          <h3 className={classes.findings_title}>Measurement trend</h3>
          <span className={cx(classes.chip, classes.chip__muted)}>
            Nothing to plot yet
          </span>
          <span className={classes.records_spacer} />
        </div>
        {/* The well is the panel's whole width (`.trend_empty`); the block inside
            it is the records panel's own centred empty state (`.empty`), which is
            what makes the two states one construction. */}
        <div className={classes.trend_empty}>
        <div className={classes.empty}>
          <TrendEmptyArt />
          <p className={classes.empty_title}>
            Needs two traced films at different dates
          </p>
          <p className={classes.empty_hint}>{reason}</p>
          {undated > 0 ? (
            <p className={classes.empty_hint}>
              {undated === 1
                ? '1 film that reports carries no capture date'
                : `${undated} films that report carry no capture date`}
              {' '}and cannot be placed on an axis — add the day it was taken
              from its card above.
            </p>
          ) : null}
          {canTrace || canAdd ? (
            <span className={classes.empty_action}>
              <RaisedButton
                primary
                className={classes.primary_action}
                label={canTrace
                  ? `Open ${this.filmLabel(untraced)} to trace`
                  : addLabel}
                icon={canTrace
                  ? undefined
                  : <IconAdd color="#FFFFFF" style={{ width: 18, height: 18 }} />}
                labelStyle={{ textTransform: 'none', fontWeight: 600 }}
                onClick={canTrace
                  ? this.openFilm(untraced.record)
                  : onAddFilmAtNextTimepoint}
              />
            </span>
          ) : null}
          {canTrace && canAdd ? (
            <button
              type="button"
              className={classes.trend_empty_alt}
              onClick={onAddFilmAtNextTimepoint}
            >
              {addLabel}
            </button>
          ) : null}
        </div>
        </div>
      </section>
    );
  };

  /** A film as this record names it: its timepoint, else its day. */
  private filmLabel = (film: FilmFindings): string => {
    const token = getTimepointToken(film.record.timepoint);
    if (token !== null) {
      return token;
    }
    const date = formatCaptureDate(film.record.captureDate);
    return date !== null ? date : 'the film';
  };

  private openFilm = (record: PatientRecord) => () => {
    const { onOpenFilm } = this.props;
    if (onOpenFilm !== undefined) {
      onOpenFilm(record);
    }
  };

  /** The cell's own tooltip: what the measurement is, and where it was read. */
  private cellTitle = (series: TrendSeries, films: TrendFilm[]): string => {
    const head = series.name !== null
      ? `${series.symbol} — ${series.name}` : series.symbol;
    const where = series.points.map((point) => {
      const film = films[point.film];
      const when = film.token !== null
        ? film.token : (film.date !== null ? film.date : 'a film');
      return `${when} ${displayNumber(point.value)}${series.unit}`;
    }).join(' → ');
    return `${head} · ${where}`;
  };

  /**
   * The selection: the clinician's, or the chart's defaults while they have made
   * none. A chosen symbol that the record has stopped reporting (a film removed,
   * an analysis changed) drops out rather than leaving a gap in the grid.
   */
  private getSelected = (series: TrendSeries[]): string[] => {
    const { selected } = this.state;
    if (selected !== null) {
      return selected.filter(
        (symbol) => series.some((one) => one.symbol === symbol),
      );
    }
    // The measurements this analysis is read for — one per finding it names, in
    // its own order (see `BOARD`). Where an analysis names none of its components
    // (Björk reports five angles and no diagnosis), the first few it does report
    // make the board, which is the whole of what can be done.
    const covered: string[] = [];
    const chosen: string[] = [];
    series.forEach((one) => {
      const fresh = one.findings.filter(
        (finding) => covered.indexOf(finding) < 0,
      );
      if (fresh.length === 0 || chosen.length >= BOARD) {
        return;
      }
      fresh.forEach((finding) => covered.push(finding));
      chosen.push(one.symbol);
    });
    series.forEach(({ symbol }) => {
      if (chosen.length < BOARD && chosen.indexOf(symbol) < 0) {
        chosen.push(symbol);
      }
    });
    // In the picker's order, so a cell is where its chip is.
    return series
      .filter(({ symbol }) => chosen.indexOf(symbol) >= 0)
      .map(({ symbol }) => symbol);
  };

  private toggle = (symbol: string, series: TrendSeries[]) => () => {
    const current = this.getSelected(series);
    const next = current.indexOf(symbol) >= 0
      ? current.filter((one) => one !== symbol)
      // Kept in the picker's own order, so ticking a measurement puts its cell
      // where its chip is rather than at the end of the grid.
      : series
        .filter((one) => one.symbol === symbol || current.indexOf(one.symbol) >= 0)
        .map((one) => one.symbol);
    this.setState({ selected: next });
  };

  private selectAll = (series: TrendSeries[]) => () =>
    this.setState({ selected: series.map(({ symbol }) => symbol) });

  /** Cleared deliberately, and recoverable: `Reset` is beside it. */
  private selectNone = () => this.setState({ selected: [] });

  private resetSelection = () => this.setState({ selected: null });
}
