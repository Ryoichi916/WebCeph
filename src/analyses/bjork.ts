import {
  NSAr, SArGo, ArGoMe,
  upperGonialAngle, lowerGonialAngle,
} from 'analyses/landmarks/angles/skeletal';
import { bjorkSum, articulareCaveats } from 'analyses/landmarks/other/skeletal';

import { defaultInterpretAnalysis, RANGE } from 'analyses/helpers';

/**
 * Björk's analysis of the facial skeleton: the three posterior angles that
 * chain the cranial base to the mandible — saddle (N-S-Ar), articular
 * (S-Ar-Go) and gonial (Ar-Go-Me) — their sum, and Björk's split of the gonial
 * angle into its ramus (Ar-Go-N) and corpus (N-Go-Me) halves.
 *
 * Norms are Björk's: saddle 123° ± 5, articular 143° ± 6, gonial 130° ± 7 and
 * sum 396° ± 6 — all four stated as a mean with a standard deviation, so all
 * four are graded on the table's star scale. The sum is the growth indicator:
 * below the norm the mandible rotates forward (horizontal growth), above it
 * backward (vertical growth).
 *
 * The two halves of the gonial angle are **not** graded on that scale. Björk
 * quotes them as ranges — upper 52–55°, lower 70–75° — and published no
 * standard deviation for either, so the table used to halve the range and print
 * "53.5 ± 1.5" and "72.5 ± 2.5": two standard deviations Björk never measured,
 * against which an ordinary 76.7° corpus half earned a star. They are declared
 * with `RANGE` instead and reported as measured values with Björk's ranges
 * quoted beside them.
 *
 * Nor do the two halves reconcile arithmetically with the whole: they sum to
 * 122–130 while the gonial angle itself is normed 123–137, so a patient with a
 * perfectly ordinary 135° gonial angle is forced to fall outside at least one
 * half. That is a property of the published figures, not of this tracing, and
 * it is the second reason the halves are context rather than a graded finding —
 * widening them to fit would have meant inventing bands nobody published.
 *
 * The three angles are reported with their norms even though none of them
 * carries a diagnosis on its own: each is an ordinary measured value, and
 * hiding it because it has no label was how they used to disappear between the
 * stepper and the report.
 *
 * Note that the sum is *independent of where articulare is plotted* — it is
 * fixed by N, S, Go and Me — while the three angles it is made of are not, so
 * an implausible saddle/articular pair with a plausible sum means articulare
 * needs re-checking, not the analysis. (That is exactly what the demo tracing's
 * misplaced articulare did: see `predictors/demo`.)
 *
 * That reading is no longer left for the clinician to reconstruct: `caveats`
 * below tests for exactly that pattern — a sum inside its own band while the
 * saddle and articular angles are each over a standard deviation out, in
 * opposite directions, as a displaced articulare must make them — and marks the
 * three affected rows in the table with the reason. Three red rows and no
 * explanation is how a landmark error becomes a diagnosis.
 */
const components: AnalysisComponent[] = [
  {
    // Saddle angle (N-S-Ar)
    landmark: NSAr,
    mean: 123,
    max: 128,
    min: 118,
  },
  {
    // Articular angle (S-Ar-Go)
    landmark: SArGo,
    mean: 143,
    max: 149,
    min: 137,
  },
  {
    // Gonial angle (Ar-Go-Me)
    landmark: ArGoMe,
    mean: 130,
    max: 137,
    min: 123,
  },
  {
    // Upper gonial angle (Ar-Go-N), the ramus half. Björk's range 52-55°.
    landmark: upperGonialAngle,
    mean: 53.5,
    max: 55,
    min: 52,
    ...RANGE,
  },
  {
    // Lower gonial angle (N-Go-Me), the corpus half. Björk's range 70-75°.
    landmark: lowerGonialAngle,
    mean: 72.5,
    max: 75,
    min: 70,
    ...RANGE,
  },
  {
    // Sum of the three posterior angles. Norm 396° ± 6.
    landmark: bjorkSum,
    mean: 396,
    max: 402,
    min: 390,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'bjork',
  components,
  provenance: {
    author: 'Björk',
    year: 1947,
    population:
      'Swedish males — 322 twelve-year-old boys and 281 army conscripts ' +
      'aged 21–23',
    note:
      'An all-male, all-Swedish sample, and the only norms in this app for ' +
      'which that is true of both. The gonial halves are quoted as ranges ' +
      'with no standard deviation, and they do not reconcile arithmetically ' +
      'with the whole gonial angle (see the module comment).',
  },
  interpret: defaultInterpretAnalysis(components),

  /** The articulare check — see `articulareCaveats`. */
  caveats: articulareCaveats,
};

export default analysis;
