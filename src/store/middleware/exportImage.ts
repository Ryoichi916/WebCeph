import { Store, Middleware } from 'redux';
import { saveAs } from 'file-saver';

import { isActionOfType } from 'utils/store';
import {
  getImageSrc,
  getImageWidth,
  getImageHeight,
  getImageName,
  getManualLandmarks,
} from 'store/reducers/workspace/image';
import { isProfilogramShown } from 'store/reducers/workspace/canvas';
import { getActivePatient } from 'store/reducers/patients';
import { buildProfilogram } from 'analyses/profilogram';
// The overlay composition (colors + drawing) is shared with the printable
// clinical report — see utils/tracingSnapshot.ts.
import { drawTracingOverlay } from 'utils/tracingSnapshot';

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
    const segments = showProfilogram ? buildProfilogram(manual) : [];
    // Prefer the active patient (chart id / name) for the filename so exports are
    // filed against the patient; fall back to the image name.
    const patient = getActivePatient(state);
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const stem = patient
      ? [patient.chartId, patient.name].filter(Boolean).join('_').replace(/[^\w.\-]+/g, '_')
      : baseName(getImageName(state)(imageId));
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
      drawTracingOverlay(ctx, width, manual, segments);

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
