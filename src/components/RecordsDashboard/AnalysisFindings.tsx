import * as React from 'react';

import * as cx from 'classnames';

import map from 'lodash/map';

import { PatientRecord } from 'store/reducers/workspace';

import { RecordAnalysis } from './selectors';

// One set of formatters for every number this app shows a clinician. The
// Summary dialog exports them, the printed report imports them, and so does
// this panel — a dashboard that rounds or signs a value its own Summary sets
// differently is worse than one that says nothing.
import {
  caveatMarkers,
  chipToneFor,
  displayDeviation,
  displayNorm,
  displayNumber,
  displaySigned,
  findingOrderOf,
  getSeverityStars,
  getUnitSuffix,
  orderFindings,
  roundToDisplay,
  FindingOrder,
  HeadlineFinding,
  STARS,
} from 'components/AnalysisResultsViewer';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';

// The report's wording for the measurements a tracing cannot produce yet: the
// note is a worklist, and it should read the same on the chart and on paper.
import {
  missingLandmarksNote,
  missingLandmarksFact,
  DEVIATION_STAR_STEPS,
  DEVIATION_STAR_SCALE,
} from 'components/ClinicalReport/copy';

import {
  hasNorm,
  isSdBand,
  normSd,
  rangeExcess,
} from 'analyses/helpers';

// What a *change* between two films may and may not be read as. The
// superimposition view owns these two rules and this panel reports the same
// quantity, so it reads them from the same module rather than restating them.
import {
  isWithinPlottingError,
  measurementKind,
  MeasurementKind,
  PLOTTING_ERROR,
} from 'analyses/superimposition';

import {
  getTimepointToken,
  formatCaptureDate,
  getImageTypeLabel,
} from 'utils/records';

const classes = require('./style.scss');

/**
 * One traced film, as this panel needs it: the record itself, what its analysis
 * reports, and — when the norms could not be read against the patient's age —
 * which of the two dates was missing.
 */
export interface FilmFindings {
  record: PatientRecord;
  analysis: RecordAnalysis;
  /**
   * Which fact is missing when the patient's age on the day of this film cannot
   * be known: the birth date or the film's own day. Null when it can.
   */
  ageGap: 'dateOfBirth' | 'captureDate' | null;
  /** The analysis' display name, from the app's one analysis-name source. */
  analysisName: string | null;
}

type ResultComponent =
  CategorizedAnalysisResult<Category>['relevantComponents'][0];

/**
 * One measurement of the film, graded exactly as the Summary grades it.
 *
 * Exported for the trend chart beside this panel (`./TrendChart`), which plots
 * the very same rows across the record's timepoints: one reading of one
 * evaluation, so a value cannot be graded amber in the table and clean in the
 * chart 300px above it.
 */
export interface ValueRow {
  symbol: string;
  name: string | null;
  component: ResultComponent;
  unit: string;
  /** Angular, linear or dimensionless — what a change of it is measured in. */
  kind: MeasurementKind;
  stars: 0 | 1 | 2 | 3;
  /** A range component lying beyond one of its published bounds. */
  outOfRange: boolean;
  /** True when this row left its norm at all, on either kind of norm. */
  isOutside: boolean;
  /**
   * Standardized deviation (value − mean) / SD, and the same clamped to the
   * ±3 SD axis the strip is drawn on. Null for a row whose norm is a published
   * range: a range has no standard deviation, so it has no place on an axis
   * measured in them (the same rule the report's wigglegram follows).
   */
  z: number | null;
  zClamped: number | null;
  /**
   * The two bounds of a **published range**, when that is what this row is
   * graded against. A range has no SD axis to sit on, but it does have an axis
   * of its own — its own bounds, in its own unit — which is what the strip draws
   * for these rows instead of leaving half the block's widest column blank.
   */
  range: { min: number; max: number } | null;
  /**
   * The findings this measurement was grouped under by the analysis itself —
   * the categories of every result group that lists it. The chips at the top of
   * the block are those findings; this is the link between them.
   */
  categories: Category[];
  /**
   * The footnote marker of the caveat this measurement is implicated in, when
   * the analysis raised one about it — the Summary's own marker, from the
   * Summary's own map (see `caveatMarkers`).
   */
  marker: string | null;
}

/** How a measurement moved since the last film of this record that reported it. */
interface RowChange {
  /** Later value − earlier value, both rounded to the decimal shown. */
  change: number;
  /**
   * True when this is not a change to read: either exactly nothing at the shown
   * decimal, or under the hand-plotting reproducibility floor for its kind.
   *
   * The zero is tested *first and for every kind*, because it is not a claim
   * about reproducibility at all — it is the two films reporting the same figure.
   * `isWithinPlottingError` has no floor to offer a dimensionless ratio (rightly:
   * none is published), so a ratio that had not moved by so much as a tenth of a
   * per cent used to print "0.0 %" in full weight beside six angular rows
   * printing "0.0°" dimmed — one fact, two presentations, and the boldest ink in
   * the block belonging to a zero.
   */
  isWithinError: boolean;
  /** Exactly nothing at the decimal shown, as against merely too small to read. */
  isZero: boolean;
  /** The film it is measured against, named as the record names it. */
  fromLabel: string;
}

/** One film, with everything the block prints already resolved against the rest. */
interface FilmView {
  film: FilmFindings;
  /** The analysis' conclusions, in the order every block of the panel uses. */
  findings: HeadlineFinding[];
  /** Every measurement the film reports, once each. */
  rows: ValueRow[];
  /** Those that left their norm, in the order every block of the panel uses. */
  outside: ValueRow[];
  /** Change since the previous film that reported the same measurement. */
  changes: { [symbol: string]: RowChange | undefined };
  /** Whether any earlier film of this record reports anything at all. */
  hasEarlierFilm: boolean;
  /**
   * The cross-reference between the chips and the rows: a number per finding
   * that has at least one row in the table below it, and the numbers each row
   * carries.
   *
   * Only findings with a row are numbered, so every number resolves in both
   * directions — chip to rows, row to chip. A chip with no number is a finding
   * whose measurements all sit inside their norms, which is why none of them is
   * in a table of what left them.
   */
  chipKey: { [index: number]: number | undefined };
  rowKeys: { [symbol: string]: number[] | undefined };
}

/**
 * Every measurement the film reports, once each, graded against its own norm and
 * kept in the **analysis' own component order**.
 *
 * A measurement can support two findings (Downs' facial angle backs both the
 * skeletal profile and the prominence of the chin), so it appears in two of the
 * result groups; it is listed here under the first of them, which is the rule
 * the Summary's table and the report's tables both follow (see
 * `AnalysisResultsViewer/grouping`).
 *
 * Exported for the trend chart (`./TrendChart`) for the same reason `ValueRow`
 * is: the chart plots what this table tabulates, and it must be the same rows
 * built the same way rather than a second reading of the same results array.
 */
export const buildValueRows = (
  results: RecordAnalysis['results'],
  landmarksBySymbol: RecordAnalysis['landmarksBySymbol'],
  markers: { [symbol: string]: string | undefined },
): ValueRow[] => {
  // Every group a measurement is listed under, before any row is built: a
  // measurement tabulated under the first of two findings still *supports* both,
  // and the block's chips are those findings (see `FilmView.chipKeys`).
  const categoriesOf: { [symbol: string]: Category[] | undefined } = {};
  results.forEach(({ category, relevantComponents }) => {
    relevantComponents.forEach(({ symbol }) => {
      const list = categoriesOf[symbol];
      if (list === undefined) {
        categoriesOf[symbol] = [category];
      } else if (list.indexOf(category) < 0) {
        list.push(category);
      }
    });
  });
  const seen: { [symbol: string]: true } = {};
  const rows: ValueRow[] = [];
  results.forEach(({ relevantComponents }) => {
    relevantComponents.forEach((component) => {
      const { symbol, value, mean, min, max, band } = component;
      if (seen[symbol] === true) {
        return;
      }
      seen[symbol] = true;
      const landmark = landmarksBySymbol[symbol];
      const landmarkName = landmark !== undefined ? landmark.name : undefined;
      const name = landmarkName !== undefined && landmarkName !== symbol
        ? landmarkName : null;
      const graded = hasNorm(mean, min, max);
      const stars = getSeverityStars(value, mean, min, max, band);
      const outOfRange = graded && !isSdBand(band) &&
        rangeExcess(value, min, max) !== 0;
      const sd = normSd(mean, min, max, band);
      const z = isFinite(sd) && sd > 0 ? (value - mean) / sd : null;
      const marker = markers[symbol];
      const categories = categoriesOf[symbol];
      rows.push({
        symbol,
        name,
        component,
        unit: getUnitSuffix(landmark),
        kind: measurementKind(landmark),
        stars,
        outOfRange,
        isOutside: stars > 0 || outOfRange,
        z,
        zClamped: z !== null ? Math.max(-3, Math.min(3, z)) : null,
        // Its own bounds are an axis; half of them is not a standard deviation.
        range: graded && !isSdBand(band) && max > min
          ? { min, max } : null,
        categories: categories !== undefined ? categories : [],
        marker: marker !== undefined ? marker : null,
      });
    });
  });
  return rows;
};

/**
 * How the panel's blocks are laid out against each other — the whole reason this
 * is computed here and not inside a block.
 *
 * Two things were wrong with ranking each film on its own. Ordering by grade
 * *re-ranked every block*: "Skeletal profile" was chip 4 on the first film, chip
 * 1 on the second and chip 3 on the third, and L1-OP was row 1 then row 2 while
 * NAPog was row 3 then row 1 — nothing lined up down a panel whose whole claim
 * is that it is a chronology. And a rank ladder that put every SD row above
 * every range row made a range-excess row unreachable while any single-star row
 * existed: Jarabak's facial-height ratios, 9.5 % and 7.8 % outside published
 * ranges, sat behind "+4 more in the Summary".
 *
 * So: one canonical order for the whole panel, taken from the analyses' own
 * component order (first film first, anything new appended in its own order),
 * every outside-norm row shown, and grade carried by ink, stars and the strip
 * rather than by position. The one exception is a measurement the analysis
 * itself has raised a caveat about — those are demoted below the clean rows, so
 * a reader meets three sound findings before three that may be an artefact of one
 * misplaced landmark.
 */
const buildViews = (films: FilmFindings[]): FilmView[] => {
  const canonical: { [symbol: string]: number | undefined } = {};
  let nextSlot = 0;
  const staged = films.map((film) => {
    const markers = caveatMarkers(film.analysis.caveats);
    const rows = buildValueRows(
      film.analysis.results, film.analysis.landmarksBySymbol, markers,
    );
    rows.forEach(({ symbol }) => {
      if (canonical[symbol] === undefined) {
        canonical[symbol] = nextSlot;
        nextSlot += 1;
      }
    });
    return { film, rows };
  });

  // The chip order every block keeps: the first *reporting* film's own
  // worst-first ranking, pinned for the rest (see `orderFindings`).
  let pinned: FindingOrder | undefined;
  staged.forEach(({ film }) => {
    if (pinned !== undefined) {
      return;
    }
    const first = orderFindings(film.analysis.results);
    if (first.length > 0) {
      pinned = findingOrderOf(first);
    }
  });

  const slotOf = (symbol: string) => {
    const slot = canonical[symbol];
    return slot !== undefined ? slot : nextSlot;
  };

  return staged.map(({ film, rows }, index) => {
    const changes: { [symbol: string]: RowChange | undefined } = {};
    let hasEarlierFilm = false;
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      if (staged[earlier].rows.length > 0) {
        hasEarlierFilm = true;
        break;
      }
    }
    rows.forEach((row) => {
      const value = row.component.value;
      if (!isFinite(value)) {
        return;
      }
      for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
        const previous = staged[earlier].rows.filter(
          (r) => r.symbol === row.symbol && isFinite(r.component.value),
        )[0];
        if (previous === undefined) {
          continue;
        }
        // Rounded first, so the printed change is the difference between the two
        // printed values — the rule the superimposition's change table follows.
        const change = roundToDisplay(
          roundToDisplay(value) - roundToDisplay(previous.component.value),
        );
        const record = staged[earlier].film.record;
        const token = getTimepointToken(record.timepoint);
        const date = formatCaptureDate(record.captureDate);
        changes[row.symbol] = {
          change,
          // Zero first, and for every kind (see `RowChange.isWithinError`).
          isWithinError: change === 0 ||
            isWithinPlottingError(row.kind, change),
          isZero: change === 0,
          fromLabel: token !== null
            ? token : (date !== null ? date : 'the earlier film'),
        };
        break;
      }
    });
    const outside = rows
      .filter((row) => row.isOutside)
      .map((row) => ({
        row,
        // A caveated row sits under the clean ones, never above them.
        tier: row.marker !== null ? 1 : 0,
        slot: slotOf(row.symbol),
      }))
      .sort((a, b) => (a.tier - b.tier) || (a.slot - b.slot))
      .map(({ row }) => row);
    // The chips and the rows, tied together: a number per finding that has a row
    // under it, and the same number on that row.
    const findings = orderFindings(film.analysis.results, pinned);
    const chipKey: { [index: number]: number | undefined } = {};
    const rowKeys: { [symbol: string]: number[] | undefined } = {};
    let nextKey = 1;
    findings.forEach(({ category }, index) => {
      const supported = outside.filter(
        (row) => row.categories.indexOf(category) >= 0,
      );
      if (supported.length === 0) {
        return;
      }
      const key = nextKey;
      nextKey += 1;
      chipKey[index] = key;
      supported.forEach((row) => {
        const keys = rowKeys[row.symbol];
        if (keys === undefined) {
          rowKeys[row.symbol] = [key];
        } else {
          keys.push(key);
        }
      });
    });
    return {
      film,
      findings,
      rows,
      outside,
      changes,
      hasEarlierFilm,
      chipKey,
      rowKeys,
    };
  });
};

/**
 * An author's name in the possessive — "Downs'", "Steiner's". Only ever applied
 * to `NormsProvenance.author`, which is a published author's name and not free
 * text.
 */
const possessive = (author: string): string => (
  /s$/.test(author) ? `${author}’` : `${author}’s`
);

/** "four age-indexed figures and one sex-split figure". */
const indexedClause = (ageIndexed: number, sexIndexed: number): string => {
  const parts: string[] = [];
  if (ageIndexed > 0) {
    parts.push(`${ageIndexed} age-indexed ` +
      `${ageIndexed === 1 ? 'figure' : 'figures'}`);
  }
  if (sexIndexed > 0) {
    parts.push(`${sexIndexed} sex-split ` +
      `${sexIndexed === 1 ? 'figure' : 'figures'}`);
  }
  return parts.join(' and ');
};

/**
 * The sentence that says what this film's norms actually are — the one caveat a
 * table of deviations cannot be read without.
 *
 * It is **the analysis' own sentence** wherever the analysis writes one
 * (`NormsProvenance.patientNote`: Ricketts names the four figures it corrected
 * and to what, Jacobson's Wits names the sex mean it graded against), and
 * otherwise it states the truth about that analysis rather than a correction
 * that did not happen. This panel used to open with "Norms corrected for age
 * 14 y 9 m and for sex (female), where the analysis' author indexed them" on
 * *every* film of *every* analysis — on Downs, Steiner, Jarabak, Björk, the
 * dental and the soft-tissue analyses the leading words were simply false, and
 * the trailing clause did not undo them.
 */
/**
 * The norms line, split the way this file already splits a caveat (see
 * `Caveats`): the figures on screen, the methodology behind them in the
 * element's title and on paper.
 *
 * Set verbatim, Ricketts' sentence was 60–90 words — three lines of 10px grey
 * and physically the largest element in the block, bigger than the measurement
 * table it qualifies. What a clinician needs at a glance is *which figures these
 * norms are*; why a growth coefficient stops at 18 is what they need once, on
 * the filed chart. `NormsProvenance.patientLede` is the analysis' own compact
 * form of its own sentence, never this panel cutting one at a full stop.
 */
interface NormsLine {
  /** The figures, in one scannable run. */
  lede: string;
  /** The methodology, when the analysis writes more than its figures. */
  full: string | null;
}

const normsNote = (film: FilmFindings): NormsLine => {
  const { provenance, context, ageIndexedCount, sexIndexedCount } =
    film.analysis;
  if (provenance === null) {
    return {
      lede: 'This analysis states no norms provenance in this app, so nothing ' +
        'here is corrected for age or sex.',
      full: null,
    };
  }
  const author = possessive(provenance.author);
  const patientNote = typeof provenance.patientNote === 'function'
    ? provenance.patientNote(context) : undefined;
  if (patientNote === undefined) {
    if (ageIndexedCount === 0 && sexIndexedCount === 0) {
      return {
        lede: `${author} norms as published — this analysis indexes none of ` +
          'its figures by age or sex.',
        full: null,
      };
    }
    // Only the fact that is actually missing is asked for: the film's own
    // capture date is stamped in this block's head, 40px above this line.
    const gap = film.ageGap === 'dateOfBirth' && ageIndexedCount > 0
      ? ' Record a date of birth to correct them for age.'
      : (film.ageGap === 'captureDate' && ageIndexedCount > 0
        ? ' The age used is the age today — record this film’s capture date to ' +
          'correct them for the age on the day of the film.'
        : '');
    return {
      lede: `${author} norms as published, apart from ` +
        `${indexedClause(ageIndexedCount, sexIndexedCount)}, corrected from ` +
        'this record wherever it holds the age or the sex they need.' + gap,
      full: null,
    };
  }
  const patientLede = typeof provenance.patientLede === 'function'
    ? provenance.patientLede(context) : undefined;
  // An age-indexed norm is read against the age *on the film*. Where the film
  // carries no capture date the app has only today's date to age the patient
  // to, and the figures above would quote that age without saying so.
  const dated = film.ageGap === 'captureDate' && ageIndexedCount > 0 &&
    typeof context.ageInYears === 'number'
    ? ' This film carries no capture date, so that age is the age today ' +
      'rather than the age on the day of the film.'
    : '';
  if (patientLede === undefined) {
    return { lede: patientNote + dated, full: null };
  }
  return { lede: patientLede + dated, full: patientNote + dated };
};

/** The block's own identification of the film: its timepoint and its day. */
const FilmStamp = ({ record }: { record: PatientRecord }) => {
  const label = record.timepoint;
  const token = getTimepointToken(label);
  const date = formatCaptureDate(record.captureDate);
  // The pill carries the label's first token and the rest of a free-text label
  // is written beside it — the app's one timepoint badge (the timeline's stamp
  // and the Summary's title row are the same construction). Set whole in the
  // pill it would be cut; dropped, half of what the clinician typed would
  // simply not be on the page, and "T2" alone cannot be told from the "T2
  // post-treatment" the timeline stamps 300px above.
  const rest = (label !== null && token !== null)
    ? label.trim().slice(token.length).trim() : '';
  return (
    <span className={classes.fb_stamp}>
      <span
        className={cx(classes.timepoint, classes.fb_timepoint, {
          [classes.timepoint__unset]: label === null,
        })}
        title={label !== null ? label : 'This film carries no timepoint label'}
      >
        <span className={classes.timepoint_label}>
          {token !== null ? token : 'No timepoint'}
        </span>
      </span>
      {rest !== '' ? (
        <span className={classes.fb_note_label} title={label as string}>
          {rest}
        </span>
      ) : null}
      {/* Paper only: the visit's whole name as one run of type, in place of the
          reversed-out pill and the grey note beside it — the same swap the
          timeline's own stamp makes (see `.visit_print`), so one visit is called
          one thing on the sheet. */}
      <span className={classes.visit_print}>
        {label !== null ? label.trim() : 'No timepoint label'}
      </span>
      {date !== null ? (
        <span className={classes.fb_date}>{date}</span>
      ) : (
        <span className={cx(classes.fb_date, classes.fb_date__unset)}>
          No capture date
        </span>
      )}
    </span>
  );
};

/**
 * The row's standardized deviation, drawn as the printed report's wigglegram
 * draws it: the norm band shaded (±1 SD dark, ±2 SD light) on a ±3 SD axis,
 * the mean marked, and the value as a dot carrying the same severity ink as the
 * number beside it. Beyond ±3 SD the dot becomes the outward-pointing marker
 * that chart uses, so a value off the axis is never drawn as one on it.
 *
 * A row graded against a *published range* is **not** plotted on that axis: its
 * author stated no standard deviation, and halving a range to manufacture one is
 * exactly the error that once printed a six-SD finding for Jarabak's ratio. It
 * gets the axis it does have — its own two bounds, in its own unit, hatched
 * between them and one range-width of paper beyond each — drawn unmistakably
 * unlike the SD strip (grey hatch, bound ticks, and no mean line, because a
 * range has no mean). Left with no strip at all, the four facial-height ratios a
 * clinician runs Jarabak *for* were the four blank rows in the block's widest
 * column, deviations of +7.8 %, +6.9 %, +1.7 % and −9.5 % with no graphical
 * reading of any of them.
 */
const StripDot = (
  { position, tone, low, clamped }: {
    /** Where on the axis, 0 at its left end and 1 at its right. */
    position: number;
    tone: 0 | 1 | 2;
    low: boolean;
    clamped: boolean;
  },
) => (
  <span
    className={cx(classes.fv_dot, {
      [classes.fv_dot__warn]: tone === 1,
      [classes.fv_dot__error]: tone === 2,
      [classes.fv_dot__clamped]: clamped,
    })}
    // The off-axis marker is inset by its own half-width: centred on the axis
    // end, the glyph that means "this value is off the axis" was itself the one
    // mark clipped by the column's edge.
    style={{
      left: clamped
        ? (low ? '5px' : 'calc(100% - 5px)')
        : `${position * 100}%`,
    }}
  >
    {clamped ? (low ? '◂' : '▸') : ''}
  </span>
);

const DeviationStrip = ({ row }: { row: ValueRow }) => {
  const { z, zClamped, stars, outOfRange, range, unit, component } = row;
  const { value, mean, min, max } = component;
  if (z !== null && zClamped !== null) {
    const clamped = Math.abs(z) > 3;
    return (
      <span
        className={classes.fv_strip}
        role="cell"
        title={`${displaySigned(z)} SD from the norm mean`}
      >
        <span className={classes.fv_strip_mean} />
        <StripDot
          position={(zClamped + 3) / 6}
          tone={stars >= 2 ? 2 : (stars === 1 ? 1 : 0)}
          low={z < 0}
          clamped={clamped}
        />
      </span>
    );
  }
  if (range !== null) {
    const width = range.max - range.min;
    const fraction = (value - (range.min - width)) / (width * 3);
    const clamped = fraction < 0 || fraction > 1;
    const excess = rangeExcess(value, range.min, range.max);
    return (
      <span
        className={cx(classes.fv_strip, classes.fv_strip__range)}
        role="cell"
        title={`Published range ${displayNumber(range.min)} to ` +
          `${displayNumber(range.max)}${unit}, hatched; this film ` +
          `${displayNumber(value)}${unit}, ` +
          (excess === 0
            ? 'inside it'
            : `${displaySigned(excess)}${unit} outside it`) +
          `. The axis runs ${displayNumber(range.min - width)} to ` +
          `${displayNumber(range.max + width)}${unit} — one range-width beyond ` +
          'each bound. Its author published no standard deviation, so this is ' +
          'not an SD axis.'}
      >
        <StripDot
          position={Math.max(0, Math.min(1, fraction))}
          tone={outOfRange ? 1 : 0}
          low={fraction < 0.5}
          clamped={clamped}
        />
      </span>
    );
  }
  return (
    <span
      className={cx(classes.fv_strip, classes.fv_strip__none)}
      role="cell"
      title={hasNorm(mean, min, max)
        ? 'Graded against a published normal range with no usable bounds, so ' +
          'there is no axis to plot it on'
        : 'Reported without a published norm'}
    />
  );
};

/** One measurement row: value, norm and signed deviation, as the Summary sets them. */
const ValueLine = (
  { row, change, hasEarlierFilm, keys, showChange, showStrip, chipsFor }: {
    row: ValueRow;
    change: RowChange | undefined;
    hasEarlierFilm: boolean;
    /** The numbers of the findings this row supports (see `FilmView.chipKey`). */
    keys: number[];
    /** False when nothing in the whole panel has a change to show. */
    showChange: boolean;
    /** False when no row in this block has any axis to be plotted on. */
    showStrip: boolean;
    /** The findings this row's keys point at, named, for the key's own title. */
    chipsFor(keys: number[]): string;
  },
) => {
  const { symbol, name, unit, stars, outOfRange, marker } = row;
  const { value, mean, min, max, band } = row.component;
  const graded = hasNorm(mean, min, max);
  const floor = row.kind === 'angular'
    ? `±${PLOTTING_ERROR.angular}°`
    : `±${PLOTTING_ERROR.linear} mm`;
  return (
    <div
      className={cx(classes.fv_row, {
        [classes.fv_row__flagged]: marker !== null,
      })}
      role="row"
    >
      <span className={classes.fv_measure} role="rowheader">
        <span className={classes.fv_symbol}>
          {symbol}
          {/* The Summary's marker, on the Summary's rows. Without it this panel
              showed three caveated angles as a film's leading findings and put
              the caveat underneath them. */}
          {marker !== null ? (
            <span
              className={classes.fv_mark}
              title="See the caveat under these rows"
            >
              {marker}
            </span>
          ) : null}
        </span>
        {/* Which of the block's chips this measurement is one of the readings
            behind. Numbered rather than named: the category's own words ("Lower
            incisor inclination") are 150px of caps in a cell that is already the
            one column in this grid that truncates. */}
        {keys.length > 0 ? (
          <span
            className={classes.fv_key}
            title={`Read for ${chipsFor(keys)} — numbered on the chips above`}
          >
            {keys.join(' ')}
          </span>
        ) : null}
        {name !== null ? (
          <span className={classes.fv_name} title={name}>{name}</span>
        ) : null}
      </span>
      <span
        role="cell"
        className={cx(classes.fv_value, {
          [classes.fv_value__warn]: stars === 1 || outOfRange,
          [classes.fv_value__error]: stars >= 2,
        })}
      >
        {displayNumber(value)}{unit}
      </span>
      <span
        className={classes.fv_norm}
        role="cell"
        title={!graded
          ? 'Measured value — this app states no published norm for it'
          : isSdBand(band)
            ? `Mean ± 1 SD (${displayNumber(min)} to ${displayNumber(max)}${unit})`
            : 'Published normal range, no standard deviation stated'}
      >
        {displayNorm(mean, min, max, band)}
        {graded && !isSdBand(band) ? (
          <span className={classes.fv_norm_kind}>range</span>
        ) : null}
      </span>
      <span
        role="cell"
        className={cx(classes.fv_dev, {
          [classes.fv_dev__warn]: stars === 1 || outOfRange,
          [classes.fv_dev__error]: stars >= 2,
        })}
      >
        {displayDeviation(value, mean, min, max, unit, band)}
        <span className={classes.fv_stars}>{stars > 0 ? STARS[stars] : ''}</span>
      </span>
      {showStrip ? <DeviationStrip row={row} /> : null}
      {!showChange ? null : change !== undefined ? (
        <span
          role="cell"
          className={cx(classes.fv_change, {
            [classes.fv_change__within]: change.isWithinError,
          })}
          title={change.isZero
            ? `The same figure on both films — ${displayNumber(value)}${unit} ` +
              `on this one and on ${change.fromLabel}, so there is no change ` +
              'to read'
            : change.isWithinError
              ? `${displaySigned(change.change)}${unit} since ` +
                `${change.fromLabel} — within hand-plotting error (${floor}), ` +
                'so it is the same measurement taken twice rather than a change'
              : `${displaySigned(change.change)}${unit} since ${change.fromLabel}`}
        >
          {displaySigned(change.change)}{unit}
        </span>
      ) : (
        <span
          role="cell"
          className={cx(classes.fv_change, classes.fv_change__none)}
          title={hasEarlierFilm
            ? 'No earlier film of this record reports this measurement'
            : 'The first film on record — nothing to compare it with'}
        >
          —
        </span>
      )}
    </div>
  );
};

/**
 * What the analysis says about the *tracing* rather than about the patient, set
 * as the one line it takes to act on it (`AnalysisCaveat.lede`) and anchored
 * directly under the rows it marks.
 *
 * The full paragraph is not lost: it is the row's title on screen, and it is
 * what prints — a filed chart carries the whole caveat, a 280px block carries
 * the instruction. Set verbatim here, Jarabak's articulare caveat was 60 words
 * of amber prose and the largest single element in the block.
 */
const Caveats = (
  { caveats, markerFor }: {
    caveats: AnalysisCaveat[];
    markerFor(caveat: AnalysisCaveat): string | null;
  },
) => {
  if (caveats.length === 0) {
    return null;
  }
  return (
    <div className={classes.fb_caveats}>
      {map(caveats, (caveat, i) => {
        const marker = markerFor(caveat);
        const lede = caveat.lede !== undefined ? caveat.lede : caveat.text;
        return (
          <p key={i} className={classes.fb_caveat}>
            {marker !== null ? (
              <span className={classes.fb_caveat_mark}>{marker}</span>
            ) : null}
            {/* …and the same rule as the norms line: a caveat that never wrote a
                one-line form has only this text, so this text is what prints. */}
            <span
              className={cx(classes.fb_caveat_lede, {
                [classes.fb_caveat_lede__whole]: caveat.lede === undefined,
              })}
              title={caveat.text}
            >
              {lede}
            </span>
            {caveat.lede !== undefined ? (
              <span className={classes.fb_caveat_full}>{caveat.text}</span>
            ) : null}
          </p>
        );
      })}
    </div>
  );
};

/**
 * The norms line, set the way this panel sets a caveat: the figures on screen,
 * the methodology in the element's title and on the filed chart.
 */
const NormsLineNote = ({ film }: { film: FilmFindings }) => {
  const { lede, full } = normsNote(film);
  return (
    <p className={classes.fb_note}>
      <span className={classes.fb_note_key}>Norms</span>
      {/* When the analysis writes nothing beyond its figures, the figures *are*
          the whole note and they print: hiding the lede on paper in favour of a
          full text that does not exist filed a chart whose norms line was the
          word "Norms" and nothing else. */}
      <span
        className={cx(classes.fb_norms_lede, {
          [classes.fb_norms_lede__whole]: full === null,
        })}
        title={full !== null ? full : undefined}
      >
        {lede}
      </span>
      {full !== null ? (
        <span className={classes.fb_norms_full}>{full}</span>
      ) : null}
    </p>
  );
};

/** One traced film's block: the headline, then the numbers behind it. */
const FilmBlock = (
  { view, onOpen, showChange, hoistNorms }: {
    view: FilmView;
    onOpen(record: PatientRecord): void;
    /** False when nothing in the whole panel has a change: the column goes. */
    showChange: boolean;
    /** True when every block's norms line is the same and is stated once below. */
    hoistNorms: boolean;
  },
) => {
  const {
    film, findings, rows, outside, changes, hasEarlierFilm, chipKey, rowKeys,
  } = view;
  const { record, analysis, analysisName } = film;
  const {
    caveats, reportedCount, totalCount,
    pendingScaleCount, missingLandmarkCount, missingSymbols, analysisId,
    plottedAnalyses, reportableAnalyses,
  } = analysis;
  // Which strips this block can honestly draw: a ±3 SD axis for its SD-graded
  // rows, and each range-graded row's own bounds for the rest. A block with
  // neither drops the column and its axis outright, rather than reserving 480px
  // of the widest column in the grid for nothing and heading it with a scale.
  const hasSd = outside.some((row) => row.z !== null);
  const showStrip = hasSd || outside.some((row) => row.range !== null);
  const markers = caveatMarkers(caveats);
  const markerFor = (caveat: AnalysisCaveat) => {
    const marker = caveat.symbols.length > 0
      ? markers[caveat.symbols[0]] : undefined;
    return marker !== undefined ? marker : null;
  };
  // Why the film has no findings, said in the analysis' own terms rather than
  // left as an empty row. Same branch order the report's contents page uses.
  //
  // Each reason is written twice: as the screen's next step, and as the sheet's
  // statement of record. A filed chart that says "run Auto-plot from the
  // toolbar" is instructing a reader who has no toolbar, and it is the one line
  // of the block — so on paper it says what is on file instead.
  const nothingReported: { screen: string; print: string } | null =
    analysisId === null
      ? {
        screen: 'No analysis is set on this film.',
        print: 'No analysis is set on this film.',
      }
      : rows.length === 0
        ? (record.landmarksPlaced === 0
          ? {
            screen: 'Not traced yet — plot the analysis’ landmarks, or run ' +
              'Auto-plot from the toolbar, and the findings appear here.',
            print: 'Not traced — no measurements on file.',
          }
          : totalCount > 0 && pendingScaleCount === totalCount
            ? {
              screen: 'Every measurement of this analysis is linear — the film ' +
                'needs a mm/px scale before any of them can be reported.',
              print: 'Every measurement of this analysis is linear — the film ' +
                'carries no mm/px scale, so none of them is reported.',
            }
            : {
              screen: 'Nothing computes from this tracing yet.',
              print: 'Nothing computes from this tracing yet.',
            })
        : null;
  // The block's head is the way to the film it describes. It used to carry a
  // filled pill in the app's primary tint — the same object as the interactive
  // chips on the record card 300px above — while the panel held nothing
  // focusable at all, and its only route to the film was a sentence telling the
  // reader to scroll up and find it.
  const identity = [
    record.timepoint, getImageTypeLabel(record.type),
    formatCaptureDate(record.captureDate),
  ].filter((part) => part !== null).join(' · ');
  // What the *tracing* can carry, as against what this one analysis reports from
  // it: an analysis every one of whose manual landmarks is already on this film
  // can be set on it and read without plotting anything further. The scope this
  // panel documents ("which analyses can this film report") was computed for
  // every film on every recompute and shown nowhere.
  const plotted = plottedAnalyses.length;
  const reportable = reportableAnalyses.length;
  // The findings this row's numbers point at, named — for the number's title.
  const chipsFor = (keys: number[]): string => {
    const named: string[] = [];
    findings.forEach(({ category, indication }, index) => {
      if (keys.indexOf(chipKey[index] as number) < 0) {
        return;
      }
      named.push(`${mapCategoryToString(category) || '—'} — ` +
        `${mapIndicationToString(indication) || '—'}`);
    });
    return named.join('; ');
  };
  return (
    <article className={classes.fb}>
      <button
        type="button"
        className={classes.fb_head}
        onClick={() => onOpen(record)}
        title={`Open ${identity} in the tracing editor`}
      >
        <FilmStamp record={record} />
        <span className={classes.fb_spacer} />
        {analysisName !== null ? (
          <span className={classes.fb_analysis}>{analysisName}</span>
        ) : (
          <span className={cx(classes.chip, classes.chip__muted)}>
            No analysis set
          </span>
        )}
        {/* The two tallies are one run of type, and the rule between them
            belongs *inside* it: as two independent flex children, a head made to
            wrap by a long free-text timepoint broke between them and opened its
            second line with a dangling vertical rule. Grouped, the pair wraps
            whole and the rule is never the first glyph on a line. */}
        {(totalCount > 0) || (plotted > 0 && reportable > 0) ? (
          <span className={classes.fb_tally}>
            {totalCount > 0 ? (
              <span
                className={classes.fb_measured}
                title={`${analysisName} interprets ${totalCount} measurements; ` +
                  `${reportedCount} of them are reported from this tracing.`}
              >
                {reportedCount} of {totalCount} measured
              </span>
            ) : null}
            {plotted > 0 && reportable > 0 ? (
              <span
                className={classes.fb_plotted}
                title={'Every landmark these analyses need is already on this ' +
                  `tracing, so any of them can be read from it without plotting ` +
                  `anything further: ${plottedAnalyses.join(', ')}.`}
              >
                {plotted} of {reportable} analyses plotted
              </span>
            ) : null}
          </span>
        ) : null}
        {/* Paper only, and only where the block's CHANGE column would otherwise
            be five em-dashes: the reason it has none (see `.fv__first`). */}
        {!hasEarlierFilm && showChange ? (
          <span className={classes.fb_first_print}>first film on record</span>
        ) : null}
        {/* Screen only: on a printed chart there is no editor to open. */}
        <span className={classes.fb_go} aria-hidden="true">Open film</span>
      </button>

      {nothingReported !== null ? (
        // A block with nothing to report is two or three lines long: on paper it
        // is held whole (see `.fb_body__none`), so a sheet can never end on this
        // film's name with its one sentence and the panel's key overleaf.
        <div className={cx(classes.fb_body, classes.fb_body__none)}>
          <p className={classes.fb_none}>
            <span className={classes.fb_note_screen}>
              {nothingReported.screen}
            </span>
            <span className={classes.fb_note_print}>
              {nothingReported.print}
            </span>
          </p>
          <Caveats caveats={caveats} markerFor={markerFor} />
        </div>
      ) : (
        <div className={classes.fb_body}>
          {/* The headline: the analysis' own conclusions. Every one of them —
              this row used to end in "+1 more in the Summary", which on a filed
              chart names a dialog nobody can open. */}
          <div className={classes.fb_findings}>
            {findings.length > 0 ? findings.map(
              ({ category, indication }, i) => {
                const tone = chipToneFor(indication);
                const key = chipKey[i];
                const label = mapCategoryToString(category) || '—';
                return (
                  <span key={`${category}/${i}`} className={classes.ff_pair}>
                    <span className={classes.ff_cat}>{label}</span>
                    <span
                      className={cx(classes.chip, classes.ff_chip, {
                        [classes.chip__ok]: tone === 'success',
                        [classes.chip__muted]: tone === 'neutral',
                        [classes.chip__partial]: tone === 'warn',
                      })}
                    >
                      {mapIndicationToString(indication) || '—'}
                    </span>
                    {/* The rows this verdict was read from, named by number in
                        the table below — the Summary pairs a finding with its own
                        measurements in one column, and this panel used to put 7
                        to 10 verdicts in a flat row above a separate list with
                        nothing joining the two. A finding with no number has no
                        measurement outside its norm, which is why none of its
                        readings appears in a table of what left them. */}
                    {key !== undefined ? (
                      <span
                        className={classes.ff_key}
                        title={`Read from the rows numbered ${key} below`}
                      >
                        {key}
                      </span>
                    ) : null}
                  </span>
                );
              },
            ) : (
              <span className={classes.fb_quiet}>
                No graded finding — this analysis reports measured values only.
              </span>
            )}
          </div>

          {/* …and the numbers behind it: every measurement that left its norm,
              in the panel's one order, with how far out it is and how it has
              moved since the last film that reported it. */}
          <div
            className={cx(classes.fv, {
              [classes.fv__nostrip]: !showStrip,
              [classes.fv__nochange]: !showChange,
              // No earlier film reports anything, so every cell of this block's
              // CHANGE column is an em-dash. On screen the column stays, because
              // the blocks are read down one page and one column anatomy is what
              // lets them be compared; on paper the column goes and the head says
              // why (see the print block).
              [classes.fv__first]: showChange && !hasEarlierFilm,
            })}
            role="table"
            aria-label={`${analysisName !== null ? analysisName : 'This analysis'}` +
              ' — measurements that left their norm on this film'}
          >
            {/* The section head and the numeric column heads are one row on the
                measurement grid: three columns of 11px caps over a four-row
                block would otherwise be a second bar of chrome, and without
                them "14.5 ± 3.5" beside "30.1°" is two numbers with no names.
                The head carries no fraction — "10 of 10 measured" is stated 20px
                above it and one denominator described twice is not two facts.
                The heads are the grid's real column headers (`role`), so a screen
                reader announces "Norm, 396.0 ± 6.0" the way the Summary's own
                `<thead>` does. */}
            <div className={classes.fv_head} role="row">
              <span
                className={classes.fv_headline}
                role="columnheader"
                aria-label="Measurement"
              >
                <span className={classes.fv_title}>
                  {outside.length > 0 ? 'Left its norm' : 'None left its norm'}
                </span>
                {outside.length > 0 ? (
                  <span className={classes.fv_count}>
                    {outside.length === 1
                      ? '1 measurement' : `${outside.length} measurements`}
                  </span>
                ) : null}
              </span>
              {outside.length > 0 ? [
                <span key="v" role="columnheader" className={classes.fv_col}>
                  Value
                </span>,
                <span key="n" role="columnheader" className={classes.fv_col}>
                  Norm
                </span>,
                <span key="d" role="columnheader" className={classes.fv_col}>
                  Deviation
                </span>,
                // The axis over the strips it scales — and only the axis the
                // strips below are actually drawn on. A block whose every row is
                // graded against a published range has no SD scale to head, and
                // heading it with one described a ruler none of its marks is on.
                showStrip ? (
                  <span
                    key="a"
                    role="columnheader"
                    aria-label="Deviation from norm, plotted"
                    className={classes.fv_axis}
                    title={hasSd
                      ? 'Each SD-graded measurement against its own norm on a ' +
                        '±3 SD axis — the printed report’s wigglegram, row by ' +
                        'row. A row graded against a published range is drawn ' +
                        'on its own bounds instead.'
                      : 'Every row here is graded against a published range, so ' +
                        'each strip is drawn on its own two bounds — hatched ' +
                        'between them, one range-width of axis beyond each'}
                  >
                    {hasSd ? [
                      <span
                        key="s"
                        className={cx(
                          classes.fv_axis_tick, classes.fv_axis_tick__start,
                        )}
                      >
                        −3 SD
                      </span>,
                      <span
                        key="m"
                        className={cx(
                          classes.fv_axis_tick, classes.fv_axis_tick__mean,
                        )}
                      >
                        Mean
                      </span>,
                      <span
                        key="e"
                        className={cx(
                          classes.fv_axis_tick, classes.fv_axis_tick__end,
                        )}
                      >
                        +3 SD
                      </span>,
                    ] : (
                      <span
                        className={cx(
                          classes.fv_axis_tick, classes.fv_axis_tick__mean,
                        )}
                      >
                        Published range
                      </span>
                    )}
                  </span>
                ) : null,
                showChange ? (
                  <span
                    key="c"
                    role="columnheader"
                    // Its own class as well as the column head's: on paper the
                    // first film of the record drops this column outright (see
                    // `.fv__first`), and a heading over nothing is worse than no
                    // heading.
                    className={cx(classes.fv_col, classes.fv_col__change)}
                    title={'Against the same measurement on the previous film ' +
                      'of this record that reports it'}
                  >
                    Change
                  </span>
                ) : null,
              ] : null}
            </div>
            {outside.length > 0 ? (
              <div className={classes.fv_list} role="rowgroup">
                {outside.map((row) => {
                  const keys = rowKeys[row.symbol];
                  return (
                    <ValueLine
                      key={row.symbol}
                      row={row}
                      change={changes[row.symbol]}
                      hasEarlierFilm={hasEarlierFilm}
                      keys={keys !== undefined ? keys : []}
                      showChange={showChange}
                      showStrip={showStrip}
                      chipsFor={chipsFor}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Anchored to the rows it marks, which are the last rows above it. */}
          <Caveats caveats={caveats} markerFor={markerFor} />
        </div>
      )}

      {/* What qualifies the block, in the order it can change a reading: what
          the film could not report, then the norms it was graded against. */}
      <div className={classes.fb_foot}>
        {pendingScaleCount > 0 ? (
          <p className={cx(classes.fb_note, classes.fb_note__warn)}>
            {pendingScaleCount === 1
              ? '1 millimetre measurement is'
              : `${pendingScaleCount} millimetre measurements are`}
            {' '}withheld — this film carries no mm/px scale. Angles and ratios
            are unaffected; calibrate the film to report them.
          </p>
        ) : null}
        {missingLandmarkCount > 0 ? (
          <p className={classes.fb_note}>
            {/* On screen it is a worklist — it names where to place them. On
                paper the instruction is something nobody can carry out, so the
                filed sheet states what is outstanding and stops (the same swap
                `.slot_print` and `.fact_print` make). */}
            <span className={classes.fb_note_screen}>
              {missingLandmarksNote(missingLandmarkCount, missingSymbols)}
            </span>
            <span className={classes.fb_note_print}>
              {missingLandmarksFact(missingLandmarkCount, missingSymbols)}
            </span>
          </p>
        ) : null}
        {/* …and the norms these figures were graded against — unless every block
            of the panel was graded against the same ones, in which case that is
            one fact and it is stated once, under the blocks (see
            `AnalysisFindings#hoistedNorms`). Repeated per block, Downs' sentence
            printed word for word twice on a two-film record and four times on a
            four-film one. */}
        {rows.length > 0 && !hoistNorms ? <NormsLineNote film={film} /> : null}
      </div>
    </article>
  );
};

export interface AnalysisFindingsProps {
  /** One entry per traceable film, oldest capture date first. */
  films: FilmFindings[];
  /** Open a film in the tracing editor — each block's head is that control. */
  onOpenFilm(record: PatientRecord): any;
}

/**
 * What the analyses already say about this patient, on the records surface —
 * the panel this dashboard was missing. One compact block per traced film, in
 * the record's own chronological order, headline first: the analysis set on the
 * film, its interpretations as chips, and every measurement that left its norm
 * with its grade, the norm it is graded against, where it sits on a ±3 SD axis
 * and how far it has moved since the previous film that reported it.
 *
 * Everything shown is read-only and arrives through the same evaluation path
 * the Summary dialog and the printed report use (see `./selectors`), formatted
 * by the same exported formatters, so every figure here is the figure that
 * film's Summary reports — to the digit. Nothing is recomputed locally, no norm
 * is re-derived, millimetre measurements stay withheld on an uncalibrated film,
 * and the age- and sex-corrected norms stay corrected — and are described by
 * the analysis' own provenance rather than by a claim this panel makes for it.
 *
 * The blocks are laid out against each other rather than each on its own terms:
 * one order for the chips, one order for the rows, one column of change (see
 * `buildViews`). A per-timepoint history whose rows re-rank per film is a
 * snapshot printed N times.
 */
const AnalysisFindings = ({ films, onOpenFilm }: AnalysisFindingsProps) => {
  const reporting = films.filter(({ analysis }) => analysis.results.length > 0);
  const views = buildViews(films);
  const hasSdStrip = views.some(
    ({ outside }) => outside.some((row) => row.z !== null),
  );
  const hasRangeStrip = views.some(
    ({ outside }) => outside.some((row) => row.range !== null),
  );
  const hasChange = views.some(
    ({ outside, changes }) => outside.some(
      (row) => changes[row.symbol] !== undefined,
    ),
  );
  // Why there is no change to show, said once, where the column would have been.
  // A CHANGE header over a column of em-dashes is a column that looks alive and
  // shows nothing: on a single-film record it was 92px of header and five
  // dashes, and where the films carried *different analyses* it was fifteen
  // dashes across three blocks whose only explanation was a per-cell tooltip.
  const changeGap = hasChange || reporting.length === 0 ? null
    : reporting.length === 1
      ? 'One film reports, so there is nothing to measure a change against.'
      : (() => {
        const named = reporting.map(({ record, analysisName }) => {
          const token = getTimepointToken(record.timepoint);
          const date = formatCaptureDate(record.captureDate);
          const when = token !== null ? token : (date !== null ? date : 'a film');
          return analysisName !== null ? `${when} ${analysisName}` : when;
        }).join(', ');
        const analyses: string[] = [];
        reporting.forEach(({ analysisName }) => {
          if (analysisName !== null && analyses.indexOf(analysisName) < 0) {
            analyses.push(analysisName);
          }
        });
        return analyses.length > 1
          ? `${named} — no measurement is common to both analyses, so no ` +
            'change is computed.'
          : 'No measurement is reported on two of these films, so no change ' +
            'is computed.';
      })();
  // One norms line for the panel when every block's is the same line: the
  // sentence is about the *analysis*, and eight analyses out of nine write the
  // same one on every film of the record.
  const notes = reporting.map((film) => normsNote(film));
  const hoistedNorms = notes.length > 1 && notes.every(
    ({ lede, full }) => lede === notes[0].lede && full === notes[0].full,
  ) ? reporting[0] : null;
  // The section's head, in one place and rendered twice: as the panel's own bar
  // on screen, and — on paper — as the first line *inside* the first film's group
  // (see `.findings_lede`).
  //
  // Chrome honours `break-inside: avoid` and nothing else about page breaks: a
  // `break-after: avoid` on a heading, or a `break-before: avoid` on what follows
  // it, is silently ignored (verified on this sheet at both A4 depths). So a
  // heading is kept off the foot of a sheet the only way that works — by being
  // *inside* the same unbreakable box as the content it introduces. The two copies
  // carry one set of strings, and exactly one of them is displayed in each medium,
  // which is the same swap this surface already makes for a dozen smaller facts
  // (`.slot_print`, `.visit_print`, `.fb_note_print`).
  const head = (forPrint: boolean) => (
    <div
      className={forPrint ? classes.findings_head_print : classes.findings_head}
      aria-hidden={forPrint ? true : undefined}
    >
      {forPrint ? (
        <span className={classes.findings_title}>Analysis findings</span>
      ) : (
        <h3 className={classes.findings_title}>Analysis findings</h3>
      )}
      <span className={classes.records_count}>
        {reporting.length === films.length
          ? (films.length === 1
            ? '1 film reporting' : `${films.length} films reporting`)
          : `${reporting.length} of ${films.length} ` +
            `${films.length === 1 ? 'film' : 'films'} reporting`}
      </span>
      <span className={classes.records_spacer} />
      <p className={classes.records_note}>
        Read from each film’s own tracing, measured with the analysis set on
        that film — the same values its Summary reports.
        {/* Screen only: "open the film" is an instruction nobody can carry out
            on a printed chart, and the chart is where these findings are read
            once they leave the screen. */}
        <span className={classes.findings_note_screen}>
          {' '}Open a block’s head for that film’s full table and its norm
          citations.
        </span>
        {changeGap !== null ? (
          <span className={classes.findings_note_gap}>{changeGap}</span>
        ) : null}
      </p>
    </div>
  );
  // One key for the panel, under the blocks it explains — the Summary's own
  // construction (its legend sits under its table). Every mark on the rows above is
  // named here once, rather than per block.
  //
  // Rendered twice, exactly as the head is: the panel's own key on screen, and — on
  // paper — a copy inside the last film's group, so the key can never print on a
  // sheet of its own (see `.findings_coda`).
  const legend = (forPrint: boolean) => (
    reporting.length > 0 ? (
      <div
        className={forPrint
          ? classes.findings_legend_print : classes.findings_legend}
        aria-hidden={forPrint ? true : undefined}
      >

          {/* The marks, *drawn* — one sample strip of each kind with its bands,
              its mean and a dot of each severity, beside the star scale they
              share. This key used to describe them instead: three lines of
              running prose in 10px grey, one of them a 176-character sentence
              naming a band, a lighter band, an amber dot, a red dot and two
              arrow glyphs, none of which was on the page beside its own name. */}
          <div className={classes.fk}>
            {/* The star scale, in the words the printed report's own foot keys
                it with (see `deviationStarKey`) — the same three marks on the
                same data, so a records sheet and a report filed in one chart
                cannot word one key two ways. The stars themselves are drawn in
                the star colour rather than set in the sentence, which is this
                surface's own idiom and the Summary's. */}
            <span className={classes.fk_group}>
              <span className={classes.fk_label}>Deviation</span>
              {DEVIATION_STAR_STEPS.map((step) => (
                <span key={step} className={classes.findings_legend_stars}>
                  {step}
                </span>
              ))}
              <span className={classes.fk_note}>= {DEVIATION_STAR_SCALE}</span>
            </span>
            {hasSdStrip ? (
              <span
                className={cx(classes.fk_group, classes.fk_group__strip)}
              >
                <span className={classes.fk_label}>±3 SD axis</span>
                <span className={cx(classes.fv_strip, classes.fk_strip)}>
                  <span className={classes.fv_strip_mean} />
                  <span
                    className={cx(classes.fv_dot, classes.fv_dot__warn)}
                    style={{ left: '72%' }}
                  />
                  <span
                    className={cx(classes.fv_dot, classes.fv_dot__error)}
                    style={{ left: '90%' }}
                  />
                  <span
                    className={cx(
                      classes.fv_dot, classes.fv_dot__error,
                      classes.fv_dot__clamped,
                    )}
                    style={{ left: '5px' }}
                  >
                    ◂
                  </span>
                </span>
                <span className={classes.fk_note}>
                  band ±1 SD, ticks ±2 SD, mean at centre; amber over 1 SD, red
                  over 2, ◂ ▸ off the axis
                </span>
              </span>
            ) : null}
            {hasRangeStrip ? (
              <span className={cx(classes.fk_group, classes.fk_group__strip)}>
                <span className={classes.fk_label}>Published range</span>
                <span
                  className={cx(
                    classes.fv_strip, classes.fv_strip__range, classes.fk_strip,
                  )}
                >
                  <span
                    className={cx(classes.fv_dot, classes.fv_dot__warn)}
                    style={{ left: '78%' }}
                  />
                </span>
                <span className={classes.fk_note}>
                  its own two bounds, hatched, one range-width beyond each — its
                  author published no SD
                </span>
              </span>
            ) : null}
          </div>
          {/* The one sentence of prose this key keeps: the reproducibility floor,
              which is a *fact about hand plotting* and cannot be drawn. It used
              to be two sentences over two lines, restating in words what the
              dimmed ink beside it already shows. */}
          {hasChange ? (
            <span className={classes.findings_legend_line}>
              <span className={classes.fk_label}>Change</span> against the
              previous film reporting it — dimmed under hand-plotting error
              (±{PLOTTING_ERROR.linear} mm on a point, ±{PLOTTING_ERROR.angular}°
              on an angle) or at exactly nothing.
            </span>
          ) : null}
          <span className={classes.findings_legend_line}>
            <span className={classes.fv_key}>1</span> ties a row to the finding it
            was read for; a chip with no number has no row outside its norm.
          </span>
          {/* One norms line for the whole panel when every block was graded
              against the same one (see `hoistedNorms`). */}
          {hoistedNorms !== null ? (
            <NormsLineNote film={hoistedNorms} />
          ) : null}
      </div>
    ) : null
  );
  return (
    <section className={classes.findings} aria-label="Analysis findings">
      {head(false)}
      <div className={classes.findings_body}>
        {views.map((view, index) => {
          const block = (
            <FilmBlock
              key={view.film.record.imageId}
              view={view}
              onOpen={onOpenFilm}
              showChange={hasChange}
              hoistNorms={hoistedNorms !== null}
            />
          );
          const isFirst = index === 0;
          const isLast = index === views.length - 1;
          if (!isFirst && !isLast) {
            return block;
          }
          // The printed head goes with the first block and the printed key with
          // the last, each as one unbreakable box on paper — the only way either
          // stays with the films it belongs to (see `.findings_lede`). On screen
          // the wrapper is `display: contents` and both copies are hidden, so the
          // block is exactly the flex child of the well it has always been.
          return (
            <div
              key={isFirst ? 'lede' : 'coda'}
              className={cx({
                [classes.findings_lede]: isFirst,
                [classes.findings_coda]: isLast,
              })}
            >
              {isFirst ? head(true) : null}
              {block}
              {isLast ? legend(true) : null}
            </div>
          );
        })}
      </div>
      {legend(false)}
    </section>
  );
};

export default AnalysisFindings;
