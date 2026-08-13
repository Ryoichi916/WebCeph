import { connect } from 'react-redux';

import PatientBar from './index';
import { StateProps, DispatchProps } from './props';

import {
  saveProject,
  setActivePatient,
  setRecordsDashboardShown,
} from 'actions/workspace';
import {
  getActivePatient,
  getActivePatientId,
} from 'store/reducers/patients';
import { getPatientRecords } from 'store/reducers/workspace';
import { isRecordsDashboardShown } from 'store/reducers/workspace/records';

const mapStateToProps = (state: StoreState): StateProps & { activeId: string | null } => ({
  activePatient: getActivePatient(state),
  recordCount: getPatientRecords(state).length,
  isRecordsShown: isRecordsDashboardShown(state),
  activeId: getActivePatientId(state),
});

const mapDispatchToProps = (dispatch: GenericDispatch) => ({ dispatch });

const mergeProps = (
  stateProps: StateProps & { activeId: string | null },
  { dispatch }: { dispatch: GenericDispatch },
  ownProps: { className?: string },
): DispatchProps & StateProps & { className?: string } => {
  const { activeId, ...rest } = stateProps;
  return {
    ...rest,
    ...ownProps,
    onSave: () => {
      if (activeId !== null) {
        dispatch(saveProject({ patientId: activeId }));
      }
    },
    // Returning to the picker clears the active patient; the project stays in
    // memory until another patient is opened (which loads over it).
    //
    // It is written on the way out first. Leaving is the moment the case list is
    // read again, and a list whose row said "No records" for a patient whose
    // films were filed thirty seconds earlier is a list that cannot be trusted —
    // the row is counted off the *saved* project (see PatientCaseSummary), and
    // the same save is what keeps the films themselves from being dropped when
    // the next patient loads over them.
    onChangePatient: () => {
      if (activeId !== null) {
        dispatch(saveProject({ patientId: activeId }));
      }
      dispatch(setActivePatient({ id: null }));
    },
    onToggleRecords: () => dispatch(setRecordsDashboardShown({
      isShown: !stateProps.isRecordsShown,
    })),
  };
};

export default connect(mapStateToProps, mapDispatchToProps, mergeProps)(PatientBar);
