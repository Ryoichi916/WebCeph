import { isGeoPoint } from 'utils/math';

/**
 * Anatomical outline tracings for the cephalogram.
 *
 * This is the single source of truth for the smooth structural curves drawn
 * over the film (soft-tissue profile, mandibular border, maxilla, sella turcica,
 * orbital rim, ear-rod marker). It is a pure module — given a map of placed
 * landmark points it returns a set of polyline control points — so the exact
 * same geometry is consumed by both the live SVG overlay (TracingViewer) and the
 * rasterised canvas snapshot (utils/tracingSnapshot.ts) used for image export and
 * the printable clinical report.
 *
 * The outlines are *derived* from landmark positions rather than drawn as fixed
 * art, so they adapt when landmarks are moved. Where a real analysis lacks the
 * soft-tissue landmarks (e.g. Downs is skeletal-only), the soft-tissue profile is
 * synthesised from the skeletal points with clinically sensible anterior offsets
 * (the skin silhouette sits anterior to the bony profile). Offsets are expressed
 * in a facial coordinate frame (anterior / longitudinal axes derived from the
 * N–Me line) and scaled to facial height, so they track the face's size and
 * orientation instead of assuming a fixed pixel scale.
 */

/** Shared visual identity — imported by both the SVG overlay and the canvas. */
export const OUTLINE_COLOR = '#7EC8FF';
/** On-screen stroke weight (px). Thinner than the 1.5px measurement segments
 *  and much thinner than the 2.5px reference planes, for a fine hand-traced look. */
export const OUTLINE_WIDTH = 1.15;
export const OUTLINE_OPACITY = 0.9;

export type LandmarkMap = { [symbol: string]: GeoObject | undefined };

type Pt = { x: number; y: number };
export type Point2 = [number, number];

export interface Outline {
  id: string;
  points: Point2[];
  closed: boolean;
}

/** A catmull-rom curve pre-converted to cubic bezier, so SVG and canvas share it. */
export interface BezierPath {
  start: Point2;
  curves: Array<[number, number, number, number, number, number]>; // c1x,c1y,c2x,c2y,x,y
  closed: boolean;
}

const point = (map: LandmarkMap, symbol: string): Pt | null => {
  const l = map[symbol];
  return isGeoPoint(l) ? { x: l.x, y: l.y } : null;
};

/**
 * The facial reference frame used to place synthesised soft-tissue points.
 * `down` runs N→Me (cranio-caudal); `ant` is perpendicular, pointing anteriorly
 * (toward the patient's face). `h` is the facial height used to scale offsets.
 */
interface Frame {
  origin: Pt;
  down: Pt;   // unit vector
  ant: Pt;    // unit vector, anterior
  h: number;  // facial height (N–Me)
}

const makeFrame = (n: Pt, me: Pt): Frame => {
  const dx = me.x - n.x;
  const dy = me.y - n.y;
  const h = Math.max(1, Math.hypot(dx, dy));
  const down = { x: dx / h, y: dy / h };
  // Rotate `down` so the result points toward +x (anterior for a right-facing
  // ceph). (uy, -ux) has a positive x-component whenever the face is upright.
  const ant = { x: down.y, y: -down.x };
  return { origin: n, down, ant, h };
};

/** Place a point relative to an anchor by anterior + longitudinal fractions of facial height. */
const place = (f: Frame, anchor: Pt, ant: number, lon: number): Point2 => [
  anchor.x + f.h * (ant * f.ant.x + lon * f.down.x),
  anchor.y + f.h * (ant * f.ant.y + lon * f.down.y),
];

/**
 * Builds every outline whose required landmarks are present. Missing outlines
 * are simply omitted, so the tracing fills in as more points are placed.
 */
export const buildOutlines = (map: LandmarkMap): Outline[] => {
  const outlines: Outline[] = [];

  const N = point(map, 'N');
  const Me = point(map, 'Me');
  const A = point(map, 'A');
  const B = point(map, 'B');
  const ANS = point(map, 'ANS');
  const PNS = point(map, 'PNS');
  const Pog = point(map, 'Pog');
  const Gn = point(map, 'Gn');
  const Go = point(map, 'Go');
  const Ar = point(map, 'Ar');
  const S = point(map, 'S');
  const Or = point(map, 'Or');
  const Po = point(map, 'Po');

  // ---- 1. Soft-tissue profile -------------------------------------------
  // Prefer the true soft-tissue landmarks when the analysis provides them;
  // otherwise synthesise the silhouette anterior to the skeletal profile.
  const G = point(map, 'G');
  const Nsoft = point(map, "N'");
  const Pn = point(map, 'Pn');
  const Sn = point(map, 'Sn');
  const Ls = point(map, 'Ls');
  const Li = point(map, 'Li');
  const Pogsoft = point(map, "Pog'");
  const Mesoft = point(map, "Me'");

  const hasSoftTissue = Nsoft && Pn && Sn && Ls && Li && Pogsoft;
  if (hasSoftTissue && N && Me) {
    const f = makeFrame(N, Me);
    const pts: Point2[] = [];
    // Forehead/glabella above soft nasion, derived from the skeletal frame so
    // the curve starts above the brow even when G is not a placed landmark.
    if (G) {
      pts.push([G.x, G.y]);
    } else {
      pts.push(place(f, N, -0.036, -0.264));
      pts.push(place(f, N, 0.027, -0.130));
    }
    pts.push([Nsoft!.x, Nsoft!.y]);
    pts.push([Pn!.x, Pn!.y]);
    pts.push([Sn!.x, Sn!.y]);
    pts.push([Ls!.x, Ls!.y]);
    pts.push([Li!.x, Li!.y]);
    pts.push([Pogsoft!.x, Pogsoft!.y]);
    if (Mesoft) {
      pts.push([Mesoft.x, Mesoft.y]);
      pts.push(place(f, Mesoft, -0.05, 0.10)); // throat / submental
    } else {
      pts.push(place(f, Pogsoft!, -0.04, 0.09));
    }
    outlines.push({ id: 'soft-tissue', points: pts, closed: false });
  } else if (N && Me && A && B && Pog) {
    // Skeletal-only synthesis (e.g. Downs, which has no soft-tissue landmarks).
    // Offsets calibrated against the demo film's soft-tissue silhouette,
    // expressed in the facial frame. ANS anchors the subnasale when present;
    // otherwise it is derived from A (subnasale sits above and anterior to A).
    const f = makeFrame(N, Me);
    const subnasale: Point2 = ANS
      ? place(f, ANS, 0.088, 0.055)
      : place(f, A, 0.110, -0.030);
    const pts: Point2[] = [
      place(f, N, -0.036, -0.264), // forehead
      place(f, N, 0.027, -0.130),  // glabella
      place(f, N, 0.057, -0.002),  // soft nasion
      place(f, N, 0.136, 0.115),   // nasal bridge
      place(f, N, 0.230, 0.264),   // nose tip (pronasale)
      subnasale,
      place(f, A, 0.173, 0.059),   // upper lip
      place(f, B, 0.200, -0.129),  // lower lip
      place(f, Pog, 0.107, -0.061),// soft pogonion
      place(f, Me, 0.112, -0.004), // soft menton
      place(f, Me, -0.050, 0.110), // throat / submental
    ];
    outlines.push({ id: 'soft-tissue', points: pts, closed: false });
  }

  // ---- 2. Mandibular border ---------------------------------------------
  // Condyle/articulare -> gonial angle -> inferior border (bulged down) -> Me
  // -> chin -> up the anterior symphysis to B.
  if (Go && Me && Pog && B && N) {
    const f = makeFrame(N, Me);
    const pts: Point2[] = [];
    if (Ar) {
      pts.push([Ar.x, Ar.y]); // condyle / articulare (top of ramus)
    }
    pts.push([Go.x, Go.y]);
    // Inferior border sags below the straight Go–Me chord.
    const midx = (Go.x + Me.x) / 2;
    const midy = (Go.y + Me.y) / 2;
    pts.push([midx + f.h * 0.09 * f.down.x, midy + f.h * 0.09 * f.down.y]);
    pts.push([Me.x, Me.y]);
    if (Gn) {
      pts.push([Gn.x, Gn.y]);
    }
    pts.push([Pog.x, Pog.y]);
    pts.push([B.x, B.y]);
    outlines.push({ id: 'mandible', points: pts, closed: false });
  }

  // ---- 3. Maxilla outline -----------------------------------------------
  // Palatal plane (PNS -> ANS) into the anterior maxilla (ANS -> A) and down to
  // the alveolar crest.
  if (ANS && A && N && Me) {
    const f = makeFrame(N, Me);
    const pts: Point2[] = [];
    if (PNS) {
      pts.push([PNS.x, PNS.y]);
    }
    pts.push([ANS.x, ANS.y]);
    pts.push([A.x, A.y]);
    pts.push(place(f, A, 0.030, 0.075)); // alveolar crest below A
    outlines.push({ id: 'maxilla', points: pts, closed: false });
  }

  // ---- 4. Sella turcica --------------------------------------------------
  // Small U-shaped fossa opening upward around S.
  if (S && N && Me) {
    const f = makeFrame(N, Me);
    const k = f.h / 388; // demo-calibrated pixel offsets, scaled to face size
    const off = (dx: number, dy: number): Point2 => [S.x + dx * k, S.y + dy * k];
    outlines.push({
      id: 'sella',
      points: [off(-23, -12), off(-20, 18), off(-2, 33), off(22, 20), off(26, -14)],
      closed: false,
    });
  }

  // ---- 5. Infraorbital rim arc ------------------------------------------
  if (Or && N && Me) {
    const f = makeFrame(N, Me);
    const k = f.h / 388;
    const off = (dx: number, dy: number): Point2 => [Or.x + dx * k, Or.y + dy * k];
    outlines.push({
      id: 'orbit',
      points: [off(-48, -6), off(0, 6), off(46, -8)],
      closed: false,
    });
  }

  // ---- 6. Porion / ear-rod marker ---------------------------------------
  if (Po && N && Me) {
    const f = makeFrame(N, Me);
    const r = Math.max(4, (f.h / 388) * 8);
    const ring: Point2[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      ring.push([Po.x + r * Math.cos(a), Po.y + r * Math.sin(a)]);
    }
    outlines.push({ id: 'porion', points: ring, closed: true });
  }

  // ---- 7. Central incisor lozenges --------------------------------------
  // Classic tracing silhouette of each central incisor: a slender closed
  // lozenge running along the incisor's long axis, from the incisal edge
  // (tip) up to the root apex, widest at the crown and tapering to the root.
  // Drawn only when both the edge and apex landmarks of that incisor are
  // present (so it appears for the dental analysis but not for skeletal-only
  // ones). Geometry is derived from the two points, so it tracks them when
  // dragged, and the width scales with the axis length.
  const buildIncisor = (edge: Pt, apex: Pt): Point2[] => {
    const ax = { x: apex.x - edge.x, y: apex.y - edge.y }; // edge -> apex
    const L = Math.max(1, Math.hypot(ax.x, ax.y));
    const u = { x: ax.x / L, y: ax.y / L };      // along axis, toward root
    const p = { x: -u.y, y: u.x };               // perpendicular (labio-lingual)
    const crownHalf = L * 0.17;
    const rootHalf = L * 0.085;
    const at = (t: number, w: number): Point2 => [
      edge.x + u.x * L * t + p.x * w,
      edge.y + u.y * L * t + p.y * w,
    ];
    return [
      at(0, 0),               // incisal tip
      at(0.30, crownHalf),    // labial crown
      at(0.60, rootHalf),     // labial root surface
      at(1, 0),               // root apex
      at(0.60, -rootHalf),    // lingual root surface
      at(0.30, -crownHalf),   // lingual crown / cingulum
    ];
  };

  const U1apex = point(map, 'U1 Apex');
  const U1edge = point(map, 'U1 Incisal Edge');
  if (U1apex && U1edge) {
    outlines.push({ id: 'incisor-upper', points: buildIncisor(U1edge, U1apex), closed: true });
  }

  const L1apex = point(map, 'L1 Apex');
  const L1edge = point(map, 'L1 Incisal Edge');
  if (L1apex && L1edge) {
    outlines.push({ id: 'incisor-lower', points: buildIncisor(L1edge, L1apex), closed: true });
  }

  return outlines;
};

/**
 * Catmull-Rom interpolation through the control points, converted to cubic
 * bezier segments (tension 1/6). Shared so the SVG path string and the canvas
 * stroke render identical curves.
 */
export const toBezierPath = (points: Point2[], closed: boolean): BezierPath | null => {
  if (points.length < 2) {
    return null;
  }
  if (points.length === 2) {
    // A straight segment: degenerate bezier.
    return {
      start: points[0],
      curves: [[points[0][0], points[0][1], points[1][0], points[1][1], points[1][0], points[1][1]]],
      closed,
    };
  }
  const p = points.slice();
  if (closed) {
    p.unshift(points[points.length - 1]);
    p.push(points[0], points[1]);
  } else {
    p.unshift(points[0]);
    p.push(points[points.length - 1]);
  }
  const curves: BezierPath['curves'] = [];
  for (let i = 1; i < p.length - 2; i += 1) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    curves.push([c1x, c1y, c2x, c2y, x2, y2]);
  }
  return { start: [p[1][0], p[1][1]], curves, closed };
};

/** SVG path `d` attribute for an outline. */
export const outlineToSvgPath = (outline: Outline): string => {
  const bez = toBezierPath(outline.points, outline.closed);
  if (bez === null) {
    return '';
  }
  let d = `M ${bez.start[0].toFixed(2)} ${bez.start[1].toFixed(2)}`;
  bez.curves.forEach(([c1x, c1y, c2x, c2y, x, y]) => {
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  if (bez.closed) {
    d += ' Z';
  }
  return d;
};

/** Strokes an outline onto a 2D canvas context (path only; caller sets style). */
export const strokeOutlineOnCanvas = (
  ctx: CanvasRenderingContext2D,
  outline: Outline,
): void => {
  const bez = toBezierPath(outline.points, outline.closed);
  if (bez === null) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(bez.start[0], bez.start[1]);
  bez.curves.forEach(([c1x, c1y, c2x, c2y, x, y]) => {
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
  });
  if (bez.closed) {
    ctx.closePath();
  }
  ctx.stroke();
};
