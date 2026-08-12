import bluebird from 'bluebird';
import { readFileAsDataURL } from 'utils/file';

import {
  loadImageStarted,
  loadImageSucceeded,
  setActiveImageId,
} from 'actions/workspace';

import uniqueId from 'lodash/uniqueId';

const importFile: Importer = async (fileToImport, options) => {
  const {
    ids = [uniqueId('imported_image_')],
    workspaceId,
    meta,
  } = options;
  const [imageId] = ids;
  const actions: GenericAction[] = [
    loadImageStarted({ imageId, workspaceId }),
  ];
  const dataURL = await readFileAsDataURL(fileToImport);
  const img = new Image();
  img.src = dataURL;
  const { height, width } = await bluebird.fromCallback<HTMLImageElement>(cb => {
    img.onload = () => cb(null, img);
    img.onerror = (event) => {
      const error = typeof event === 'string' ? event : (event as ErrorEvent).error;
      cb(error);
    };
  });
  // Only spread record metadata the caller actually supplied: an explicit
  // `undefined` would overwrite the reducer's defaults with nothing.
  const recordMeta: Partial<ImageRecordMeta> = {};
  if (meta !== undefined) {
    if (meta.type !== undefined) {
      recordMeta.type = meta.type;
    }
    if (meta.timepoint !== undefined) {
      recordMeta.timepoint = meta.timepoint;
    }
    if (meta.captureDate !== undefined) {
      recordMeta.captureDate = meta.captureDate;
    }
    // Which frame of the photographic series the upload was filed at (see
    // `PhotoView`). Carried like the three above it: the records dashboard's
    // series cells file at one exact position, the upload form shows it before
    // anything is written, and without it here the position chosen was thrown
    // away on the way into the store — every photograph arrived unplaced.
    if (meta.photoView !== undefined) {
      recordMeta.photoView = meta.photoView;
    }
  }
  actions.push(loadImageSucceeded({
    id: imageId,
    name: fileToImport.name,
    data: dataURL,
    height,
    width,
    ...recordMeta,
  }));
  actions.push(setActiveImageId({ imageId, workspaceId }));
  return actions;
};

export default importFile;
