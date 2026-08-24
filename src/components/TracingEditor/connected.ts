import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';

import { getTracingImageId, getImportError } from 'store/reducers/workspace/settings';
import { isSummaryShown } from 'store/reducers/workspace/analyses';
import { isImageTraceable } from 'store/reducers/workspace/image';

import {
  getPatientRecords,
  shouldShowLoadingFileIndicator,
} from 'store/reducers/workspace';

import { getNextTimepointLabel } from 'utils/records';

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
      isLoadingFile: shouldShowLoadingFileIndicator(state)(workspaceId),
      importError: getImportError(state)(workspaceId),
      isSummaryShown: isSummaryShown(state),
      isImageTraceable: imageId !== null ? isImageTraceable(state)(imageId) : true,
      // The next *visit* in the series, read off the timepoint labels the
      // record already carries: T1 on a case with nothing on file, T2 once T1
      // exists — however many images T1 holds. Counted off the images instead
      // (the first formulation here), a visit that was both radiographed and
      // photographed made the app propose T3 for the second visit, and because
      // the proposal is prefilled it was accepted: the record kept a T2-shaped
      // hole nobody had skipped on purpose.
      defaultTimepoint: getNextTimepointLabel(getPatientRecords(state)),
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
