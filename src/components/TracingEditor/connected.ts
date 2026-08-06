import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';

import { getTracingImageId } from 'store/reducers/workspace/settings';
import { isSummaryShown } from 'store/reducers/workspace/analyses';
import {
  isImageTraceable,
  getAllImages,
} from 'store/reducers/workspace/image';

import { getDefaultTimepoint } from 'utils/records';

import { importFileRequested, loadImageFromURL } from 'actions/workspace';

import TracingEditor from './index';

import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState, { workspaceId }: OwnProps): StateProps => {
    const imageId = getTracingImageId(state)(workspaceId);
    return {
      imageId,
      isSummaryShown: isSummaryShown(state),
      isImageTraceable: imageId !== null ? isImageTraceable(state)(imageId) : true,
      // The next timepoint in the series: T1 for the first image on file, T2
      // for the second, and so on.
      defaultTimepoint: getDefaultTimepoint(Object.keys(getAllImages(state)).length),
    };
  };

import { DEMO_IMAGE_URL as url } from 'utils/config';

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> =
  (dispatch: GenericDispatch, { workspaceId }: OwnProps): DispatchProps => {
    return {
      onFilesDrop: ([file], meta) =>
        dispatch(importFileRequested({ file, workspaceId, meta })),
      onDemoButtonClick: (meta) =>
        dispatch(loadImageFromURL({ url, workspaceId, meta })),
    };
  };

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(TracingEditor);


export default connected;
