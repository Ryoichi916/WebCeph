import { connect } from 'react-redux';
import uniqueId from 'lodash/uniqueId';

import PatientPicker from './index';
import { StateProps, DispatchProps } from './props';

import {
  addPatient,
  removePatient,
  openPatient,
} from 'actions/workspace';
import { getPatientsList, getPatientCaseIndex } from 'store/reducers/patients';

const mapStateToProps = (state: StoreState): StateProps => ({
  patients: getPatientsList(state),
  caseIndex: getPatientCaseIndex(state),
});

const mapDispatchToProps = (dispatch: GenericDispatch): DispatchProps => ({
  onRegister: (
    name: string,
    chartId: string,
    dateOfBirth: string,
    sex: PatientSex,
    reading: string,
  ) => {
    const id = uniqueId(`patient_${new Date().getTime()}_`);
    dispatch(addPatient({ id, name, chartId, dateOfBirth, sex, reading }));
    dispatch(openPatient({ patientId: id }));
  },
  onOpen: (id: string) => dispatch(openPatient({ patientId: id })),
  onRemove: (id: string) => dispatch(removePatient({ id })),
});

export default connect(mapStateToProps, mapDispatchToProps)(PatientPicker);
