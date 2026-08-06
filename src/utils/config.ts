import zipObject from 'lodash/zipObject';
import map from 'lodash/map';
import uniqueId from 'lodash/uniqueId';

const redoType: ActionType = 'REDO_REQUESTED';
const undoType: ActionType = 'UNDO_REQUESTED';

const undoableConfig = {
  undoType,
  redoType,
  limit: 100,
};

import { SAMPLE_CEPH_DATA_URL } from 'utils/sampleCeph';

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

export const defaultWorkspaceId = uniqueId('workspace_');
export const defaultWorkspaceSettings: WorkspaceSettings = {
  isImporting: false,
  importError: null,
  isExporting: false,
  exportError: null,
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
