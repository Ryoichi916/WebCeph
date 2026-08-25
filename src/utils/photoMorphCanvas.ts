/**
 * The pixel loop of the photo-morph preview: resamples a photograph's ROI
 * through a backward MLS displacement field (@see analyses/photoMorph) into
 * a canvas that can be composited over the untouched photograph.
 *
 * Kept apart from the geometry module so the math stays pure and testable
 * under the node runner; this file is the only place the morph touches the
 * DOM (canvas + ImageData).
 */

import { MorphField, sampleField } from 'analyses/photoMorph';

/**
 * Extra source pixels read around the ROI so a backward sample that lands
 * just outside it still hits real image data instead of a clamped edge.
 */
const SOURCE_MARGIN = 96;

/**
 * Warps the ROI of `source` (the full-resolution photograph, drawn or
 * drawable to a canvas) through `field` and returns a canvas exactly the
 * ROI's size. Pixels whose backward sample falls outside the source read
 * the clamped edge pixel — with the identity ring pinning the field at the
 * ROI border (@see anchorRing) this only ever happens off-photo.
 */
export const warpPhotoRegion = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  field: MorphField,
): HTMLCanvasElement | null => {
  const { roi } = field;
  const srcLeft = Math.max(0, roi.left - SOURCE_MARGIN);
  const srcTop = Math.max(0, roi.top - SOURCE_MARGIN);
  const srcRight = Math.min(sourceWidth, roi.left + roi.width + SOURCE_MARGIN);
  const srcBottom = Math.min(sourceHeight, roi.top + roi.height + SOURCE_MARGIN);
  const srcW = srcRight - srcLeft;
  const srcH = srcBottom - srcTop;
  if (srcW <= 0 || srcH <= 0) {
    return null;
  }

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  if (srcCtx === null) {
    return null;
  }
  srcCtx.drawImage(
    source, srcLeft, srcTop, srcW, srcH, 0, 0, srcW, srcH,
  );
  const src = srcCtx.getImageData(0, 0, srcW, srcH);

  const out = document.createElement('canvas');
  out.width = roi.width;
  out.height = roi.height;
  const outCtx = out.getContext('2d');
  if (outCtx === null) {
    return null;
  }
  const dst = outCtx.createImageData(roi.width, roi.height);

  const sData = src.data;
  const dData = dst.data;
  const clamp = (v: number, lo: number, hi: number): number =>
    v < lo ? lo : (v > hi ? hi : v);

  for (let y = 0; y < roi.height; y += 1) {
    const photoY = roi.top + y;
    for (let x = 0; x < roi.width; x += 1) {
      const photoX = roi.left + x;
      const d = sampleField(field, photoX, photoY);
      // Backward map: the source position this output pixel reads from,
      // in the cropped source canvas' coordinates.
      const sx = clamp(photoX + d.x - srcLeft, 0, srcW - 1.001);
      const sy = clamp(photoY + d.y - srcTop, 0, srcH - 1.001);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;
      const di = (y * roi.width + x) * 4;
      for (let ch = 0; ch < 4; ch += 1) {
        const top =
          sData[i00 + ch] * (1 - fx) + sData[i10 + ch] * fx;
        const bottom =
          sData[i01 + ch] * (1 - fx) + sData[i11 + ch] * fx;
        dData[di + ch] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  outCtx.putImageData(dst, 0, 0);
  return out;
};
