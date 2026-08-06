import { FMA } from 'analyses/landmarks/angles/skeletal';
import {
  witsAppraisal,
  posteriorAnteriorFacialHeightRatio,
  lowerAnteriorFacialHeight,
} from 'analyses/landmarks/distances/skeletal';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * "Wits & vertical" — a compact skeletal appraisal.
 *
 * A true McNamara analysis relies on effective jaw lengths measured from
 * Condylion (Co-A, Co-Gn), but this landmark set has no Condylion point (only
 * Articulare), so those measures cannot be computed honestly. Instead we ship
 * the dentition-independent Wits appraisal (the signed AO-BO projection onto
 * the functional occlusal plane) together with two vertical measures: the
 * anterior/posterior facial-height ratio and the lower anterior facial height,
 * plus the Frankfort–mandibular plane angle.
 */
const components: AnalysisComponent[] = [
  {
    // Wits appraisal — signed AO-BO along the occlusal plane. Norm 0 ± 2 mm.
    landmark: witsAppraisal,
    mean: 0,
    max: 2,
    min: -2,
  },
  {
    // Frankfort–mandibular plane angle.
    landmark: FMA,
    mean: 25,
    max: 30,
    min: 20,
  },
  {
    // Posterior / anterior facial-height ratio (S-Go / N-Me) × 100.
    landmark: posteriorAnteriorFacialHeightRatio,
    mean: 63.5,
    max: 65,
    min: 62,
  },
  {
    // Lower anterior facial height (ANS-Me) in mm.
    landmark: lowerAnteriorFacialHeight,
    mean: 68,
    max: 74,
    min: 62,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'wits',
  components,
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
