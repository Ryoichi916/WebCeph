import { connect } from 'react-redux';

import Superimposition from './index';
import { StateProps, OwnProps } from './props';

import { getSuperimpositionTimepoints } from './selectors';

import { getActivePatient } from 'store/reducers/patients';

const mapStateToProps = (state: StoreState): StateProps => ({
  patient: getActivePatient(state),
  timepoints: getSuperimpositionTimepoints(state),
});

export default connect<StateProps, { }, OwnProps>(
  mapStateToProps,
)(Superimposition);
