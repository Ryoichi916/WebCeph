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
  getImageType,
  getImageTimepoint,
  getImageCaptureDate,
} from 'store/reducers/workspace/image';

import {
  getImageTypeShortLabel,
  getImageTypeLabel,
  getImageTypeLabelWithArticle,
  formatCaptureDate,
} from 'utils/records';

import { getRecordFilingIntent } from 'store/reducers/workspace/records';

import { TabCaption } from './props';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState) => {
    const tabs = getWorkspacesIdsInOrder(state);
    // A miniature of the workspace's radiograph, rendered inside its page tile,
    // plus the record caption (timepoint + image type) shown beneath it.
    const thumbnails: { [workspaceId: string]: string | undefined } = {};
    const captions: { [workspaceId: string]: TabCaption | undefined } = {};
    for (const workspaceId of tabs) {
      const imageIds = getWorkspaceImageIds(state)(workspaceId) || [];
      const firstImageId = imageIds.length > 0 ? imageIds[0] : null;
      const props = firstImageId !== null
        ? getImageProps(state)(firstImageId)
        : undefined;
      thumbnails[workspaceId] = (props && props.data) || undefined;
      if (firstImageId !== null && props !== undefined) {
        const timepoint = getImageTimepoint(state)(firstImageId);
        const type = getImageType(state)(firstImageId);
        const date = formatCaptureDate(getImageCaptureDate(state)(firstImageId));
        captions[workspaceId] = {
          timepoint,
          typeLabel: getImageTypeShortLabel(type),
          fullLabel: [
            timepoint,
            getImageTypeLabel(type),
            date,
          ].filter((part) => part !== null).join(' · '),
        };
      }
    }
    // The slot-directed upload in progress, and the tile it is waiting on: the
    // dashboard sends the clinician to an empty tile with a filing intent
    // attached (see workspace/records#KEY_FILING_INTENT), so that tile can say
    // what it is about to hold instead of showing a bare ordinal.
    const activeTabId = getActiveWorkspaceId(state);
    const intent = getRecordFilingIntent(state);
    const isActiveEmpty = activeTabId !== null &&
      thumbnails[activeTabId] === undefined;
    const isPending = intent !== null && isActiveEmpty;
    const intentDate = intent !== null
      ? formatCaptureDate(intent.captureDate) : null;
    return {
      activeTabId,
      tabs,
      thumbnails,
      captions,
      canAddWorkspace: isLastWorkspaceUsed(state),
      pendingWorkspaceId: isPending ? activeTabId : null,
      pendingCaption: isPending && intent !== null ? {
        timepoint: intent.timepoint,
        typeLabel: getImageTypeShortLabel(intent.type),
        fullLabel: [
          `Filing ${getImageTypeLabelWithArticle(intent.type)}`,
          intent.timepoint !== null ? `at ${intent.timepoint}` : null,
          intentDate !== null ? `· ${intentDate}` : null,
          '— pick an image for this tile',
        ].filter((part) => part !== null).join(' '),
      } : null,
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
