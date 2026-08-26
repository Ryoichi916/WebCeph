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
  // --- Incisor axes (Tweed / Steiner) ---
  ['U1 Apex', 'U1 Incisal Edge'],
  ['L1 Apex', 'L1 Incisal Edge'],
  // --- Ricketts E-line (nose tip -> soft chin) ---
  ['Pn', 'Pog\''],
];

/**
 * The soft-tissue profile, superior → inferior, drawn as a *chain*: each
 * placed landmark is joined to the **next placed** one, so an unplotted
 * intermediate (the sulci and the stomion pair are plotted by few analyses)
 * collapses its span to the old direct chord instead of leaving a gap — a
 * tracing without Sls still draws Sn → Ls, and one with it draws the sulcus
 * dip Sn → Sls → Ls. Kept apart from `PROFILOGRAM_SEGMENTS`' fixed pairs,
 * whose skip-if-unplaced rule would drop the whole span instead.
 */
export const SOFT_PROFILE_CHAIN: string[] = [
  'G', 'N\'', 'Pn', 'Sn', 'Sls', 'Ls', 'Sts', 'Sti', 'Li', 'Ils',
  'Pog\'', 'Me\'',
];

export interface Segment { x1: number; y1: number; x2: number; y2: number; }

/**
 * Builds the profilogram line segments from the placed landmarks. Fixed pairs
 * whose two endpoints are both placed, plus the soft-tissue chain connecting
 * each placed landmark of `SOFT_PROFILE_CHAIN` to the next placed one.
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
  let prev: GeoPoint | null = null;
  SOFT_PROFILE_CHAIN.forEach((symbol) => {
    const value = landmarks[symbol];
    if (!isGeoPoint(value)) {
      return;
    }
    if (prev !== null) {
      segments.push({ x1: prev.x, y1: prev.y, x2: value.x, y2: value.y });
    }
    prev = value;
  });
  return segments;
};

export default buildProfilogram;
