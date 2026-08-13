import {
  WCephJSON,
  IMAGES_FOLDER_NAME,
  JSON_FILE_NAME,
} from './format';

import uniqueId from 'lodash/uniqueId';

import JSZip from 'jszip';

import { getBaseName } from 'utils/file';

import findIndex from 'lodash/findIndex';
import zipObject from 'lodash/zipObject';
import map from 'lodash/map';

import {
  getActiveWorkspaceImageIds,
} from 'store/reducers/workspace';

import {
  getImageProps,
  getTracingDataByImageId,
} from 'store/reducers/workspace/image';

import {
  getActiveTracingImageId,
  getActiveWorkspaceMode,
} from 'store/reducers/workspace';

import {
  getTreatmentStagesOrder,
  getTreatmentStageDataById,
} from 'store/reducers/workspace/treatment';

import {
  getSuperimpsotionMode,
  getWorkspaceImageIds,
} from 'store/reducers/workspace/settings';

import { getActiveWorkspaceId } from 'store/reducers/workspace/activeId';

// The written half of the record: one clinical note per visit, filed under the
// visit's own timepoint label (see `visitNotes` in ./format).
import { getVisitNotes } from 'store/reducers/workspace/records';
import { getVisitNoteKey, readVisitNote } from 'utils/visitNotes';

import { validateIndexJSON } from './validate';

const createExport: Exporter = async (state, options, onUpdate) => {
  const {
    imagesToSave = getActiveWorkspaceImageIds(state),
    treatmentStagesToSave = getTreatmentStagesOrder(state),
    saveWorkspaceSettings = true,
  } = options;
  const zip = new JSZip();
  const imgFolder = zip.folder(IMAGES_FOLDER_NAME);

  const getProps = getImageProps(state);
  const getTracingData = getTracingDataByImageId(state);
  const getTreatmentData = getTreatmentStageDataById(state);

  await Promise.all(
    map(imagesToSave, async (imageId) => {
      const dataURI = getProps(imageId).data;
      if (dataURI !== null) {
        const response = await fetch(dataURI);
        const blob = await response.blob();
        imgFolder.file(imageId, blob);
      } else {
        console.warn(
          `[BUG] Trying to export a file without image data`
        );
      }
    }),
  );

  const activeWorkspaceId = getActiveWorkspaceId(state)!;

  /**
   * The clinical notes this file carries: the notes of the visits whose images
   * are actually being written, and no others.
   *
   * Scoped that way so a file cannot contain a diagnosis about a visit it holds
   * no image of — importing that would file a note the record has no visit for.
   * A note is written whole, with every version it holds, so an amended entry
   * imports as an amended entry. @see WCephJSON#visitNotes
   */
  const allNotes = getVisitNotes(state);
  const exportedVisitKeys: { [key: string]: true } = {};
  imagesToSave.forEach((id: string) => {
    exportedVisitKeys[getVisitNoteKey(getProps(id).timepoint)] = true;
  });
  const visitNotes: NonNullable<WCephJSON['visitNotes']> = {};
  Object.keys(allNotes)
    .filter((key) => exportedVisitKeys[key] === true)
    .filter((key) => readVisitNote(allNotes[key]) !== null)
    .forEach((key) => {
      visitNotes[key] = { entries: allNotes[key].entries };
    });

  const activeImageId = getActiveTracingImageId(state);
  const hasActiveImage = activeImageId !== null && findIndex(
    imagesToSave, id => id === activeImageId) !== -1;

  const json: WCephJSON = {
    version: 1,
    debug: __DEBUG__ || undefined,
    refs: {
      thumbs: {

      },
      images: zipObject(
        imagesToSave,
        map(
          imagesToSave,
          (id) => `${IMAGES_FOLDER_NAME}/${id}`,
        ),
      ), // @FIXME @TODO
    },
    data: zipObject(
      imagesToSave,
      map(
        imagesToSave,
        (id) => ({
          ...getProps(id),
          tracing: {
            scaleFactor: getProps(id).scaleFactor,
            ...getTracingData(id),
          },
        }),
      ),
    ),
    // Omitted entirely when the record holds none, so a file from a chart with no
    // notes is byte-for-byte the file this app has always written.
    visitNotes: Object.keys(visitNotes).length > 0 ? visitNotes : undefined,
    superimposition: {
      mode: getSuperimpsotionMode(state)(activeWorkspaceId),
      imageIds: getWorkspaceImageIds(state)(activeWorkspaceId),
    },
    treatmentStages: {
      order: getTreatmentStagesOrder(state),
      data: zipObject(
        treatmentStagesToSave,
        map(
          treatmentStagesToSave,
          id => getTreatmentData(id),
        ),
      ),
    },
    workspace: {
      mode: (
        saveWorkspaceSettings ?
          getActiveWorkspaceMode(state) : undefined
      ),
      activeImageId: (
        saveWorkspaceSettings ?
          hasActiveImage ? activeImageId : null
        : null
      ),
    },
  };

  const errors = validateIndexJSON(json);
  if (errors.length > 0) {
    if (__DEBUG__) {
      console.warn(
        '[BUG] Failed to export file. ' +
        'Trying to export file as an invalid WCeph format. ' +
        'This is a bug either in validation or in export logic.',
        map(errors, e => e.message),
      );
    }
    throw new TypeError(
      `Could not export file. ` + (
        (errors.length === 1) ? errors[0].message : (
          `The following errors were encoutered while exporting: \n` +
            map(errors, e => e.message).join('\n')
        )
      ),
    );
  }

  zip.file(JSON_FILE_NAME, JSON.stringify(json, undefined, 2));
  const generatorOptions: JSZipGeneratorOptions & { mimeType?: string } = {
    type : 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/wceph',
  };
  const blob: Blob = await zip.generateAsync(
    generatorOptions,
    onUpdate !== undefined ? ({ percent }: { percent: number }) => {
      onUpdate(percent);
    } : undefined,
  );

  const props = activeImageId !== null ? getProps(activeImageId) : null;
  let imageName;
  if (hasActiveImage && props && props.name !== null) {
    imageName = props.name;
  } else {
    imageName = uniqueId('Exported tracing ');
  }
  const basename = imageName !== null ? getBaseName(imageName) : activeImageId;
  return new File([blob], `${basename}.wceph`);
};

export default createExport;
