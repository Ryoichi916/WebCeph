export interface StateProps {
  patients: Patient[];
  /**
   * What each patient's saved project holds, keyed by patient id — the record
   * count, visits, last visit, tracing progress and film thumbnail the case list
   * shows and sorts on. A patient with no entry has no saved project yet.
   * @see PatientCaseSummary
   */
  caseIndex: { [id: string]: PatientCaseSummary };
}

export interface DispatchProps {
  onRegister(
    name: string,
    chartId: string,
    dateOfBirth: string,
    sex: PatientSex,
    /** Reading of the name (かな), or empty when it was not entered. */
    reading: string,
  ): any;
  onOpen(id: string): any;
  onRemove(id: string): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
