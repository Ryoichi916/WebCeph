import {
  NSAr, SArGo, ArGoMe,
  upperGonialAngle, lowerGonialAngle,
} from 'analyses/landmarks/angles/skeletal';
import { bjorkSum, articulareCaveats } from 'analyses/landmarks/other/skeletal';
import {
  posteriorAnteriorFacialHeightRatio,
  upperAnteriorFaceHeightShare,
  anteriorFacialHeight,
  posteriorFacialHeight,
  upperAnteriorFacialHeight,
  lowerAnteriorFacialHeight,
  anteriorCranialBaseLength,
  posteriorCranialBaseLength,
  ramusHeight,
  mandibularBodyLength,
} from 'analyses/landmarks/distances/skeletal';

import { defaultInterpretAnalysis, NO_NORM, RANGE } from 'analyses/helpers';

/**
 * Jarabak's analysis — his polygon S-N-Go-Me plus the proportions read off it.
 *
 * The polygon itself: the four angles that chain the cranial base to the
 * mandible (saddle, articular, gonial, and Björk's split of the gonial angle
 * into its ramus and corpus halves), their sum, and the four sides — anterior
 * cranial base S-N, posterior cranial base S-Ar, ramus height Ar-Go and
 * mandibular body Go-Me. The gonial split belongs here as much as it does in
 * Björk's section: it is Jarabak's polygon that the split describes, and it
 * used to be computed on this very screen and surfaced only under Björk.
 *
 * The proportions are what Jarabak grades:
 *
 *  - Posterior : anterior facial height, S-Go / N-Me, 62–65 %. Above it a
 *    horizontal (forward-rotating) grower, below it a vertical one.
 *  - The anterior face-height split, N-ANS : ANS-Me, 45 : 55. Reported as the
 *    upper share of N-Me, 43–47 %.
 *
 * Both are published *ranges*, not means with standard deviations, so both are
 * declared with `RANGE` and carry no star scale. Printing "63.5 ± 1.5" for the
 * 62–65 band is how a 72.8 % ratio came to be reported as a six-SD finding
 * against a standard deviation Jarabak never published.
 *
 * Every absolute length — the four polygon sides and the three facial heights —
 * is reported **without a norm** (see `NO_NORM`): their normal values are age-
 * and sex-specific, and printing one adult figure beside a growing patient's
 * film would be a fabricated norm. They are still worth printing: the polygon
 * is read by comparing its sides, and a length with no norm is honest where an
 * invented one is not.
 */
const components: AnalysisComponent[] = [
  {
    // Saddle angle (N-S-Ar)
    landmark: NSAr,
    mean: 123,
    max: 128,
    min: 118,
    normSource: 'Björk 1947',
  },
  {
    // Articular angle (S-Ar-Go)
    landmark: SArGo,
    mean: 143,
    max: 149,
    min: 137,
    normSource: 'Björk 1947',
  },
  {
    // Gonial angle (Ar-Go-Me)
    landmark: ArGoMe,
    mean: 130,
    max: 137,
    min: 123,
    normSource: 'Björk 1947',
  },
  {
    // Upper gonial angle (Ar-Go-N), the ramus half. Björk's range 52-55°.
    landmark: upperGonialAngle,
    mean: 53.5,
    max: 55,
    min: 52,
    ...RANGE,
    normSource: 'Björk 1947',
  },
  {
    // Lower gonial angle (N-Go-Me), the corpus half. Björk's range 70-75°.
    landmark: lowerGonialAngle,
    mean: 72.5,
    max: 75,
    min: 70,
    ...RANGE,
    normSource: 'Björk 1947',
  },
  {
    // Sum of the posterior angles (= saddle + articular + gonial). Norm 396° ± 6.
    landmark: bjorkSum,
    mean: 396,
    max: 402,
    min: 390,
    normSource: 'Björk 1947',
  },
  {
    // Posterior / anterior facial-height ratio (S-Go / N-Me) × 100. 62-65 %.
    landmark: posteriorAnteriorFacialHeightRatio,
    mean: 63.5,
    max: 65,
    min: 62,
    ...RANGE,
  },
  {
    // Upper share of the anterior face height, N-ANS / N-Me. 45 : 55 split.
    landmark: upperAnteriorFaceHeightShare,
    mean: 45,
    max: 47,
    min: 43,
    ...RANGE,
  },
  // ---- the polygon's four sides, measured ---------------------------------
  {
    landmark: anteriorCranialBaseLength,
    ...NO_NORM,
  },
  {
    landmark: posteriorCranialBaseLength,
    ...NO_NORM,
  },
  {
    landmark: ramusHeight,
    ...NO_NORM,
  },
  {
    landmark: mandibularBodyLength,
    ...NO_NORM,
  },
  // ---- facial heights, measured -------------------------------------------
  {
    // Anterior facial height, N-Me.
    landmark: anteriorFacialHeight,
    ...NO_NORM,
  },
  {
    // Posterior facial height, S-Go.
    landmark: posteriorFacialHeight,
    ...NO_NORM,
  },
  {
    // Upper anterior facial height, N-ANS.
    landmark: upperAnteriorFacialHeight,
    ...NO_NORM,
  },
  {
    // Lower anterior facial height, ANS-Me.
    landmark: lowerAnteriorFacialHeight,
    ...NO_NORM,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'jarabak',
  components,
  provenance: {
    author: 'Jarabak & Fizzell',
    year: 1972,
    population: 'North American white children and adolescents',
    alsoFrom: [
      'Björk 1947 — the four posterior angles and their sum, Swedish males',
    ],
    note:
      'The proportions (62–65 % and the 45 : 55 anterior split) are ' +
      'published as ranges, not as means with standard deviations. The ' +
      'absolute lengths have no norm here at all: theirs are age- and ' +
      'sex-specific.',
  },
  interpret: defaultInterpretAnalysis(components),

  /**
   * The same articulare check Björk's section runs — the three posterior
   * angles of this polygon are his, and they are as dependent on articulare
   * here as they are there. See `articulareCaveats`.
   */
  caveats: articulareCaveats,
};

export default analysis;
