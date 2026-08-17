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
import uniq from 'lodash/uniq';
import sortBy from 'lodash/sortBy';

import {
  getImageProps,
  getAllImages,
  getAllImagesStatus,
  getManualLandmarks,
  getSkippedSteps,
  getTracingDataByImageId,
} from 'store/reducers/workspace/image';

import {
  getTreatmentStagesOrder,
  getTreatmentStageDataById,
} from 'store/reducers/workspace/treatment';

import {
  getAllWorkspacesSettings,
} from 'store/reducers/workspace/settings';

import { getActiveWorkspaceId } from 'store/reducers/workspace/activeId';

// Who the case is. Carried by the file so the receiving chart is not left
// ageless — @see WCephJSON#patient.
import { getActivePatient } from 'store/reducers/patients';

// The written half of the record: one clinical note per visit, filed under the
// visit's own timepoint label (see `visitNotes` in ./format).
import { getVisitNotes } from 'store/reducers/workspace/records';
import { readVisitNote } from 'utils/visitNotes';

import { getCaptureDateSortKey } from 'utils/records';

import { validateIndexJSON } from './validate';

/**
 * Every image of the **chart** that finished loading, oldest capture date first.
 *
 * Not the active workspace's images, which is what this used to be: a workspace
 * is one rail tile holding one film, so "export" wrote a one-film file and
 * called it the case. A case file is the patient and their dated images (the
 * same reading `getPatientRecords` takes), so that is what is written.
 *
 * Read off the two slices directly rather than through `getPatientRecords`,
 * which needs the workspace rail, the analyses and the step lists — none of
 * which an export has any business requiring in order to write image bytes.
 */
const getChartImageIds = (state: StoreState): string[] => {
  const allImages = getAllImages(state) || {};
  const allStatus = getAllImagesStatus(state) || {};
  const ids = Object.keys(allImages).filter((imageId) => {
    const status = allStatus[imageId];
    // No status entry at all means nothing has been said about this image's
    // loading either way, and it has props — a half-loaded or failed image is
    // the only thing excluded here.
    return status === undefined ||
      (status.isLoading === false && status.error === null);
  });
  return sortBy(ids, (imageId) => {
    const props = allImages[imageId];
    return getCaptureDateSortKey(props && props.captureDate);
  });
};

const createExport: Exporter = async (state, options, onUpdate) => {
  const {
    imagesToSave = getChartImageIds(state),
    treatmentStagesToSave = getTreatmentStagesOrder(state) || [],
    saveWorkspaceSettings = true,
  } = options;
  const zip = new JSZip();
  const imgFolder = zip.folder(IMAGES_FOLDER_NAME);

  const getProps = getImageProps(state);
  const getManual = getManualLandmarks(state);
  const getSkipped = getSkippedSteps(state);
  const getTracingData = getTracingDataByImageId(state);
  const getTreatmentData = getTreatmentStageDataById(state);

  await Promise.all(
    map(imagesToSave, async (imageId) => {
      const props = getProps(imageId);
      const dataURI = props !== undefined ? props.data : null;
      if (dataURI !== null && dataURI !== undefined) {
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

  /**
   * The workspace this file was written from, read defensively.
   *
   * `workspaces.settings` is keyed by workspace id and this used to index into
   * it unguarded — `getSuperimpsotionMode(state)(activeWorkspaceId!)` — which
   * throws on any state that has no entry for the active workspace (a store
   * assembled by a spec, or a workspace removed between the click and the
   * write). Writing a case file must not depend on the rail's bookkeeping being
   * intact: with no settings on file the file simply states no workspace mode
   * and no active image, which is exactly what a chart with no workspace
   * settings has.
   */
  const activeWorkspaceId = getActiveWorkspaceId(state);
  const allSettings = getAllWorkspacesSettings(state) || {};
  const activeSettings = activeWorkspaceId !== null
    ? allSettings[activeWorkspaceId] : undefined;
  const workspaceMode = activeSettings !== undefined
    ? activeSettings.mode : undefined;
  const activeImageId = activeSettings !== undefined &&
    activeSettings.tracing !== undefined
    ? activeSettings.tracing.imageId : null;

  /**
   * The clinical notes this file carries: **every note the chart holds**, each
   * under the key it is filed at.
   *
   * This used to be scoped to the visits whose images are being written, on the
   * reasoning that a file should not contain a diagnosis about a visit it holds no
   * image of. That reasoning cost the record the very thing the dashboard promises
   * about these entries. A note whose visit was relabelled, or whose images were
   * all removed, is listed on screen under "…not filed at any visit on file" —
   * a panel whose whole argument is "Nothing has been deleted" — and it was
   * precisely those notes the filter dropped: the archive file, the one artefact a
   * clinician keeps, was where the diagnosis did get deleted.
   *
   * So nothing is filtered out. On the far side, `LOAD_VISIT_NOTES` refuses to
   * overwrite a key that already holds an entry, and `getUnmatchedVisitNoteKeys`
   * re-surfaces a note whose visit the file has no image of in the same unfiled
   * panel it left from — where it can be read and filed. A note the reader has to
   * file is a record; a note the file left behind is not.
   *
   * A note is written whole — every version it holds, each with the author stamped
   * into it, and the record of any re-filing — so an amended entry imports as an
   * amended entry, an attributed one stays attributed, and one written for another
   * visit still says so. @see WCephJSON#visitNotes
   */
  const allNotes = getVisitNotes(state);
  const visitNotes: NonNullable<WCephJSON['visitNotes']> = {};
  Object.keys(allNotes)
    .filter((key) => readVisitNote(allNotes[key]) !== null)
    .forEach((key) => {
      const note = allNotes[key];
      visitNotes[key] = {
        entries: note.entries,
        refiledFrom: note.refiledFrom,
        refiledAt: note.refiledAt,
      };
    });

  const hasActiveImage = activeImageId !== null && findIndex(
    imagesToSave, id => id === activeImageId) !== -1;

  /**
   * Who the case is. Written only where a patient is actually open — a file from
   * a device with nobody registered carries no `patient` key rather than a shell
   * of empty strings that would import as "this case has a blank name".
   * @see WCephJSON#patient
   */
  const patient = getActivePatient(state);

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
        (id) => {
          // Written field by field, and deliberately **without** `data`: the
          // pixels live in the ZIP's `images/` folder, once. Spreading the image
          // props wrote them a *second* time into index.json as a base64 data
          // URI, which made a three-film case file roughly twice the size it
          // needed to be for bytes the importer never reads (it re-reads the
          // blob out of the folder).
          const props = getProps(id);
          const stored = getTracingData(id);
          return {
            name: props !== undefined ? props.name : null,
            type: props !== undefined ? props.type : null,
            timepoint: props !== undefined ? props.timepoint : null,
            captureDate: props !== undefined ? props.captureDate : null,
            photoView: props !== undefined ? props.photoView : null,
            scaleSourceId: props !== undefined ? props.scaleSourceId : null,
            flipX: props !== undefined ? props.flipX : false,
            flipY: props !== undefined ? props.flipY : false,
            invertColors: props !== undefined ? props.invertColors : false,
            brightness: props !== undefined ? props.brightness : 0.5,
            contrast: props !== undefined ? props.contrast : 0.5,
            analysis: {
              activeId: (props !== undefined && props.analysis !== undefined
                ? props.analysis.activeId : null) as
                WCephJSON['data'][string]['analysis']['activeId'],
            },
            tracing: {
              scaleFactor: props !== undefined &&
                typeof props.scaleFactor === 'number'
                ? props.scaleFactor : null,
              // Read through the store's own selectors, which return a stable
              // empty object for an image with no tracing entry yet. Spreading
              // the raw slice entry wrote `manualLandmarks: undefined` for every
              // untraced film, and the validator — correctly — refused the file.
              manualLandmarks: getManual(id),
              skippedSteps: getSkipped(id),
              // Only where the store actually holds one. @see the field's note
              // in ./format: nothing in this app sets a tracing mode any more,
              // and writing one would be inventing a provenance for landmarks.
              ...(stored !== undefined && stored.mode !== undefined
                ? { mode: stored.mode } : {}),
            },
          };
        },
      ),
    ),
    // Omitted entirely when the record holds none, so a file from a chart with no
    // notes is byte-for-byte the file this app has always written.
    visitNotes: Object.keys(visitNotes).length > 0 ? visitNotes : undefined,
    patient: patient !== null ? {
      name: patient.name,
      chartId: patient.chartId,
      dateOfBirth: patient.dateOfBirth !== undefined ? patient.dateOfBirth : null,
      sex: patient.sex !== undefined ? patient.sex : null,
      reading: patient.reading !== undefined ? patient.reading : null,
      /**
       * The measurements this patient's trend board plots — written because it
       * is a clinical setting, not a view: a case followed on IMPA and U1-L1
       * came back from an export and a restore on the default five, and the
       * dialog's own exclusions list called the board "this device's own
       * setting", which is the opposite of what `Patient#trendPlot` says.
       * Null where the case is on the default board. @see WCephJSON#patient
       */
      trendPlot: Array.isArray(patient.trendPlot) && patient.trendPlot.length > 0
        ? patient.trendPlot : null,
    } : undefined,
    // Deliberately no `superimposition`: it is a view of the films and tracings
    // this file already carries, and what was written here was never a
    // superimposition at all — it was the active rail tile's image list.
    // @see WCephJSON#superimposition, CASE_FILE_EXCLUSIONS
    treatmentStages: {
      order: treatmentStagesToSave,
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
        saveWorkspaceSettings ? workspaceMode : undefined
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
    /**
     * The chart could not be written, and the clinician is told so in words.
     *
     * This threw `Could not export file. INCOMPATIBLE_BRIGHTNESS_VALUE` — an
     * enum identifier — and the middleware then swallowed the whole thing into
     * `console.error`, so a chart that could not be written closed its dialog
     * and produced nothing at all. The reasons are the validator's own sentences
     * now, and the dialog prints them. @see store/reducers/workspace/fileExport
     */
    throw new TypeError(
      'This chart could not be written as a case file, so no file was ' +
      'created: ' +
      uniq(map(errors, (e) => e.message)).join('; ') +
      '. Nothing on this chart has been changed.',
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

  /**
   * What the file is called on disk.
   *
   * The case's own identity first — the chart ID and the patient's name, which is
   * how a practice files and finds a case — and only failing that the name of a
   * film inside it. It used to be named after whichever image happened to be open
   * ("scan0007.wceph"), which is a filename that says nothing about whose record
   * it is, on the one artefact that leaves the device.
   */
  const props = activeImageId !== null ? getProps(activeImageId) : null;
  let basename: string;
  const patientParts = patient !== null
    ? [patient.chartId, patient.name].filter(
      (part) => typeof part === 'string' && part.trim() !== '',
    ) : [];
  if (patientParts.length > 0) {
    basename = patientParts.join(' ').trim();
  } else if (hasActiveImage && props && props.name) {
    basename = getBaseName(props.name);
  } else {
    basename = uniqueId('Exported tracing ');
  }
  // Never a path separator or a reserved character: the name is written to the
  // reader's own filesystem.
  basename = basename.replace(/[\\/:*?"<>|]/g, '-');
  return new File([blob], `${basename}.wceph`);
};

export default createExport;
