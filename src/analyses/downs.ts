import {
  yAxis,
  downsAngleOfConvexity,
  downsABPlaneAngle,
  downsCantOfOcclusalPlane,
  downsIncisorOcclusalPlaneAngle,
  facialAngle,
  interincisalAngle,
  FMPA,
  L1_MP,
} from 'analyses/landmarks/angles/skeletal';
import {
  maxillaryIncisorToDentalPlane,
} from 'analyses/landmarks/distances/skeletal';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * Downs' analysis, as he published it: five skeletal measurements read off the
 * Frankfort horizontal — facial angle, angle of convexity, A-B plane, cant of
 * the mandibular plane and the Y axis — and five dental ones — cant of the
 * occlusal plane, interincisal angle, lower incisor to the occlusal plane,
 * lower incisor to the mandibular plane and upper incisor to A-Pog.
 *
 * Those ten, and only those ten. This module used to open with SNA, SNB, ANB
 * and SN-MP, borrowed from the shared `common` block: none of the four is
 * Downs'. He measures nothing from sella-nasion — the whole point of his
 * analysis is that everything hangs off Frankfort — so those rows carried
 * Steiner's landmarks under a Downs heading with norms that are Steiner's and
 * Riedel's. They are still one click away in the Steiner section, measured
 * against their own author's figures, which is where they belong. What replaces
 * them is the half of Downs' analysis this app never computed: his whole dental
 * group but the interincisal angle.
 *
 * Two constructions deserve a note:
 *
 *  - Downs' **occlusal plane** runs from the molar cusps to the bisector of the
 *    incisal overbite, not from molar to premolar like the functional plane the
 *    rest of the app uses for the Wits appraisal. Both his occlusal readings
 *    are taken on his line (see `downsOcclusalPlane`); they differ by about 3°
 *    on an ordinary tracing, which is most of a standard deviation.
 *  - His **incisor–occlusal plane angle** is stated as the departure from a
 *    right angle, not as the angle the two lines subtend, so its 14.5° mean
 *    describes an incisor 14.5° proclined past the perpendicular.
 *
 * Downs' own "Wylie polygon" plotting of the ten against their ranges is the
 * ancestor of this app's wigglegram, which draws exactly that.
 */
const components: AnalysisComponent[] = [
  // ---- skeletal ------------------------------------------------------------
  {
    // Facial angle, FH to N-Pog: mandibular protrusion.
    landmark: facialAngle,
    mean: 87.8,
    max: 91.4,
    min: 84.2,
  },
  {
    // Angle of convexity, N-A to A-Pog, signed.
    landmark: downsAngleOfConvexity,
    mean: 0,
    max: 5.1,
    min: -5.1,
  },
  {
    // A-B plane to the facial plane, signed and normally negative.
    landmark: downsABPlaneAngle,
    mean: -4.6,
    // Downs' standard deviation for the A-B plane is **3.7°**, and this is the
    // one component of his ten where the band was not his: it was
    // reconstructed by halving his 0 to −9.2 *range*, which gave 4.6 — a band
    // ~24 % wider than he measured, and the only figure in this module that
    // did not match the published SD. (An analysis whose note says "the ±
    // figures here are the standard deviations of that sample" has to mean
    // it: at 4.6 an A-B plane of −10° reads 1.2 SD and prints unstarred; at
    // Downs' 3.7 it is 1.5 SD and starred.)
    max: -0.9,
    min: -8.3,
  },
  {
    // Mandibular plane to FH. Downs' own mean and SD, which are a degree and
    // a half tighter than Tweed's 25 ± 5 for the same two lines.
    landmark: FMPA,
    mean: 21.9,
    max: 25.1,
    min: 18.7,
  },
  {
    // Y axis, S-Gn to FH: the direction of facial growth.
    landmark: yAxis,
    mean: 59.4,
    max: 63.2,
    min: 55.6,
  },
  // ---- dental --------------------------------------------------------------
  {
    // Cant of the occlusal plane to FH, on Downs' construction of the plane.
    landmark: downsCantOfOcclusalPlane,
    mean: 9.3,
    max: 13.1,
    min: 5.5,
  },
  {
    // Interincisal angle. Downs' mean is 135.4°, four degrees wider than
    // Steiner's 131° for the identical measurement — which is exactly why each
    // analysis has to carry its own author's figure.
    landmark: interincisalAngle,
    mean: 135.4,
    max: 141.2,
    min: 129.6,
  },
  {
    // Lower incisor to the occlusal plane, as a departure from perpendicular.
    landmark: downsIncisorOcclusalPlaneAngle,
    mean: 14.5,
    max: 18,
    min: 11,
  },
  {
    // Lower incisor to the mandibular plane (IMPA).
    landmark: L1_MP,
    mean: 91.4,
    max: 95.2,
    min: 87.6,
  },
  {
    // Upper incisal edge in front of A-Pog, signed. The one linear
    // measurement in Downs' ten, so the only one withheld on an uncalibrated
    // film.
    landmark: maxillaryIncisorToDentalPlane,
    mean: 2.7,
    max: 4.5,
    min: 0.9,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'downs',
  components,
  provenance: {
    author: 'Downs',
    year: 1948,
    population:
      '20 North American white adolescents, 12–17 y, with clinically ' +
      'excellent occlusions',
    note:
      'A small, ethnically homogeneous sample of adolescents. Downs himself ' +
      'published ranges alongside the means; the ± figures here are the ' +
      'standard deviations of that sample.',
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
