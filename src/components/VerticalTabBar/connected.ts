import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';

import uniqueId from 'lodash/uniqueId';

import WorkspaceSwitcher from './index';
import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';

import {
  addNewWorkspace,
  setActiveWorkspace,
} from 'actions/workspace';

import {
  getActiveWorkspaceId,
} from 'store/reducers/workspace/activeId';

import {
  isLastWorkspaceUsed,
} from 'store/reducers/workspace';

import {
  getWorkspacesIdsInOrder,
} from 'store/reducers/workspace/order';

import {
  getWorkspaceImageIds,
} from 'store/reducers/workspace/settings';

import {
  getImageProps,
} from 'store/reducers/workspace/image';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState) => {
    const tabs = getWorkspacesIdsInOrder(state);
    // A miniature of the workspace's radiograph, rendered inside its page tile.
    const thumbnails: { [workspaceId: string]: string | undefined } = {};
    for (const workspaceId of tabs) {
      const imageIds = getWorkspaceImageIds(state)(workspaceId) || [];
      const firstImageId = imageIds.length > 0 ? imageIds[0] : null;
      const props = firstImageId !== null
        ? getImageProps(state)(firstImageId)
        : undefined;
      thumbnails[workspaceId] = (props && props.data) || undefined;
    }
    return {
      activeTabId: getActiveWorkspaceId(state),
      tabs,
      thumbnails,
      canAddWorkspace: isLastWorkspaceUsed(state),
    };
  };

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> =
  (dispatch) => (
    {
      onAddNewTab: () => {
        const id = uniqueId('workspace_');
        dispatch(addNewWorkspace({ id }));
        dispatch(setActiveWorkspace({ id }));
      },
      onTabChanged: (id) => dispatch(setActiveWorkspace({ id })),
    }
  );

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(WorkspaceSwitcher);

export default connected;
