import { line } from 'analyses/helpers';

import {
  Pn, Sn, softPog,
} from 'analyses/landmarks/points/soft';

/**
 * The E-line (esthetic line of Ricketts)
 */
export const ELine = line(Pn, softPog, undefined, 'E-line');

/**
 * Steiner's S-line: from soft-tissue pogonion to the midpoint of the S-shaped
 * curve between the nose tip and subnasale — that midpoint being the middle of
 * the Pn–Sn segment, which is how the curve's centre is taken on a tracing.
 *
 * Drawn in the same sense as the E-line (from the nose down to the chin) so
 * both share one sign convention: a lip in front of the line is positive.
 * Steiner's rule is that in a balanced face the lips just touch the line.
 */
export const SLine: CephLine = {
  name: 'Steiner S-line',
  symbol: 'S-line',
  type: 'line',
  imageType: 'ceph_lateral',
  components: [Pn, Sn, softPog],
  map: (pn: GeoPoint, sn: GeoPoint, pog: GeoPoint) => ({
    x1: (pn.x + sn.x) / 2,
    y1: (pn.y + sn.y) / 2,
    x2: pog.x,
    y2: pog.y,
  }),
};
