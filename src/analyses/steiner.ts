import {
  SNA, SNB, ANB, SND,
  GOGN_SN, occlusalPlaneToSN,
  U1_NA, L1_NB, interincisalAngle,
} from 'analyses/landmarks/angles/skeletal';
import {
  upperIncisorToNA, lowerIncisorToNB, pogonionToNB, holdawayRatio,
} from 'analyses/landmarks/distances/skeletal';
import {
  upperLipToSLine, lowerLipToSLine,
} from 'analyses/landmarks/distances/soft';

import { defaultInterpretAnalysis, RANGE } from 'analyses/helpers';

/**
 * Steiner's analysis, as published: the skeletal relations read off the S-N
 * cranial base, the mandibular and occlusal planes measured against the same
 * line, the dental group — each incisor's inclination *and* its position in
 * millimetres — the chin, Holdaway's reading of the chin against the lower
 * incisor, and the soft-tissue S-line.
 *
 * Norms are Steiner's own figures (SNA 82°, SNB 80°, ANB 2°, SND 76°,
 * Go-Gn/SN 32°, U1-NA 22° and 4 mm, L1-NB 25° and 4 mm, Pog-NB 2 mm,
 * interincisal 131°, occlusal plane to S-N 14°), each with the ± 1 SD band the
 * results table reads as its severity scale.
 *
 * Two components are not on that scale, because their authors published a rule
 * rather than a distribution, and both are declared with `RANGE` so the table
 * prints their bounds and withholds the star scale:
 *
 *  - **Holdaway's ratio**, L1-NB : Pog-NB. Both operands were already computed
 *    and printed on this table; the ratio between them — Steiner's reason for
 *    reporting the pair at all — was named in two comments and shown nowhere.
 *    Ideal 1 : 1, acceptable to 2 : 1. It is what says whether the lower
 *    incisor may be retracted.
 *  - **The S-line**, upper and lower lip. Steiner's statement is that the lips
 *    touch the line in a balanced face — a norm of zero with a ± 1 mm working
 *    tolerance, not a measured standard deviation. Every landmark it needs
 *    (Ls, Li, Sn, Pn, Pog') is already plotted by the soft-tissue analysis.
 *
 * The millimetre readings are *signed* against their reference line (see
 * `signedDistanceAnteriorTo`): a retruded incisor reports −2 mm rather than the
 * same "2 mm" as a protruded one, and they are withheld entirely on an
 * uncalibrated radiograph rather than reported as pixels. Holdaway's ratio is
 * the exception that proves the rule — a quotient of two lengths needs no
 * scale, so it survives on an uncalibrated film.
 *
 * Steiner's "acceptable compromises" (the chart of treatment goals derived from
 * ANB) are a plan, not a measurement, and are deliberately not printed here.
 */
const components: AnalysisComponent[] = [
  {
    landmark: SNA,
    mean: 82,
    max: 84,
    min: 80,
  },
  {
    landmark: SNB,
    mean: 80,
    max: 82,
    min: 78,
  },
  {
    landmark: ANB,
    mean: 2,
    max: 4,
    min: 0,
  },
  {
    // Mandibular position measured from the centre of the symphysis, which
    // (unlike point B) does not move with the lower incisor.
    landmark: SND,
    mean: 76,
    max: 78,
    min: 74,
  },
  {
    // Steiner's mandibular plane angle, Go-Gn to S-N.
    landmark: GOGN_SN,
    mean: 32,
    max: 37,
    min: 27,
  },
  {
    // Upper incisor inclination to N-A.
    landmark: U1_NA,
    mean: 22,
    max: 27,
    min: 17,
  },
  {
    // Upper incisor position: signed millimetres in front of N-A.
    landmark: upperIncisorToNA,
    mean: 4,
    max: 6,
    min: 2,
  },
  {
    // Lower incisor inclination to N-B.
    landmark: L1_NB,
    mean: 25,
    max: 30,
    min: 20,
  },
  {
    // Lower incisor position: signed millimetres in front of N-B.
    landmark: lowerIncisorToNB,
    mean: 4,
    max: 6,
    min: 2,
  },
  {
    // Chin prominence in front of N-B; read against L1-NB (Holdaway).
    landmark: pogonionToNB,
    mean: 2,
    max: 4,
    min: 0,
  },
  {
    // Holdaway's ratio of the two readings above. Ideal 1 : 1, up to 2 : 1
    // accepted — a published range, so no star scale (see `RANGE`).
    landmark: holdawayRatio,
    mean: 1.5,
    max: 2,
    min: 1,
    ...RANGE,
    normSource: 'Holdaway 1983 — incisor : chin ratio',
  },
  {
    // Interincisal angle. Reported with Steiner's norm but no named
    // indication: a closed interincisal angle can come from either incisor,
    // and the two rows above already say which.
    landmark: interincisalAngle,
    mean: 131,
    max: 141,
    min: 121,
  },
  {
    // Occlusal plane to S-N.
    landmark: occlusalPlaneToSN,
    mean: 14,
    max: 17,
    min: 11,
  },
  {
    // Upper lip to the S-line. Steiner: the lip touches the line.
    landmark: upperLipToSLine,
    mean: 0,
    max: 1,
    min: -1,
    ...RANGE,
    normSource: 'Steiner 1962 — S-line lip positions',
  },
  {
    // Lower lip to the S-line.
    landmark: lowerLipToSLine,
    mean: 0,
    max: 1,
    min: -1,
    ...RANGE,
    normSource: 'Steiner 1962 — S-line lip positions',
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'steiner',
  components,
  provenance: {
    author: 'Steiner',
    year: 1953,
    population:
      'North American white adults with acceptable occlusions, drawn from ' +
      'the Bolton and Burlington growth series',
    alsoFrom: [
      'Holdaway 1983 — incisor : chin ratio',
      'Steiner 1962 — S-line lip positions',
    ],
    note:
      'Steiner published his norms as treatment goals as much as ' +
      'descriptions: the "acceptable compromises" chart derives a target SNA ' +
      'and SNB from the patient\'s own ANB, so a value outside the band ' +
      'below is not by itself an indication for treatment.',
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
