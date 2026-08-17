import zipObject from 'lodash/zipObject';
import map from 'lodash/map';

const redoType: ActionType = 'REDO_REQUESTED';
const undoType: ActionType = 'UNDO_REQUESTED';

const undoableConfig = {
  undoType,
  redoType,
  limit: 100,
};

import { SAMPLE_CEPH_DATA_URL } from 'utils/sampleCeph';
import { mintWorkspaceId } from 'utils/ids';

// The sample image is bundled with the app (as a data: URI) so it loads
// instantly and works offline — no external requests.
export const DEMO_IMAGE_URL = SAMPLE_CEPH_DATA_URL;

export { undoableConfig };

export const supportedLocales = ['en-US', 'ar-SY'];

export const bundledLocales = ['en-US'];

export const defaultLocale = bundledLocales[0];

export const bundleLocaleData = zipObject(
  bundledLocales,
  map(bundledLocales, (locale) => {
    return require(`locale/${locale}.json`) as Locale;
  }),
);

export const defaultWorkspaceId = mintWorkspaceId();
/**
 * A rail tile's own settings, as a new one starts.
 *
 * `isExporting`/`exportError` used to sit here and were written by no reducer:
 * writing a case file is the whole chart's act, not a tile's, and it lives in
 * `file.export` now. They are simply gone from this default — and because
 * `workspaces.settings` is a project key (see store/middleware/project), a
 * project saved by an older build rehydrates with those two dead fields still on
 * each tile. Nothing reads them and nothing writes them; they are inert
 * leftovers in a blob, not state, and they disappear the next time the project
 * is written. No migration is run for them, because a migration that rewrites
 * every stored project in order to delete two ignored booleans is a bigger risk
 * to the record than the booleans are.
 */
export const defaultWorkspaceSettings: WorkspaceSettings = {
  isImporting: false,
  importError: null,
  images: [],
  contentRect: null,
  mode: 'tracing',
  tracing: {
    imageId: null,
  },
  superimposition: {
    mode: 'auto',
  },
};
