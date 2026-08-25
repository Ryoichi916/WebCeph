import {
  S, N, A, B, D, Ar, Dc, Pog, Go, Me, Gn, ANS, PNS, Ba, Pt, PM,
} from 'analyses/landmarks/points/skeletal';
import { Xi } from 'analyses/landmarks/points/skeletal-custom';
import {
  FH, NPog, dentalPlane,
  SN, NA, NB, GoGn,
  MP, SPP, U1Axis, L1Axis,
} from 'analyses/landmarks/lines/skeletal';
import {
  functionalOcclusalPlane, downsOcclusalPlane,
} from 'analyses/landmarks/lines/dental';
import {
  line,
  angleBetweenLines,
  angleBetweenPoints,
  flipVector,
  defaultInterpetLandmark,
  composeInterpretation,
} from 'analyses/helpers';
import {
  getVectorPoints,
  createVectorFromPoints,
  radiansToDegrees,
  calculateAngle,
  isBehind,
} from 'utils/math';

/**
 * SNA (sella, nasion, A point) indicates whether or not the maxilla is normal, prognathic, or retrognathic.
 */
export const SNA: CephAngle = {
  ...angleBetweenPoints(S, N, A),
  interpret: defaultInterpetLandmark(
    'maxilla',
    ['retrognathic', 'normal', 'prognathic'],
  ),
};

/**
 * SNB (sella, nasion, B point) indicates whether or not the mandible is normal, prognathic, or retrognathic.
 */
export const SNB: CephAngle = {
  ...angleBetweenPoints(S, N, B),
  interpret: defaultInterpetLandmark(
    'mandible',
    ['retrognathic', 'normal', 'prognathic'],
  ),
};

/**
 * ANB (A point, nasion, B point) indicates whether the skeletal relationship between
 * the maxilla and mandible is a normal skeletal class I (+2 degrees),
 * a skeletal Class II (+4 degrees or more), or skeletal class III (0 or negative) relationship.
 */
export const ANB: CephAngle = {
  ...angleBetweenLines(line(N, A), line(N, B)),
  calculate: () => (lineNA: GeoVector, lineNB: GeoVector) => (angle: GeoAngle) => {
    const [, A] = getVectorPoints(lineNA);
    const positiveValue = Math.abs(radiansToDegrees(calculateAngle(angle)));
    if (isBehind(A, lineNB)) {
      return -1 * positiveValue;
    }
    return positiveValue;
  },
  /**
   * Classified against **the band the row prints**, not against a second,
   * hidden one.
   *
   * Two bugs lived here. The first: `if (value > 0 && value < 2)` returned a
   * "Class 3 tendency" for any ANB in that window whatever the declared norm,
   * so Steiner's ANB of 1.5° — a quarter of a standard deviation below his own
   * printed 2.0 ± 2.0, a reading every orthodontist calls Class I — earned an
   * amber "Class 3 Tendency" chip beside Downs' "Class 1" and the Wits
   * section's "Class 1" on the same page. The second: the fallback read
   * `(value, min || 2, max || 4, 2)`, and Steiner's declared `min: 0` is
   * falsy — so the band actually used was 2–4 while the table printed 0–4, and
   * an ANB of exactly 0.0° was graded Class 3 by a band nobody could see.
   *
   * `??` keeps a declared zero, and the classification now says only what the
   * norm says: below the band is Class III, above it Class II, inside it
   * Class I. Steiner's *tendency* language belongs to his "acceptable
   * compromises" chart — a treatment target derived from the patient's own
   * ANB — and is a plan, not a reading of this angle, so it is not printed as
   * one.
   */
  interpret(value, min, max, mean): Array<LandmarkInterpretation<'skeletalPattern'>> {
    return defaultInterpetLandmark(
      'skeletalPattern',
      ['class3', 'class1', 'class2'],
    )(value, min ?? 0, max ?? 4, mean ?? 2);
  },
};

/**
 * SND (sella, nasion, D point) reads the antero-posterior position of the
 * mandible from the *centre of the symphysis* instead of from supramentale.
 * Steiner reported it alongside SNB because point B migrates with the lower
 * incisor while D does not, so SND survives orthodontic movement of the
 * incisor that SNB does not.
 */
export const SND: CephAngle = {
  ...angleBetweenPoints(S, N, D),
  interpret: defaultInterpetLandmark(
    'mandible',
    ['retrognathic', 'normal', 'prognathic'],
  ),
};

/**
 * Steiner's mandibular plane angle: Go-Gn to S-N. Norm 32°.
 * A low value is a counter-clockwise (horizontal) mandibular rotation, a high
 * one a clockwise (vertical) rotation — the same reading FMPA gives from the
 * Frankfort horizontal.
 */
export const GOGN_SN: CephAngle = {
  ...angleBetweenLines(
    SN, GoGn,
    'Mandibular plane to S-N',
    'Go-Gn/SN',
  ),
  interpret: defaultInterpetLandmark(
    'mandibularRotation',
    ['counterclockwise', 'normal', 'clockwise'],
  ),
};

/** The direction a declared line runs in, in image coordinates (y downwards). */
const directionOf = ({ x1, y1, x2, y2 }: GeoVector) => ({
  x: x2 - x1,
  y: y2 - y1,
});

/**
 * The **signed** acute angle from a reference line to another, in the sense
 * every author who publishes a "cant" uses: positive when the second line,
 * followed forwards, runs *downwards* relative to the reference — Downs' cant
 * of the occlusal plane is "downward and forward positive, upward and forward
 * negative", and his sample's range (+1.5° to +14°) is entirely on the positive
 * side of it.
 *
 * Both lines in this app are declared running anteriorly (Po→Or, molar→incisor,
 * S→N), but the second is flipped onto the reference's half-plane first so a
 * line declared the other way round cannot silently report its 180° explement.
 * The result is in (−90°, +90°].
 *
 * An unsigned cant is not a cant. `Math.abs` on this measurement makes an
 * occlusal plane tipped 4° up-anteriorly indistinguishable from one tipped 4°
 * down, and grades both as 5.3° below Downs' +9.3° mean when the first is in
 * fact 13.3° below it.
 */
const signedCantBetween = (reference: GeoVector, line: GeoVector): number => {
  const a = directionOf(reference);
  const b = directionOf(line);
  const sameSense = (a.x * b.x + a.y * b.y) >= 0;
  const bx = sameSense ? b.x : -b.x;
  const by = sameSense ? b.y : -b.y;
  // y grows downwards on an image, so a positive cross product is the second
  // line running *below* the reference as both are followed forwards.
  return radiansToDegrees(
    Math.atan2(a.x * by - a.y * bx, a.x * bx + a.y * by),
  );
};

/** `signedCantBetween` packaged as a landmark calculator over two lines. */
const calculateSignedCant = (
  () => (reference: GeoVector, line: GeoVector) => () => (
    (reference === undefined || line === undefined)
      ? NaN
      : signedCantBetween(reference, line)
  )
) as CalculateLandmark<number, GeoObject, GeoObject>;

/**
 * The inclination of the occlusal plane to S-N (Steiner, norm 14°).
 *
 * Measured on the *functional* occlusal plane this app already traces (molar
 * cusp centre to premolar cusp centre) — Steiner drew the plane through the
 * overlapping cusps of the premolars and first molars, which is the same line.
 * It carries no interpretation: the inclination of the occlusal plane is read
 * as part of the treatment plan (whether it may be levelled or must be kept),
 * not as a diagnosis of its own, so it is reported as a measured value.
 *
 * Signed like every other cant in this file (see `signedCantBetween`): a plane
 * tipped up anteriorly reads negative rather than borrowing the reading of one
 * tipped down by the same amount.
 */
export const occlusalPlaneToSN: CephAngle = {
  ...angleBetweenLines(
    SN, functionalOcclusalPlane,
    'Occlusal plane to S-N',
    'OP-SN',
  ),
  calculate: calculateSignedCant,
};

/**
 * The inclination of the functional occlusal plane to the Frankfort
 * horizontal. Signed: see `signedCantBetween`.
 *
 * No author's norm is quoted for it. Downs' +9.3° belongs to *his* occlusal
 * plane (molar cusps to the incisal bisector), which is a different line from
 * the functional molar-to-premolar plane by about 3° on an ordinary tracing —
 * see `downsCantOfOcclusalPlane` below, which is the graded one.
 */
export const occlusalPlaneToFH: CephAngle = {
  ...angleBetweenLines(
    FH, functionalOcclusalPlane,
    'Occlusal plane to Frankfort horizontal',
    'OP-FH',
  ),
  calculate: calculateSignedCant,
};

/**
 * Downs' cant of the occlusal plane: the inclination of **his** occlusal plane
 * — molar cusps to the bisector of the incisal overbite — to the Frankfort
 * horizontal. Norm +9.3°, his sample running +1.5° to +14°.
 *
 * Signed in Downs' own sense (see `signedCantBetween`): downward-and-forward
 * positive. His whole sample is positive, so an occlusal plane that rises
 * anteriorly is a real and unusual finding — and it was exactly the finding an
 * unsigned reading hid, printing the same "3.6°" for a plane tipped 3.6° up as
 * for one tipped 3.6° down.
 *
 * Kept separate from `occlusalPlaneToFH` above, which measures the functional
 * (molar-to-premolar) plane. The two lines are not the same line, they differ
 * by about 3° on an ordinary tracing, and Downs' mean belongs to his (see
 * `downsOcclusalPlane`).
 */
export const downsCantOfOcclusalPlane: CephAngle = {
  ...angleBetweenLines(
    FH, downsOcclusalPlane,
    'Cant of occlusal plane to Frankfort horizontal',
    'OP(Downs)-FH',
  ),
  calculate: calculateSignedCant,
};

/**
 * Downs' incisor–occlusal plane angle: how far the lower incisor's long axis
 * departs from a **right angle** to the occlusal plane, positive when the
 * incisor is proclined past the perpendicular. Norm +14.5°.
 *
 * Downs states it that way rather than as the raw 60–85° the two lines
 * actually subtend, and the two must not be confused: an app printing the raw
 * angle beside a mean of 14.5 would report every normal incisor as five
 * standard deviations proclined. The value here is therefore ±(90 − θ), θ being
 * the acute angle between the incisor axis and Downs' occlusal plane.
 *
 * **The sign is the measurement.** `90 − θ` alone is never negative, so a
 * lower incisor retroclined 15° *behind* the perpendicular printed the same
 * "+15°" as one proclined 15° past it, and the `['lingual', 'normal',
 * 'labial']` interpretation below could not reach 'lingual' for the right
 * reason: a genuinely retroclined incisor was labelled "Labial". The sign is
 * taken from which side of the perpendicular the incisal edge falls on —
 * whether the axis, followed from apex to edge, leans forwards along the
 * occlusal plane (proclined, positive) or backwards against it (retroclined,
 * negative).
 */
export const downsIncisorOcclusalPlaneAngle: CephAngle = {
  ...angleBetweenLines(
    L1Axis, downsOcclusalPlane,
    'Lower incisor to occlusal plane',
    'L1-OP',
  ),
  calculate: (
    () => (axis: GeoVector, plane: GeoVector) => (angle: GeoAngle) => {
      const raw = Math.abs(radiansToDegrees(calculateAngle(angle)));
      // The two lines subtend a pair of supplementary angles; Downs reads the
      // acute one, then states its departure from the perpendicular.
      const departure = 90 - Math.min(raw, 180 - raw);
      if (axis === undefined || plane === undefined) {
        return departure;
      }
      // L1Axis runs apex → incisal edge and Downs' plane runs molars →
      // incisors, so a forward (labial) lean of the crown puts the axis and
      // the plane in the same direction.
      const a = directionOf(axis);
      const p = directionOf(plane);
      return (a.x * p.x + a.y * p.y) < 0 ? -departure : departure;
    }
  ) as CalculateLandmark<number, GeoObject, GeoObject>,
  interpret: defaultInterpetLandmark(
    'lowerIncisorInclination',
    ['lingual', 'normal', 'labial'],
  ),
};

/**
 * Ricketts' facial axis: the angle between the facial axis Pt-Gn and the
 * Ba-N plane, read as the **postero-inferior** angle. Norm 90° ± 3.
 *
 * A facial axis under 90° means the chin is growing down and back (a vertical,
 * dolichofacial pattern); over 90° it is growing forward (brachyfacial). Note
 * the line is declared N→Ba rather than Ba→N precisely so that the arccosine
 * returns that postero-inferior angle: taken the other way round the app would
 * print its 180° explement and read every brachyfacial patient as dolichofacial.
 *
 * The one Ricketts factor with no age correction — it is the same at 9 and at
 * 40 — which is why he treats it as the summary's anchor.
 */
export const facialAxisAngle: CephAngle = {
  ...angleBetweenLines(
    line(N, Ba), line(Pt, Gn),
    'Facial Axis (Ba-N to Pt-Gn)',
    'Facial Axis',
  ),
  interpret: defaultInterpetLandmark(
    'growthPattern',
    ['vertical', 'normal', 'horizontal'],
  ),
};

/**
 * Ricketts' mandibular arc: the angle the corpus axis (Xi-Pm) makes with the
 * condylar axis (Dc-Xi) **extended** — i.e. how sharply the mandible bends at
 * the centre of its ramus. Norm 26° ± 4 at age 9, opening about 0.5° a year
 * thereafter (an age correction this app does not apply; see the analysis'
 * norms provenance).
 *
 * A large arc is a square, forward-growing (brachyfacial) mandible; a small
 * one a long, backward-rotating mandible. Because it is measured on the
 * *extension* of Dc-Xi, the declared vectors run Dc→Xi and Xi→Pm — head to
 * tail — so the arccosine already gives the bend rather than its explement.
 */
export const mandibularArc: CephAngle = {
  ...angleBetweenLines(
    line(Dc, Xi), line(Xi, PM),
    'Mandibular arc angle (Dc-Xi to Xi-Pm)',
    'Mandibular arc',
  ),
  interpret: defaultInterpetLandmark(
    'growthPattern',
    ['vertical', 'normal', 'horizontal'],
  ),
};

/**
 * The inclination of the upper incisor to the N-A line (Steiner, norm 22°).
 */
export const U1_NA: CephAngle = {
  ...angleBetweenLines(
    NA, U1Axis,
    'Upper incisor to N-A',
    'U1-NA',
  ),
  interpret: defaultInterpetLandmark(
    'upperIncisorInclination',
    ['palatal', 'normal', 'labial'],
  ),
};

/**
 * The inclination of the lower incisor to the N-B line (Steiner, norm 25°).
 *
 * The lower incisor axis is flipped (incisal edge → apex) so that it runs the
 * same way as N→B, down and back; taken as declared, the two vectors point in
 * opposite directions and the arccosine would report the 157° explement of the
 * 23° angle the clinician means.
 */
export const L1_NB: CephAngle = {
  ...angleBetweenLines(
    NB, flipVector(L1Axis),
    'Lower incisor to N-B',
    'L1-NB',
  ),
  interpret: defaultInterpetLandmark(
    'lowerIncisorInclination',
    ['lingual', 'normal', 'labial'],
  ),
};

/**
 * Björk's split of the gonial angle. The line Go-N divides it into an upper
 * part, Ar-Go-N, which follows the ramus, and a lower part, N-Go-Me, which
 * follows the mandibular body: the split says which half of the mandible a
 * large or small gonial angle came from.
 *
 * Neither half is given an interpretation of its own. A wide lower gonial
 * angle is *associated* with backward rotation, but Björk grades the growth
 * pattern on the sum of the three posterior angles, and letting one half of
 * one of them vote separately produced the absurdity this app briefly printed:
 * Björk's own section calling the same tracing a vertical grower on the lower
 * gonial angle while its sum — and Jarabak, from the identical numbers —
 * called it horizontal. Both halves are reported as measured values against
 * Björk's ranges instead.
 */
export const upperGonialAngle: CephAngle = angleBetweenPoints(
  Ar, Go, N, 'Upper gonial angle (Ar-Go-N)',
);

export const lowerGonialAngle: CephAngle = angleBetweenPoints(
  N, Go, Me, 'Lower gonial angle (N-Go-Me)',
);

/**
 * Angle between Frankfort horizontal line and the line intersecting Gonion-Menton
 */
export const FMPA: CephAngle = {
  ...angleBetweenLines(
    FH, MP,
    'Frankfort Mandibular Plane Angle',
    'FMPA',
  ),
  interpret: defaultInterpetLandmark(
    'mandibularRotation',
    ['counterclockwise', 'normal', 'clockwise'],
  ),
};

/**
 * Angle between Frankfort horizontal line and the line intersecting Gonion-Menton
 */
export const FMA = FMPA;

/**
 * Angle between SN and the mandibular plane (Go-Me).
 *
 * The same mandibular rotation FMPA grades, read from the cranial base instead
 * of from Frankfort, and it carries the same interpretation: below the band is
 * a counter-clockwise (horizontal) rotation, above it a clockwise (vertical)
 * one. It had none, so it reached the vertical analysis as an ungraded number
 * sitting beside FMA, which was graded — the same finding stated twice, once
 * with a conclusion and once without.
 *
 * Distinct from Steiner's `GOGN_SN`, which is drawn to gnathion rather than to
 * menton and normed separately for that construction.
 */
export const SN_MP: CephAngle = {
  ...angleBetweenLines(
    SN, MP,
    'Sella-nasion to mandibular plane',
    'SN-MP',
  ),
  interpret: defaultInterpetLandmark(
    'mandibularRotation',
    ['counterclockwise', 'normal', 'clockwise'],
  ),
};

/**
 * Saddle Angle
 */
export const NSAr = angleBetweenPoints(N, S, Ar, 'Saddle Angle');

/**
 * Articular Angle
 */
export const SArGo = angleBetweenPoints(S, Ar, Go, 'Articular Angle');

/**
 * Gonial Angle
 */
export const ArGoMe = angleBetweenPoints(Ar, Go, Me, 'Gonial Angle');

/**
 * The maxillo-mandibular planes angle: palatal plane (PNS-ANS) to mandibular
 * plane (Go-Me). Norm 27° ± 4.
 *
 * The one vertical reading that needs no cranial reference at all — neither
 * Frankfort nor sella-nasion — so it survives a tracing on which porion is
 * buried in the mastoid or nasion is hard to see. Wide is a skeletal open-bite
 * pattern, narrow a deep-bite one.
 *
 * It printed as a bare "MM" with no name beside it, which is neither the
 * abbreviation clinicians use for it nor anything a reader could look up.
 */
export const MM: CephAngle = {
  ...angleBetweenLines(
    SPP, MP,
    'Maxillo-mandibular planes angle',
    'MMPA',
  ),
  interpret: defaultInterpetLandmark(
    'skeletalBite',
    ['closed', 'normal', 'open'],
  ),
};

/**
 * Angle between the upper incisor to S-N line
 */
export const U1_SN: CephAngle = {
  ...angleBetweenLines(
    line(N, S), U1Axis,
    'Upper incisor to sella-nasion',
    'U1-SN',
  ),
  interpret: defaultInterpetLandmark(
    'upperIncisorInclination',
    ['palatal', 'normal', 'labial'],
  ),
};

/**
 * The inclination of the upper incisor to the **maxillary (palatal) plane**,
 * PNS-ANS. Norm 109° ± 6 (British Standards Institution / Eastman).
 *
 * The companion of IMPA on the other jaw, and the more robust of the two ways
 * of reading upper incisor inclination: U1-SN depends on the cranial base,
 * this one is measured inside the maxilla itself, so it does not move when the
 * cranial base is rotated or when nasion sits high. The palatal plane is
 * declared ANS→PNS — running posteriorly, as N→S does for U1-SN — so both
 * angles open in the same sense and can be read on one table without one of
 * them being the other's explement.
 */
export const U1_SPP: CephAngle = {
  ...angleBetweenLines(
    line(ANS, PNS), U1Axis,
    'Upper incisor to maxillary plane',
    'U1-MxP',
  ),
  interpret: defaultInterpetLandmark(
    'upperIncisorInclination',
    ['palatal', 'normal', 'labial'],
  ),
};

/**
 * Incisor Mandibular Plane Angle
 * Angle between the lower incisor to the mandibular plane
 */
export const L1_MP: CephAngle = {
  ...angleBetweenLines(
    line(Me, Go), L1Axis,
    'Incisor Mandibular Plane Angle',
    'IMPA',
  ),
  interpret: defaultInterpetLandmark(
    'lowerIncisorInclination',
    ['lingual', 'normal', 'labial'],
  ),
};

/**
 * The interincisal angulation relates the relative position of the maxillary
 * incisor to that of the mandibular incisor.
 */
export const interincisalAngle: CephAngle = {
  ...angleBetweenLines(
    flipVector(U1Axis),
    flipVector(L1Axis),
    'Interincisal Angle',
    'U1-L1',
  ),
  // @TODO: add interpretation
};

/**
 * Incisor Mandibular Plane Angle
 * Angle between the lower incisor to the mandibular plane
 */
export const IMPA = L1_MP;

/**
 * Frankfort–mandibular incisor angle
 * Angle between the lower incisor to the Frankfort plane
 */
export const FMIA: CephAngle = {
  ...angleBetweenLines(
    FH, L1Axis,
    'Frankfort–mandibular incisor angle',
    'FMIA',
  ),
  // The third angle of the Tweed triangle. FMIA closes as the lower incisor
  // proclines (labial) and opens as it retroclines (lingual), so the two
  // out-of-range indications are the mirror image of IMPA's.
  interpret: defaultInterpetLandmark(
    'lowerIncisorInclination',
    ['labial', 'normal', 'lingual'],
  ),
};

/**
 * The y-axis is measured as the acute angle formed by the intersection of a line
 * from the sella turcica to gnathion with the FH.
 * This angle is larger in Class II facial patterns than in Class III tendencies.
 * The y-axis indicates the degree of the downward, rearward, or forward position
 * of the chin in relation to the upper face.
 */
export const yAxis: CephAngle = {
  ...angleBetweenLines(
    line(S, Gn),
    FH,
    'Y Axis-FH Angle',
    'Y-FH Angle',
  ),
  interpret: defaultInterpetLandmark(
    'growthPattern',
    ['horizontal', 'normal', 'vertical'],
  ),
};

/**
 * The angle of convexity is formed by the intersection of line N–point A
 * to point A–Pog. This angle measures the degree of the maxillary basal arch
 * at its anterior limit (point A) relative to the total facial profile (N-Pog).
 */
export const downsAngleOfConvexity: CephAngle = {
  ...angleBetweenLines(line(A, N), flipVector(dentalPlane), 'Angle of Convexity', 'NAPog'),
  /**
   * This angle is read in positive or negative degrees from zero.
   * If the line Pog–point A is extended and located anterior to the N-A
   * line, the angle is read as positive.
   */
  calculate: () => (AN: GeoVector, PogA: GeoVector) => (angle: GeoAngle) => {
    const [Pog, A] = getVectorPoints(PogA);
    const [   , N] = getVectorPoints(AN);
    const NPog = createVectorFromPoints(N, Pog);
    const positiveValue = Math.abs(
      radiansToDegrees(calculateAngle(angle)),
    );
    if (isBehind(A, NPog)) {
      return -1 * positiveValue;
    }
    return positiveValue;
  },
  /**
   * A positive angle suggests prominence of the maxillary dental base
   * relative to the mandible. A negative angle of convexity is associated
   * with a prognathic profile. The range extends from a minimum of –8.5
   * to a maximum of 10 degrees, with a mean reading of 0 degrees.
   */
  interpret: defaultInterpetLandmark(
    'skeletalProfile',
    ['concave', 'normal', 'convex'],
  ),
};

/**
 * The A-B plane is a measure of the relation of the anterior limit of the
 * apical bases to each other relative to the facial line.
 * It represents an estimate of the difficulty in obtaining the correct
 * axial inclination and incisor relationship when using orthodontic therapy.
 */
export const downsABPlaneAngle: CephAngle = {
  ...angleBetweenLines(line(B, A), line(Pog, N), 'A-B Plane Angle'),
  /**
   * Downs' sign convention: the angle is read as **negative when point B lies
   * behind point A** relative to the facial line — the usual configuration —
   * and positive when B (and with it the chin) has come forward past A, which
   * he states happens "in Class III malocclusions or Class I occlusions with
   * prominence of the mandible".
   *
   * The sign therefore hangs on **B's position relative to A across the
   * facial-line direction** — not on which side of the facial line point A
   * happens to fall. The previous implementation tested the latter, which is
   * within a millimetre of a coin flip on the faces the norm describes
   * (Ricketts' convexity of point A runs to ≈ 0 mm in adults, i.e. A sits
   * *on* the facial line), and read backwards whenever it did resolve: a
   * normal face with A a shade anterior printed +4.6° against Downs' band of
   * −9…0 — a two-SD "Class 2" — while a Class III chin carried past A
   * printed negative and graded "Class 1".
   */
  calculate: () => (lineBA: GeoVector, linePogN: GeoVector) => (angle: GeoAngle) => {
    const [ptB, ptA] = getVectorPoints(lineBA);
    const [ptPog, ptN] = getVectorPoints(linePogN);
    const positiveValue = Math.abs(
      radiansToDegrees(calculateAngle(angle)),
    );
    // A line through A running parallel to the facial line, directed upward
    // (Pog → N). For an upward-directed line, `isBehind`'s cross product is
    // positive on the *anterior* side — the same screen-orientation
    // convention every signed reading in this file relies on.
    const bIsAnteriorToA = isBehind(ptB, {
      x1: ptA.x,
      y1: ptA.y,
      x2: ptA.x + (ptN.x - ptPog.x),
      y2: ptA.y + (ptN.y - ptPog.y),
    });
    return bIsAnteriorToA ? positiveValue : -1 * positiveValue;
  },

  /**
   * Because point B is positioned behind point A, this angle is usually negative in value,
   * except in Class III malocclusions or Class I occlusions with prominence of the mandible.
   * A large negative value suggests a Class II facial pattern. The readings extend from
   * a maximum of 0 degrees to a minimum of –9 degrees, with a mean reading of -4.6 degrees.
   *
   * So the indications run **Class 2 below the band, Class 3 above it** —
   * Downs' own sentences above, turned into the range triple. They used to be
   * listed the other way round, which paired with the inverted sign
   * convention (see `calculate`) to grade a large-negative (Class II) reading
   * as "Class 3" and a positive (Class III) one as "Class 2".
   */
  interpret: defaultInterpetLandmark(
    'skeletalPattern',
    ['class2', 'class1', 'class3'],
  ),
};

/**
 * The facial angle is used to measure the degree of retrusion or protrusion of the mandible.
 * This is the inferior inside angle in which the facial line (nasion-pogonion).
 */
export const facialAngle: CephAngle = {
  ...angleBetweenLines(flipVector(FH), NPog, 'Facial Angle'),
  // `defaultInterpetLandmark` reads its indications as [below min, in band,
  // above max]. A facial angle *above* the norm puts pogonion further forward:
  // a prominent chin and a prognathic mandible, which is a **concave** profile
  // — and a facial angle below the norm is the retrognathic, **convex** one.
  // The skeletal-profile pair used to be the other way round, so this landmark
  // contradicted both itself (it called the same chin "prominent" while calling
  // the profile "convex") and the rest of the app: on one patient Ricketts read
  // "Skeletal profile — Convex" off this angle while Downs read "Concave" off
  // the angle of convexity, from the same tracing on the same screen.
  interpret: composeInterpretation(
    defaultInterpetLandmark('skeletalProfile', ['convex', 'normal', 'concave']),
    defaultInterpetLandmark('chin', ['recessive', 'normal', 'prominent']),
  ),
};

/**
 * Mandibular incisor inclination.
 * The angle between the long axis of the mandibular incisor
 * and the A-Pog line (1 to A-Pog) is measured to provide some idea
 * of mandibular incisor procumbency.
 */
export const L1ToDentalPlaneAngle: CephAngle = {
  ...angleBetweenLines(
    L1Axis, flipVector(dentalPlane),
    'Lower incisor inclination to A-Pog',
    'L1-APog',
  ),
  interpret: defaultInterpetLandmark(
    'lowerIncisorInclination',
    ['lingual', 'normal', 'labial'],
  ),
};

/**
 * Ricketts' lower facial height: the angle ANS-Xi-Pm, subtended at the centre
 * of the ramus by the anterior nasal spine and the protuberance menti.
 * Norm 47° ± 4, with no age correction.
 *
 * Two things about it were wrong until this revision, and both mattered:
 *
 *  - It was measured to **pogonion**, not to Pm. Pog is the most anterior point
 *    of the symphysis and Pm the point on its anterior curve above the chin, so
 *    the two subtend angles that differ by 8–9° on an ordinary tracing — the
 *    whole width of Ricketts' ± 4° band, twice over. On the demo tracing the
 *    Pog construction reads 54.2° and Ricketts' own reads 45.7°: the first is
 *    two standard deviations "open", the second is normal.
 *  - It was interpreted as **lower incisor inclination**, a category it has
 *    nothing to do with — the angle contains no tooth. It grades the vertical
 *    relation of the jaws: wide is a skeletal open-bite (dolichofacial)
 *    pattern, narrow a deep-bite (brachyfacial) one.
 */
export const lowerFacialHeightAngle: CephAngle = {
  ...angleBetweenPoints(
    ANS, Xi, PM,
    'Lower facial height (ANS-Xi-Pm)',
  ),
  symbol: 'ANS-Xi-Pm',
  interpret: defaultInterpetLandmark(
    'skeletalBite',
    ['closed', 'normal', 'open'],
  ),
};

/**
 * The maxillo-mandibular planes angle: palatal plane (PNS-ANS) to mandibular
 * plane (Go-Me). Same landmark as `MM` above, exported under the name the
 * vertical analysis reports it by.
 */
export const MMPA = MM;
