import { Store, Dispatch, Middleware } from 'redux';

import {
  exportFileSucceeded, exportFileFailed, setExportProgress,
} from 'actions/workspace';

import createExport from 'utils/importers/wceph/v1/export';

import { isActionOfType } from 'utils/store';
// Replaces `file-saver`'s saveAs(): see its doc comment in tracingSnapshot.ts
// for why (a webpack chunk boundary between file-saver and its caller
// silently drops the filename, saving this chart's only copy as an unnamed
// 'download').
import { saveBlobAs } from 'utils/tracingSnapshot';

/**
 * Writing the case out as one `.wceph`.
 *
 * The three outcomes are **dispatched**, not logged. This used to end a failure
 * at `console.error` — so a chart whose writer threw
 * (`Could not export file. INCOMPATIBLE_BRIGHTNESS_VALUE`) closed its dialog,
 * downloaded nothing, and said nothing, leaving the clinician believing their
 * only copy was on disk. @see store/reducers/workspace/fileExport
 *
 * The zip's own progress is passed through as well: a twenty-film case is tens
 * of megabytes of DEFLATE and the dialog has a place to show it.
 */
const middleware = ({ getState }: Store<StoreState>) =>
  (next: Dispatch<GenericAction>) => async (action: GenericAction) => {
    if (!isActionOfType(action, 'EXPORT_FILE_REQUESTED')) {
      return next(action);
    } else {
      next(action);
      console.info('Exporting file...');
      try {
        const payload = action.payload;
        if (payload.format !== 'wceph_v1') {
          throw new TypeError(
            `${payload.format} is not a format this app can write. ` +
            `A case file is written as wceph_v1.`,
          );
        }
        const options: ExportOptions = { };
        const state = getState();
        const file = await createExport(state, options, (value: number) => {
          next(setExportProgress({ value }));
        });
        saveBlobAs(file, file.name);
        return next(exportFileSucceeded({ fileName: file.name }));
      } catch (e) {
        // Diagnostic only, and only in development: the clinician's answer is
        // the dispatched `exportFileFailed` above, which the dialog already
        // renders as its own sentence (see `utils/importers/wceph/v1/export`'s
        // own message). An unconditional `console.error` here duplicated that
        // as a browser-console error on every refused export — including the
        // ordinary, handled case of a chart the writer declines to write — the
        // opposite of "zero console errors" for a *handled* failure.
        if (__DEBUG__) {
          console.warn('Failed to export file.', e);
        }
        return next(exportFileFailed(e));
      }
    }
  };

export default middleware as Middleware;
