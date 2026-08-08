import {
  FMIA, FMPA, IMPA, yAxis,
} from 'analyses/landmarks/angles/skeletal';

import { defaultInterpretAnalysis } from 'analyses/helpers';

/**
 * Tweed's diagnostic triangle — FMIA, FMPA (FMA) and IMPA, the three angles the
 * Frankfort horizontal, the mandibular plane and the lower incisor axis form
 * with each other (they sum to 180°) — read with the Y axis, the fourth reading
 * taken off the same Frankfort horizontal.
 *
 * All four are computed from landmarks this app already places (Po, Or, Go, Me,
 * S, Gn and the lower incisor axis).
 *
 * The triangle's three angles carry Tweed's norms (FMA 25° ± 5, FMIA 65° ± 5,
 * IMPA 90° ± 5) and are interpreted: FMPA grades the mandibular rotation, while
 * FMIA and IMPA — read together, as Tweed intended — grade the inclination of
 * the lower incisor.
 *
 * The **Y axis** is not Tweed's measurement and is not printed as though it
 * were: it carries Downs' 59.4° ± 3.8, attributed to him in `alsoFrom` exactly
 * as `wits.ts` attributes its borrowed FMA to Tweed and its ratio to Jarabak.
 * It used to sit here with "no published norm" against it — while the Downs
 * section, two menu items away, graded the identical S-Gn-to-Frankfort angle
 * against that very figure. One app cannot both state a norm for a quantity and
 * deny that one exists for it; naming the borrowed author fixes that in the
 * direction that keeps the reading.
 *
 * The **occlusal plane to Frankfort** row has been dropped. It was the other
 * ungraded row here, and on a five-row table the two of them were 40 % of the
 * content; but the reason it goes rather than borrowing a norm too is that
 * Downs' +9.3° cant belongs to *his* occlusal plane — molar cusps to the
 * incisal bisector — and this row measured the functional molar-to-premolar
 * plane, a different line by about 3°. Downs' section reports the cant on
 * Downs' construction, which is where it belongs.
 *
 * Tweed's own treatment rule (that FMIA should be brought to 65° when FMPA is
 * high and 68° when it is low) is a *plan*, not a measurement, so it is not
 * printed as a finding: this module reports what the tracing supports and
 * leaves the prescription to the clinician.
 */
const components: AnalysisComponent[] = [
  {
    landmark: FMIA,
    mean: 65,
    max: 70,
    min: 60,
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
    max: 95,
    min: 85,
  },
  {
    // Y axis (S-Gn to Frankfort horizontal), graded against Downs' figure —
    // the same construction and the same norm his own section uses.
    landmark: yAxis,
    mean: 59.4,
    max: 63.2,
    min: 55.6,
    normSource: 'Downs 1948',
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'tweed',
  components,
  provenance: {
    author: 'Tweed',
    year: 1954,
    population:
      'North American white orthodontic patients with stable, successfully ' +
      'treated results',
    alsoFrom: [
      'Downs 1948 — Y axis to Frankfort horizontal, 59.4° ± 3.8',
    ],
    note:
      'Tweed\'s triangle is a treatment prescription as much as a norm: the ' +
      'three angles are defined to sum to 180°, so they cannot vary ' +
      'independently, and his FMIA target moves with FMPA (65° on a high ' +
      'angle, 68° on a low one) rather than staying at the single mean ' +
      'printed here. The Y axis is Downs\' measurement and Downs\' norm, ' +
      'borrowed here because it is read off the same Frankfort horizontal; ' +
      'the occlusal-plane cant is not printed in this section at all, since ' +
      'the only published norm for it is Downs\' and it belongs to his ' +
      'construction of the plane, not to the functional one.',
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
