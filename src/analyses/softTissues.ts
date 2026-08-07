import {
  Z,
  nasolabialAngle,
  softTissueFacialConvexity,
  totalFacialConvexity,
  mentolabialSulcusAngle,
} from 'analyses/landmarks/angles/soft';
import { upperLipToELine, lowerLipToELine } from 'analyses/landmarks/distances/soft';

import { defaultInterpretAnalysis, RANGE } from 'analyses/helpers';

/**
 * The soft-tissue profile: what the face shows, as opposed to what the bone
 * underneath it does.
 *
 * The two are not the same reading and the analysis is here to say when they
 * part company — a thick chin pad, a full upper lip or a large nose can carry
 * a convex skeleton into a straight profile, and it is the face the patient
 * and the clinician actually look at.
 *
 * What is reported:
 *
 *  - **Lips to Ricketts' E-line**, upper and lower, signed (in front of the
 *    line is positive). Ricketts' adult figures are −4 mm for the upper lip
 *    and −2 mm for the lower.
 *  - **Merrifield's Z angle**, the profile line against the Frankfort
 *    horizontal, 80° ± 9.
 *  - **The nasolabial angle**, 90–110°, the reading that decides whether the
 *    upper incisors may be retracted. A published range, not a mean ± SD, so
 *    it is declared with `RANGE` and carries no star scale.
 *  - **Facial convexity twice** — at subnasale (G-Sn-Pog', excluding the nose)
 *    and at pronasale (G-Pn-Pog', including it). Read as a pair they say
 *    whether the nose is carrying the profile.
 *  - **The mentolabial sulcus**, Li-Ils-Pog', the depth of the chin-lip fold.
 *
 * What is **not** reported, and why: Merrifield's **lip-chin-throat angle**
 * needs the soft-tissue cervical point where the submental line meets the
 * throat, and this tracing plots no throat point at all. Substituting a
 * different point and keeping the name would produce a number under a label it
 * does not belong to, so the app measures the lip-chin relation it does have
 * (the mentolabial sulcus above) and states no throat angle. Holdaway's H
 * angle is likewise absent: it is measured to soft-tissue nasion via the
 * harmony line, and the H-line's norm is stated against a skeletal convexity
 * correction this module does not compute.
 */
const components: AnalysisComponent[] = [
  {
    // Upper lip to the E-line.
    landmark: upperLipToELine,
    mean: -4,
    max: -2,
    min: -6,
  },
  {
    // Lower lip to the E-line.
    landmark: lowerLipToELine,
    mean: -2,
    max: 0,
    min: -4,
  },
  {
    // Merrifield's Z angle.
    landmark: Z,
    mean: 80,
    max: 89,
    min: 71,
  },
  {
    // Nasolabial angle. Published as a range — see `RANGE`.
    landmark: nasolabialAngle,
    mean: 100,
    max: 110,
    min: 90,
    ...RANGE,
  },
  {
    // Soft-tissue facial convexity at subnasale, excluding the nose.
    landmark: softTissueFacialConvexity,
    mean: 12,
    max: 16,
    min: 8,
  },
  {
    // Total facial convexity at pronasale, including the nose.
    landmark: totalFacialConvexity,
    mean: 137,
    max: 141,
    min: 133,
  },
  {
    // Mentolabial sulcus.
    landmark: mentolabialSulcusAngle,
    mean: 122,
    max: 134,
    min: 110,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'soft_tissues_lateral',
  components,
  provenance: {
    author: 'Legan & Burstone',
    year: 1980,
    population:
      '40 North American white adults with good facial balance ' +
      '(20 male, 20 female)',
    alsoFrom: [
      'Ricketts 1968 — E-line lip distances',
      'Merrifield 1966 — Z angle',
      'Burstone 1967 — total facial convexity, nasolabial angle',
    ],
    note:
      'Soft-tissue norms are the most population- and age-sensitive in ' +
      'cephalometry: lip thickness and nasal projection differ markedly ' +
      'between ethnic groups and change through life, so these adult white ' +
      'means transfer less well than the skeletal ones.',
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
