import { connect } from 'react-redux';
import uniqueId from 'lodash/uniqueId';

import PatientBar from './index';
import { StateProps, DispatchProps } from './props';

import {
  addPatient,
  removePatient,
  setActivePatient,
} from 'actions/workspace';
import {
  getPatientsList,
  getActivePatient,
} from 'store/reducers/patients';

const mapStateToProps = (state: StoreState): StateProps => ({
  patients: getPatientsList(state),
  activePatient: getActivePatient(state),
});

const mapDispatchToProps = (dispatch: GenericDispatch): DispatchProps => ({
  onAdd: (name: string, chartId: string) =>
    dispatch(addPatient({ id: uniqueId(`patient_${new Date().getTime()}_`), name, chartId })),
  onSelect: (id: string | null) => dispatch(setActivePatient({ id })),
  onRemove: (id: string) => dispatch(removePatient({ id })),
});

export default connect(mapStateToProps, mapDispatchToProps)(PatientBar);
