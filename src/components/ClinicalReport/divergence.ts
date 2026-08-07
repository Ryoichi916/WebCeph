/**
 * Cross-analysis disagreement in the combined report.
 *
 * Seven analyses computed from one tracing routinely reach different
 * conclusions about the same clinical category: Downs calls the skeletal
 * profile concave from the angle of convexity, Ricketts calls it convex from
 * the facial angle, the soft-tissue analysis calls it normal from Merrifield's
 * Z angle. All three are correct — they measure different things against
 * different authors' norms — but printed side by side with no explanation they
 * read as a software fault.
 *
 * This module finds those categories and, for each analysis, names the
 * measurement that actually drives its conclusion, so the reader can see *why*
 * the sections differ. Nothing here re-interprets anything: the indications are
 * the ones the analyses produced, and the driving measurement is found by
 * re-running the landmark's own `interpret` over its own value.
 */

import { getUnitSuffix } from 'components/AnalysisResultsViewer';
import { mapIndicationToString } from 'components/AnalysisResultsViewer/strings';

import { NEUTRAL_CATEGORY, normSd } from 'analyses/helpers';
import { AnalysisEvaluation } from 'analyses/evaluate';
import { LateralAnalysisEntry } from 'analyses/lateral';

import { printNumber, printNorm } from './copy';

export interface DivergenceSource {
  /** Display name of the analysis reaching this conclusion. */
  analysis: string;
  /** The conclusion, already mapped to clinical English. */
  indication: string;
  /** Symbol of the measurement that drives it. */
  symbol: string;
  /** That measurement's value with its unit, e.g. `91.5°`. */
  value: string;
  /** That measurement's norm, e.g. `87.0 ± 3.0`. */
  norm: string;
}

export interface Divergence {
  category: Category;
  /** One entry per analysis that reported this category, in section order. */
  sources: DivergenceSource[];
}

export interface DivergenceSection {
  entry: LateralAnalysisEntry;
  evaluation: AnalysisEvaluation;
}

type Component =
  CategorizedAnalysisResult<Category>['relevantComponents'][0];

/**
 * Standardized distance from the norm mean; 0 when the component has no
 * standard deviation to standardize by — no norm at all, or a norm published
 * as a plain range (see `normSd`). Used only to rank candidates for "which
 * measurement drives this finding", so a 0 makes such a component the last
 * resort rather than inventing a spread for it.
 */
const zScore = ({ value, mean, min, max, band }: Component): number => {
  const sd = normSd(mean, min, max, band);
  return (!isFinite(sd) || sd <= 0) ? 0 : Math.abs(value - mean) / sd;
};

/**
 * The measurement responsible for a finding: among the components whose own
 * interpretation matches the finding's conclusion, the one furthest from its
 * norm. Falls back to the most deviant component when no landmark carries an
 * interpretation of its own (so the answer is never invented, only weakened).
 */
const drivingComponent = (
  result: CategorizedAnalysisResult<Category>,
  landmarksBySymbol: AnalysisEvaluation['landmarksBySymbol'],
): Component | null => {
  const components = result.relevantComponents;
  if (components.length === 0) {
    return null;
  }
  const agreeing = components.filter((component) => {
    const landmark = landmarksBySymbol[component.symbol];
    if (landmark === undefined || typeof landmark.interpret !== 'function') {
      return false;
    }
    const { value, mean, min, max } = component;
    return landmark.interpret(value, min, max, mean).some(
      (i) => i.category === result.category && i.indication === result.indication,
    );
  });
  const pool = agreeing.length > 0 ? agreeing : components;
  return pool.reduce(
    (best, c) => (zScore(c) > zScore(best) ? c : best),
    pool[0],
  );
};

/**
 * Categories that more than one analysis reports and on which those analyses
 * disagree, each with the measurement behind every conclusion. Categories the
 * analyses agree on are left out entirely — the note exists to explain a
 * contradiction, not to annotate agreement.
 */
export const findDivergences = (
  sections: DivergenceSection[],
): Divergence[] => {
  const byCategory: { [category: string]: DivergenceSource[] } = {};
  const order: Category[] = [];
  const indications: { [category: string]: { [indication: string]: true } } = {};

  sections.forEach(({ entry, evaluation }) => {
    evaluation.results.forEach((result) => {
      // The neutral bucket holds plain measured values, not conclusions, so
      // two analyses "disagreeing" about it means nothing worth printing.
      if (result.category === NEUTRAL_CATEGORY) {
        return;
      }
      const component = drivingComponent(result, evaluation.landmarksBySymbol);
      if (component === null) {
        return;
      }
      const { category, indication } = result;
      if (byCategory[category] === undefined) {
        byCategory[category] = [];
        indications[category] = {};
        order.push(category);
      }
      indications[category][indication as string] = true;
      const landmark = evaluation.landmarksBySymbol[component.symbol];
      const unit = getUnitSuffix(landmark);
      byCategory[category].push({
        analysis: entry.name,
        indication: mapIndicationToString(indication) || String(indication),
        symbol: component.symbol,
        value: `${printNumber(component.value)}${unit}`,
        // Whatever the component's norm actually is — a mean ± SD or a
        // published range — printed the same way the tables print it.
        norm: printNorm(
          component.mean, component.min, component.max, component.band,
        ),
      });
    });
  });

  return order
    .filter((category) => (
      Object.keys(indications[category]).length > 1 &&
      byCategory[category].length > 1
    ))
    .map((category) => ({ category, sources: byCategory[category] }));
};

/** Lookup of the divergent categories, for marking chips in the overview. */
export const divergentCategorySet = (
  divergences: Divergence[],
): { [category: string]: true } => {
  const set: { [category: string]: true } = {};
  divergences.forEach(({ category }) => {
    set[category as string] = true;
  });
  return set;
};
