import { Ls, Li, softPog } from 'analyses/landmarks/points/soft';
import { FH } from 'analyses/landmarks/lines/skeletal';
import { flipVector, defaultInterpetLandmark } from 'analyses/helpers';
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
   * a high one (> 89°) a flat-to-concave profile.
   */
  interpret: defaultInterpetLandmark(
    'skeletalProfile',
    ['convex', 'normal', 'concave'],
  ),
};
