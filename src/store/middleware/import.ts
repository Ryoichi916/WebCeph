import { Store, Middleware } from 'redux';

import find from 'lodash/find';
import each from 'lodash/each';

import {
  importFileRequested,
  importFileSucceeded,
  importFileFailed,
  updatePatient,
  setPatientTrendPlot,
} from 'actions/workspace';

import { getActivePatient } from 'store/reducers/patients';
import { getAllImages } from 'store/reducers/workspace/image';

import { isActionOfType } from 'utils/store';

import importWCeph from 'utils/importers/wceph/v1/import';
import importImage from 'utils/importers/image/import';

/** Whether a chosen file is a WebCeph case file, by its name. */
export const isCaseFileName = (name: string): boolean =>
  Boolean(name.match(/\.wceph$/i));

/**
 * What a clinician is told when a case file is handed to an image input.
 *
 * One sentence, because the two acts are not the same act: adding an image files
 * one film onto this chart, and opening a case file merges a whole case — its
 * films, its visits, its tracings and another patient's clinical notes. Routed
 * on the extension alone, a `.wceph` chosen at "Add image" did the second while
 * the clinician was doing the first: twelve foreign films, three visits and
 * somebody else's notes, with no manifest, no confirmation and no date of birth,
 * so every analysis on those films reported uncorrected norms.
 */
export const CASE_FILE_AT_IMAGE_INPUT =
  'This is a WebCeph case file, not an image. A case file holds a whole case — ' +
  'its films, its visits, its tracings and its clinical entries — so it is ' +
  'opened through "Open case file", which reads it and states what it will add ' +
  'to this chart before anything is changed. Nothing has been added here.';

const importers = [
  {
    doesMatch: (file: File) => isCaseFileName(file.name),
    importFn: importWCeph,
  },
  {
    doesMatch: (_: File) => {
      return true;
    },
    importFn: importImage,
  },
];

/**
 * What a clinician is told when an import would have landed on top of a film the
 * chart already holds.
 *
 * It cannot happen by accident any more — ids are minted from the clock (see
 * `utils/ids`), so a page reload can no longer hand a new film the id of a stored
 * one. This is the check that makes the guarantee *visible*: an import that would
 * overwrite is refused before a single action is dispatched, and the surface that
 * asked for it says so, rather than the chart quietly ending up with one record
 * where there were two.
 */
export const IMAGE_ID_COLLISION =
  'This image was not filed: it was given the id of a film already on this ' +
  'chart, and filing it would have written over that record. Nothing on the ' +
  'chart was changed. Reload the page and try again.';

/**
 * Which ids an importer's actions would write a film to, that the chart already
 * holds a *different* film under. @see IMAGE_ID_COLLISION
 */
const collidingImageIds = (
  actions: GenericAction[], state: StoreState,
): string[] => {
  const stored = getAllImages(state);
  const colliding: string[] = [];
  actions.forEach((action) => {
    if (action.type !== 'LOAD_IMAGE_SUCCEEDED') {
      return;
    }
    const payload = action.payload as { id: string; data?: string };
    const existing = stored[payload.id];
    if (
      existing !== undefined &&
      typeof existing.data === 'string' && existing.data !== '' &&
      typeof payload.data === 'string' && payload.data !== existing.data
    ) {
      colliding.push(payload.id);
    }
  });
  return colliding;
};

const fail = (error: Error, workspaceId: string) => {
  // Diagnostic only, and only in development — see the matching note in
  // `store/middleware/export.ts`. The clinician's answer is the dispatched
  // `importFileFailed` below, which the dialog renders as its own sentence
  // (@see utils/importers/wceph/v1/import's own messages); an unconditional
  // `console.error` here turned every *handled* refusal — a corrupt file, a
  // collision, a case file that could not be read — into a browser-console
  // error, which is the one thing a graceful, worded refusal is not.
  if (__DEBUG__) {
    console.warn('Failed to import file.', error);
  }
  return importFileFailed({ workspaceId, error });
};

const middleware = ({ dispatch, getState }: Store<StoreState>) =>
  (next: GenericDispatch) => async (action: GenericAction) => {
    if (isActionOfType(action, 'LOAD_IMAGE_FROM_URL_REQUESTED')) {
      next(action);
      const { url, workspaceId, meta } = action.payload;
      try {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], 'demo_image');
        return dispatch(importFileRequested({ file, workspaceId, meta }));
      } catch (error) {
        return dispatch(fail(error, workspaceId));
      }
    } else if (isActionOfType(action, 'IMPORT_FILE_REQUESTED')) {
      next(action);
      const { file, workspaceId, meta, isCaseFile, patientPatch } = action.payload;
      console.info('Importing file...', file.name);
      /**
       * A case file is only ever read through the dialog that asks first.
       *
       * The choke point is here rather than at each upload surface because the
       * routing is here: every surface in the app — the dropzone, the rail's
       * ghost tile, a photographic batch, a dropped file — ends in this action,
       * and any of them handed a `.wceph` used to get the whole-case importer.
       * @see CASE_FILE_AT_IMAGE_INPUT
       */
      if (isCaseFileName(file.name) && isCaseFile !== true) {
        // Refused, not failed: nothing went wrong here, a case file was handed
        // to an image input. So it is a warning and not an error in the log.
        console.warn(CASE_FILE_AT_IMAGE_INPUT, file.name);
        return dispatch(importFileFailed({
          workspaceId, error: new TypeError(CASE_FILE_AT_IMAGE_INPUT),
        }));
      }
      const importer = find(importers, ({ doesMatch }) => doesMatch(file));
      if (importer) {
        try {
          const imported = await importer.importFn(file, { workspaceId, meta });
          /**
           * Nothing is dispatched until the whole set has been checked against
           * the chart: a batch is refused as a batch, so a case file can never
           * be half-merged with one of its films written over a stored one.
           * @see IMAGE_ID_COLLISION
           */
          const colliding = collidingImageIds(imported, getState());
          if (colliding.length > 0) {
            console.error(IMAGE_ID_COLLISION, colliding);
            return dispatch(importFileFailed({
              workspaceId, error: new Error(IMAGE_ID_COLLISION),
            }));
          }
          each(imported, dispatch);
          /**
           * The images are in. **Only now** may the file say anything about the
           * patient — see `IMPORT_FILE_REQUESTED#patientPatch`.
           *
           * Applied here rather than by the dialog that computed it because the
           * dialog does not survive its own success: a case file arriving opens
           * the records page, which unmounts the editor the dialog was opened
           * from, and a patch left to be dispatched by an unmounted component is
           * a date of birth that silently never arrives. The whole demographic
           * set is re-sent, because that is what UPDATE_PATIENT_REQUESTED writes.
           */
          if (patientPatch !== undefined && patientPatch !== null) {
            const patient = getActivePatient(getState());
            if (patient !== null) {
              const { trendPlot, ...demographics } = patientPatch;
              dispatch(updatePatient({
                id: patient.id,
                name: patient.name,
                chartId: patient.chartId,
                dateOfBirth: patient.dateOfBirth || '',
                sex: patient.sex || '',
                reading: patient.reading || '',
                ...demographics,
              }));
              /**
               * The trend board travels apart from the four demographic fields
               * because it is written by its own action:
               * `UPDATE_PATIENT_REQUESTED` is the edit-details dialog's four
               * fields and deliberately spreads over everything else the record
               * holds about how this patient is read.
               *
               * Filled in on the same terms as the rest of the patch — only
               * where this chart has no board of its own. @see Patient#trendPlot
               */
              if (Array.isArray(trendPlot) && trendPlot.length > 0 &&
                (patient.trendPlot === undefined || patient.trendPlot === null)) {
                dispatch(setPatientTrendPlot({
                  id: patient.id, symbols: trendPlot,
                }));
              }
            }
          }
          dispatch(importFileSucceeded({ workspaceId, isCaseFile }));
        } catch (error) {
          return dispatch(fail(error, workspaceId));
        }
      } else {
        console.warn(
          `Type of ${file.name} is not a supported format.`,
        );
        throw new Error('Incompatible file type');
      }
    } else {
      return next(action);
    }
  };

export default middleware as Middleware;
