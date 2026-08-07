import {
  U1_SN, U1_SPP, L1_MP, interincisalAngle,
} from 'analyses/landmarks/angles/skeletal';
import {
  overjet, overbite, molarRelationship, curveOfSpeeDepth,
} from 'analyses/landmarks/distances/dental';
import {
  upperIncisorToNA, lowerIncisorToNB,
  maxillaryIncisorToDentalPlane, mandibularIncisorToDentalPlane,
} from 'analyses/landmarks/distances/skeletal';

import { defaultInterpretAnalysis, NO_NORM, RANGE } from 'analyses/helpers';

/**
 * The dental analysis: the module a clinician opens to answer a question about
 * the teeth rather than about the skeleton. It reports the bite, both incisors'
 * *inclination*, both incisors' *position*, and the two arch readings the
 * occlusal plane already supports.
 *
 * **The bite.** Overjet and overbite lead, because they are the two
 * relationships a treatment plan is written against. Both are signed millimetre
 * values measured against the functional occlusal plane (see
 * `analyses/landmarks/distances/dental`), so they need the molar and premolar
 * cusp centres plotted and an mm/px calibration — the same rule every other
 * linear measurement in the app follows.
 *
 * Both are declared with `RANGE`, and that is a correction of something this
 * module used to get badly wrong. They were declared `mean: 2.5, min: 1.5,
 * max: 3.5` — the shape of a mean ± 1 SD band — while the note underneath
 * admitted the figure was "the conventional clinical ideal, not a measured
 * population mean". The table dutifully divided by that invented standard
 * deviation and printed "−0.7 mm · 2.5 ± 1.0 · −3.2 mm ***": the loudest
 * severity marker anywhere in an eleven-page report, computed against a
 * standard deviation nobody has ever published. The ideal bite is a *range*
 * (2.0–3.5 mm of overjet, 2.0–4.0 mm of overbite, about a third of the lower
 * incisor crown), so it is declared as one: graded in or out of range, with no
 * stars, exactly as Björk's gonial halves and Jarabak's proportions are.
 *
 * **Inclination.** Each incisor's axis against a reference the other jaw cannot
 * move. The upper incisor is reported **twice** on purpose: against
 * sella-nasion, which is what most software prints, and against the maxillary
 * plane it is actually standing in. The two disagree whenever the cranial base
 * is rotated or nasion sits high, and when they do it is the maxillary-plane
 * reading that describes the tooth.
 *
 * **Position.** An inclination is not a position: a tooth can be perfectly
 * upright and still stand three millimetres too far forward, and no amount of
 * torque will fix that. Four linear readings are added here — U1-NA and L1-NB
 * against Steiner's cranial-base references, U1-APog and L1-APog against the
 * facial plane the profile is actually judged on — all four computed from
 * landmarks this module already requires (U1/L1 edges and apices, A, B, Pog),
 * and all four graded against the same author's figure the section that
 * introduced them uses. The dental analysis reported inclinations alone for as
 * long as it existed, which meant the one module named after the teeth could
 * not answer "how far forward are the incisors?".
 *
 * **The arch.** The molar relationship and the depth of the curve of Spee are
 * both computed from cusps already plotted for the occlusal plane, and both are
 * reported without a norm — see their landmarks for why neither may be dressed
 * up as Angle's classification or as a "2 mm" rule of thumb read on models.
 * They are here because a plan needs them and the geometry supports them, not
 * because the table looked short.
 *
 * **Whose norms these are.** Every band below is the cited author's own figure,
 * checked against the module that introduced it, because the combined report
 * prints them side by side and the reader can see any disagreement: the
 * interincisal angle is Steiner's 131 ± 10 (it was 130 ± 5 here under a
 * "Steiner 1953" heading while `steiner.ts` printed 131 ± 10 for the identical
 * measurement, so one tracing's 133.8° was 0.28 SD in one section and 0.76 SD
 * in the next), and IMPA is Tweed's 90 ± 5 (it was 90 ± 3, printed by the
 * report's own divergence table directly beneath Tweed's 90 ± 5). An analysis
 * that borrows a norm has to borrow the whole of it.
 */
const components: AnalysisComponent[] = [
  // ---- the bite ------------------------------------------------------------
  {
    // Ideal overjet 2.0–3.5 mm. A range, not a mean ± SD: see the module note.
    landmark: overjet,
    mean: 2.75,
    min: 2,
    max: 3.5,
    ...RANGE,
    normSource: 'Conventional clinical ideal (no published SD)',
  },
  {
    // Ideal overbite 2.0–4.0 mm — about a third of the lower incisor crown.
    landmark: overbite,
    mean: 3,
    min: 2,
    max: 4,
    ...RANGE,
    normSource: 'Conventional clinical ideal (no published SD)',
  },
  // ---- incisor inclination -------------------------------------------------
  {
    // Interincisal angle. Steiner's own figure, matching `steiner.ts`.
    landmark: interincisalAngle,
    mean: 131,
    max: 141,
    min: 121,
  },
  {
    landmark: U1_SN,
    mean: 102,
    max: 107,
    min: 97,
  },
  {
    // Upper incisor to the maxillary (palatal) plane — the same inclination
    // measured inside the maxilla instead of from the cranial base.
    landmark: U1_SPP,
    mean: 109,
    max: 115,
    min: 103,
    normSource: 'British Standards Institution (Eastman)',
  },
  {
    // IMPA. Tweed's own figure, matching `tweed.ts`.
    landmark: L1_MP,
    mean: 90,
    min: 85,
    max: 95,
    normSource: 'Tweed 1954',
  },
  // ---- incisor position ----------------------------------------------------
  {
    // Upper incisal edge in front of N-A (Steiner, 4 ± 2 mm).
    landmark: upperIncisorToNA,
    mean: 4,
    max: 6,
    min: 2,
  },
  {
    // Lower incisal edge in front of N-B (Steiner, 4 ± 2 mm).
    landmark: lowerIncisorToNB,
    mean: 4,
    max: 6,
    min: 2,
  },
  {
    // Upper incisal edge in front of A-Pog (Downs, 2.7 ± 1.8 mm).
    landmark: maxillaryIncisorToDentalPlane,
    mean: 2.7,
    max: 4.5,
    min: 0.9,
    normSource: 'Downs 1948',
  },
  {
    // Lower incisal edge in front of A-Pog (Ricketts, 1 ± 2 mm) — the reading
    // that decides whether the lower arch may be advanced at all.
    landmark: mandibularIncisorToDentalPlane,
    mean: 1,
    max: 3,
    min: -1,
    normSource: 'Ricketts 1960',
  },
  // ---- the arch ------------------------------------------------------------
  {
    // Molar relationship along the occlusal plane. Measured, not classified.
    landmark: molarRelationship,
    ...NO_NORM,
  },
  {
    // Depth of the curve of Spee. Measured; no norm may be quoted for a
    // three-point approximation of it on one film.
    landmark: curveOfSpeeDepth,
    ...NO_NORM,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'dental',
  components,
  provenance: {
    author: 'Steiner',
    year: 1953,
    population: 'North American white adults with acceptable occlusions',
    alsoFrom: [
      'Tweed 1954 — incisor-mandibular plane angle, 90° ± 5',
      'British Standards Institution (Eastman) — upper incisor to maxillary plane',
      'Downs 1948 — upper incisor to A-Pog',
      'Ricketts 1960 — lower incisor to A-Pog',
      'Conventional ideal incisor relationship — overjet and overbite ranges',
    ],
    note:
      'This is a composite section rather than one author\'s analysis: no ' +
      'single published paper reports all of these against one sample, and ' +
      'each band above is the figure published by the author named beside ' +
      'it — Steiner\'s interincisal 131 ± 10 and his millimetre readings, ' +
      'Tweed\'s IMPA 90 ± 5, Downs\' and Ricketts\' A-Pog figures — not a ' +
      'house average of them. The overjet and overbite bands are the ' +
      'conventional clinical ideal stated as a range: no author published a ' +
      'standard deviation for them, so they are graded in or out of range ' +
      'and carry no severity stars. The molar relationship and the curve of ' +
      'Spee are reported with no norm at all. The upper incisor to ' +
      'sella-nasion, 102° ± 5, is the figure in general circulation rather ' +
      'than one paper\'s: the same tooth is reported on the line above ' +
      'against the maxillary plane, where the Eastman standard\'s 109° ± 6 ' +
      'does have a source.',
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
