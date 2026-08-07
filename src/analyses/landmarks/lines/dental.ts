import { line } from 'analyses/helpers';

import {
  centerOfMolarCusps, centerOfPremolarCusps,
} from 'analyses/landmarks/points/dental';

import {
  U1_INCISAL_EDGE, L1_INCISAL_EDGE,
} from 'analyses/landmarks/points/skeletal';

/**
 * The functional occlusal plane.
 * A line bisecting the cusp of tips of the molars and passing
 * through the cusp tips of the first premolars.
 */
export const functionalOcclusalPlane = line(
  centerOfMolarCusps,
  centerOfPremolarCusps,
  'Functional occlusal plane',
  'OP',
);

/**
 * Downs' occlusal plane: the line from the centre of the molar cusps to the
 * point that bisects the incisal overbite — the midpoint of the two incisal
 * edges.
 *
 * It is **not** the functional occlusal plane above, and the difference is not
 * cosmetic: Downs' plane reaches all the way to the incisors, so it carries
 * the anterior part of the curve of Spee that the molar-to-premolar functional
 * plane deliberately leaves out. On the demo tracing the two differ by 3°, and
 * the norms Downs published (cant of the occlusal plane 9.3°, lower incisor to
 * the occlusal plane 14.5°) were measured on *his* construction. Reporting the
 * functional plane's angle under Downs' mean would be quoting one author's
 * figure for another author's line — the same mistake `tweed.ts` refuses to
 * make with the Y axis.
 *
 * Drawn from the molars forward, in the same sense as the functional plane, so
 * anything that reads a direction off either gets the same anterior sense.
 */
export const downsOcclusalPlane: CephLine = {
  name: 'Downs occlusal plane',
  symbol: 'OP (Downs)',
  type: 'line',
  imageType: 'ceph_lateral',
  components: [centerOfMolarCusps, U1_INCISAL_EDGE, L1_INCISAL_EDGE],
  map: (molars: GeoPoint, u1Tip: GeoPoint, l1Tip: GeoPoint) => ({
    x1: molars.x,
    y1: molars.y,
    x2: (u1Tip.x + l1Tip.x) / 2,
    y2: (u1Tip.y + l1Tip.y) / 2,
  }),
};
