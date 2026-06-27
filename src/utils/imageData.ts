/**
 * Decode an image data URL into `ImageData` (RGBA pixels) via an offscreen
 * canvas. Runs on the main thread; the resulting `ImageData` is structured-
 * cloneable and can be handed to a Web Worker for inference.
 */
export function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        reject(new Error('Could not get a 2D canvas context for prediction'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('Could not decode the image for prediction'));
    img.src = dataUrl;
  });
}
