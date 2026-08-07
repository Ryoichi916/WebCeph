import { point } from 'analyses/helpers';

import { createVectorFromPoints, getMidpoint } from 'utils/math';

/**
 * The four posterior cusp tips the occlusal plane is drawn through, exported
 * individually as well as summed into the two midpoints below.
 *
 * They were declared inline inside the midpoints, which made them unreachable
 * for anything that needs one arch on its own — the molar relationship needs
 * the upper and lower molar cusps *apart*, and the curve of Spee needs the
 * lower premolar cusp. Exporting the same objects (rather than re-declaring
 * them) keeps them one step each: the stepper de-duplicates by symbol, so a
 * second `point('L6', …)` elsewhere would be the same step with a different
 * identity and a different chance of drifting.
 */
export const upperFirstPremolarCusp = point('U4', 'Cusp of upper first premolar');
export const lowerFirstPremolarCusp = point('L4', 'Cusp of lower first premolar');
export const upperFirstMolarCusp = point('U6', 'Cusp of upper first molar');
export const lowerFirstMolarCusp = point('L6', 'Cusp of lower first molar');

/**
 * Midpoint of line connecting the cusps of the premolars
 */
export const centerOfPremolarCusps: CephPoint = {
  ...point('C4', 'Center of premolar cusps'),
  components: [upperFirstPremolarCusp, lowerFirstPremolarCusp],
  map: (U4: GeoPoint, L4: GeoPoint) => {
    return getMidpoint(createVectorFromPoints(U4, L4));
  },
};

/**
 * Midpoint of line connecting the cusps of the premolars
 */
export const centerOfMolarCusps: CephPoint = {
  ...point('C6', 'Center of molar cusps'),
  components: [upperFirstMolarCusp, lowerFirstMolarCusp],
  map: (U6: GeoPoint, L6: GeoPoint) => {
    return getMidpoint(createVectorFromPoints(U6, L6));
  },
};
