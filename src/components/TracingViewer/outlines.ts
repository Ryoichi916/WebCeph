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

// ---- Lip concavities ---------------------------------------------------
// The labial sulci and the lip embrasure — the three concavities that make a
// profile read as two lips instead of one smooth bulge: the superior labial
// sulcus (Sls) between subnasale and the upper lip, the stomion notch
// (Sts/Sti) where the lips meet, and the mentolabial sulcus (Ils) between the
// lower lip and the soft chin. When the tracing carries the real landmark it
// is always used; otherwise the dip is *synthesised* between its neighbours —
// an invention, like every other synthesised offset in this module, published
// here as explicit numbers rather than hidden in drawing code.

/**
 * A synthesised concavity between neighbours `a` and `b`: its longitudinal
 * position (along the frame's `down` axis) is `t` of the way from `a` to `b`,
 * and its anterior coordinate is `depth` × facial height **behind the less
 * anterior of the two neighbours** — not behind their chord. The distinction
 * is what makes the dip a dip: when the two lips differ a lot in anterior
 * projection (a Class III tracing puts the lower lip well in front of the
 * upper), a point "behind the chord" can still sit in *front* of the nearer
 * lip, and the concavity silently reads as part of one convex bulge. A local
 * minimum against both neighbours is the property a sulcus is defined by, so
 * it is what this constructs. `ant`/`down` are orthonormal, so the point is
 * rebuilt exactly from its two projections.
 */
const lipDip = (
  a: Point2, b: Point2, f: Frame, depth: number, t: number,
): Point2 => {
  const antOf = (p: Point2) => p[0] * f.ant.x + p[1] * f.ant.y;
  const lonOf = (p: Point2) => p[0] * f.down.x + p[1] * f.down.y;
  const lon = lonOf(a) + (lonOf(b) - lonOf(a)) * t;
  const ant = Math.min(antOf(a), antOf(b)) - depth * f.h;
  return [
    ant * f.ant.x + lon * f.down.x,
    ant * f.ant.y + lon * f.down.y,
  ];
};

/**
 * Depth (fraction of facial height, posterior of the **less anterior
 * neighbour** — see `lipDip`) and position (fraction along the span) of each
 * synthesised dip. Calibrated against the bundled demo tracing's own
 * Sls/Sts/Sti/Ils template positions relative to their neighbours: on that
 * film (facial height ≈ 974 px) the real sulcus sits ≈ 11 px behind
 * min(Sn, Ls), the real stomion ≈ 13 px behind min(Ls, Li), and the real
 * mentolabial fold ≈ 32 px behind min(Li, Pog′) — the deepest of the three
 * on a normal profile.
 */
const LIP_DIPS = {
  /** Sn → Ls: superior labial sulcus. */
  sls: { depth: 0.010, t: 0.45 },
  /** Ls → Li: the lip embrasure (stomion). */
  stomion: { depth: 0.012, t: 0.5 },
  /** Li → Pog': mentolabial sulcus. */
  ils: { depth: 0.028, t: 0.45 },
};

/**
 * Splices the three lip concavities into an assembled profile chain, between
 * the boundary points given **by reference**. Each dip prefers the real
 * plotted landmark (Sls / Sts+Sti / Ils) and synthesises otherwise. A dip is
 * inserted only when its two boundary points are still *adjacent* in `pts` —
 * if the spike guard removed either boundary, the anatomy there was already
 * suspect and an interpolated dip would hang off a mis-plot.
 */
const insertLipConcavities = (
  pts: Point2[],
  map: LandmarkMap,
  f: Frame,
  snPt: Point2,
  lsPt: Point2,
  liPt: Point2,
  pogPt: Point2,
): Point2[] => {
  const Sls = point(map, 'Sls');
  const Sts = point(map, 'Sts');
  const Sti = point(map, 'Sti');
  const Ils = point(map, 'Ils');

  const upper: Point2[] = Sls
    ? [[Sls.x, Sls.y]]
    : [lipDip(snPt, lsPt, f, LIP_DIPS.sls.depth, LIP_DIPS.sls.t)];
  // Superior → inferior, matching the chain's own order: Sts (lowest point of
  // the upper vermilion) before Sti (highest point of the lower vermilion).
  const stomion: Point2[] = (Sts || Sti)
    ? [
      ...(Sts ? [[Sts.x, Sts.y] as Point2] : []),
      ...(Sti ? [[Sti.x, Sti.y] as Point2] : []),
    ]
    : [lipDip(lsPt, liPt, f, LIP_DIPS.stomion.depth, LIP_DIPS.stomion.t)];
  const lower: Point2[] = Ils
    ? [[Ils.x, Ils.y]]
    : [lipDip(liPt, pogPt, f, LIP_DIPS.ils.depth, LIP_DIPS.ils.t)];

  const spliceBetween = (
    arr: Point2[], a: Point2, b: Point2, inserts: Point2[],
  ): Point2[] => {
    const i = arr.indexOf(a);
    if (i === -1 || arr[i + 1] !== b) {
      return arr;
    }
    return [...arr.slice(0, i + 1), ...inserts, ...arr.slice(i + 1)];
  };

  let out = spliceBetween(pts, snPt, lsPt, upper);
  out = spliceBetween(out, lsPt, liPt, stomion);
  out = spliceBetween(out, liPt, pogPt, lower);
  return out;
};

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
    const snPt: Point2 = [Sn!.x, Sn!.y];
    const lsPt: Point2 = [Ls!.x, Ls!.y];
    const liPt: Point2 = [Li!.x, Li!.y];
    const pogPt: Point2 = [Pogsoft!.x, Pogsoft!.y];
    pts.push([Nsoft!.x, Nsoft!.y]);
    pts.push([Pn!.x, Pn!.y]);
    pts.push(snPt);
    pts.push(lsPt);
    pts.push(liPt);
    pts.push(pogPt);
    if (Mesoft) {
      pts.push([Mesoft.x, Mesoft.y]);
      pts.push(place(f, Mesoft, -0.05, 0.10)); // throat / submental
    } else {
      pts.push(place(f, Pogsoft!, -0.04, 0.09));
    }
    // The lip concavities — real Sls/Sts/Sti/Ils where plotted, synthesised
    // otherwise. No dropSpikePoints on this branch (unchanged): these sharp
    // reversals are anatomy, and the guard would eat them.
    outlines.push({
      id: 'soft-tissue',
      points: insertLipConcavities(pts, map, f, snPt, lsPt, liPt, pogPt),
      closed: false,
    });
  } else if (N && Me && A && B && Pog) {
    // Skeletal-anchored synthesis (e.g. Downs, which has no soft-tissue
    // landmarks) — but each slot prefers the *real* soft-tissue landmark when
    // it happens to be plotted: a 9-of-9 Soft Tissue tracing carries
    // G/Pn/Sn/Ls/Li/Ils/Pog' yet lands in this branch because N' (this gate's
    // sixth landmark) is not a plottable step of any analysis, and drawing
    // bone-derived guesses over real measurements would ignore the
    // clinician's own tracing. Offsets calibrated against the demo film's
    // soft-tissue silhouette, expressed in the facial frame. ANS anchors the
    // subnasale when present; otherwise it is derived from A.
    const f = facialFrame(N, Me) as Frame; // N, Me, A, B, Pog all placed (see `if`)
    const glabella: Point2 = G ? [G.x, G.y] : place(f, N, 0.027, -0.130);
    const softNasion: Point2 = Nsoft
      ? [Nsoft.x, Nsoft.y] : place(f, N, 0.057, -0.002);
    const noseTip: Point2 = Pn ? [Pn.x, Pn.y] : place(f, N, 0.230, 0.264);
    const subnasale: Point2 = Sn
      ? [Sn.x, Sn.y]
      : (ANS ? place(f, ANS, 0.088, 0.055) : place(f, A, 0.110, -0.030));
    const upperLip: Point2 = Ls ? [Ls.x, Ls.y] : place(f, A, 0.173, 0.059);
    const lowerLip: Point2 = Li ? [Li.x, Li.y] : place(f, B, 0.200, -0.129);
    const softPog: Point2 = Pogsoft
      ? [Pogsoft.x, Pogsoft.y] : place(f, Pog, 0.107, -0.061);
    const softMenton: Point2 = Mesoft
      ? [Mesoft.x, Mesoft.y] : place(f, Me, 0.112, -0.004);
    const pts: Point2[] = [
      place(f, N, -0.036, -0.264), // forehead
      glabella,
      softNasion,
      place(f, N, 0.136, 0.115),   // nasal bridge
      noseTip,
      subnasale,
      upperLip,
      lowerLip,
      softPog,
      softMenton,
      place(f, Me, -0.050, 0.110), // throat / submental
    ];
    // See `dropSpikePoints`: Pog is an interior control point of this chain
    // (forehead -> ... -> Pog -> Me -> throat) exactly as it is in the
    // `mandible` outline below, so a mis-plotted Pog can fold this curve
    // back over itself the same way. Guard it identically — but BEFORE the
    // lip concavities go in: their sharp reversals are deliberate anatomy the
    // guard must never eat, so the guard sees only the base silhouette, and
    // each dip is spliced in afterwards only where its boundary points
    // survived.
    const guarded = dropSpikePoints(pts);
    outlines.push({
      id: 'soft-tissue',
      points: insertLipConcavities(
        guarded, map, f, subnasale, upperLip, lowerLip, softPog,
      ),
      closed: false,
    });
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
 * Uniform Catmull-Rom overshoots when consecutive control points are very
 * unevenly spaced: a tangent derived from a long neighbouring chord swings a
 * bezier control point far past a short segment, and the curve loops or cusps
 * through it. The lip region is exactly that case — Ls → Sts → Sti → Li sit a
 * few percent of facial height apart beside the much longer Pn → Sn chord —
 * so each control offset is clamped to this fraction of its own segment's
 * length. Evenly spaced points are untouched: their offset is |p2−p0|/6 ≈
 * (2·segment)/6 = a third of the segment, comfortably under the cap, so every
 * previously well-behaved outline renders byte-identically.
 */
const MAX_TANGENT_FRACTION = 0.45;

/**
 * Catmull-Rom interpolation through the control points, converted to cubic
 * bezier segments (tension 1/6, per-segment tangent clamp — see
 * `MAX_TANGENT_FRACTION`). Shared so the SVG path string and the canvas
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
  const clamp = (
    baseX: number, baseY: number, offX: number, offY: number, segLen: number,
  ): [number, number] => {
    const len = Math.hypot(offX, offY);
    const max = segLen * MAX_TANGENT_FRACTION;
    if (len <= max || len < 1e-9) {
      return [baseX + offX, baseY + offY];
    }
    const k = max / len;
    return [baseX + offX * k, baseY + offY * k];
  };
  const curves: BezierPath['curves'] = [];
  for (let i = 1; i < p.length - 2; i += 1) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    const [c1x, c1y] = clamp(x1, y1, (x2 - x0) / 6, (y2 - y0) / 6, segLen);
    const [c2x, c2y] = clamp(x2, y2, -(x3 - x1) / 6, -(y3 - y1) / 6, segLen);
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
