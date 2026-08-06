import { Segment } from 'analyses/profilogram';
import { isGeoPoint } from 'utils/math';
import {
  buildOutlines,
  strokeOutlineOnCanvas,
  OUTLINE_COLOR,
  OUTLINE_OPACITY,
} from 'components/TracingViewer/outlines';

/**
 * Shared canvas composition for the tracing overlay (profilogram lines +
 * landmark points), used by both the image export middleware and the printable
 * clinical report so the two always look identical. Colors match the on-screen
 * tracing (see TracingViewer/style.scss): amber landmark dots with a dark halo
 * stroke, cyan profilogram lines — both read on gray radiographs.
 */
export const PROFILOGRAM_COLOR = '#40C4FF';
export const POINT_FILL = '#FFC400';
export const POINT_STROKE = '#14181D';

export type ManualLandmarks = { [symbol: string]: GeoObject | undefined };

/**
 * Draws the tracing overlay onto a canvas that already contains the radiograph
 * at its native resolution. Sizing is relative to the image width so the
 * overlay reads the same whatever the image's resolution.
 */
export const drawTracingOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  manual: ManualLandmarks,
  segments: Segment[],
): void => {
  const lineWidth = Math.max(1.5, width * 0.0028);
  const pointRadius = Math.max(2.5, width * 0.006);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Anatomical outline tracings (soft-tissue profile, mandible, maxilla, sella,
  // orbital rim, ear-rod) — shared geometry with the on-screen SVG overlay
  // (see components/TracingViewer/outlines.ts). Drawn first so the measurement
  // segments and landmark dots sit on top. Thin fine strokes, like a hand
  // tracing.
  const outlines = buildOutlines(manual);
  if (outlines.length > 0) {
    const outlineWidth = Math.max(1, width * 0.0018);
    ctx.save();
    // Dark casing under the fine light stroke, so it reads on bright bone.
    ctx.strokeStyle = 'rgba(20, 24, 29, 0.55)';
    ctx.lineWidth = outlineWidth + Math.max(1.4, width * 0.0022);
    outlines.forEach((outline) => strokeOutlineOnCanvas(ctx, outline));
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.globalAlpha = OUTLINE_OPACITY;
    ctx.lineWidth = outlineWidth;
    outlines.forEach((outline) => strokeOutlineOnCanvas(ctx, outline));
    ctx.restore();
  }

  ctx.strokeStyle = PROFILOGRAM_COLOR;
  ctx.lineWidth = lineWidth;
  segments.forEach((s) => {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  });

  ctx.fillStyle = POINT_FILL;
  ctx.strokeStyle = POINT_STROKE;
  ctx.lineWidth = Math.max(1, pointRadius * 0.25);
  Object.keys(manual).forEach((symbol) => {
    const p = manual[symbol];
    if (isGeoPoint(p)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, pointRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  });
};

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
): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      drawTracingOverlay(ctx, width, manual, segments);
      // JPEG keeps the embedded data URL small; the source is a photographic
      // radiograph, so the quality loss is invisible on paper.
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
};
