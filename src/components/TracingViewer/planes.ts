/**
 * Cephalometric reference planes (S-N, Frankfort horizontal, mandibular
 * plane, facial plane, …) are the anatomical scaffolding of a tracing.
 * Classic tracing convention draws them heavier than the construction /
 * measurement segments built on top of them, so the canvas reads with a
 * hierarchy instead of a uniform web of identical strokes.
 *
 * Symbols are matched direction-insensitively: several analyses define the
 * same physical segment under both orders (e.g. "Pog-N" and the Facial
 * Plane's "N-Pog"), and both must classify identically no matter which
 * instance survives de-duplication.
 */

const normalize = (symbol: string): string =>
  symbol.split('-').sort().join('-');

const REFERENCE_PLANE_SYMBOLS = [
  'S-N',    // anterior cranial base
  'FH',     // Frankfort Horizontal (Po-Or)
  'Go-Me',  // mandibular plane
  'N-Pog',  // facial plane
  'SPP',    // palatal plane (PNS-ANS)
  'OP',     // functional occlusal plane
  'E-line', // esthetic line (soft tissue)
];

const PLANE_KEYS: { [key: string]: true } = {};
for (const symbol of REFERENCE_PLANE_SYMBOLS) {
  PLANE_KEYS[normalize(symbol)] = true;
}

const isReferencePlaneSymbol = (symbol: string): boolean =>
  PLANE_KEYS[normalize(symbol)] === true;

export default isReferencePlaneSymbol;
