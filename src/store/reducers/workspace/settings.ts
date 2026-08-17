import { defaultWorkspaceId, defaultWorkspaceSettings } from 'utils/config';
import { handleActions } from 'utils/store';

import { createSelector } from 'reselect';

import omit from 'lodash/omit';
import without from 'lodash/without';

const KEY_WORKSPACE_SETTINGS: StoreKey = 'workspaces.settings';

const reducers: Partial<ReducerMap> = {
  [KEY_WORKSPACE_SETTINGS]: handleActions<typeof KEY_WORKSPACE_SETTINGS>({
    ADD_NEW_WORKSPACE: (state, { payload: { id, settings } }) => {
      return {
        ...state,
        [id]: {
          ...defaultWorkspaceSettings,
          ...settings,
        },
      };
    },
    REMOVE_WORKSPACE: (state, { payload: { id } }) => omit(state, id) as typeof state,
    SET_SUPERIMPOSITION_MODE_REQUESTED: (state, { payload: { workspaceId, mode } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          superimposition: {
            ...state[workspaceId].superimposition,
            mode,
          },
        },
      };
    },
    SET_WORKSPACE_MODE_REQUESTED: (state, { payload: { workspaceId, mode } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          mode,
        },
      };
    },
    SUPERIMPOSE_IMAGES_REQUESTED: (state, { payload: { workspaceId, order }}) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          superimposition: {
            ...state[workspaceId].superimposition,
            order,
          },
        },
      };
    },
    SET_ACTIVE_IMAGE_ID: (state, { payload: { workspaceId, imageId }}) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          tracing: {
            ...state[workspaceId].tracing,
            imageId,
          },
        },
      };
    },
    LOAD_IMAGE_STARTED: (state, { payload: { workspaceId, imageId } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          images: [ ...state[workspaceId].images, imageId ],
        },
      };
    },
    CLOSE_IMAGE_REQUESTED: (state, { payload: { workspaceId, imageId } }) => {
      const settings = state[workspaceId];
      const remaining = without(settings.images, imageId);
      // The removed image must also stop being the workspace's tracing/active
      // image, otherwise the editor keeps pointing at props that no longer
      // exist. Fall back to another image of the same workspace when there is
      // one, else to the empty (upload) state.
      const tracingImageId = settings.tracing.imageId === imageId
        ? (remaining.length > 0 ? remaining[0] : null)
        : settings.tracing.imageId;
      return {
        ...state,
        [workspaceId]: {
          ...settings,
          images: remaining,
          tracing: {
            ...settings.tracing,
            imageId: tracingImageId,
          },
        },
      } as typeof state;
    },
    IMPORT_FILE_REQUESTED: (state, { payload: { workspaceId } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          importError: null,
          isImporting: true,
        },
      };
    },
    IMPORT_FILE_FAILED: (state, { payload: { workspaceId, error } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          importError: error,
          isImporting: false,
        },
      };
    },
    IMPORT_FILE_SUCCEEDED: (state, { payload: { workspaceId } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          importError: null,
          isImporting: false,
        },
      };
    },
    TRACE_IMAGE_REQUESTED: (state, { payload: { imageId, workspaceId } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          mode: 'tracing',
          tracing: {
            imageId,
          },
        },
      };
    },
    CANVAS_RESIZED: (state, { payload: { workspaceId, contentRect } }) => {
      return {
        ...state,
        [workspaceId]: {
          ...state[workspaceId],
          contentRect,
        },
      };
    },
  }, {
    [defaultWorkspaceId]: defaultWorkspaceSettings,
  }),
};

export default reducers;

export const getAllWorkspacesSettings = (state: StoreState) => state[KEY_WORKSPACE_SETTINGS];

export const getWorkspaceSettingsById = createSelector(
  getAllWorkspacesSettings,
  settings => (workspaceId: string) => settings[workspaceId],
);

export const getWorkspaceMode = createSelector(
  getWorkspaceSettingsById,
  getSettings => (workspaceId: string) => getSettings(workspaceId).mode,
);

export const getWorkspaceImageIds = createSelector(
  getWorkspaceSettingsById,
  (getSettings) => (id: string) => getSettings(id).images,
);

export const isTracing = createSelector(
  getWorkspaceMode,
  (getMode) => (id: string) => getMode(id) === 'tracing',
);
export const isSuperimposing = createSelector(
  getWorkspaceMode,
  (getMode) => (id: string) => getMode(id) === 'superimposition',
);

export const getSuperimpositionSettingsByWorkspaceId = createSelector(
  getWorkspaceSettingsById,
  (getSettings) => (id: string) => getSettings(id).superimposition,
);

export const getSuperimpsotionMode = createSelector(
  getSuperimpositionSettingsByWorkspaceId,
  (getSettings) => (id: string) => getSettings(id).mode,
);

export const getTracingImageId = createSelector(
  getWorkspaceSettingsById,
  (getSettings) => (workspaceId: string) => getSettings(workspaceId).tracing.imageId,
);

export const hasImportFailed = createSelector(
  getWorkspaceSettingsById,
  (getSettings) => (workspaceId: string) => getSettings(workspaceId).importError !== null,
);

/**
 * Why the last import into this rail tile failed, or null.
 *
 * `IMPORT_FILE_FAILED` was being stored here and read by nothing that renders —
 * so a case file that broke halfway through changed the chart not at all and
 * said nothing at all. The case-file dialog reads this and stays open until the
 * import resolves, so the reason reaches the person who chose the file.
 * @see components/CaseFile
 */
export const getImportError = createSelector(
  getWorkspaceSettingsById,
  (getSettings) => (workspaceId: string) => {
    const settings = getSettings(workspaceId);
    return settings !== undefined ? settings.importError : null;
  },
);

export const isImporting = createSelector(
  getWorkspaceSettingsById,
  (getSettings) => (workspaceId: string) => getSettings(workspaceId).isImporting,
);
