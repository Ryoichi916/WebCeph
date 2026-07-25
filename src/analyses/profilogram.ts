import { isGeoPoint } from 'utils/math';

/**
 * Profilogram: a stylised line tracing of the facial skeleton built from the
 * placed landmarks. Each entry is a pair of landmark symbols joined by a line;
 * together they outline the profile (cranial base, maxilla, mandible, chin) and
 * the common reference planes. Segments whose endpoints are not both placed are
 * simply skipped, so the profilogram fills in as more points are added.
 */
export const PROFILOGRAM_SEGMENTS: Array<[string, string]> = [
  // --- Cranial base ---
  ['Ba', 'N'],    // basion -> nasion (cranial base)
  ['S', 'N'],     // anterior cranial base (SN)
  ['Ba', 'S'],
  // --- Maxilla / palatal ---
  ['N', 'A'],     // maxillary (nasion -> subspinale)
  ['A', 'ANS'],   // anterior maxilla
  ['ANS', 'PNS'], // palatal plane
  // --- Facial plane ---
  ['N', 'Pog'],   // facial plane
  // --- Anterior mandible / symphysis ---
  ['A', 'B'],     // alveolar profile
  ['B', 'Pog'],   // anterior symphysis
  ['Pog', 'Gn'],  // chin
  ['Gn', 'Me'],   // chin -> menton
  // --- Mandibular outline ---
  ['Me', 'Go'],   // mandibular plane (corpus)
  ['Go', 'Ar'],   // ramus
  ['Ar', 'S'],    // condyle -> sella
  // --- Frankfort horizontal ---
  ['Po', 'Or'],   // FH plane
  // --- Soft-tissue profile (superior -> inferior) ---
  ['G', 'N\''],
  ['N\'', 'Pn'],
  ['Pn', 'Sn'],
  ['Sn', 'Ls'],
  ['Ls', 'Li'],
  ['Li', 'Pog\''],
  ['Pog\'', 'Me\''],
  // --- Ricketts E-line (nose tip -> soft chin) ---
  ['Pn', 'Pog\''],
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
