import { FMIA, FMPA, IMPA } from 'analyses/landmarks/angles/skeletal';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * Tweed's diagnostic triangle — FMIA, FMPA (FMA) and IMPA, the three angles the
 * Frankfort horizontal, the mandibular plane and the lower incisor axis form
 * with each other (they sum to 180°).
 *
 * All three are computed from landmarks this app already places (Po, Or, Go, Me
 * and the lower incisor axis) and all three carry a norm, so all three are
 * interpreted: FMPA grades the mandibular rotation, while FMIA and IMPA — read
 * together, as Tweed intended — grade the inclination of the lower incisor.
 *
 * Tweed's own treatment rule (that FMIA should be brought to 65° when FMPA is
 * high and 68° when it is low) is a *plan*, not a measurement, so it is not
 * printed as a finding: this module reports what the tracing supports and
 * leaves the prescription to the clinician.
 */
const components: AnalysisComponent[] = [
  {
    landmark: FMIA,
    mean: 66,
    max: 70,
    min: 62,
  },
  {
    landmark: FMPA,
    mean: 25,
    max: 30,
    min: 20,
  },
  {
    landmark: IMPA,
    mean: 90,
    max: 93,
    min: 87,
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'tweed',
  components,
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
