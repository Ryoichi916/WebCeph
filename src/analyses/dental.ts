import { U1_SN, L1_MP, interincisalAngle } from 'analyses/landmarks/angles/skeletal';
import { overjet, overbite } from 'analyses/landmarks/distances/dental';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * Overjet and overbite lead the dental analysis: they are the two incisor
 * relationships a treatment plan is actually written against, and a dental
 * analysis that reported inclinations but not the bite would be describing the
 * teeth without describing the occlusion.
 *
 * Both are signed millimetre values measured against the functional occlusal
 * plane (see `analyses/landmarks/distances/dental`), so they need the molar and
 * premolar cusp centres plotted and an mm/px calibration — the same rule every
 * other linear measurement in the app follows.
 *
 * Norms: 2.5 ± 1.0 mm for each, the conventional ideal incisor relationship
 * (roughly a 2–3.5 mm overjet and 2–4 mm of overbite, about a third of the
 * lower incisor crown).
 */
const components: AnalysisComponent[] = [
  {
    landmark: overjet,
    mean: 2.5,
    min: 1.5,
    max: 3.5,
  },
  {
    landmark: overbite,
    mean: 2.5,
    min: 1.5,
    max: 3.5,
  },
  {
    landmark: interincisalAngle,
    mean: 130,
    max: 135,
    min: 125,
  },
  {
    landmark: U1_SN,
    mean: 102,
    max: 107,
    min: 97,
  },
  {
    landmark: L1_MP,
    mean: 90,
    min: 87,
    max: 93,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'dental',
  components,
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
