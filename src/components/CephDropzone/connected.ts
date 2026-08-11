import {
  connect,
  MapStateToProps,
} from 'react-redux';
import CephaloDropzone from './index';
import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';

import { isAppOffline } from 'store/reducers/env/connection';
import { getRecordFilingIntent } from 'store/reducers/workspace/records';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> = (state) => ({
  isOffline: isAppOffline(state),
  // Set by an empty type slot on the records dashboard; null for a plain
  // "Add image".
  filingIntent: getRecordFilingIntent(state),
});

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps,
)(CephaloDropzone);


export default connected;
