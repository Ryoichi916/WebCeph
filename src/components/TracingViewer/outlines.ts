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
 *
 * That facial frame falls back to the S–Gn axis when N or Me is not on the
 * tracing (see `facialFrame` in `buildOutlines`) — Tweed's own 17-step point
 * set never places N, so without the fallback none of the frame-scaled
 * branches (sella, orbit, porion, the mandible's border sag) could draw for a
 * Tweed-only tracing, even though the points they anchor to (S, Or, Po, Go,
 * Me, Gn) were all placed. The mandible branch also accepts Gn as the chin
 * anchor when Pog is not placed, for the same reason.
 */

/** Shared visual identity — imported by both the SVG overlay and the canvas. */
export const OUTLINE_COLOR = '#7EC8FF';
/**
 * The same identity taken to full contrast for a rasterised film (image export,
 * printed report). There the anatomical tracing is the primary graphic — it is
 * what a cephalometric report is *about* — so it is drawn at full weight in
 * near-white while the analysis planes recede behind it. On screen the planes
 * are interactive and keep their own weight, which is why this is a second
 * constant rather than a change to the one above.
 */
export const OUTLINE_PRINT_COLOR = '#EAF6FF';
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
 * A turn between consecutive segments of an ordered curve sharper than this
 * reads as the curve doubling back on itself rather than as an anatomical
 * bend. Calibrated against the bundled sample's own mandible chain (Go,
 * Me, Gn, Pog, B): every turn along it, plotted normally, stays under 40°,
 * and moving the *whole* chin as a group — the shape a real growth spurt or
 * a surgical advancement actually takes, however large — translates those
 * points together and barely moves the angle either, because the segments
 * between them keep the same relative geometry. What does cross this
 * threshold is one point of the chain drifting out of line while its
 * neighbours hold still — from an isolated 20 mm displacement (the shape a
 * single mis-plotted or stale landmark takes, never a clinical change) the
 * joint reaches ~139°, comfortably clear of both the normal baseline and a
 * coherent anatomical movement. 110° leaves a wide margin on the honest side
 * (ordinary tracing variation, real correlated change) while still catching
 * the isolated-point case this guards against.
 */
const SPIKE_TURN_DEG = 110;

/**
 * Drops an interior point from an ordered, open curve when it reverses the
 * curve's own direction sharply enough to draw a spike or a self-crossing
 * loop instead of a bend a face could have. Guards a specific failure mode:
 * one landmark of an otherwise well-behaved chain (e.g. the mandible's
 * Me -> Gn -> Pog -> B) has drifted far from where its neighbours place it —
 * a genuinely mis-plotted point, or an edit so large it no longer reads as
 * the same anatomy — and the straight-line segments in and out of it fold
 * the polyline back over itself. The landmark itself is never touched or
 * hidden — every plotted point still gets its own dot on the tracing — this
 * only keeps the *decorative* connecting curve from looping through it. A
 * normal tracing never trips `SPIKE_TURN_DEG`, so this is a no-op on every
 * anatomy the module is tuned against; only a single backward pass is taken,
 * which is enough for the one-point drift this guards against.
 */
const dropSpikePoints = (pts: Point2[]): Point2[] => {
  if (pts.length < 3) {
    return pts;
  }
  const out = pts.slice();
  for (let i = 1; i < out.length - 1; i += 1) {
    const [ax, ay] = out[i - 1];
    const [bx, by] = out[i];
    const [cx, cy] = out[i + 1];
    const v1x = bx - ax;
    const v1y = by - ay;
    const v2x = cx - bx;
    const v2y = cy - by;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) {
      continue;
    }
    const cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const turnDeg = Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI);
    if (turnDeg > SPIKE_TURN_DEG) {
      out.splice(i, 1);
      i -= 1; // re-examine the joint the removal just closed up
    }
  }
  return out;
};

/**
 * The soft-tissue landmarks the profile curve is drawn *through* when the
 * tracing carries them. Short of the full set the silhouette is synthesised
 * from the skeletal profile instead (see `buildOutlines`), which matters to any
 * caller that needs to know whether the curve on screen is measured or inferred
 * — the treatment simulation does, because a synthesised silhouette follows the
 * bone 1:1 and therefore cannot honestly show a soft-tissue response ratio.
 */
export const SOFT_TISSUE_PROFILE_LANDMARKS: string[] = [
  'N\'', 'Pn', 'Sn', 'Ls', 'Li', 'Pog\'',
];

/**
 * Whether the soft-tissue profile would be drawn through real plotted
 * soft-tissue landmarks (`true`) or synthesised from the skeletal profile
 * (`false`). Mirrors the branch `buildOutlines` takes, and is the single place
 * that condition is named.
 */
export const hasSoftTissueProfile = (map: LandmarkMap): boolean =>
  SOFT_TISSUE_PROFILE_LANDMARKS.every((symbol) => point(map, symbol) !== null);

/** The soft-tissue profile landmarks this tracing is still missing. */
export const missingSoftTissueProfileLandmarks = (
  map: LandmarkMap,
): string[] =>
  SOFT_TISSUE_PROFILE_LANDMARKS.filter((symbol) => point(map, symbol) === null);

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

export interface OutlineOptions {
  /**
   * Take the N–Me facial frame — the unit system the synthesised soft-tissue
   * offsets are expressed in — from this map instead of from `map` itself.
   *
   * Only the treatment simulation passes it. There, `map` holds landmarks
   * displaced by a hypothetical plan, and letting the frame follow them would
   * rescale every inferred offset: advancing the mandible lengthens N–Me, which
   * would slide the inferred forehead and nose forward even though nothing in
   * the plan touches the cranium or the nasal bones. The offsets were derived
   * against the patient's actual facial height, so that height is what they
   * stay expressed in.
   */
  frameFrom?: LandmarkMap;
}

/**
 * Builds every outline whose required landmarks are present. Missing outlines
 * are simply omitted, so the tracing fills in as more points are placed.
 */
export const buildOutlines = (
  map: LandmarkMap, options?: OutlineOptions,
): Outline[] => {
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

  // The frame the synthesised offsets are scaled in; `frameFrom` lets a caller
  // hold it steady while the landmarks it draws move (see `OutlineOptions`).
  const frameSource = options !== undefined && options.frameFrom !== undefined
    ? options.frameFrom
    : map;
  const frameN = point(frameSource, 'N');
  const frameMe = point(frameSource, 'Me');
  const frameS = point(frameSource, 'S');
  const frameGn = point(frameSource, 'Gn');
  /**
   * The facial axis every synthesised offset in this module is scaled and
   * oriented against. Prefers N-Me (nasion to menton, the classic facial-
   * height axis a full tracing carries); when a tracing has neither — Tweed's
   * own 17-step point set never places N, only S, Gn, Go, Me, Po, Or and the
   * lower incisor axis — falls back to S-Gn, the same posterior-superior-to-
   * anterior-inferior axis Tweed's own Y-axis measurement is already built
   * from. Without this fallback every branch below that needs a frame (sella,
   * orbit, porion, the mandible's border sag) went blank for a Tweed-only
   * tracing even though S, Or, Po and Go/Me/Gn — everything those branches
   * actually anchor to — were all on the film. Returns null only when neither
   * pair is placed, in which case the caller has no anatomy left to scale
   * against.
   */
  const facialFrame = (n: Pt | null, me: Pt | null): Frame | null => {
    const useN = frameN !== null ? frameN : n;
    const useMe = frameMe !== null ? frameMe : me;
    if (useN !== null && useMe !== null) {
      return makeFrame(useN, useMe);
    }
    const useS = frameS !== null ? frameS : S;
    const useGn = frameGn !== null ? frameGn : Gn;
    if (useS !== null && useGn !== null) {
      return makeFrame(useS, useGn);
    }
    return null;
  };

  const hasSoftTissue = hasSoftTissueProfile(map);
  if (hasSoftTissue && N && Me) {
    // N and Me are both placed here (the `if` above requires them), so the
    // N-Me branch of `facialFrame` always resolves — never the S-Gn fallback.
    const f = facialFrame(N, Me) as Frame;
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
    const f = facialFrame(N, Me) as Frame; // N, Me, A, B, Pog all placed (see `if`)
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
    // See `dropSpikePoints`: Pog is an interior control point of this chain
    // (forehead -> ... -> Pog -> Me -> throat) exactly as it is in the
    // `mandible` outline below, so a mis-plotted Pog can fold this curve
    // back over itself the same way. Guard it identically.
    outlines.push({ id: 'soft-tissue', points: dropSpikePoints(pts), closed: false });
  }

  // ---- 2. Mandibular border ---------------------------------------------
  // Condyle/articulare -> gonial angle -> inferior border (bulged down) -> Me
  // -> chin -> up the anterior symphysis to B, wherever those points exist.
  // Anchors the chin on Pog when it is placed, on Gn otherwise — Tweed's own
  // copy describes Gn as the "midpoint between pogonion and menton", and
  // Tweed's 17-step point set places Gn and Me but never Pog, B or N. Without
  // this fallback the whole curve — the app's most polished decorative layer
  // — was invisible for a Tweed-only tracing even though Go, Me and Gn, the
  // three points it actually needs, were all on the film.
  const chinAnchor = Pog !== null ? Pog : Gn;
  if (Go && Me && chinAnchor) {
    const f = facialFrame(N, Me); // falls back to the S-Gn axis when N is absent
    if (f) {
      const pts: Point2[] = [];
      if (Ar) {
        pts.push([Ar.x, Ar.y]); // condyle / articulare (top of ramus)
      }
      pts.push([Go.x, Go.y]);
      // Inferior border: on a real film the border runs close to the straight
      // Go–Me chord — checked against the bundled sample, where the bone edge
      // stays within ~2% of facial height of the chord (slightly above it near
      // the antegonial region). The old 9% sag drew a bulge no mandible has.
      const t = 0.6; // control point biased toward Me, where the border dips most
      const cx = Go.x + (Me.x - Go.x) * t;
      const cy = Go.y + (Me.y - Go.y) * t;
      pts.push([cx + f.h * 0.02 * f.down.x, cy + f.h * 0.02 * f.down.y]);
      pts.push([Me.x, Me.y]);
      if (Gn) {
        pts.push([Gn.x, Gn.y]);
      }
      if (Pog) {
        pts.push([Pog.x, Pog.y]);
      }
      if (B) {
        pts.push([B.x, B.y]);
      }
      // See `dropSpikePoints`: guards against one point of the chin chain
      // (Me, Gn, Pog, B) having drifted far enough from its neighbours —
      // a mis-plotted landmark between visits, most visibly — to fold the
      // curve back over itself into a loop or a spike.
      outlines.push({ id: 'mandible', points: dropSpikePoints(pts), closed: false });
    }
  }

  // ---- 3. Maxilla outline -----------------------------------------------
  // Palatal plane (PNS -> ANS) into the anterior maxilla (ANS -> A) and down to
  // the alveolar crest.
  if (ANS && A && N && Me) {
    const f = facialFrame(N, Me) as Frame; // N, Me, ANS, A all placed (see `if`)
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
  // Small U-shaped fossa opening upward around S. S is one of Tweed's own
  // points (his Y-axis runs S->Gn), so this now draws for a Tweed-only
  // tracing too, scaled off the S-Gn axis in place of N-Me.
  if (S) {
    const f = facialFrame(N, Me);
    if (f) {
      const k = f.h / 388; // demo-calibrated pixel offsets, scaled to face size
      const off = (dx: number, dy: number): Point2 => [S.x + dx * k, S.y + dy * k];
      // Sized against the bundled sample's own fossa (~10 mm wide, ~6 mm deep at
      // that film's scale): the previous offsets drew a U half again larger than
      // the anatomy it was supposed to trace.
      outlines.push({
        id: 'sella',
        points: [off(-17, -13), off(-15, 8), off(-1, 17), off(14, 9), off(18, -15)],
        closed: false,
      });
    }
  }

  // ---- 5. Infraorbital rim arc ------------------------------------------
  // Or is one of Tweed's own points (his FMPA/FMIA run off Po-Or), so this
  // now draws for a Tweed-only tracing too.
  if (Or) {
    const f = facialFrame(N, Me);
    if (f) {
      const k = f.h / 388;
      const off = (dx: number, dy: number): Point2 => [Or.x + dx * k, Or.y + dy * k];
      outlines.push({
        id: 'orbit',
        points: [off(-48, -6), off(0, 6), off(46, -8)],
        closed: false,
      });
    }
  }

  // ---- 6. Porion / ear-rod marker ---------------------------------------
  // Po is one of Tweed's own points, so this now draws for a Tweed-only
  // tracing too.
  if (Po) {
    const f = facialFrame(N, Me);
    if (f) {
      const r = Math.max(4, (f.h / 388) * 8);
      const ring: Point2[] = [];
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        ring.push([Po.x + r * Math.cos(a), Po.y + r * Math.sin(a)]);
      }
      outlines.push({ id: 'porion', points: ring, closed: true });
    }
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
