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
import { buildProfilogram } from 'analyses/profilogram';
import { isGeoPoint } from 'utils/math';

const PROFILOGRAM_COLOR = '#00e5ff';
const POINT_STROKE = '#05323a';

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
    const filename = `${baseName(getImageName(state)(imageId))}.${format === 'jpeg' ? 'jpg' : 'png'}`;

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

      // Size the overlay relative to the image so it reads the same as on screen
      // whatever the image's native resolution.
      const lineWidth = Math.max(1.5, width * 0.0028);
      const pointRadius = Math.max(2.5, width * 0.006);

      ctx.lineCap = 'round';
      ctx.strokeStyle = PROFILOGRAM_COLOR;
      ctx.lineWidth = lineWidth;
      segments.forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      });

      ctx.fillStyle = PROFILOGRAM_COLOR;
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
