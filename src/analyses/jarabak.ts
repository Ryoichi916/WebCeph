import { NSAr, SArGo, ArGoMe } from 'analyses/landmarks/angles/skeletal';
import { bjorkSum } from 'analyses/landmarks/other/skeletal';
import { posteriorAnteriorFacialHeightRatio } from 'analyses/landmarks/distances/skeletal';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * Jarabak's analysis — the posterior cranio-facial angles that describe the
 * mandibular growth pattern (their sum is Björk's sum), plus the anterior /
 * posterior facial-height ratio that grades the growth direction.
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
    // Sum of the posterior angles (= saddle + articular + gonial). Norm 396° ± 6°.
    landmark: bjorkSum,
    mean: 396,
    max: 402,
    min: 390,
  },
  {
    // Posterior / anterior facial-height ratio (S-Go / N-Me) × 100.
    landmark: posteriorAnteriorFacialHeightRatio,
    mean: 63.5,
    max: 65,
    min: 62,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'jarabak',
  components,
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
