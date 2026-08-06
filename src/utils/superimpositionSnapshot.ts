import {
  buildOutlines,
  strokeOutlineOnCanvas,
} from 'components/TracingViewer/outlines';

import {
  Box,
  LandmarkMap,
  Transform,
  transformLandmarks,
} from 'analyses/superimposition';

/**
 * Rasterised superimposition, for the PNG export.
 *
 * The geometry comes from exactly the modules the screen uses — the outlines
 * from `TracingViewer/outlines.ts`, the registration transform from
 * `analyses/superimposition.ts` — so the exported image is the view, not a
 * lookalike. Only the drawing back-end differs (canvas here, SVG on screen),
 * which is the same split `utils/tracingSnapshot.ts` already uses for the
 * single-tracing export.
 */

/** T1 hue (cyan) and T2 hue (deep orange) — shared with the on-screen view. */
export const T1_COLOR = '#40C4FF';
export const T2_COLOR = '#FF8A65';
export const FILM_OPACITY = 0.34;
const CASING = 'rgba(20, 24, 29, 0.6)';
const PANEL_BG = '#1E242B';
const CANVAS_BG = '#14181D';
const PANEL_TEXT = '#C7D0D9';
const PANEL_TEXT_DIM = 'rgba(199, 208, 217, 0.72)';

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
  /** Legend text: what the two hues are, and how they were registered. */
  t1Label: string;
  t2Label: string;
  registrationLabel: string;
  /** Patient identity line, so a detached PNG is still attributable. */
  patientLabel: string;
  /** Stated when the two films' magnification was assumed rather than known. */
  caveat: string | null;
}

/** Rendered width of the exported PNG; height follows the frame's aspect. */
const OUTPUT_WIDTH = 1600;
const LEGEND_HEIGHT = 108;

const drawTracing = (
  ctx: CanvasRenderingContext2D,
  points: { [symbol: string]: GeoPoint },
  color: string,
  scale: number,
  dotRadius: number,
) => {
  const outlines = buildOutlines(points);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Dark casing under the light stroke so both tracings read over bright bone.
  ctx.strokeStyle = CASING;
  ctx.lineWidth = 4.4 / scale;
  outlines.forEach((outline) => strokeOutlineOnCanvas(ctx, outline));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1 / scale;
  outlines.forEach((outline) => strokeOutlineOnCanvas(ctx, outline));

  ctx.fillStyle = color;
  ctx.strokeStyle = CANVAS_BG;
  ctx.lineWidth = 1.4 / scale;
  Object.keys(points).forEach((symbol) => {
    const p = points[symbol];
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });
};

const drawLegend = (
  ctx: CanvasRenderingContext2D,
  input: SuperimpositionSnapshotInput,
  width: number,
  top: number,
) => {
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, top, width, LEGEND_HEIGHT);
  ctx.fillStyle = 'rgba(255, 255, 255, .08)';
  ctx.fillRect(0, top, width, 1);

  const swatch = (y: number, color: string, text: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(64, y);
    ctx.stroke();
    ctx.fillStyle = PANEL_TEXT;
    ctx.font = `600 20px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 76, y);
  };

  swatch(top + 30, T1_COLOR, input.t1Label);
  swatch(top + 62, T2_COLOR, input.t2Label);

  ctx.textAlign = 'right';
  ctx.fillStyle = PANEL_TEXT;
  ctx.font = `600 18px ${FONT_STACK}`;
  ctx.fillText(input.registrationLabel, width - 28, top + 30);
  ctx.fillStyle = PANEL_TEXT_DIM;
  ctx.font = `400 16px ${FONT_STACK}`;
  ctx.fillText(input.patientLabel, width - 28, top + 58);
  if (input.caveat !== null) {
    ctx.fillText(input.caveat, width - 28, top + 84);
  }
  ctx.textAlign = 'left';
};

const compose = (
  input: SuperimpositionSnapshotInput,
  film: HTMLImageElement | null,
): Promise<Blob | null> => new Promise((resolve) => {
  const { frame } = input;
  const scale = OUTPUT_WIDTH / frame.width;
  const imageHeight = Math.round(frame.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_WIDTH;
  canvas.height = imageHeight + LEGEND_HEIGHT;
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
  }), T1_COLOR, scale, dotRadius);
  drawTracing(
    ctx, transformLandmarks(input.t2, input.transform),
    T2_COLOR, scale, dotRadius,
  );
  ctx.restore();

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
