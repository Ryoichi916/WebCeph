import {
  angularSum,
  defaultInterpetLandmark,
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
