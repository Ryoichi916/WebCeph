import { connect } from 'react-redux';
import uniqueId from 'lodash/uniqueId';

import PatientPicker from './index';
import { StateProps, DispatchProps } from './props';

import {
  addPatient,
  removePatient,
  openPatient,
  setPatientTrendPlot,
} from 'actions/workspace';
import {
  getPatientsList,
  getPatientCaseIndex,
  getRestoreFromCaseFileError,
} from 'store/reducers/patients';
import { PatientDetails } from 'components/PatientFields';

const mapStateToProps = (state: StoreState): StateProps => ({
  patients: getPatientsList(state),
  caseIndex: getPatientCaseIndex(state),
  // Why the last restore did not land — the case list is where a failed restore
  // puts the clinician back. @see StoreState['patients.restoreError']
  restoreError: getRestoreFromCaseFileError(state),
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
  /**
   * Restore a case from its file: register the chart the file names, then open
   * it **with the file**, so the import runs once the project slices are in
   * place. @see store/middleware/project
   */
  onRestoreFromCaseFile: (
    details: PatientDetails, file: File, trendPlot: string[] | null,
  ) => {
    const id = uniqueId(`patient_${new Date().getTime()}_`);
    dispatch(addPatient({
      id,
      name: details.name,
      chartId: details.chartId,
      dateOfBirth: details.dateOfBirth,
      sex: details.sex,
      reading: details.reading,
    }));
    // The measurements this case is followed on, where the file states them:
    // registration writes the four demographic fields and nothing else, and the
    // board is a clinical setting the file carries. @see Patient#trendPlot
    if (trendPlot !== null && trendPlot.length > 0) {
      dispatch(setPatientTrendPlot({ id, symbols: trendPlot }));
    }
    dispatch(openPatient({ patientId: id, restoreFromCaseFile: file }));
  },
  onOpen: (id: string) => dispatch(openPatient({ patientId: id })),
  onRemove: (id: string) => dispatch(removePatient({ id })),
});

export default connect(mapStateToProps, mapDispatchToProps)(PatientPicker);
