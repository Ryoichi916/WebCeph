import { Store, Middleware } from 'redux';
import idb from 'idb-keyval';

import { isActionOfType } from 'utils/store';
import { loadProjectSucceeded } from 'actions/workspace';
import { defaultWorkspaceId, defaultWorkspaceSettings } from 'utils/config';

// The state slices that make up a patient's project: the images (with their
// pixel data), the tracings, and the workspace/tab layout.
const PROJECT_KEYS: StoreKey[] = [
  'images.props',
  'images.status',
  'images.tracing',
  'workspaces.settings',
  'workspaces.order',
  'workspaces.activeWorkspaceId',
];

// A blank project: one empty workspace, no images.
const emptyProject = (): Partial<StoreState> => ({
  'images.props': {},
  'images.status': {},
  'images.tracing': {},
  'workspaces.settings': { [defaultWorkspaceId]: defaultWorkspaceSettings },
  'workspaces.order': [defaultWorkspaceId],
  'workspaces.activeWorkspaceId': defaultWorkspaceId,
});

const storageKey = (patientId: string) => `project:${patientId}`;

const middleware = ({ getState, dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => async (action: GenericAction) => {
    if (isActionOfType(action, 'OPEN_PATIENT_REQUESTED')) {
      next(action);
      const { patientId } = action.payload;
      let project: Partial<StoreState>;
      try {
        const saved = await idb.get(storageKey(patientId)) as Partial<StoreState> | undefined;
        project = saved || emptyProject();
      } catch (e) {
        console.error('Failed to open project', e);
        project = emptyProject();
      }
      dispatch(loadProjectSucceeded({
        ...project,
        'patients.activeId': patientId,
      }));
      return;
    }

    if (isActionOfType(action, 'SAVE_PROJECT_REQUESTED')) {
      next(action);
      const { patientId } = action.payload;
      const state = getState() as any;
      const project: Partial<StoreState> = {};
      PROJECT_KEYS.forEach((key) => { (project as any)[key] = state[key]; });
      try {
        await idb.set(storageKey(patientId), project);
      } catch (e) {
        console.error('Failed to save project', e);
      }
      return;
    }

    return next(action);
  };

export default middleware as Middleware;
