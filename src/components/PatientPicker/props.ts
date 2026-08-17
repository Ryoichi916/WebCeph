import { PatientDetails } from 'components/PatientFields';

export interface StateProps {
  patients: Patient[];
  /**
   * What each patient's saved project holds, keyed by patient id — the record
   * count, visits, last visit, tracing progress and film thumbnail the case list
   * shows and sorts on. A patient with no entry has no saved project yet.
   * @see PatientCaseSummary
   */
  caseIndex: { [id: string]: PatientCaseSummary };
  /**
   * Why the last restore from a case file failed, or null.
   *
   * Restoring registers a chart and then reads the file into it, and the case
   * list unmounts the moment the chart opens — so this is where the outcome of a
   * restore that did not land comes back to. The chart is taken off the list
   * again by the project middleware; the list states why.
   * @see StoreState['patients.restoreError']
   */
  restoreError: GenericError | null;
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
  /**
   * Register the chart a case file names and read the case into it.
   *
   * One press, two acts: the patient has to exist before there is a project to
   * read a case into. The file is handed to `OPEN_PATIENT_REQUESTED` rather than
   * dispatched beside it, because opening a patient replaces the project slices
   * wholesale and an import in the same tick loses everything it read in.
   * @see ./RestoreFromCaseFile, store/middleware/project
   */
  onRestoreFromCaseFile(
    details: PatientDetails,
    file: File,
    /**
     * The measurement trend board the file carries for this case, or null — a
     * clinical setting that travels with the case (@see Patient#trendPlot), and
     * a chart being registered from the file has none of its own to keep.
     */
    trendPlot: string[] | null,
  ): any;
  onOpen(id: string): any;
  onRemove(id: string): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
