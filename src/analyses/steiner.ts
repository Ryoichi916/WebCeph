import { SNA, SNB, ANB } from 'analyses/landmarks/angles/skeletal';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * Steiner's analysis — the anteroposterior skeletal relations read off the
 * S-N cranial base: SNA for the maxilla, SNB for the mandible and ANB for the
 * relation between the two.
 *
 * Steiner's *dental* and chin measurements (U1-NA and L1-NB, in millimetres and
 * degrees, plus Pog-NB) are deliberately absent: they are measured from the
 * N-A and N-B lines, which this landmark set does not define, so there is no
 * honest way to compute them here. What is printed is what the tracing
 * supports — three angles, each against Steiner's own norm.
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
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'steiner',
  components,
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
