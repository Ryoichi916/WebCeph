import {
  angularSum,
  defaultInterpetLandmark,
  normSd,
} from 'analyses/helpers';

import { NSAr, SArGo, ArGoMe, FMIA } from 'analyses/landmarks/angles/skeletal';
import { L1Axis } from 'analyses/landmarks/lines/skeletal';

import {
  calculateAngle,
  getVectorPoints,
  createVectorFromPoints,
  rotatePointAroundOrigin,
  degreesToRadians,
  radiansToDegrees,
} from 'utils/math';

export const bjorkSum: CephAngularSum = {
  // Named for what it measures rather than after its author: printed next to
  // the "Björk" symbol (and under a "Björk" section heading) "Björk's sum" only
  // repeated the name three times without saying what was summed.
  ...angularSum(
    [NSAr, SArGo, ArGoMe],
    'Sum of the saddle, articular and gonial angles',
    'Björk',
  ),
  interpret: defaultInterpetLandmark(
    'growthPattern',
    ['horizontal', 'normal', 'vertical'],
  ),
};

/**
 * The articulare check, shared by every analysis that reports Björk's three
 * posterior angles (his own and Jarabak's).
 *
 * N-S-Ar, S-Ar-Go and Ar-Go-Me all hang off articulare; their sum does not — it
 * is fixed by N, S, Go and Me. So the three can only disagree with each other
 * by as much as articulare is misplaced: move Ar and one angle opens by exactly
 * what another closes, leaving the total where it was.
 *
 * The pattern reported here is therefore *the components deviating further than
 * their own total, in opposite directions*. On the demo tracing that is saddle
 * 115.2° (−1.6 SD) and articular 133.6° (−1.6 SD) against a gonial 139.0°
 * (+1.3 SD) under a sum of 387.8° (−1.4 SD): three starred rows a clinician
 * would otherwise read as three findings about a mandible.
 *
 * It is a caveat, never an interpretation. The app cannot know that articulare
 * *is* misplaced — only that these numbers are what a misplaced articulare
 * looks like, and that the landmark is worth re-checking before the three rows
 * are read as findings.
 */
export const articulareCaveats = (
  values: Record<string, number | undefined>,
): AnalysisCaveat[] => {
  const zOf = (symbol: string, mean: number, min: number, max: number) => {
    const value = values[symbol];
    const sd = normSd(mean, min, max);
    if (typeof value !== 'number' || !isFinite(value) || !(sd > 0)) {
      return null;
    }
    return (value - mean) / sd;
  };
  const saddle = zOf(NSAr.symbol, 123, 118, 128);
  const articular = zOf(SArGo.symbol, 143, 137, 149);
  const gonial = zOf(ArGoMe.symbol, 130, 123, 137);
  const total = zOf(bjorkSum.symbol, 396, 390, 402);
  if (
    saddle === null || articular === null ||
    gonial === null || total === null
  ) {
    return [];
  }
  const parts = [saddle, articular, gonial];
  const deviant = parts.filter(z => Math.abs(z) >= 1);
  const opposed = parts.some(z => z >= 1) && parts.some(z => z <= -1);
  const worst = Math.max(...parts.map(Math.abs));
  if (deviant.length < 2 || !opposed || Math.abs(total) >= worst) {
    return [];
  }
  return [{
    symbols: [NSAr.symbol, SArGo.symbol, ArGoMe.symbol],
    // The one line a compact surface has room for: what to do, and why. See
    // `AnalysisCaveat.lede` — the full paragraph below still travels with it.
    lede:
      'Re-check Ar before reading these three angles — they deviate the ' +
      'way a misplaced articulare does, not the way a mandible does.',
    text:
      'These three angles are all measured from articulare, and their sum is ' +
      'not — it is fixed by N, S, Go and Me. Here they deviate in opposite ' +
      'directions while that sum stays nearer its mean than any of them, ' +
      'which is what a misplaced articulare produces and not what a mandible ' +
      'does. Re-check Ar, on the posterior border of the condylar neck where ' +
      'it crosses the cranial base, before reading these three as findings.',
  }];
};

export const cephCorrection: CephLandmark = {
  name: 'Cephalometric correction',
  symbol: 'ceph-correction',
  type: 'distance',
  components: [FMIA, L1Axis],
  imageType: 'ceph_lateral',
  unit: 'mm',
  map(geoFMIA: GeoAngle, axis: GeoVector) {
    const actualAngle = calculateAngle(geoFMIA);
    const rotation = actualAngle - degreesToRadians(65);
    const [apex, edge] = getVectorPoints(axis);
    const newEdge = rotatePointAroundOrigin(apex, edge, rotation);
    return createVectorFromPoints(apex, newEdge);
  },
  calculate: () => (geoFMIA: GeoAngle) => () => {
    const actualAngle = calculateAngle(geoFMIA);
    const rotation = actualAngle - degreesToRadians(65);
    // @TODO: measure on the occlusion plane
    return 0.8 * radiansToDegrees(rotation);
  },
};
