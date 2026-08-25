import { G, Pn, Sn, Ls, Li, Ils, softPog } from 'analyses/landmarks/points/soft';
import { FH } from 'analyses/landmarks/lines/skeletal';
import {
  flipVector, angleBetweenPoints, defaultInterpetLandmark,
} from 'analyses/helpers';
import {
  isBehind,
  createVectorFromPoints,
  calculateAngle,
  radiansToDegrees,
} from 'utils/math';

/**
 * A profile line is established by drawing a line tangent
 * to Pog' and to the most anterior point of either the
 * lower or upper lip, whichever is most protrusive.
 * 
 * The angle formed by the intersection of FH and this
 * profile line is called the Z-angle.
 */
export const Z: CephLandmark = {
  symbol: 'Z',
  type: 'angle',
  name: 'Merrifield\'s Z Angle',
  unit: 'degree',
  imageType: 'ceph_lateral',
  components: [flipVector(FH), Li, Ls, softPog],
  map: (
    FH: GeoVector,
    Li: GeoPoint,
    Ls: GeoPoint,
    softPog: GeoPoint,
  ): GeoAngle => {
    const LsSoftPog = createVectorFromPoints(Ls, softPog);
    if (isBehind(Li, LsSoftPog)) {
      return {
        vectors: [FH, LsSoftPog],
      };
    } else {
      const LiSoftPog = createVectorFromPoints(Li, softPog);
      return {
        vectors: [FH, LiSoftPog],
      };
    }
  },
  /**
   * The Z angle value itself: the angle between the (posteriorly directed)
   * Frankfort horizontal and the profile line built in `map` above.
   * Merrifield's norm is 80° ± 9°.
   */
  calculate: (() =>
    () =>
      (angle: GeoAngle) =>
        radiansToDegrees(calculateAngle(angle))
  ) as CalculateLandmark<number, GeoObject, GeoObject>,
  /**
   * A low Z angle (< 71°) marks a protrusive (convex) soft-tissue profile,
   * a high one (> 89°) a flat-to-concave profile. Filed under the
   * **soft-tissue** profile: the Z angle is read off the lips and the
   * soft-tissue chin, and the whole point of reporting it beside the skeletal
   * analyses is to say when the face and the bone part company — a job it
   * cannot do from inside the `skeletalProfile` category, where it used to
   * print a facial-surface reading under a "Skeletal profile" heading.
   */
  interpret: defaultInterpetLandmark(
    'softTissueProfile',
    ['convex', 'normal', 'concave'],
  ),
};

/**
 * The nasolabial angle, Pn-Sn-Ls: the angle the base of the nose makes with
 * the upper lip. Normal range 90–110°.
 *
 * A wide nasolabial angle means a retruded (or retractable) upper lip; a
 * narrow one an upper lip already carried forward, which is what says the
 * upper incisors must not be retracted further. It is read at every extraction
 * decision, and this app computed nothing of the sort until now.
 *
 * Two honest qualifications, both consequences of the point set:
 *
 *  - The angle is properly measured between the **columella tangent** and the
 *    upper lip. This tracing has no columella point, so its superior leg runs
 *    to pronasale — the nose tip — which is how the angle is taken on a
 *    profile tracing without a columella point, and which reads a few degrees
 *    wider on a long, drooping nasal tip than the tangent construction does.
 *  - 90–110° is a published *range*, not a mean with a standard deviation, so
 *    the component that reports it is declared with `RANGE` and carries no
 *    star scale.
 */
export const nasolabialAngle: CephLandmark = {
  ...angleBetweenPoints(Pn, Sn, Ls, 'Nasolabial angle (Pn-Sn-Ls)'),
  symbol: 'Nasolabial',
  interpret: defaultInterpetLandmark(
    'upperLipProminence',
    // A narrow angle is an upper lip carried forward; a wide one a lip that
    // has fallen back over the incisors.
    ['prominent', 'normal', 'resessive'],
  ),
};

/**
 * The soft-tissue facial convexity, G-Sn-Pog', *excluding* the nose: how far
 * the profile bends at subnasale. Legan & Burstone's norm is 12° ± 4.
 *
 * Reported as the **departure from a straight profile**, which is how the norm
 * is stated: the three points subtend about 168° on a normal face, and the
 * value here is 180° minus that. A larger figure is a convex (Class II-looking)
 * profile, a smaller or negative one a flat-to-concave (Class III-looking) one.
 *
 * The skeletal analyses grade the same convexity from bone (Downs' angle of
 * convexity, Ricketts' A to N-Pog). This is what the face actually shows,
 * which is not always the same thing: a thick chin pad or a full upper lip can
 * carry a convex skeleton into a straight profile.
 */
export const softTissueFacialConvexity: CephLandmark = {
  ...angleBetweenPoints(G, Sn, softPog, 'Soft-tissue facial convexity (G-Sn-Pog\')'),
  symbol: 'G-Sn-Pog\'',
  calculate: (() =>
    () =>
      (angle: GeoAngle) => 180 - Math.abs(radiansToDegrees(calculateAngle(angle)))
  ) as CalculateLandmark<number, GeoObject, GeoObject>,
  interpret: defaultInterpetLandmark(
    'softTissueProfile',
    ['concave', 'normal', 'convex'],
  ),
};

/**
 * Total facial convexity, G-Pn-Pog' — the same profile bend read **including
 * the nose**, at pronasale rather than at subnasale. Burstone's norm is
 * 137° ± 4.
 *
 * The two are reported side by side because they answer different questions and
 * can disagree: a large nose on a flat skeleton gives an ordinary total
 * convexity over a distinctly flat G-Sn-Pog', and it is the pair — not either
 * one — that says whether the nose is carrying the profile.
 *
 * Unlike the angle above, this one is quoted directly (the nose makes the bend
 * large enough to state as an angle rather than as a departure from 180°).
 */
export const totalFacialConvexity: CephLandmark = {
  ...angleBetweenPoints(G, Pn, softPog, 'Total facial convexity (G-Pn-Pog\')'),
  symbol: 'G-Pn-Pog\'',
  interpret: defaultInterpetLandmark(
    'softTissueProfile',
    // A small angle at the nose tip is a convex profile; a large one is flat.
    ['convex', 'normal', 'concave'],
  ),
};

/**
 * The mentolabial (labiomental) sulcus angle, Li-Ils-Pog': how deeply the
 * chin-lip fold is set. Norm 122° ± 12 (Legan & Burstone).
 *
 * This is as far towards Merrifield's **lip-chin-throat** angle as this point
 * set honestly reaches: that angle needs the soft-tissue cervical point where
 * the submental line meets the throat, and nothing in this tracing plots the
 * throat. Rather than substitute a different point and keep the name, the app
 * reports the lip-chin relation it can measure and reports no throat angle at
 * all.
 *
 * A shallow (wide) sulcus goes with a protrusive lower lip or a flat chin; a
 * deep (narrow) one with a strong chin button or a retruded lower incisor,
 * and it deepens further when lower incisors are retracted — which is why it
 * is looked at before extraction in a Class II division 2.
 */
export const mentolabialSulcusAngle: CephLandmark = {
  ...angleBetweenPoints(Li, Ils, softPog, 'Mentolabial sulcus (Li-Ils-Pog\')'),
  symbol: 'Li-Ils-Pog\'',
  interpret: defaultInterpetLandmark(
    'mentolabialSulcus',
    // A narrow angle is a deep fold, a wide one a shallow (effaced) fold.
    // Reported as the fold it is, not converted into a "Chin prominence"
    // verdict: that category is graded on bone (Pog-NB, the facial angle),
    // and a deep fold over a retruded lower incisor is not a prominent chin.
    ['deep', 'normal', 'shallow'],
  ),
};
