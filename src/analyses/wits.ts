import { FMA, SN_MP, MMPA } from 'analyses/landmarks/angles/skeletal';
import {
  witsAppraisal,
  posteriorAnteriorFacialHeightRatio,
  upperAnteriorFaceHeightShare,
  anteriorFacialHeight,
  posteriorFacialHeight,
  upperAnteriorFacialHeight,
  lowerAnteriorFacialHeight,
} from 'analyses/landmarks/distances/skeletal';

import { defaultInterpretAnalysis, NO_NORM, RANGE } from 'analyses/helpers';

/**
 * "Wits & vertical" — the antero-posterior appraisal that does not depend on
 * the cranial base, read together with everything this landmark set supports
 * about the vertical dimension.
 *
 * ANB is the usual antero-posterior reading and it is hostage to nasion: a
 * high or low nasion, or a rotated cranial base, moves ANB without anything
 * changing in the jaws. Jacobson's Wits appraisal answers the same question by
 * projecting A and B onto the occlusal plane, so it survives all of that — and
 * fails differently, since it now depends on where the occlusal plane is
 * drawn. The two are read as a pair, which is why the app reports both, in
 * different sections, each against its own author's norm.
 *
 * The vertical group is deliberately over-determined, because no single
 * vertical measurement is reliable on its own:
 *
 *  - **Two plane angles from different references** — Frankfort to the
 *    mandibular plane (FMA) and sella-nasion to the mandibular plane. They
 *    disagree whenever Frankfort is hard to locate, which is often.
 *  - **The maxillo-mandibular planes angle**, palatal to mandibular, which
 *    needs no cranial reference at all.
 *  - **Two proportions**: Jarabak's posterior/anterior facial-height ratio and
 *    the upper share of the anterior face height. Both are published *ranges*
 *    rather than means with standard deviations, so both are declared with
 *    `RANGE` and carry no star scale — and both are unitless, so they survive
 *    on an uncalibrated film where the millimetre heights below do not.
 *  - **The four absolute heights** the two proportions are built from — total
 *    (N-Me), posterior (S-Go), upper anterior (N-ANS) and lower anterior
 *    (ANS-Me) — reported *without* a norm: their normal millimetre values are
 *    age- and sex-specific and this app will not print one adult figure beside
 *    a growing patient's film. They are tabulated so each ratio above can be
 *    checked against the lengths it was actually taken from.
 *
 * A true McNamara appraisal would belong here too, but it is built on
 * effective jaw lengths measured from **Condylion** (Co-A, Co-Gn), and this
 * landmark set has no condylion — only articulare, which sits on the posterior
 * border of the neck rather than at the top of the head of the condyle.
 * Measuring McNamara's lengths from Ar and printing them under his norms would
 * shorten every one of them by a few millimetres, silently. They are omitted
 * instead.
 */
const components: AnalysisComponent[] = [
  {
    // Wits appraisal — signed AO-BO along the occlusal plane. Jacobson
    // published it by sex: about −1 mm in males, 0 mm in females, ± 2 mm. The
    // patient's own figure is used whenever the record states a sex; the
    // pooled 0 ± 2 mm otherwise, and the provenance note says which.
    landmark: witsAppraisal,
    mean: 0,
    max: 2,
    min: -2,
    sexMeans: { male: -1, female: 0 },
  },
  {
    // Frankfort–mandibular plane angle.
    landmark: FMA,
    mean: 25,
    max: 30,
    min: 20,
    normSource: 'Tweed 1954',
  },
  {
    // Sella-nasion to the mandibular plane (Go-Me). The same mandibular
    // rotation read from the cranial base instead of from Frankfort; on a
    // tracing where porion or orbitale is uncertain it is the steadier of the
    // two, and where the cranial base is rotated it is the worse.
    landmark: SN_MP,
    mean: 32,
    max: 37,
    min: 27,
    normSource: 'Riedel 1952',
  },
  {
    // Maxillo-mandibular planes angle, palatal plane to mandibular plane.
    // Independent of both Frankfort and sella-nasion.
    landmark: MMPA,
    mean: 27,
    max: 31,
    min: 23,
    normSource: 'British Standards Institution (Eastman)',
  },
  {
    // Posterior / anterior facial-height ratio (S-Go / N-Me) × 100. Jarabak's
    // 62-65 is a published *range*, not a mean ± SD, so it is declared with
    // `RANGE` here exactly as it is in jarabak.ts — the same measurement must
    // not be graded on two different scales in two sections of one report.
    landmark: posteriorAnteriorFacialHeightRatio,
    mean: 63.5,
    max: 65,
    min: 62,
    ...RANGE,
    normSource: 'Jarabak & Fizzell 1972',
  },
  {
    // Upper share of the anterior face height, N-ANS / N-Me. Jarabak's 45 : 55
    // split, likewise a published range.
    landmark: upperAnteriorFaceHeightShare,
    mean: 45,
    max: 47,
    min: 43,
    ...RANGE,
    normSource: 'Jarabak & Fizzell 1972',
  },
  {
    // Total anterior facial height (N-Me), measured. Printed beside the lower
    // height below so the proportion above can be checked against the two
    // lengths it is made of.
    landmark: anteriorFacialHeight,
    ...NO_NORM,
  },
  {
    // Posterior facial height (S-Go) — the numerator of the S-Go/N-Me ratio
    // above. It is *already computed* on this screen (the ratio cannot be had
    // without it) and the stepper prints its millimetres, but it was not a
    // component, so the one surface a clinician reads the ratio on never showed
    // the length it was taken from: the section promised the proportion "can be
    // checked against the two lengths it is made of" while tabulating only one
    // of them. Declared exactly as Jarabak's section declares the same
    // measurement — no norm, because a normal S-Go in millimetres is age- and
    // sex-specific.
    landmark: posteriorFacialHeight,
    ...NO_NORM,
  },
  {
    // Upper anterior facial height (N-ANS) — likewise the numerator of the
    // N-ANS/N-Me share above, measured and shown in the stepper but previously
    // absent from the table.
    landmark: upperAnteriorFacialHeight,
    ...NO_NORM,
  },
  {
    // Lower anterior facial height (ANS-Me), measured. It carried "68 ± 6 mm"
    // here, an adult figure applied to any patient — the very thing `NO_NORM`
    // exists to prevent, and the reason its two siblings N-Me and S-Go already
    // state no norm. The row only ever printed blank because its symbol
    // collided with the ANS-Me *line* it is built from; now that it reaches the
    // table it must reach it honestly.
    landmark: lowerAnteriorFacialHeight,
    ...NO_NORM,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'wits',
  components,
  provenance: {
    author: 'Jacobson',
    year: 1975,
    population:
      '21 South African white adults with clinically excellent occlusions',
    alsoFrom: [
      'Tweed 1954 — Frankfort-mandibular plane angle',
      'Riedel 1952 — sella-nasion to mandibular plane',
      'British Standards Institution (Eastman) — maxillo-mandibular planes angle',
      'Jarabak & Fizzell 1972 — facial-height ratio and anterior face-height split',
    ],
    note:
      'Jacobson published the Wits appraisal separately by sex — about ' +
      '−1 mm in males and 0 mm in females, ± 2 mm — and this app grades ' +
      'against the patient\'s own figure whenever a sex is on record.',
    patientNote: (context) => {
      if (context === undefined || context.sex === undefined) {
        return (
          'No sex is recorded for this patient, so the Wits appraisal above ' +
          'is graded against the pooled 0 ± 2 mm rather than Jacobson\'s ' +
          'male (−1 mm) or female (0 mm) mean. Recording a sex moves a male ' +
          'reading about half a standard deviation.'
        );
      }
      return context.sex === 'male'
        ? 'The Wits appraisal above is graded against Jacobson\'s male mean ' +
          'of −1.0 ± 2.0 mm, not the pooled figure.'
        : 'The Wits appraisal above is graded against Jacobson\'s female ' +
          'mean of 0.0 ± 2.0 mm.';
    },
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
