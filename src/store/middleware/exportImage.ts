import { Store, Middleware } from 'redux';
import { saveAs } from 'file-saver';

import { isActionOfType } from 'utils/store';
import {
  getImageSrc,
  getImageWidth,
  getImageHeight,
  getImageName,
  getManualLandmarks,
  getScaleFactor,
} from 'store/reducers/workspace/image';
import { getLandmarksToDisplay } from 'store/reducers/workspace';
import { isProfilogramShown } from 'store/reducers/workspace/canvas';
import { getActivePatient } from 'store/reducers/patients';
import { buildProfilogram, Segment } from 'analyses/profilogram';
import { isGeoVector } from 'utils/math';
// The overlay composition (colors + drawing) is shared with the printable
// clinical report — see utils/tracingSnapshot.ts.
import { drawTracingOverlay, drawScaleBar, sanitizeFilenameStem } from 'utils/tracingSnapshot';

const baseName = (name: string | null): string => {
  if (!name) {
    return 'tracing';
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}-tracing`;
};

/**
 * Renders the current tracing (raster image + profilogram + landmark points) to
 * an offscreen canvas at the image's native resolution and saves it as PNG or
 * JPEG. Drawing from the stored coordinates — rather than serialising the live
 * SVG — keeps the output independent of the on-screen zoom and CSS, and lets
 * JPEG have an opaque background (the image fills the canvas).
 */
const middleware = ({ getState }: Store<StoreState>) =>
  (next: GenericDispatch) => (action: GenericAction) => {
    if (!isActionOfType(action, 'EXPORT_IMAGE_REQUESTED')) {
      return next(action);
    }
    next(action);

    const state = getState();
    const { imageId, format } = action.payload;

    const src = getImageSrc(state)(imageId);
    const width = getImageWidth(state)(imageId) as number;
    const height = getImageHeight(state)(imageId) as number;
    if (!src || !width || !height) {
      return;
    }

    const manual = getManualLandmarks(state)(imageId);
    const showProfilogram = isProfilogramShown(state);
    // The exported figure carries what the editor shows: the active analysis'
    // planes and construction lines, not just the anatomy. A clinician exports
    // this file to hand the *analysis* to someone — an unadorned film is what
    // the original already is.
    const display = getLandmarksToDisplay(state)(imageId);
    const analysisSegments: Segment[] = [];
    Object.keys(display).forEach((symbol) => {
      const l = display[symbol];
      if (isGeoVector(l)) {
        analysisSegments.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 });
      }
    });
    const segments = showProfilogram
      ? [...analysisSegments, ...buildProfilogram(manual)]
      : analysisSegments;
    const scaleFactor = getScaleFactor(state)(imageId);
    // Prefer the active patient (chart id / name) for the filename so exports are
    // filed against the patient; fall back to the image name.
    const patient = getActivePatient(state);
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    // Only characters an actual filesystem path cannot carry are sanitised
    // away — same rule as the `.wceph` case file export — so a Japanese
    // patient's name survives, e.g. `C-0001 山田 太郎-tracing.png` rather than
    // losing the name entirely. See `sanitizeFilenameStem`.
    const stem = patient
      ? sanitizeFilenameStem([patient.chartId, patient.name])
      : sanitizeFilenameStem([baseName(getImageName(state)(imageId))]);
    const filename = `${stem || 'tracing'}-tracing.${ext}`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      // Labelled like the printed report's figure — the export stands alone in
      // somebody else's viewer, where an unlabelled dot answers nothing.
      drawTracingOverlay(ctx, width, manual, segments, {
        labels: true,
        pointLandmarks: display,
      });
      // Same rule as the printed report: a ruler from the calibration only —
      // an uncalibrated film gets no bar rather than an invented one.
      if (scaleFactor !== null) {
        drawScaleBar(ctx, { x: 0, y: 0, width, height }, scaleFactor);
      }

      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob(
        (blob) => {
          if (blob !== null) {
            saveAs(blob, filename);
          }
        },
        mime,
        format === 'jpeg' ? 0.92 : undefined,
      );
    };
    img.src = src;
  };

export default middleware as Middleware;
