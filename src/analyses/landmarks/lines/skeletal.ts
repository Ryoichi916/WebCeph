import { line } from 'analyses/helpers';

import {
  N, S, A, B, Po, Or, Pog, Go, Me, ANS, PNS, Pt, Gn, Ba,
  U1_APEX, U1_INCISAL_EDGE,
  L1_APEX, L1_INCISAL_EDGE,
} from 'analyses/landmarks/points/skeletal';

import { createPerpendicular } from 'utils/math';

/**
 * Frankfort Horizontal Plane.
 * Po-Or line projected to form a plane.
 */
export const FH = line(Po, Or, 'Frankfort Horizontal Plane', 'FH');

/**
 * Facial Plane.
 * N-Pog line projected to form a plane.
 */
export const NPog = line(N, Pog, 'Facial Plane');

/**
 * Facial Plane.
 * N-Pog line projected to form a plane.
 */
export const facialPlane = NPog;


/**
 * Dental Plane (A-Pog line projected to form a plane).
 * The A-Pog line or plane is referred to as the dental plane and
 * is a useful reference line from which to measure the position of
 * the anterior teeth.
 */
export const APog = line(A, Pog);

/**
 * Dental Plane (A-Pog line projected to form a plane).
 * The A-Pog line or plane is referred to as the dental plane and
 * is a useful reference line from which to measure the position of
 * the anterior teeth.
 */
export const dentalPlane = APog;

/**
 * Mandiblular Plane (Go-Me)
 */
export const MP = line(Go, Me);

/**
 * Steiner's mandibular plane, gonion to gnathion.
 *
 * Kept distinct from `MP` (Go-Me) on purpose: Steiner drew the plane to
 * gnathion and published its norm against S-N (32°) for that construction, so
 * reporting Go-Me under Steiner's norm would be quoting one author's figure
 * for another author's line.
 */
export const GoGn = line(Go, Gn, 'Mandibular plane (Go-Gn)', 'Go-Gn');

/**
 * The N-A line — the reference Steiner measures the maxilla's incisor against.
 */
export const NA = line(N, A);

/**
 * The N-B line — the reference Steiner measures the lower incisor and the
 * chin against.
 */
export const NB = line(N, B);

/**
 * A line connecting sella to nasion.
 */
export const SN = line(S, N);

/**
 * A line connecting the incisal edge and root apex of the most prominent maxillary incisor.
 */
export const U1Axis = line(U1_APEX, U1_INCISAL_EDGE, 'Upper Incisor Axis', 'U1');

/**
 * Axis of lower incisor.
 * A line connecting the apex of the lower incisor with its incisal edge.
 */
export const L1Axis = line(L1_APEX, L1_INCISAL_EDGE, 'Lower Incisor Axis', 'L1');

/**
 * Palatal plane
 * PNS-ANS projected to form a plane.
 */
export const SPP = line(PNS, ANS, undefined, 'SPP');

/**
 * Palatal plane.
 * PNS-ANS projected to form a plane.
 */
export const palatalPlane = SPP;

/**
 * Pterygoid vertical (PtV), a line perpendicular to
 * FH at the posterior margin of the pterygopalatine fossa.
 */
export const PtV: CephLandmark = {
  type: 'line',
  name: 'Pterygoid Vertical',
  symbol: 'PtV',
  imageType: 'ceph_lateral',
  unit: 'mm',
  components: [Pt, FH],
  map(geoPt: GeoPoint, geoFH: GeoVector) {
    return createPerpendicular(geoFH, geoPt);
  },
};

/**
 * The facial axis.
 * A line drawn from Pt to Gn.
 */
export const PtGn = line(Pt, Gn);

/**
 * The facial axis.
 * A line drawn from Pt to Gn.
 */
export const facialAxis = PtGn;

/**
 * The cranial base plane.
 */
export const BaN = line(Ba, N);

/**
 * The cranial base plane.
 */
export const cranialBase = BaN;
