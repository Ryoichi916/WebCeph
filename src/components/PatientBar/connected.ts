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

const mapStateToProps = (state: StoreState): StateProps & { activeId: string | null } => ({
  activePatient: getActivePatient(state),
  recordCount: getPatientRecords(state).length,
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
    onChangePatient: () => dispatch(setActivePatient({ id: null })),
    onOpenRecords: () => dispatch(setRecordsDashboardShown({ isShown: true })),
  };
};

export default connect(mapStateToProps, mapDispatchToProps, mergeProps)(PatientBar);
