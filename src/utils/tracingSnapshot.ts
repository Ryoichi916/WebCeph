import { Segment } from 'analyses/profilogram';
import { isGeoPoint } from 'utils/math';
import {
  buildOutlines,
  strokeOutlineOnCanvas,
  OUTLINE_PRINT_COLOR,
} from 'components/TracingViewer/outlines';
import {
  computeLabelPlacements,
  getShortLabel,
  LabelPoint,
  LineSegment,
  LABEL_FONT_FAMILY,
} from 'components/TracingViewer/labels';

/**
 * Shared canvas composition for the tracing overlay, used by both the image
 * export middleware and the printable clinical report so the two always look
 * identical.
 *
 * The layer order is the one a commercial cephalometric report uses, and it is
 * the reverse of the editor's: the **anatomical outline** is the primary
 * graphic and is drawn at full weight in near-white, while the **analysis
 * planes** are thin and desaturated behind it. On screen those planes are the
 * thing being edited, so they lead; on a printed film they are construction
 * lines over somebody's face, and a saturated cyan web of them buries the
 * tracing the reader came for.
 */
/** Analysis planes / construction lines: thin, desaturated, behind everything. */
export const PLANE_COLOR = '#93AEC6';
export const POINT_FILL = '#FFC400';
export const POINT_STROKE = '#14181D';
/** Colour of the landmark tag and of its dark halo. */
const LABEL_FILL = '#FFFFFF';
const LABEL_HALO = 'rgba(12, 16, 21, 0.88)';

export type ManualLandmarks = { [symbol: string]: GeoObject | undefined };

export interface TracingOverlayOptions {
  /**
   * The landmarks whose dots (and labels) are drawn, when that is a subset of
   * the tracing. The single-analysis report passes the active analysis' own
   * landmarks: a film captioned "Downs" may not be plastered with the other
   * eight analyses' points. The outlines are always built from the full
   * tracing — the anatomy does not belong to one analysis.
   */
  pointLandmarks?: ManualLandmarks;
  /**
   * Write each point's symbol next to it, laid out by the editor's own
   * collision-aware label layer (components/TracingViewer/labels). An
   * unlabelled film is a picture; a labelled one is a clinical figure.
   */
  labels?: boolean;
  /** Tag size in image pixels. Defaults to a size legible at print scale. */
  labelFontSize?: number;
}

const NO_OPTIONS: TracingOverlayOptions = {};

/**
 * Draws the tracing overlay onto a canvas that already contains the radiograph.
 * Sizing is relative to `width` — the width the drawing will be *seen* at
 * (the crop's width when the film is cropped), not necessarily the image's —
 * so the overlay reads the same whatever the radiograph's resolution.
 */
export const drawTracingOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  manual: ManualLandmarks,
  segments: Segment[],
  options: TracingOverlayOptions = NO_OPTIONS,
): void => {
  const { pointLandmarks = manual, labels = false } = options;
  const planeWidth = Math.max(0.9, width * 0.0017);
  const outlineWidth = Math.max(1.8, width * 0.0042);
  const pointRadius = Math.max(2, width * 0.0052);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Analysis planes / construction lines. Bottom of the stack, thin and
  //    desaturated: present for reference, never competing with the anatomy.
  if (segments.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(12, 16, 21, 0.45)';
    ctx.lineWidth = planeWidth + Math.max(1, width * 0.0012);
    segments.forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    });
    ctx.strokeStyle = PLANE_COLOR;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = planeWidth;
    segments.forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // 2. Anatomical outline tracings (soft-tissue profile, mandible, maxilla,
  //    sella, orbital rim, ear-rod) — shared geometry with the on-screen SVG
  //    overlay (see components/TracingViewer/outlines.ts). The heaviest,
  //    highest-contrast layer on the film.
  const outlines = buildOutlines(manual);
  if (outlines.length > 0) {
    ctx.save();
    // Dark casing under the light stroke, so it reads on bright bone too.
    ctx.strokeStyle = 'rgba(12, 16, 21, 0.75)';
    ctx.lineWidth = outlineWidth + Math.max(1.6, width * 0.0026);
    outlines.forEach((outline) => strokeOutlineOnCanvas(ctx, outline));
    ctx.strokeStyle = OUTLINE_PRINT_COLOR;
    ctx.globalAlpha = 0.97;
    ctx.lineWidth = outlineWidth;
    outlines.forEach((outline) => strokeOutlineOnCanvas(ctx, outline));
    ctx.restore();
  }

  // 3. Landmark dots.
  const points: LabelPoint[] = [];
  Object.keys(pointLandmarks).forEach((symbol) => {
    const p = pointLandmarks[symbol];
    if (isGeoPoint(p)) {
      points.push({ symbol, x: p.x, y: p.y });
    }
  });
  ctx.save();
  ctx.fillStyle = POINT_FILL;
  ctx.strokeStyle = POINT_STROKE;
  ctx.lineWidth = Math.max(0.8, pointRadius * 0.3);
  points.forEach(({ x, y }) => {
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();

  // 4. Landmark tags, laid out by the editor's collision-aware label layer.
  if (labels && points.length > 0) {
    drawLabels(ctx, width, points, segments, options.labelFontSize);
  }
};

/**
 * Writes each landmark's symbol beside its dot, using the shared placement
 * layer so the tags dodge each other, the dots and the planes exactly as they
 * do on screen. Text is measured with the real canvas metrics rather than
 * estimated, which the SVG overlay cannot do.
 */
const drawLabels = (
  ctx: CanvasRenderingContext2D,
  width: number,
  points: LabelPoint[],
  segments: Segment[],
  requestedFontSize?: number,
): void => {
  // Sized against the width the film will be *printed* at: at 150 mm on A4 the
  // crop is reproduced at roughly 567 CSS px, so this lands the tag at about
  // 9.5 pt on paper whatever the radiograph's resolution.
  const fontSize = requestedFontSize !== undefined
    ? requestedFontSize
    : Math.max(9, width * 0.0224);
  const font = `600 ${fontSize}px ${LABEL_FONT_FAMILY}`;
  ctx.save();
  ctx.font = font;
  const lines: LineSegment[] = segments.map(
    ({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }),
  );
  const placements = computeLabelPlacements(points, lines, {
    fontSize,
    dotRadius: Math.max(2, width * 0.0052) + fontSize * 0.25,
    measureText: (text) => ctx.measureText(text).width,
  });
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  points.forEach(({ symbol, x, y }) => {
    const p = placements[symbol];
    if (p === undefined) {
      return;
    }
    const labelX = x + p.dx;
    const labelY = y + p.dy;
    if (p.far) {
      // Leader back to the dot, so a displaced tag is never ambiguous.
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 232, 242, 0.75)';
      ctx.lineWidth = Math.max(0.6, fontSize * 0.07);
      ctx.beginPath();
      ctx.moveTo(x + (p.dx > 0 ? 1 : -1) * fontSize * 0.5,
                 y + (p.dy > 0 ? 1 : -1) * fontSize * 0.4);
      ctx.lineTo(labelX + (p.dx > 0 ? -2 : 2), labelY - fontSize * 0.3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.textAlign = p.anchor === 'start' ? 'left'
      : p.anchor === 'end' ? 'right' : 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = LABEL_HALO;
    ctx.lineWidth = Math.max(2, fontSize * 0.34);
    ctx.strokeText(getShortLabel(symbol), labelX, labelY);
    ctx.fillStyle = LABEL_FILL;
    ctx.fillText(getShortLabel(symbol), labelX, labelY);
  });
  ctx.restore();
};

/**
 * Padding kept around the traced region when cropping, as a fraction of the
 * traced *height* on every side, so the margin is the same width all round
 * rather than proportional to each axis.
 */
const CROP_PADDING = 0.10;
/**
 * Extra headroom above the tracing. No landmark and no outline reaches the
 * cranial vault or the frontal soft tissue, so a box drawn around the tracing
 * alone saws the top of the skull off — the single most obvious sign that a
 * figure was cropped by a machine.
 */
const CROP_PADDING_TOP = 0.22;
/**
 * Width : height the crop is nudged towards, by widening (never by cutting).
 *
 * The printed figure is height-limited — a page has a fixed amount of room
 * under the patient block — so a crop much taller than it is wide prints
 * *narrow*, leaving the page half empty beside a thin strip of film. Padding
 * the sides out towards this ratio spends the spare room on more film instead.
 * The box is only ever grown, and always clamped to the radiograph, so no
 * anatomy is lost and the image is never scaled anisotropically.
 */
const CROP_TARGET_ASPECT = 0.86;
/** Below this many placed points a bounding box is not representative. */
const CROP_MIN_POINTS = 4;

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The region of the film that carries the tracing, padded generously and
 * clamped to the image. A lateral ceph is mostly empty field: printed whole it
 * reduces the anatomy to a stamp in the middle of a black rectangle. Returns
 * `null` when there is too little tracing to crop around, in which case the
 * whole film is used.
 *
 * The box is taken around the landmarks *and* the anatomical outlines — the
 * soft-tissue silhouette runs anterior to every skeletal point, so a box drawn
 * around the points alone cuts the nose and the chin profile off the figure.
 */
const contentCrop = (
  manual: ManualLandmarks, width: number, height: number,
): Crop | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  Object.keys(manual).forEach((symbol) => {
    const p = manual[symbol];
    if (!isGeoPoint(p)) {
      return;
    }
    count += 1;
    include(p.x, p.y);
  });
  if (count < CROP_MIN_POINTS || maxX <= minX || maxY <= minY) {
    return null;
  }
  buildOutlines(manual).forEach((outline) => {
    outline.points.forEach(([x, y]) => include(x, y));
  });
  const traced = maxY - minY;
  const pad = traced * CROP_PADDING;
  const padTop = traced * CROP_PADDING_TOP;
  let left = Math.max(0, Math.floor(minX - pad));
  let right = Math.min(width, Math.ceil(maxX + pad));
  const top = Math.max(0, Math.floor(minY - padTop));
  const bottom = Math.min(height, Math.ceil(maxY + pad));
  // Widen towards the target ratio, symmetrically, giving whatever one side
  // cannot take (the film's edge) to the other.
  const wanted = (bottom - top) * CROP_TARGET_ASPECT;
  let deficit = wanted - (right - left);
  if (deficit > 0) {
    const takeLeft = Math.min(left, deficit / 2);
    left -= takeLeft;
    deficit -= takeLeft;
    const takeRight = Math.min(width - right, deficit);
    right += takeRight;
    deficit -= takeRight;
    if (deficit > 0) {
      left = Math.max(0, left - deficit);
    }
  }
  return {
    x: Math.floor(left),
    y: top,
    width: Math.ceil(right) - Math.floor(left),
    height: bottom - top,
  };
};

export interface TracingSnapshotOptions extends TracingOverlayOptions {
  /**
   * Limit the canvas to the traced region plus padding, which is what the
   * printed report wants: the film then fills the space the page gives it
   * instead of surrounding the anatomy with empty field. The tracing itself is
   * drawn identically either way.
   */
  crop?: boolean;
}

/**
 * Composites the radiograph + tracing overlay to an offscreen canvas and
 * resolves with a data URL, for embedding the traced image in documents
 * (e.g. the printable clinical report). Resolves with `null` when the image
 * fails to load or a 2D context is unavailable.
 */
export const renderTracingSnapshot = (
  src: string,
  width: number,
  height: number,
  manual: ManualLandmarks,
  segments: Segment[],
  options: TracingSnapshotOptions = NO_OPTIONS,
): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const crop = options.crop === true
        ? contentCrop(manual, width, height)
        : null;
      const canvas = document.createElement('canvas');
      canvas.width = crop !== null ? crop.width : width;
      canvas.height = crop !== null ? crop.height : height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        resolve(null);
        return;
      }
      if (crop !== null) {
        // Draw in image coordinates, with the crop's origin at the canvas'.
        ctx.translate(-crop.x, -crop.y);
      }
      ctx.drawImage(img, 0, 0, width, height);
      // Overlay weights follow the width the drawing is *reproduced* at, which
      // for a cropped film is the crop's width, not the radiograph's.
      drawTracingOverlay(
        ctx, crop !== null ? crop.width : width, manual, segments, options,
      );
      // JPEG keeps the embedded data URL small; the source is a photographic
      // radiograph, so the quality loss is invisible on paper.
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
};
