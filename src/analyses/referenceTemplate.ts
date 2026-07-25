/**
 * Scaffolds a lateral-ceph tracing from just two reference points, Sella (S)
 * and Nasion (N).
 *
 * S and N define the anterior cranial base (the SN line), the most stable and
 * reproducible reference in a lateral cephalogram. Given the two points a
 * reader has placed, every other landmark is positioned at its population-mean
 * location expressed in the SN coordinate frame, giving a full starting tracing
 * that the reader then drags into place. It is a labour-saving scaffold, not a
 * measurement: the template positions are approximate adult norms.
 *
 * Coordinate frame (all values in units of the SN distance):
 *   - origin: S
 *   - u axis: S -> N  (anterior, +1 at N)
 *   - v axis: perpendicular to u, pointing inferiorly (towards the mandible)
 *
 * Because the frame is derived from the placed points, the scaffold follows the
 * image's own scale and rotation; the inferior direction is resolved from the
 * upright orientation of a standard cephalogram (see plotFromReferencePoints).
 */

export interface Point { x: number; y: number; }

/**
 * Mean landmark positions as (along-SN, perpendicular-inferior) offsets from S,
 * in units of the SN distance. Approximate adult norms — a starting point for
 * manual refinement, not diagnostic values. S = (0, 0) and N = (1, 0) are
 * implicit (they are the references) and intentionally omitted.
 */
export const SN_RELATIVE_TEMPLATE: { [symbol: string]: [number, number] } = {
  // --- Skeletal ---
  Ba: [-0.30, 0.50],   // Basion — postero-inferior to S (foramen magnum)
  Po: [-0.10, 0.28],   // Porion — posterior, below SN (external auditory meatus)
  Ar: [-0.18, 0.55],   // Articulare
  Or: [0.72, 0.22],    // Orbitale — anterior, just below SN
  PNS: [0.30, 0.55],   // Posterior nasal spine
  ANS: [1.02, 0.55],   // Anterior nasal spine
  A: [0.95, 0.64],     // Subspinale (A-point)
  B: [0.88, 1.02],     // Supramentale (B-point)
  Pog: [0.95, 1.18],   // Pogonion (bony chin)
  Gn: [0.86, 1.30],    // Gnathion
  Me: [0.78, 1.34],    // Menton (lowest point of the symphysis)
  Go: [-0.05, 1.06],   // Gonion (mandibular angle)
  // --- Incisors (axes used by Tweed / Steiner / interincisal) ---
  'U1 Apex': [0.93, 0.70],          // Upper incisor root apex
  'U1 Incisal Edge': [1.02, 0.98],  // Upper incisor incisal edge
  'L1 Apex': [0.84, 1.12],          // Lower incisor root apex
  'L1 Incisal Edge': [0.98, 0.97],  // Lower incisor incisal edge
  // --- Soft-tissue profile (superior -> inferior) ---
  'G': [1.02, -0.15],   // Glabella
  'N\'': [1.10, 0.05],  // Soft-tissue nasion
  Pn: [1.34, 0.32],     // Pronasale (nose tip)
  Sn: [1.16, 0.60],     // Subnasale
  Ls: [1.20, 0.77],     // Labrale superius (upper lip)
  Li: [1.17, 0.95],     // Labrale inferius (lower lip)
  'Pog\'': [1.08, 1.22], // Soft-tissue pogonion
  'Me\'': [0.88, 1.42],  // Soft-tissue menton
};

/**
 * Given the two placed references, returns the mean position of `symbol` in
 * image coordinates, or null if the symbol has no template entry (or is a
 * reference itself). The result is not clamped to the image bounds — callers
 * that need that should clamp.
 */
export const positionFromReferences = (
  sella: Point,
  nasion: Point,
  symbol: string,
): Point | null => {
  const entry = SN_RELATIVE_TEMPLATE[symbol];
  if (entry === undefined) {
    return null;
  }
  const ux = nasion.x - sella.x;
  const uy = nasion.y - sella.y;
  const length = Math.hypot(ux, uy);
  if (length === 0) {
    return null;
  }
  const u = { x: ux / length, y: uy / length };
  // Perpendicular to u; pick the one pointing inferiorly (downwards in the
  // upright image) so the mandible/face landmarks land below the SN line
  // regardless of whether the ceph faces left or right.
  let v = { x: -u.y, y: u.x };
  if (v.y < 0) {
    v = { x: -v.x, y: -v.y };
  }
  const [a, b] = entry;
  return {
    x: sella.x + (a * u.x + b * v.x) * length,
    y: sella.y + (a * u.y + b * v.y) * length,
  };
};

export default positionFromReferences;
