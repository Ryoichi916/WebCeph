/**
 * Collision-aware landmark label layout.
 *
 * This is the single source of truth for where a landmark's symbol tag is
 * written relative to its dot. It is a pure module — given the placed points
 * and the visible tracing lines it returns a chosen offset per symbol — so the
 * live SVG overlay (components/TracingViewer) and the rasterised canvas
 * snapshot (utils/tracingSnapshot, used by the image export and the printed
 * clinical report) lay their labels out identically instead of one of them
 * going unlabelled.
 *
 * Every coordinate here — the points, the lines and the returned offsets — is
 * in one space chosen by the caller. The SVG overlay works in *screen* pixels
 * (image coordinates times the zoom) so a label keeps its size as the user
 * zooms; the canvas works in *image* pixels, with `fontSize` set from the
 * width of the crop so the tag is legible at print scale. The candidate
 * offsets below are tuned for an 11px tag and are scaled proportionally
 * whenever a different `fontSize` is asked for.
 */

/**
 * Candidate label positions around a landmark dot, tried in order until one
 * does not collide with an already-placed label or another dot. Offsets are
 * pixels relative to the dot; `anchor` is the SVG text-anchor. The `far`
 * candidates sit further out and get a small leader line back to the dot.
 */
export interface LabelCandidate {
  dx: number;
  dy: number;
  anchor: 'start' | 'end' | 'middle';
  far: boolean;
}

/** The tag size the candidate offsets below were tuned against. */
export const LABEL_FONT_SIZE = 11;

export const LABEL_FONT_FAMILY = [
  '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
  '"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"',
  'Meiryo', 'sans-serif',
].join(', ');

export const LABEL_CANDIDATES: LabelCandidate[] = [
  { dx: 9, dy: -7, anchor: 'start', far: false },   // right-above (default)
  { dx: 9, dy: 15, anchor: 'start', far: false },   // right-below
  { dx: -9, dy: -7, anchor: 'end', far: false },    // left-above
  { dx: -9, dy: 15, anchor: 'end', far: false },    // left-below
  { dx: 0, dy: -10, anchor: 'middle', far: false }, // centered above
  { dx: 0, dy: 18, anchor: 'middle', far: false },  // centered below
  { dx: 18, dy: -16, anchor: 'start', far: true },  // far right-above + leader
  { dx: 18, dy: 24, anchor: 'start', far: true },   // far right-below + leader
  { dx: -18, dy: -16, anchor: 'end', far: true },   // far left-above + leader
  { dx: -18, dy: 24, anchor: 'end', far: true },    // far left-below + leader
];

/**
 * Anatomically informed first choices: for landmarks that sit directly on the
 * traced bony outline (the chin cluster especially), place the label on the
 * side that is typically clear film so it never sits across the outline. The
 * generic candidates above remain as fallbacks.
 */
export const PREFERRED_CANDIDATES: { [symbol: string]: LabelCandidate[] } = {
  // Menton is the lowest point of the chin — below it is clear film.
  Me: [{ dx: 0, dy: 19, anchor: 'middle', far: false }],
  // Gnathion sits on the chin curve between Pog and Me — label inward (up-left
  // into the symphysis body) keeps it off the outline.
  Gn: [{ dx: -10, dy: 4, anchor: 'end', far: false },
       { dx: -10, dy: -8, anchor: 'end', far: false }],
  // Pogonion / B point sit on the anterior symphysis outline — label inward.
  Pog: [{ dx: -10, dy: 4, anchor: 'end', far: false }],
  B: [{ dx: -10, dy: 4, anchor: 'end', far: false }],
  // Gonion sits on the posterior jaw angle — label outward (down-left).
  Go: [{ dx: -9, dy: 15, anchor: 'end', far: false }],
};

/**
 * Compact labels for verbose landmark symbols: the dentition cluster
 * especially ('U1 Incisal Edge', 'L1 Apex', …) sits in the densest region of
 * the tracing, where full names collide no matter how the layout dodges. The
 * stepper and dialogs keep the full names; only the drawn tag shortens.
 */
const SHORT_LABELS: { [symbol: string]: string } = {
  'U1 Incisal Edge': 'U1',
  'U1 Apex': 'U1A',
  'L1 Incisal Edge': 'L1',
  'L1 Apex': 'L1A',
  'R1-mandible': 'R1',
  'R2-mandible': 'R2',
  'R3-mandible': 'R3',
  'R4-mandible': 'R4',
};

export const getShortLabel = (symbol: string): string =>
  SHORT_LABELS[symbol] || symbol;

export interface LabelPlacement extends LabelCandidate {
  symbol: string;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LabelPoint {
  symbol: string;
  x: number;
  y: number;
}

const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The same rect grown by a margin on every side (for soft-proximity tests). */
const inflateRect = (r: Rect, m: number): Rect => ({
  left: r.left - m,
  right: r.right + m,
  top: r.top - m,
  bottom: r.bottom + m,
});

/** Approximate bounding box of a label drawn with a candidate. */
export const getLabelRect = (
  sx: number, sy: number, textWidth: number, fontSize: number, c: LabelCandidate,
): Rect => {
  const left = c.anchor === 'start' ? sx + c.dx
    : c.anchor === 'end' ? sx + c.dx - textWidth
    : sx + c.dx - textWidth / 2;
  const baseline = sy + c.dy;
  return {
    left: left - 1,
    right: left + textWidth + 1,
    top: baseline - fontSize - 1,
    bottom: baseline + 2,
  };
};

/** Liang-Barsky: does the segment pass through the (slightly padded) rect? */
const segmentIntersectsRect = (
  s: LineSegment, r: Rect, pad: number,
): boolean => {
  const left = r.left - pad;
  const right = r.right + pad;
  const top = r.top - pad;
  const bottom = r.bottom + pad;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [s.x1 - left, right - s.x1, s.y1 - top, bottom - s.y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) {
        return false;
      }
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) { return false; }
        if (t > t0) { t0 = t; }
      } else {
        if (t < t0) { return false; }
        if (t < t1) { t1 = t; }
      }
    }
  }
  return true;
};

export interface LabelLayoutOptions {
  /** Tag size in the caller's coordinate space. Defaults to `LABEL_FONT_SIZE`. */
  fontSize?: number;
  /** Keep-out radius around each landmark dot. Scales with the font by default. */
  dotRadius?: number;
  /**
   * Real text measurement, when the caller has one (a canvas 2D context does).
   * Without it the width is estimated at ~0.62em per glyph, which is what the
   * SVG overlay has always used.
   */
  measureText?(text: string, fontSize: number): number;
}

/**
 * Greedy collision-aware label layout: labels are placed in reading order
 * (top-to-bottom), each taking the first candidate position that overlaps
 * neither an already-placed label nor another landmark dot, so adjacent labels
 * (e.g. A and Po near the ear region) never stack.
 *
 * `lines` are the tracing strokes labels must not sit across — the analysis'
 * planes on screen, the same planes on the printed film.
 */
export const computeLabelPlacements = (
  points: LabelPoint[],
  lines: LineSegment[],
  options: LabelLayoutOptions = {},
): { [symbol: string]: LabelPlacement } => {
  const fontSize = options.fontSize !== undefined
    ? options.fontSize
    : LABEL_FONT_SIZE;
  // The candidate ring and the collision paddings were tuned at 11px; at any
  // other tag size they have to grow with it or the labels crowd the dots.
  const k = fontSize / LABEL_FONT_SIZE;
  const dotRadius = options.dotRadius !== undefined
    ? options.dotRadius
    : 7 * k;
  const measure = options.measureText;

  const placements: { [symbol: string]: LabelPlacement } = {};
  const occupied: Rect[] = points.map(({ x, y }) => ({
    left: x - dotRadius,
    right: x + dotRadius,
    top: y - dotRadius,
    bottom: y + dotRadius,
  }));
  const sorted = points
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.symbol < b.symbol ? -1 : 1));

  for (const point of sorted) {
    const text = getShortLabel(point.symbol);
    const textWidth = measure !== undefined
      ? measure(text, fontSize) + 2
      // ~0.62em average glyph advance for a 600-weight system font.
      : text.length * fontSize * 0.62 + 2;
    const candidates = [
      ...(PREFERRED_CANDIDATES[point.symbol] || []),
      ...LABEL_CANDIDATES,
    ].map((c) => (k === 1 ? c : { ...c, dx: c.dx * k, dy: c.dy * k }));
    // First candidate that collides with nothing wins; otherwise the least
    // objectionable one. Hard overlaps (label on label/dot, line through the
    // text) weigh most; mere proximity (within a few px of a dot, label or
    // line) gets a soft penalty so labels are nudged clear of crowded areas
    // — the N fan and the Pog/Gn/Me chin cluster especially — instead of
    // parking flush against them. Far candidates carry a small cost so the
    // leader-line treatment only appears when the near ring is truly full.
    let chosen = candidates[0];
    let bestPenalty = Infinity;
    for (const candidate of candidates) {
      const rect = getLabelRect(point.x, point.y, textWidth, fontSize, candidate);
      const softRect = inflateRect(rect, 3 * k);
      let penalty = candidate.far ? 0.75 : 0;
      for (const other of occupied) {
        if (rectsIntersect(rect, other)) {
          penalty += 3;
        } else if (rectsIntersect(softRect, other)) {
          penalty += 1;
        }
      }
      for (const line of lines) {
        if (segmentIntersectsRect(line, rect, 1.5 * k)) {
          penalty += 1.5;
        } else if (segmentIntersectsRect(line, rect, 4.5 * k)) {
          penalty += 0.5;
        }
      }
      if (penalty === 0) {
        chosen = candidate;
        break;
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        chosen = candidate;
      }
    }
    occupied.push(getLabelRect(point.x, point.y, textWidth, fontSize, chosen));
    placements[point.symbol] = { symbol: point.symbol, ...chosen };
  }
  return placements;
};
