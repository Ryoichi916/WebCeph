import {
  buildOutlines,
  strokeOutlineOnCanvas,
  Outline,
} from 'components/TracingViewer/outlines';

import {
  Box,
  LandmarkMap,
  SuperimpositionAnnotations,
  Transform,
  transformLandmarks,
} from 'analyses/superimposition';

/**
 * Rasterised superimposition, for the PNG export.
 *
 * The geometry comes from exactly the modules the screen uses — the outlines
 * from `TracingViewer/outlines.ts`, the registration transform and the figure
 * annotations from `analyses/superimposition.ts` — so the exported image is the
 * view, not a lookalike. Only the drawing back-end differs (canvas here, SVG on
 * screen), which is the same split `utils/tracingSnapshot.ts` already uses for
 * the single-tracing export.
 *
 * Everything the screen states about the comparison — the registration marker
 * and its matched reference lines, the millimetre scale bar, the interval, the
 * rotation/translation audit and the "nothing here is predicted" caveat — is
 * carried onto the PNG, because a detached image is read without the app
 * around it.
 */

/** T1 hue (cyan) and T2 hue (deep orange) — shared with the on-screen view. */
export const T1_COLOR = '#40C4FF';
export const T2_COLOR = '#FF8A65';
/**
 * Matches the on-screen `.film` opacity exactly: an export that dimmed the
 * radiograph further would disagree with the view it claims to be.
 */
export const FILM_OPACITY = 0.62;
/** T2 is dashed in both renderers so a coincident T1 stays visible under it. */
export const T2_DASH: [number, number] = [7, 4.5];
const CASING = 'rgba(20, 24, 29, 0.6)';
const PANEL_BG = '#1E242B';
const CANVAS_BG = '#14181D';
const PANEL_TEXT = '#C7D0D9';
const PANEL_TEXT_DIM = 'rgba(199, 208, 217, 0.72)';
const ANNOTATION = '#FFFFFF';
const ANNOTATION_HALO = 'rgba(20, 24, 29, 0.85)';

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", ' +
  '"Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif';

export interface SuperimpositionSnapshotInput {
  /** T1's film, shown dimmed underneath for anatomical context. */
  filmSrc: string | null;
  filmWidth: number | null;
  filmHeight: number | null;
  /** Landmarks of each timepoint, in their own image coordinates. */
  t1: LandmarkMap;
  t2: LandmarkMap;
  /** T2 → T1 registration (see analyses/superimposition#buildRegistration). */
  transform: Transform;
  /** The framed region of T1's coordinate space to render. */
  frame: Box;
  /** Registration marker, reference lines, labels and scale bar. */
  annotations: SuperimpositionAnnotations;
  /** Legend text: what the two hues are, and how they were registered. */
  t1Label: string;
  t2Label: string;
  registrationLabel: string;
  /** Elapsed time between the two capture dates, or null when unknown. */
  interval: string | null;
  /** Rotation/translation actually applied to T2, so the fit can be checked. */
  auditLabel: string;
  /** Patient identity line, so a detached PNG is still attributable. */
  patientLabel: string;
  /** Stated when the two films' magnification was assumed rather than known. */
  caveat: string | null;

  // ---- Optional: the treatment simulation's figure ---------------------------
  //
  // The simulation draws the same kind of two-layer figure — a reference
  // tracing with a second one over it — so it renders through this back-end
  // rather than a second canvas implementation. What it needs to override is
  // only what genuinely differs: the hues, the curves of the second layer, the
  // displacement arrows, and the sentences the legend closes with.

  /** Hue of the reference layer. Defaults to the superimposition's cyan. */
  t1Color?: string;
  /** Hue of the overlaid layer. Defaults to the superimposition's orange. */
  t2Color?: string;
  /**
   * Pre-built curves for the overlaid layer. The treatment simulation builds
   * its soft-tissue profile from a ratio-displaced map rather than from the
   * moved skeleton, and an export that rebuilt the curves from the landmarks
   * would silently disagree with the screen about how far the face moved.
   */
  t2Outlines?: Outline[];
  /** Symbols to dot on the overlaid layer. Defaults to every placed point. */
  t2DotSymbols?: string[];
  /**
   * Landmark symbols and outline ids, per layer, with no counterpart on the
   * other layer — drawn at reduced opacity rather than full weight, matching
   * the on-screen `.geometry__orphan` treatment
   * (`components/Superimposition/style.scss`) so the exported PNG reads the
   * same comparison the screen does. Defaults to nothing dimmed, which is what
   * every other caller of this back-end (the treatment simulation) wants: a
   * displaced plan has no second tracing to be an orphan against.
   */
  t1OrphanDotSymbols?: string[];
  t2OrphanDotSymbols?: string[];
  t1OrphanOutlineIds?: string[];
  t2OrphanOutlineIds?: string[];
  /** Displacement arrows drawn over the figure, in the frame's coordinates. */
  vectors?: Array<{ from: GeoPoint; to: GeoPoint }>;
  /**
   * Sentences closing the legend. Defaults to the superimposition's "nothing
   * here is predicted or simulated" — which a simulation must not print.
   */
  notes?: string[];
}

/**
 * Rendered width of the exported PNG.
 *
 * The framed region is a crop of T1's film measured in that film's own pixels,
 * so rendering it wider than `frame.width` upsamples the radiograph and hands
 * the clinician a blurred image. The export therefore runs at the film's native
 * resolution over the frame; the floor exists only so the legend type stays
 * legible on a very tight crop, and is the one place a small (≤1.4×) upsample
 * is accepted.
 */
const MIN_OUTPUT_WIDTH = 640;
const MAX_OUTPUT_WIDTH = 2400;

const outputWidthFor = (frame: Box): number => Math.round(Math.max(
  MIN_OUTPUT_WIDTH, Math.min(MAX_OUTPUT_WIDTH, frame.width),
));

/**
 * Opacity an orphan dot or outline is drawn at — a landmark or synthesised
 * shape with no counterpart on the other layer. Kept in step with
 * `.geometry__orphan`'s opacity in `components/Superimposition/style.scss`:
 * the two renderers draw the same dimming, so they must agree on the number.
 */
const ORPHAN_ALPHA = 0.34;

const drawTracing = (
  ctx: CanvasRenderingContext2D,
  points: { [symbol: string]: GeoPoint },
  color: string,
  scale: number,
  dotRadius: number,
  isDashed: boolean,
  builtOutlines?: Outline[],
  dotSymbols?: string[],
  orphanOutlineIds?: string[],
  orphanDotSymbols?: string[],
) => {
  const outlines = builtOutlines !== undefined
    ? builtOutlines
    : buildOutlines(points);
  const orphanOutlineSet = orphanOutlineIds !== undefined ? orphanOutlineIds : [];
  const orphanDotSet = orphanDotSymbols !== undefined ? orphanDotSymbols : [];
  const alphaFor = (isOrphan: boolean) => (isOrphan ? ORPHAN_ALPHA : 1);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Dark casing under the light stroke so both tracings read over bright bone.
  ctx.setLineDash([]);
  ctx.strokeStyle = CASING;
  ctx.lineWidth = 4.4 / scale;
  outlines.forEach((outline) => {
    ctx.globalAlpha = alphaFor(orphanOutlineSet.indexOf(outline.id) !== -1);
    strokeOutlineOnCanvas(ctx, outline);
  });
  if (isDashed) {
    ctx.setLineDash([T2_DASH[0] / scale, T2_DASH[1] / scale]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1 / scale;
  outlines.forEach((outline) => {
    ctx.globalAlpha = alphaFor(orphanOutlineSet.indexOf(outline.id) !== -1);
    strokeOutlineOnCanvas(ctx, outline);
  });
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  ctx.strokeStyle = CANVAS_BG;
  ctx.lineWidth = 1.4 / scale;
  (dotSymbols !== undefined ? dotSymbols : Object.keys(points)).forEach((symbol) => {
    const p = points[symbol];
    if (p === undefined) {
      return;
    }
    ctx.globalAlpha = alphaFor(orphanDotSet.indexOf(symbol) !== -1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
};

/**
 * The annotation layer: the matched reference line of each timepoint, the
 * registration marker, the names of the registration landmarks and the
 * millimetre scale bar. Drawn in device pixels (after the frame transform has
 * been undone) so type and hairlines keep a constant size whatever the crop.
 */
const drawAnnotations = (
  ctx: CanvasRenderingContext2D,
  input: SuperimpositionSnapshotInput,
  scale: number,
  imageHeight: number,
) => {
  const { frame, annotations } = input;
  const toDev = (p: GeoPoint) => ({
    x: (p.x - frame.x) * scale,
    y: (p.y - frame.y) * scale,
  });
  const width = frame.width * scale;
  const fontSize = Math.max(11, Math.round(width / 38));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, imageHeight);
  ctx.clip();

  const line = (
    ends: [GeoPoint, GeoPoint], color: string, dashed: boolean,
  ) => {
    const a = toDev(ends[0]);
    const b = toDev(ends[1]);
    ctx.setLineDash(dashed ? [7, 4.5] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  ctx.globalAlpha = 0.9;
  if (annotations.t1Basis !== null) {
    line(annotations.t1Basis, T1_COLOR, false);
  }
  if (annotations.t2Basis !== null) {
    line(annotations.t2Basis, T2_COLOR, true);
  }
  ctx.globalAlpha = 1;

  const label = (text: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fontSize / 3;
    ctx.strokeStyle = ANNOTATION_HALO;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = ANNOTATION;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  };

  if (annotations.origin !== null) {
    const o = toDev(annotations.origin);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = ANNOTATION;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(o.x, o.y, fontSize * 0.7, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  annotations.labels.forEach(({ symbol, point }) => {
    const p = toDev(point);
    const text = symbol === annotations.originSymbol
      ? `${symbol} — registration`
      : symbol;
    label(text, p.x + fontSize * 0.9, p.y - fontSize * 0.9, 'left');
  });

  // Displacement arrows: where a landmark was, where the plan puts it. Drawn in
  // device pixels so the head keeps a constant size whatever the crop.
  if (input.vectors !== undefined) {
    ctx.strokeStyle = ANNOTATION;
    ctx.fillStyle = ANNOTATION;
    ctx.lineWidth = 1.3;
    const head = fontSize * 0.62;
    input.vectors.forEach(({ from, to }) => {
      const a = toDev(from);
      const b = toDev(to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < head * 1.4) {
        return;
      }
      const ux = dx / len;
      const uy = dy / len;
      const bx = b.x - ux * head;
      const by = b.y - uy * head;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(bx - uy * head * 0.45, by + ux * head * 0.45);
      ctx.lineTo(bx + uy * head * 0.45, by - ux * head * 0.45);
      ctx.closePath();
      ctx.fill();
    });
  }

  const { scaleBar } = annotations;
  if (scaleBar !== null) {
    const pad = Math.round(width * 0.035);
    const y = imageHeight - pad;
    const x0 = pad;
    const x1 = pad + scaleBar.px * scale;
    ctx.strokeStyle = ANNOTATION;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.moveTo(x0, y - fontSize * 0.35);
    ctx.lineTo(x0, y + fontSize * 0.35);
    ctx.moveTo(x1, y - fontSize * 0.35);
    ctx.lineTo(x1, y + fontSize * 0.35);
    ctx.stroke();
    label(`${scaleBar.mm} mm`, (x0 + x1) / 2, y - fontSize, 'center');
  }

  ctx.restore();
};

/** Legend geometry: every line is full width, so nothing collides on a crop. */
const legendLines = (input: SuperimpositionSnapshotInput): string[][] => {
  const lines: string[][] = [];
  const registration = [input.registrationLabel];
  if (input.interval !== null) {
    registration.push(`${input.interval} apart`);
  }
  lines.push(registration);
  lines.push([input.auditLabel]);
  if (input.caveat !== null) {
    lines.push([input.caveat]);
  }
  if (input.notes !== undefined) {
    input.notes.forEach((note) => lines.push([note]));
  } else {
    lines.push([
      'Both tracings are the plotted landmarks — nothing here is predicted ' +
      'or simulated.',
    ]);
  }
  if (input.patientLabel !== '') {
    lines.push([input.patientLabel]);
  }
  return lines;
};

/**
 * Greedy word wrap against a measured context. Canvas does not wrap text, so
 * without this a legend sentence longer than the crop is simply cut off at the
 * edge of the PNG — and the sentence most likely to be long is the one stating
 * what the figure may not be read as.
 */
const wrapText = (
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current !== '') {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
};

interface LegendRow { text: string; isHead: boolean; }

const legendMetrics = (width: number, input: SuperimpositionSnapshotInput) => {
  const s = Math.max(0.62, Math.min(1.25, width / 1000));
  const pad = Math.round(20 * s);
  const swatchLine = Math.round(30 * s);
  const noteLine = Math.round(24 * s);
  const left = pad + Math.round(8 * s);
  const maxWidth = Math.max(80, width - left - pad * 2);
  const noteSize = Math.round(16 * s);
  // A throwaway context purely for text measurement: the legend's height has to
  // be known before the real canvas is sized.
  const measure = document.createElement('canvas').getContext('2d');
  const rows: LegendRow[] = [];
  legendLines(input).forEach((parts, index) => {
    const text = parts.join(' · ');
    const isHead = index === 0;
    if (measure === null) {
      rows.push({ text, isHead });
      return;
    }
    measure.font = `${isHead ? 600 : 400} ${noteSize}px ${FONT_STACK}`;
    wrapText(measure, text, maxWidth).forEach((line) => {
      rows.push({ text: line, isHead });
    });
  });
  return {
    s,
    pad,
    left,
    noteSize,
    swatchLine,
    noteLine,
    rows,
    height: pad * 2 + swatchLine * 2 + noteLine * rows.length,
  };
};

const drawLegend = (
  ctx: CanvasRenderingContext2D,
  input: SuperimpositionSnapshotInput,
  width: number,
  top: number,
) => {
  const m = legendMetrics(width, input);
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, top, width, m.height);
  ctx.fillStyle = 'rgba(255, 255, 255, .08)';
  ctx.fillRect(0, top, width, 1);

  const left = m.left;
  let y = top + m.pad + m.swatchLine / 2;
  ctx.textBaseline = 'middle';

  const swatch = (color: string, text: string, dashed: boolean) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, 3 * m.s);
    ctx.setLineDash(dashed ? [7 * m.s, 4.5 * m.s] : []);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + 36 * m.s, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PANEL_TEXT;
    ctx.font = `600 ${Math.round(20 * m.s)}px ${FONT_STACK}`;
    ctx.fillText(text, left + 48 * m.s, y);
    y += m.swatchLine;
  };

  swatch(
    input.t1Color !== undefined ? input.t1Color : T1_COLOR,
    input.t1Label, false,
  );
  swatch(
    input.t2Color !== undefined ? input.t2Color : T2_COLOR,
    input.t2Label, true,
  );

  y += m.noteLine / 2 - m.swatchLine / 2;
  m.rows.forEach(({ text, isHead }) => {
    ctx.fillStyle = isHead ? PANEL_TEXT : PANEL_TEXT_DIM;
    ctx.font = `${isHead ? 600 : 400} ${m.noteSize}px ${FONT_STACK}`;
    ctx.fillText(text, left, y);
    y += m.noteLine;
  });
};

const compose = (
  input: SuperimpositionSnapshotInput,
  film: HTMLImageElement | null,
): Promise<Blob | null> => new Promise((resolve) => {
  const { frame } = input;
  const outputWidth = outputWidthFor(frame);
  const scale = outputWidth / frame.width;
  const imageHeight = Math.round(frame.height * scale);
  const legendHeight = legendMetrics(outputWidth, input).height;
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = imageHeight + legendHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    resolve(null);
    return;
  }
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Map the framed region of T1's coordinate space onto the canvas.
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, imageHeight);
  ctx.clip();
  ctx.scale(scale, scale);
  ctx.translate(-frame.x, -frame.y);

  if (film !== null && input.filmWidth !== null && input.filmHeight !== null) {
    ctx.save();
    ctx.globalAlpha = FILM_OPACITY;
    ctx.drawImage(film, 0, 0, input.filmWidth, input.filmHeight);
    ctx.restore();
  }

  const dotRadius = frame.width / 260;
  drawTracing(ctx, transformLandmarks(input.t1, {
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
  }), input.t1Color !== undefined ? input.t1Color : T1_COLOR,
    scale, dotRadius, false, undefined, undefined,
    input.t1OrphanOutlineIds, input.t1OrphanDotSymbols);
  drawTracing(
    ctx, transformLandmarks(input.t2, input.transform),
    input.t2Color !== undefined ? input.t2Color : T2_COLOR,
    scale, dotRadius, true,
    input.t2Outlines, input.t2DotSymbols,
    input.t2OrphanOutlineIds, input.t2OrphanDotSymbols,
  );
  ctx.restore();

  drawAnnotations(ctx, input, scale, imageHeight);
  drawLegend(ctx, input, canvas.width, imageHeight);
  canvas.toBlob((blob) => resolve(blob), 'image/png');
});

/**
 * Composites the superimposition to a PNG blob, ready to save. Resolves with
 * null when a 2D context is unavailable; a film that fails to load is simply
 * omitted (the two tracings alone are still a valid superimposition).
 */
export const renderSuperimpositionSnapshot = (
  input: SuperimpositionSnapshotInput,
): Promise<Blob | null> => {
  if (input.filmSrc === null) {
    return compose(input, null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => compose(input, img).then(resolve);
    img.onerror = () => compose(input, null).then(resolve);
    img.src = input.filmSrc as string;
  });
};

export default renderSuperimpositionSnapshot;
