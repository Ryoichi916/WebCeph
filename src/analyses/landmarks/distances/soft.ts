import { distance, defaultInterpetLandmark } from 'analyses/helpers';

import {
  Li, Ls,
} from 'analyses/landmarks/points/soft';

import {
  ELine,
} from 'analyses/landmarks/lines/soft';

import { getSegmentLength } from 'utils/math';

/**
 * Signed perpendicular distance from a lip point to Ricketts' E-line.
 *
 * The E-line runs from Pronasale (Pn) to soft-tissue Pogonion (Pog'). A lip
 * lying *anterior* to (in front of) the line is reported as **positive**, a lip
 * *behind* the line as **negative** — the clinical convention, with a normal
 * value around −2 ± 2 mm (lips slightly behind the line).
 *
 * `defaultCalculateLine` only ever returns a positive magnitude, so these two
 * landmarks get their own `calculate` that keeps the magnitude but restores the
 * sign from which side of the E-line the lip falls on. The sign is taken from
 * the 2-D cross product of the E-line direction with the (lip − Pn) vector:
 * for a patient facing right, a point in front of the line yields a negative
 * cross product, which we map to a positive (anterior) distance.
 */
const signedDistanceToELine: CalculateLandmark<number, GeoObject, GeoObject> =
  () => (lip: GeoObject | undefined, eline: GeoObject | undefined) =>
    (perpendicular: GeoObject | undefined) => {
      const p = lip as GeoPoint;
      const l = eline as GeoVector;
      const magnitude = getSegmentLength(perpendicular as GeoVector);
      const dx = l.x2 - l.x1;
      const dy = l.y2 - l.y1;
      const cross = dx * (p.y - l.y1) - dy * (p.x - l.x1);
      // cross < 0 ⇒ lip is anterior to the E-line ⇒ positive distance.
      return cross < 0 ? magnitude : -magnitude;
    };

export const lowerLipToELine: CephDistance = {
  ...distance(Li, ELine),
  calculate: signedDistanceToELine,
  interpret: defaultInterpetLandmark(
    'lowerLipProminence',
    ['resessive', 'normal', 'prominent'],
  ),
};

export const upperLipToELine: CephDistance = {
  ...distance(Ls, ELine),
  calculate: signedDistanceToELine,
  interpret: defaultInterpetLandmark(
    'upperLipProminence',
    ['resessive', 'normal', 'prominent'],
  )
}
