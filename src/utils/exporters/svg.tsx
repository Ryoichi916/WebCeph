import zipObject from 'lodash/zipObject';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';

import * as React from 'react';
import { render } from 'react-dom';
import GeoViewer from 'components/GeoViewer';

import {
  getWorkspaceImageIds,
} from 'store/reducers/workspace';

import {
  getImageProps,
} from 'store/reducers/workspace/image';

import {
  getActiveTracingImageId,
} from 'store/reducers/workspace';

import {
  getActiveWorkspaceId,
} from 'store/reducers/workspace/activeId';

import {
  getAllGeoObjects,
} from 'store/reducers/workspace/analyses';

const createExport: Exporter = async (state, options, _) => {
  const activeWorkspaceId = getActiveWorkspaceId(state)!;
  const {
    imagesToSave = getWorkspaceImageIds(state)(activeWorkspaceId),
    includeRasterImage = true,
    objectsToExport: selection,
  } = options;

  const getObjectsByImageId = getAllGeoObjects(state);
  // For each image, the geo objects to export (filtered by the selection).
  const objectsByImage = zipObject(
    imagesToSave,
    imagesToSave.map((imgId: string) => pickBy(
      getObjectsByImageId(imgId),
      (_, symbol) => (
        typeof selection === 'undefined' || (
          typeof selection[imgId] !== 'undefined' &&
          selection[imgId][symbol] === true
        )
      ),
    )),
  );

  if (includeRasterImage && imagesToSave.length > 1) {
    // We do not support exporting more than one reference image
    throw new RangeError('Cannot export more than one image');
  }
  const getProps = getImageProps(state);
  const activeImageId = getActiveTracingImageId(state);
  const imageId = activeImageId !== null
    ? activeImageId
    : getWorkspaceImageIds(state)(activeWorkspaceId)[0];
  const imageToExport = getProps(imageId);

  const fragment = new DocumentFragment();
  render(
    (
      <svg>
        {includeRasterImage ? <image xlinkHref={imageToExport.data} /> : null}
        {map(objectsByImage, (objects, imgId) => (
          <GeoViewer
            key={imgId}
            objects={map(objects, (value: GeoObject | undefined, symbol: string) =>
              ({ label: symbol, symbol, value: value as GeoObject }))}
            top={0}
            left={0}
            width={500}
            height={500}
            getPropsForPoint={() => ({})}
            getPropsForVector={() => ({})}
            getPropsForAngle={() => ({})}
          />
        ))}
      </svg>
    ),
    fragment as unknown as Element,
  );
  const { serializeToString } = new XMLSerializer();
  const str = serializeToString(fragment);
  const basename = imageToExport.name || 'Exported image';
  return new File([str], `${basename}.svg`);
};

export default createExport;
