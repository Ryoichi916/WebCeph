import { isGeoPoint } from 'utils/math';

/**
 * Profilogram: a stylised line tracing of the facial skeleton built from the
 * placed landmarks. Each entry is a pair of landmark symbols joined by a line;
 * together they outline the profile (cranial base, maxilla, mandible, chin) and
 * the common reference planes. Segments whose endpoints are not both placed are
 * simply skipped, so the profilogram fills in as more points are added.
 */
export const PROFILOGRAM_SEGMENTS: Array<[string, string]> = [
  ['S', 'N'],     // anterior cranial base
  ['N', 'A'],     // maxillary (nasion -> subspinale)
  ['A', 'ANS'],   // anterior maxilla
  ['ANS', 'PNS'], // palatal plane
  ['N', 'Pog'],   // facial plane
  ['A', 'B'],     // alveolar profile
  ['B', 'Pog'],   // anterior symphysis
  ['Pog', 'Gn'],  // chin
  ['Gn', 'Me'],   // chin -> menton
  ['Me', 'Go'],   // mandibular plane
  ['Go', 'Ar'],   // ramus
  ['Ar', 'S'],    // condyle -> sella
  ['S', 'Gn'],    // Y-axis
];

export interface Segment { x1: number; y1: number; x2: number; y2: number; }

/**
 * Builds the profilogram line segments from the placed landmarks. Only segments
 * whose two endpoints are both placed points are returned.
 */
export const buildProfilogram = (
  landmarks: { [symbol: string]: GeoObject | undefined },
): Segment[] => {
  const segments: Segment[] = [];
  PROFILOGRAM_SEGMENTS.forEach(([from, to]) => {
    const a = landmarks[from];
    const b = landmarks[to];
    if (isGeoPoint(a) && isGeoPoint(b)) {
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  });
  return segments;
};

export default buildProfilogram;
