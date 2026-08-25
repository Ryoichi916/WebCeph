import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import CircularProgress from 'material-ui/CircularProgress';

import CaseFileFacts from 'components/CaseFile/Facts';

import {
  PatientTextField,
  DateOfBirthField,
  SexField,
  PatientDetails,
  PatientDetailsError,
  validatePatientDetails,
} from 'components/PatientFields';

import {
  CaseFileManifest,
  readManifestFromFile,
  readWholeCaseFile,
} from 'utils/importers/wceph/v1/manifest';

const classes = require('./restore.scss');

/**
 * Reading a case file back onto a machine that has never seen the case.
 *
 * This is the missing half of "one file, one case", and it is the half that
 * matters when it matters most. A `.wceph` is the only artefact a chart leaves
 * this browser in, so the realistic reason to open one is that the machine
 * changed, the browser was cleared, or the file came from a colleague — and
 * until this dialog existed the only way in was through a chart that was already
 * open. On a new machine there is no chart, and the case list offered
 * registration and nothing else: a clinician restoring their only copy had to
 * invent the patient from memory before the app would read the file that names
 * them.
 *
 * So the file is read first and the chart is registered **from it**. The
 * manifest is shown before anything is created — the same counted facts the case
 * file dialog shows, from the same component, so the two cannot disagree — and
 * the patient's own details are put in the registration fields, filled in and
 * **editable**: the file states them, and a clinician may still correct a name
 * or give the chart the ID this practice files it under.
 *
 * No new record type and no new store: this registers one patient and reads one
 * case file into them, through the two actions that already do both.
 *
 * **It waits, and it reports.** Registering the chart opens it, which unmounts
 * the case list and this dialog with it — so a restore that failed after that
 * point had nowhere left to say so: the clinician was left looking at a new,
 * empty chart with their only copy apparently refused in silence. Two things fix
 * that, and both are here. The file is read *whole* first — every image in it
 * decoded, by the very importer that will read it for real — and nothing is
 * created until that comes back clean; the dialog stays open and says what it is
 * doing while it happens, and says why if it fails. And should an import fail
 * anyway, the chart it registered is taken off the case list again and the
 * reason is stated there (@see store/middleware/project,
 * StoreState['patients.restoreError']).
 */

export interface RestoreFromCaseFileProps {
  open: boolean;
  /** Chart IDs already in use, so a restore cannot collide with a chart on file. */
  existingChartIds: string[];
  onCancel(): any;
  /**
   * Register the chart from these details and read the file into it.
   *
   * `trendPlot` is the measurement trend board the file carries for this case,
   * or null — a clinical setting rather than a view (@see Patient#trendPlot),
   * and a brand-new chart has none of its own to keep.
   */
  onRestore(
    details: PatientDetails, file: File, trendPlot: string[] | null,
  ): any;
}

interface State {
  file: File | null;
  manifest: CaseFileManifest | null;
  /** Why the chosen file could not be read, in the words the reader gets. */
  readError: string | null;
  isReading: boolean;
  /** The whole file is being read through, before anything is created. */
  isRestoring: boolean;
  /**
   * Why the restore did not go ahead — the file turned out not to be readable
   * whole. Nothing was created; the button offers the file again.
   */
  restoreError: string | null;
  name: string;
  chartId: string;
  dateOfBirth: string;
  sex: PatientSex;
  reading: string;
  error: PatientDetailsError | null;
}

/**
 * The importer and the manifest reader both end their sentence with "Nothing has
 * been read into this chart", which is the right thing to say inside a chart.
 * On this path there is no chart at all — saying it here would tell a clinician
 * that one was made and left empty.
 */
const stripChartClause = (message: string): string =>
  message.replace(/\s*Nothing has been read into this chart\.?/, '').trim();

const emptyState = (): State => ({
  file: null,
  manifest: null,
  readError: null,
  isReading: false,
  isRestoring: false,
  restoreError: null,
  name: '',
  chartId: '',
  dateOfBirth: '',
  sex: '',
  reading: '',
  error: null,
});

export default class RestoreFromCaseFile
  extends React.PureComponent<RestoreFromCaseFileProps, State> {
  state: State = emptyState();

  private input: HTMLInputElement | null = null;

  componentWillReceiveProps(next: RestoreFromCaseFileProps) {
    // Every open starts from nothing chosen: last time's file must never be on
    // screen, and last time's details must never be registered by accident.
    if (next.open && !this.props.open) {
      this.setState(emptyState());
    }
  }

  render() {
    const { open, onCancel } = this.props;
    if (!open) {
      return null;
    }
    const {
      file, manifest, readError, isReading, isRestoring, restoreError,
    } = this.state;
    return (
      <Dialog
        open
        modal={false}
        onRequestClose={isRestoring ? undefined : onCancel}
        title={
          <div className={classes.title}>
            <h3 id="restore-case-file-title" className={classes.title_heading}>Open a case file</h3>
            <span className={classes.title_caption}>
              Register the chart the file names, and read the case into it
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="cancel"
            label="Cancel"
            labelStyle={{ textTransform: 'none' }}
            disabled={isRestoring}
            onClick={onCancel}
          />,
          <RaisedButton
            key="restore"
            primary
            label={isRestoring
              ? 'Reading in…'
              : (manifest === null
                ? 'Open case file'
                : (restoreError !== null
                  ? 'Try again'
                  : (manifest.imageCount === 1
                    ? 'Register and read in 1 image'
                    : `Register and read in ${manifest.imageCount} images`)))}
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            style={{ marginLeft: 8 }}
            icon={isRestoring
              ? <CircularProgress size={18} thickness={2} /> : undefined}
            disabled={manifest === null || file === null || isRestoring}
            onClick={this.handleRestore}
          />,
        ]}
        autoScrollBodyContent
        contentStyle={{ width: '94%', maxWidth: 640 }}
        bodyStyle={{ padding: '4px 24px 12px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
        paperProps={{
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'restore-case-file-title',
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        <div className={classes.body}>
          {/* Short on purpose: what a case file is belongs on one line, and the
              height it used to take was height the chart's own fields needed —
              at 1440×900 the date of birth and sex were cut off by the actions
              bar of this very dialog, which says in the next breath that the
              date of birth is what nine analyses index their norms by. */}
          <p className={classes.lead}>
            One file, one case: its films and photographs, their tracings and
            mm/px scales, its visits and the entries written at each. Reading it
            here registers the chart it names on this device. Nothing is uploaded,
            and no case already here is touched.
          </p>
          <div className={classes.pick}>
            <input
              ref={this.setInput}
              type="file"
              accept=".wceph"
              className={classes.pick_input}
              tabIndex={-1}
              aria-hidden="true"
              onChange={this.handleFileChosen}
            />
            <RaisedButton
              label={file === null
                ? 'Choose a .wceph file…' : 'Choose another file…'}
              labelStyle={{ textTransform: 'none', fontWeight: 600 }}
              disabled={isRestoring}
              onClick={this.openPicker}
            />
            {file !== null ? (
              <span className={classes.pick_name}>{file.name}</span>
            ) : null}
            {isReading ? (
              <span className={classes.pick_name}>Reading…</span>
            ) : null}
          </div>
          {readError !== null ? (
            <p className={classes.error}>{readError}</p>
          ) : null}
          {/* The restore did not go ahead, and the reason is the file's own. No
              chart was registered — the file is read whole before anything is
              created — so there is nothing to undo and nothing to explain away. */}
          {restoreError !== null ? (
            <p className={classes.error}>
              {`${restoreError} No chart was registered on this device.`}
            </p>
          ) : null}
          {isRestoring ? (
            <p className={classes.busy}>
              Reading this case file through — every image in it — before the
              chart is created. A case of twenty films takes a moment. Nothing is
              registered until the whole file has been read.
            </p>
          ) : null}
          {manifest !== null ? (
            <div>
              {/* Naming the chart is the act; the file's manifest is the
                  evidence for it. The act goes first — it used to sit under a
                  seven-row table, which is what pushed its last two fields
                  under the fold. */}
              {this.renderFields(manifest)}
              <CaseFileFacts manifest={manifest} heading="This file carries" />
            </div>
          ) : null}
          {/* A visible edge where the body scrolls, so a dialog with more below
              does not simply end mid-field. */}
          <div className={classes.scroll_edge} aria-hidden="true" />
        </div>
      </Dialog>
    );
  }

  /**
   * The chart's own details, filled in from the file and editable.
   *
   * Editable is the point: the file states what it states, and the clinician
   * decides what this practice's chart says. A file that carries no patient block
   * at all — everything written before the format held one — leaves these empty
   * and says so, rather than registering a nameless chart silently.
   */
  private renderFields = (manifest: CaseFileManifest) => {
    const { name, chartId, dateOfBirth, sex, reading, error } = this.state;
    const nameHasError =
      error !== null && (error.field === 'name' || error.field === 'both');
    const chartIdHasError =
      error !== null && (error.field === 'chartId' || error.field === 'both');
    return (
      <section className={classes.block}>
        <h4 className={classes.block_heading}>Register this chart as</h4>
        <p className={classes.note}>
          {manifest.patient === null
            ? 'This file carries no patient details — it was written before the ' +
              'format held them. Name the chart yourself; a date of birth is ' +
              'what every analysis corrects its norms for, so it is worth adding ' +
              'now.'
            : 'Filled in from the file, and yours to change before the chart is ' +
              'created. The date of birth is what all nine analyses index their ' +
              'age-corrected norms by.'}
        </p>
        <div className={classes.form_row}>
          <PatientTextField
            label="Patient name"
            placeholder="e.g. 山田 太郎"
            className={classes.field_name}
            value={name}
            invalid={nameHasError}
            message={nameHasError ? error!.message : null}
            onChange={this.handleNameChange}
          />
          <PatientTextField
            label="Chart ID"
            placeholder="e.g. C-0001"
            className={classes.field_chart}
            value={chartId}
            invalid={chartIdHasError}
            message={error !== null && error.field === 'chartId'
              ? error.message : null}
            onChange={this.handleChartIdChange}
          />
          <PatientTextField
            label="Reading (かな)"
            placeholder="e.g. やまだ たろう"
            optional
            className={classes.field_reading}
            value={reading}
            onChange={this.handleReadingChange}
          />
          <DateOfBirthField
            className={classes.field_dob}
            value={dateOfBirth}
            onChange={this.handleDateOfBirthChange}
          />
          <SexField value={sex} onChange={this.handleSexChange} />
        </div>
      </section>
    );
  }

  private setInput = (input: HTMLInputElement | null) => {
    this.input = input;
  }

  private openPicker = () => {
    if (this.input !== null) {
      this.input.click();
    }
  }

  /**
   * Read the chosen file and fill the form from it — **without creating
   * anything**. No patient exists until Register is pressed.
   */
  private handleFileChosen = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.value !== '' && event.target.files !== null
      ? event.target.files : null;
    const file = files !== null && files.length > 0 ? files[0] : null;
    if (file === null) {
      return;
    }
    this.setState({
      file, manifest: null, readError: null, isReading: true, error: null,
    });
    try {
      const manifest = await readManifestFromFile(file);
      const patient = manifest.patient;
      this.setState({
        manifest,
        readError: null,
        isReading: false,
        name: patient !== null ? patient.name : '',
        chartId: patient !== null ? patient.chartId : '',
        dateOfBirth: patient !== null ? patient.dateOfBirth : '',
        sex: patient !== null ? patient.sex : '',
        reading: patient !== null ? patient.reading : '',
      });
    } catch (e) {
      this.setState({
        manifest: null,
        isReading: false,
        // The reader's sentence is written for a chart that exists; here there is
        // none yet, and telling somebody nothing was read into "this chart"
        // implies one was created. @see stripChartClause
        readError: e && e.message
          ? `${stripChartClause(String(e.message))} Nothing was created on ` +
            'this device.'
          : 'This file could not be read as a WebCeph case file.',
      });
    }
  }

  private handleNameChange = (name: string) =>
    this.setState({ name, error: null });
  private handleChartIdChange = (chartId: string) =>
    this.setState({ chartId, error: null });
  private handleReadingChange = (reading: string) => this.setState({ reading });
  private handleDateOfBirthChange = (dateOfBirth: string) =>
    this.setState({ dateOfBirth });
  private handleSexChange = (sex: PatientSex) => this.setState({ sex });

  /**
   * Register the chart and read the case into it — **in that order, and only
   * once the file has been read whole**.
   *
   * The registration opens the chart, which unmounts this dialog and the case
   * list under it, so everything this dialog can still say has to be said
   * before that: the whole file is read through here (@see readWholeCaseFile),
   * with the outcome on screen either way. A file that cannot be read leaves the
   * device exactly as it was — no chart, no row, nothing to tidy up — and the
   * button offers it again.
   */
  private handleRestore = async () => {
    const { file, manifest, isRestoring } = this.state;
    if (file === null || manifest === null || isRestoring) {
      return;
    }
    const details: PatientDetails = {
      name: this.state.name.trim(),
      chartId: this.state.chartId.trim(),
      dateOfBirth: this.state.dateOfBirth,
      sex: this.state.sex,
      reading: this.state.reading.trim(),
    };
    // The same one rule set registration and Edit patient details use — a chart
    // needs a name or a chart ID, and a chart ID may not collide with one on
    // file. A file whose patient block is empty therefore has to be named here,
    // which is right: an unnamed chart is not a chart.
    const error = validatePatientDetails(
      details, this.props.existingChartIds, 'open this file',
    );
    if (error !== null) {
      this.setState({ error });
      return;
    }
    this.setState({ isRestoring: true, restoreError: null });
    try {
      await readWholeCaseFile(file);
    } catch (e) {
      this.setState({
        isRestoring: false,
        restoreError: e && e.message
          ? stripChartClause(String(e.message))
          : 'This case file could not be read.',
      });
      return;
    }
    // The file reads whole. From here the two acts are one press, and the chart
    // is opened with the file — @see components/PatientPicker#handleRestore.
    this.props.onRestore(
      details, file,
      manifest.patient !== null ? manifest.patient.trendPlot : null,
    );
  }
}
