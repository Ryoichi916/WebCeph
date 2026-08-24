import { Store, Middleware } from 'redux';

import { isActionOfType } from 'utils/store';
import {
  getImageSrc,
  getImageWidth,
  getImageHeight,
  getImageName,
  getManualLandmarks,
  getScaleFactor,
  getImageTimepoint,
  getImageCaptureDate,
} from 'store/reducers/workspace/image';
import { getLandmarksToDisplay } from 'store/reducers/workspace';
import { isProfilogramShown } from 'store/reducers/workspace/canvas';
import { getActivePatient } from 'store/reducers/patients';
import { buildProfilogram, Segment } from 'analyses/profilogram';
import { isGeoVector } from 'utils/math';
import { getTimepointToken, formatCaptureDate } from 'utils/records';
// The overlay composition (colors + drawing) is shared with the printable
// clinical report — see utils/tracingSnapshot.ts. `saveBlobAs` replaces
// `file-saver`'s saveAs(): see its doc comment for why (a webpack chunk
// boundary between file-saver and its caller silently drops the filename).
import {
  drawTracingOverlay, drawScaleBar, sanitizeFilenameStem, saveBlobAs,
} from 'utils/tracingSnapshot';

// The bare stem only — the caller's own `${stem}-tracing.${ext}` template is
// the one place "-tracing" gets appended, for both this fallback and the
// patient-identity stem beside it. Appending it here too doubled it up:
// "sample-tracing T1 2026-08-24-tracing.png".
const baseName = (name: string | null): string => {
  if (!name) {
    return 'tracing';
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
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
    // The visit token (T1, T2, …) and capture date, the same way the
    // Superimposition view already labels each side of a comparison — without
    // either, exporting more than one timepoint of the same patient in a
    // session writes every tracing to the identical filename ("C-0001
    // 山田 太郎-tracing.png" for T1 and T2 alike), and the browser's silent
    // "(1)" suffix is the only thing left to tell them apart once separated
    // from download order.
    const visitLabel = sanitizeFilenameStem([
      getTimepointToken(getImageTimepoint(state)(imageId)),
      formatCaptureDate(getImageCaptureDate(state)(imageId)),
    ]);
    // Only characters an actual filesystem path cannot carry are sanitised
    // away — same rule as the `.wceph` case file export — so a Japanese
    // patient's name survives, e.g. `C-0001 山田 太郎-tracing.png` rather than
    // losing the name entirely. See `sanitizeFilenameStem`.
    const stem = patient
      ? sanitizeFilenameStem([patient.chartId, patient.name, visitLabel])
      : sanitizeFilenameStem([baseName(getImageName(state)(imageId)), visitLabel]);
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
            saveBlobAs(blob, filename);
          }
        },
        mime,
        format === 'jpeg' ? 0.92 : undefined,
      );
    };
    img.src = src;
  };

export default middleware as Middleware;
