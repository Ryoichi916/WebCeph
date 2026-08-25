import {
  facialAxisAngle,
  facialAngle,
  FMPA,
  mandibularArc,
  L1ToDentalPlaneAngle,
  lowerFacialHeightAngle,
} from 'analyses/landmarks/angles/skeletal';
import {
  convexityAtPointA,
  mandibularIncisorToDentalPlane,
  upperMolarToPtV,
} from 'analyses/landmarks/distances/skeletal';

import { upperLipToELine, lowerLipToELine } from 'analyses/landmarks/distances/soft';

import { defaultInterpretAnalysis, NO_NORM } from 'analyses/helpers';

/**
 * Ricketts' summary analysis — the short list he distilled out of the full
 * hundred-odd-factor Rocky Mountain analysis and intended a clinician to read
 * in one pass. Its shape is deliberate: two angles that say *where the chin is
 * going* (facial axis, facial depth), two that say *how the face opens*
 * (mandibular plane, lower facial height), one that says *what the mandible
 * itself is shaped like* (mandibular arc), one for the *skeletal profile*
 * (convexity), three for the *dentition* (lower incisor position and
 * inclination against A-Pog, upper molar against the pterygoid vertical) and
 * two for the *lips* against his own E-line.
 *
 * Every one of them was computable from landmarks this app already asks for
 * except the mandibular arc, which needs Dc — the point on the condylar neck
 * where the Ba-N plane crosses it — and that landmark has been added rather
 * than the measurement skipped.
 *
 * Three of the eight factors that were here before were being measured on the
 * wrong construction, and each is documented at its landmark:
 *
 *  - the **convexity** was unsigned, so it could not report the Class III
 *    tendency it exists to report;
 *  - the **lower incisor to A-Pog** was taken from the root apex instead of
 *    the incisal edge, 5 mm away and on the other side of the line;
 *  - the **lower facial height** was subtended to pogonion instead of Pm, and
 *    interpreted as an incisor inclination — a category with no tooth in it.
 *
 * **Ricketts' norms are age-indexed, and this app applies the index.** The
 * figures below are his values at age 9, each carrying the growth correction he
 * publishes with it (`perYearFrom`: facial depth +0.33°/yr, mandibular plane
 * −0.3°/yr, convexity −0.2 mm/yr, mandibular arc +0.5°/yr; the facial axis and
 * the lower facial height have none, and are the same at 9 as at 40). The
 * correction is applied against the patient's age **on the day of the film**,
 * which is the only age a cephalometric norm may be read at, and it moves the
 * mean and its band together — the standard deviation is the sample's and
 * Ricketts does not restate it per year.
 *
 * It **stops at the end of growth** (`until: 18`). A growth coefficient is a
 * description of growth, and running one into middle age produces figures no
 * author has printed: +0.33°/yr taken to 60 would norm the facial depth at
 * 103°. Taken to 18 it reaches 90.0°, and the other three reach 23.3°, 0.2 mm
 * and 30.5° — which are precisely the adult figures Ricketts' own tables carry.
 * The clamp is what makes the correction agree with its author, not a hedge
 * against it.
 *
 * This is not a cosmetic difference. On this app's demo adult the correction is
 * the full nine years, and two of the four headline factors change their
 * verdict outright: the facial depth is normed 90.0° rather than 87°, so 91.3°
 * reads +1.3° and **normal** where against the child's figure it read +4.3° and
 * "concave"; and the convexity is normed 0.2 mm rather than 2 mm, so −0.9 mm is
 * **Class 1** where it read −2.9 mm and "Class 3". The mandibular plane moves
 * from 26° to 23.3° (24.3° goes from −1.7° to +1.0°) and the mandibular arc
 * from 26° to 30.5° (24.3° goes from within the band to 1.6 SD below it).
 * Grading an adult against a nine-year-old's mean was not a caveat, it was two
 * wrong diagnoses and two misleading deviations.
 *
 * With **no date of birth on record** nothing is corrected: the published
 * age-9 figures are printed and the provenance note says, on that particular
 * document, that they were not corrected and in which direction they err.
 */
const components: AnalysisComponent[] = [
  {
    // Facial axis, Ba-N to Pt-Gn. The direction of chin growth, and the one
    // Ricketts factor with no age correction at all.
    landmark: facialAxisAngle,
    mean: 90,
    max: 93,
    min: 87,
  },
  {
    // Facial depth, FH to N-Pog: how far forward the chin already is.
    // +0.33° a year after 9 — the chin comes forward as the face grows.
    landmark: facialAngle,
    mean: 87,
    max: 90,
    min: 84,
    perYearFrom: { age: 9, delta: 0.33, until: 18 },
  },
  {
    // Mandibular plane angle, FH to Go-Me. Closes 0.3° a year after 9 as the
    // ramus grows faster than the anterior face height.
    landmark: FMPA,
    mean: 26,
    max: 30,
    min: 22,
    perYearFrom: { age: 9, delta: -0.3, until: 18 },
  },
  {
    // Lower facial height, ANS-Xi-Pm.
    landmark: lowerFacialHeightAngle,
    mean: 47,
    max: 51,
    min: 43,
  },
  {
    // Mandibular arc, the bend between the condylar and corpus axes.
    // Opens 0.5° a year after 9.
    landmark: mandibularArc,
    mean: 26,
    max: 30,
    min: 22,
    perYearFrom: { age: 9, delta: 0.5, until: 18 },
  },
  {
    // Convexity: point A in front of the facial plane N-Pog, signed. Falls
    // 0.2 mm a year after 9 as the chin catches up with the maxilla, so the
    // adult mean is negative — a straight adult profile is *not* +2 mm.
    landmark: convexityAtPointA,
    mean: 2,
    max: 4,
    min: 0,
    perYearFrom: { age: 9, delta: -0.2, until: 18 },
  },
  {
    // Lower incisal edge in front of A-Pog, signed.
    landmark: mandibularIncisorToDentalPlane,
    mean: 1,
    max: 3,
    min: -1,
  },
  {
    // Lower incisor inclination to A-Pog.
    landmark: L1ToDentalPlaneAngle,
    mean: 22,
    max: 26,
    min: 18,
  },
  {
    // Upper first molar to the pterygoid vertical. Measured, not graded: the
    // norm is the patient's age + 3 mm (see the landmark).
    landmark: upperMolarToPtV,
    ...NO_NORM,
  },
  {
    // Upper lip to the E-line.
    landmark: upperLipToELine,
    mean: -4,
    max: -2,
    min: -6,
    normSource: 'Ricketts 1968 — E-line',
  },
  {
    // Lower lip to the E-line — the factor Ricketts names in the summary.
    landmark: lowerLipToELine,
    mean: -2,
    max: 0,
    min: -4,
    normSource: 'Ricketts 1968 — E-line',
  },
];

const analysis: Analysis<'ceph_lateral'> = {
  id: 'ricketts_lateral',
  components,
  provenance: {
    author: 'Ricketts',
    year: 1960,
    population:
      'North American white children and adults (Rocky Mountain Data ' +
      'Systems growth series)',
    alsoFrom: [
      'Ricketts 1968 — E-line lip norms',
    ],
    note:
      'Ricketts states his norms at age 9 and publishes a growth correction ' +
      'for most of them (facial depth +0.33°/yr, mandibular plane −0.3°/yr, ' +
      'convexity −0.2 mm/yr, mandibular arc +0.5°/yr; the facial axis and the ' +
      'lower facial height have none). The molar-to-PtV norm is age-dependent ' +
      'outright — the patient\'s age + 3 mm — and is therefore withheld ' +
      'rather than graded.',
    // The figures alone, for a compact surface (see `NormsProvenance.patientLede`).
    // The instruction that follows from a missing date is *not* here: which date
    // is missing is a fact about the record, not about Ricketts' norms, and the
    // surface that knows it writes that sentence.
    patientLede: (context) => {
      if (context === undefined || typeof context.ageInYears !== 'number') {
        return (
          'No date of birth on record — Ricketts’ age-9 figures, uncorrected. ' +
          'Record one to grade against the age-corrected norms.'
        );
      }
      const years = context.ageInYears;
      const shown = years >= 10 ? years.toFixed(0) : years.toFixed(1);
      const grown = Math.min(Math.max(years, 9), 18) - 9;
      return (
        `Age ${shown} y · facial depth ${(87 + 0.33 * grown).toFixed(1)}° · ` +
        `mand. plane ${(26 - 0.3 * grown).toFixed(1)}° · ` +
        `convexity ${(2 - 0.2 * grown).toFixed(1)} mm · ` +
        `mand. arc ${(26 + 0.5 * grown).toFixed(1)}°`
      );
    },
    patientNote: (context) => {
      if (context === undefined || typeof context.ageInYears !== 'number') {
        return (
          'No date of birth is on record for this patient, so the age-9 ' +
          'figures are printed uncorrected: an adult will read further from ' +
          'these means than from their own. Record a date of birth to grade ' +
          'against the age-corrected norms.'
        );
      }
      const years = context.ageInYears;
      const shown = years >= 10 ? years.toFixed(0) : years.toFixed(1);
      const applied = Math.min(Math.max(years, 9), 18);
      const grown = applied - 9;
      const figures =
        `facial depth ${(87 + 0.33 * grown).toFixed(1)}°, mandibular plane ` +
        `${(26 - 0.3 * grown).toFixed(1)}°, convexity ` +
        `${(2 - 0.2 * grown).toFixed(1)} mm, mandibular arc ` +
        `${(26 + 0.5 * grown).toFixed(1)}°`;
      // Below Ricketts' anchor age nothing is corrected — `grown` clamps to
      // 0 and the four figures are his published age-9 means, unchanged. The
      // sentence used to say "corrected for this patient's age (8.7 y)"
      // over exactly those uncorrected numbers: true of the figures and
      // false of the claim, since Ricketts published nothing younger to
      // correct toward.
      if (years < 9) {
        return (
          `This patient is younger than the age (9 y) Ricketts anchors ` +
          `these norms to (${shown} y at the radiograph), and he published ` +
          `no younger norms to correct toward — so his age-9 figures stand ` +
          `uncorrected above: ${figures}. The standard deviations are the ` +
          `sample's, unchanged.`
        );
      }
      const mature = years > 18;
      return (
        `The four age-indexed norms above are corrected for this patient's ` +
        `age at the radiograph (${shown} y): ${figures}. ` +
        (mature
          ? 'The correction runs from age 9 to the end of growth at 18 and ' +
            'stops there — these are Ricketts\' adult figures. Extending a ' +
            'growth coefficient past skeletal maturity would invent a norm ' +
            'that keeps moving for the rest of the patient\'s life. '
          : '') +
        'The standard deviations are the sample\'s, unchanged — Ricketts ' +
        'does not restate them per year.'
      );
    },
  },
  interpret: defaultInterpretAnalysis(components),
};

export default analysis;
