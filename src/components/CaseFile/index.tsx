import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import CircularProgress from 'material-ui/CircularProgress';

import * as cx from 'classnames';

import Props from './props';

// The counted facts of a case, shared with the case list's restore dialog so the
// two surfaces cannot state the same file differently. @see ./Facts
import CaseFileFacts from './Facts';

import {
  CaseFileManifest,
  CASE_FILE_EXCLUSIONS,
  readManifestFromFile,
} from 'utils/importers/wceph/v1/manifest';

import { formatCaptureDate } from 'utils/records';
import { formatAgeFull } from 'utils/patient';

const classes = require('./style.scss');

/**
 * The one file a case ever leaves this device in — offered honestly.
 *
 * Patient data is held in this browser and that is the requirement, not a gap;
 * the consequence is that the `.wceph` case file is the *only* way a chart moves
 * to another machine, gets kept off it, or reaches a colleague. So the two things
 * that matter about it are that it works in both directions and that a clinician
 * can see what is in it before they trust it with a record.
 *
 * This dialog is the second of those. It never states a capability the format does
 * not have and never states a count it has not made:
 *
 *  - **Exporting** shows what is in *this* chart and would therefore be written —
 *    the images, the visits they belong to, the tracings, the calibrations, the
 *    photographic series and the clinical entries — and, in the same breath, the
 *    things the format does not carry (@see CASE_FILE_EXCLUSIONS).
 *  - **Importing** opens the chosen file and reads its own manifest *before
 *    anything is dispatched*, then says exactly what will happen to the chart on
 *    screen: what is added, what is never replaced, and — field by field — what
 *    the file says about the patient against what this chart already says.
 *
 * **Both halves stay open until the act they started has finished**, which is the
 * thing this dialog got most wrong. It used to fire the action and close in the
 * same tick, so an export that threw produced no file and no word about it — the
 * clinician was left believing their only copy had been written — and an import
 * that broke halfway left the chart unchanged with nothing on screen to say so.
 * The outcome of both is now reported here, in words, before this closes.
 *
 * The demographics deserve their own paragraph, because they are the reason the
 * import half of this dialog exists at all. The format carries them now
 * (@see WCephJSON#patient), but a file written before it did carries none, and a
 * chart that arrives without a date of birth cannot have a single age-corrected
 * norm applied to it. That is stated in words, on screen, rather than left for a
 * clinician to discover in the analysis panel three films later. And what the file
 * says never overwrites what the chart says: an import fills blanks and keeps
 * everything already on file, exactly as `LOAD_VISIT_NOTES` does for the notes —
 * and it fills them **only once the import has actually landed**, so a file that
 * failed cannot leave its date of birth behind on a chart it never reached.
 */

type FieldKey = 'name' | 'chartId' | 'dateOfBirth' | 'sex' | 'reading';

/** How one demographic field of the file compares with the open chart's. */
interface FieldRow {
  key: FieldKey;
  label: string;
  /** What the file says, already formatted for reading. `''` = it says nothing. */
  fileValue: string;
  /** What this chart says. */
  chartValue: string;
  /**
   * `absent` — the file states nothing, so nothing happens to this field.
   * `same`   — both agree.
   * `fill`   — the chart has nothing here and the file does: it gets filled in.
   * `keep`   — both state something and they differ: **this chart's is kept**.
   */
  outcome: 'absent' | 'same' | 'fill' | 'keep';
}

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'reading', label: 'Reading' },
  { key: 'chartId', label: 'Chart ID' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'sex', label: 'Sex' },
];

const readSex = (sex: PatientSex | undefined): string => {
  if (sex === 'female') {
    return 'Female';
  }
  if (sex === 'male') {
    return 'Male';
  }
  return '';
};

const text = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** The file's demographics against the chart's, one row per field. */
const compareDemographics = (
  manifest: CaseFileManifest, patient: Patient | null,
): FieldRow[] => {
  const file = manifest.patient;
  return FIELDS.map(({ key, label }): FieldRow => {
    const fileValue = file === null
      ? ''
      : (key === 'sex' ? readSex(file.sex) : text(file[key]));
    const chartValue = patient === null
      ? ''
      : (key === 'sex' ? readSex(patient.sex) : text(patient[key]));
    let outcome: FieldRow['outcome'] = 'absent';
    if (fileValue !== '') {
      if (chartValue === '') {
        outcome = 'fill';
      } else if (chartValue === fileValue) {
        outcome = 'same';
      } else {
        outcome = 'keep';
      }
    }
    return { key, label, fileValue, chartValue, outcome };
  });
};

/**
 * The blanks-only patch those rows add up to, or null when there are none.
 *
 * The trend board rides with them on the same terms (@see Patient#trendPlot): a
 * chart that already follows this case on measurements of its own keeps them,
 * and one that is on the default board takes the file's. It is written by its
 * own action on the far side — see store/middleware/import.
 */
const buildPatch = (
  rows: FieldRow[], manifest: CaseFileManifest, patient: Patient | null,
): Partial<Patient> | null => {
  const file = manifest.patient;
  if (file === null) {
    return null;
  }
  const patch: Partial<Patient> = {};
  let count = 0;
  rows.forEach((row) => {
    if (row.outcome !== 'fill') {
      return;
    }
    count += 1;
    if (row.key === 'sex') {
      patch.sex = file.sex;
    } else {
      patch[row.key] = file[row.key];
    }
  });
  if (file.trendPlot !== null && !chartHasTrendPlot(patient)) {
    patch.trendPlot = file.trendPlot;
    count += 1;
  }
  return count > 0 ? patch : null;
};

/** Whether this chart already follows the case on a board of its own. */
const chartHasTrendPlot = (patient: Patient | null): boolean =>
  patient !== null && Array.isArray(patient.trendPlot) &&
  patient.trendPlot.length > 0;

/** Who a case names itself as, for the sentence that names both charts. */
const nameOf = (
  who: { name: string; chartId: string } | Patient | null,
): string => {
  if (who === null) {
    return 'a chart with no name or chart ID';
  }
  const parts = [text(who.name), text(who.chartId)].filter((p) => p !== '');
  return parts.length > 0 ? parts.join(' · ') : 'a chart with no name or chart ID';
};

/**
 * Whether the file names a **different patient** from the chart it is being read
 * into — a name or a chart ID that is stated on both sides and disagrees.
 *
 * Merging one case into another is a legitimate thing to do (a colleague's file,
 * a case re-registered on this machine) and it is not refused. But it was shown
 * only as a 12px chip in the fourth row of a five-row table, and after the import
 * there was no trace at all that the films had come from another chart — twelve
 * of Mika Arai's films sat under Nao Kubo, re-aged by the wrong date of birth.
 * So it is promoted out of the table and has to be acknowledged.
 */
const isDifferentPatient = (rows: FieldRow[]): boolean =>
  rows.some((row) =>
    (row.key === 'name' || row.key === 'chartId') && row.outcome === 'keep');

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** What is on screen after Export was pressed. */
type ExportOutcome = 'written' | 'failed' | null;

interface State {
  /** The file the clinician chose to import, before anything is dispatched. */
  file: File | null;
  /** What that file turned out to hold, read straight out of it. */
  fileManifest: CaseFileManifest | null;
  /** Why the chosen file could not be read or imported, in the reader's words. */
  error: string | null;
  isReading: boolean;
  /**
   * Acknowledged that the file was written for another patient. Import is
   * refused until it is. @see isDifferentPatient
   */
  acknowledged: boolean;
  /** An import dispatched from this dialog that has not resolved yet. */
  awaitingImport: boolean;
  /** An export dispatched from this dialog that has not resolved yet. */
  awaitingExport: boolean;
  exportOutcome: ExportOutcome;
}

const emptyState = (): State => ({
  file: null,
  fileManifest: null,
  error: null,
  isReading: false,
  acknowledged: false,
  awaitingImport: false,
  awaitingExport: false,
  exportOutcome: null,
});

/** A stored error, reduced to the sentence it holds. */
const readError = (error: GenericError | null, fallback: string): string => {
  if (error === null) {
    return fallback;
  }
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  return message !== '' ? message : fallback;
};

export default class CaseFile extends React.PureComponent<Props, State> {
  state: State = emptyState();

  private input: HTMLInputElement | null = null;

  componentWillReceiveProps(next: Props) {
    // Every open starts from nothing chosen: a manifest read from last time's
    // file must never be on screen above this time's chart, and last time's
    // outcome must never be read as this time's.
    if (next.mode !== null && next.mode !== this.props.mode) {
      this.setState(emptyState());
    }
  }

  /**
   * Where the two waits end.
   *
   * Both acts are dispatched into middleware and resolve asynchronously, and
   * neither used to be waited on at all — the dialog fired and closed in the
   * same tick, which is exactly how a failed export came to produce no file and
   * no word about it. Done here rather than in `componentWillReceiveProps`
   * because closing the dialog on success is a side effect and does not belong
   * in the render phase.
   */
  componentDidUpdate(prev: Props) {
    const { isImporting, importError, isExporting, exportError } = this.props;

    if (this.state.awaitingImport) {
      const failedNow = importError !== null && importError !== prev.importError;
      const settled = prev.isImporting && !isImporting;
      if (failedNow || settled) {
        if (importError !== null) {
          // Nothing was read in — and nothing about the patient was written
          // either, because the patch travelled with the import and the import
          // did not land. @see Events['IMPORT_FILE_REQUESTED']#patientPatch
          this.setState({
            awaitingImport: false,
            error: readError(
              importError,
              'This case file could not be read into this chart. Nothing on ' +
              'this chart has been changed.',
            ),
          });
        } else {
          this.setState({ awaitingImport: false });
          this.props.onRequestClose();
        }
      }
    }

    if (this.state.awaitingExport && prev.isExporting && !isExporting) {
      this.setState({
        awaitingExport: false,
        exportOutcome: exportError !== null ? 'failed' : 'written',
      });
    }
  }

  render() {
    const { mode, onRequestClose } = this.props;
    if (mode === null) {
      return null;
    }
    const isExport = mode === 'export';
    return (
      <Dialog
        open
        modal={false}
        onRequestClose={onRequestClose}
        // Screen-only chrome: the records sheet behind this prints, and an open
        // dialog's overlay put a grey wash over the whole page.
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <h3 className={classes.title_heading}>
              {isExport
                ? 'Export this case as a file'
                : 'Open a case file into this chart'}
            </h3>
            <span className={classes.title_caption}>
              {this.describeChart()}
            </span>
          </div>
        }
        actions={isExport ? this.renderExportActions() : this.renderImportActions()}
        autoScrollBodyContent
        contentStyle={{ width: '94%', maxWidth: 620 }}
        bodyStyle={{ padding: '4px 24px 12px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
        paperProps={{
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        {isExport ? this.renderExport() : this.renderImport()}
      </Dialog>
    );
  }

  /** The chart this dialog is acting on, named the way the case list names it. */
  private describeChart = (): string => {
    const { patient } = this.props;
    if (patient === null) {
      return 'No patient is open on this device';
    }
    return [text(patient.chartId), text(patient.name)]
      .filter((part) => part !== '')
      .join(' · ') || 'This chart';
  };

  // ---- Export ---------------------------------------------------------------

  private renderExportActions = () => {
    const { isExporting, exportProgress, onRequestClose } = this.props;
    const { exportOutcome } = this.state;
    // Written: there is one thing left to do, and it is to close.
    if (exportOutcome === 'written') {
      return [
        <RaisedButton
          key="done"
          primary
          label="Done"
          labelStyle={{ textTransform: 'none', fontWeight: 600 }}
          onClick={onRequestClose}
        />,
      ];
    }
    return [
      <FlatButton
        key="cancel"
        label="Cancel"
        labelStyle={{ textTransform: 'none' }}
        disabled={isExporting}
        onClick={onRequestClose}
      />,
      <RaisedButton
        key="export"
        primary
        label={isExporting
          ? (exportProgress !== null
            ? `Writing… ${Math.round(exportProgress)}%` : 'Writing…')
          : (exportOutcome === 'failed' ? 'Try again' : 'Export case file')}
        labelStyle={{ textTransform: 'none', fontWeight: 600 }}
        style={{ marginLeft: 8 }}
        icon={isExporting
          ? <CircularProgress size={18} thickness={2} /> : undefined}
        disabled={isExporting}
        onClick={this.handleExport}
      />,
    ];
  }

  private renderExport = () => {
    const { manifest, isExporting, exportedFileName, exportError } = this.props;
    const { exportOutcome } = this.state;
    return (
      <div className={classes.body}>
        <p className={classes.lead}>
          One file, one case. It is written to this device — nothing is uploaded
          anywhere — and it is the file to keep, to move this chart to another
          machine, or to hand to a colleague who uses WebCeph.
        </p>
        {isExporting ? (
          <p className={classes.note_busy}>
            Writing this case out. A case of twenty films is tens of megabytes
            and takes a moment — the file is offered for saving as soon as it is
            written.
          </p>
        ) : null}
        {exportOutcome === 'written' && exportedFileName !== null ? (
          <p className={classes.written}>
            Written as
            {' '}
            <strong className={classes.written_name}>{exportedFileName}</strong>
            {' '}
            — your browser has saved it wherever it puts downloads. Nothing on
            this chart has changed.
          </p>
        ) : null}
        {exportOutcome === 'failed' ? (
          <p className={classes.error}>
            {readError(
              exportError,
              'This chart could not be written as a case file, and no file was ' +
              'created.',
            )}
          </p>
        ) : null}
        <CaseFileFacts manifest={manifest} heading="This file will carry" />
        {this.renderExclusions()}
      </div>
    );
  }

  private handleExport = () => {
    // Deliberately no `onRequestClose`: this dialog is where the outcome is
    // reported, and closing here is what made a failed export completely silent.
    this.setState({ awaitingExport: true, exportOutcome: null });
    this.props.onExport();
  }

  // ---- Import ---------------------------------------------------------------

  private renderImportActions = () => {
    const { patient, onRequestClose } = this.props;
    const { fileManifest, awaitingImport, acknowledged } = this.state;
    const count = fileManifest !== null ? fileManifest.imageCount : 0;
    const needsAck = fileManifest !== null &&
      isDifferentPatient(compareDemographics(fileManifest, patient)) &&
      !acknowledged;
    return [
      <FlatButton
        key="cancel"
        label="Cancel"
        labelStyle={{ textTransform: 'none' }}
        disabled={awaitingImport}
        onClick={onRequestClose}
      />,
      <RaisedButton
        key="import"
        primary
        label={awaitingImport
          ? 'Reading in…'
          : (fileManifest === null
            ? 'Import'
            : (count === 1 ? 'Import 1 image' : `Import ${count} images`))}
        labelStyle={{ textTransform: 'none', fontWeight: 600 }}
        style={{ marginLeft: 8 }}
        icon={awaitingImport
          ? <CircularProgress size={18} thickness={2} /> : undefined}
        disabled={fileManifest === null || count === 0 || awaitingImport || needsAck}
        onClick={this.handleImport}
      />,
    ];
  }

  private renderImport = () => {
    const { patient, manifest } = this.props;
    const {
      file, fileManifest, error, isReading, awaitingImport,
    } = this.state;
    // Entries of the file that land on a visit this chart has already written
    // up. Counted from both manifests, so the dialog states the collision it can
    // compute rather than letting the reader find out it happened.
    const collisions = fileManifest !== null
      ? fileManifest.noteKeys.filter(
        (key) => manifest.noteKeys.indexOf(key) !== -1)
      : [];
    return (
      <div className={classes.body}>
        <p className={classes.lead}>
          A case file is read into the chart that is open — it is added to it.
          Nothing already on this chart is replaced, overwritten or removed.
        </p>
        <div className={classes.pick}>
          <input
            ref={this.setInput}
            type="file"
            accept=".wceph"
            className={classes.pick_input}
            // Never in the tab order: it is invisible, it has no focus ring, and
            // a keyboard user tabbing through this dialog landed on it with no
            // way to tell where they were. The button beside it is the control.
            tabIndex={-1}
            aria-hidden="true"
            onChange={this.handleFileChosen}
          />
          <RaisedButton
            label={file === null ? 'Choose a .wceph file…' : 'Choose another file…'}
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            disabled={awaitingImport}
            onClick={this.openPicker}
          />
          {file !== null ? (
            <span className={classes.pick_name}>{file.name}</span>
          ) : null}
          {isReading ? (
            <span className={classes.pick_name}>Reading…</span>
          ) : null}
        </div>
        {error !== null ? (
          <p className={classes.error}>{error}</p>
        ) : null}
        {awaitingImport ? (
          <p className={classes.note_busy}>
            Reading this case into the chart. Nothing is written to the record
            until every image in the file has been read.
          </p>
        ) : null}
        {/**
          * The one consequence of pressing Import that is not additive, said
          * where the file is chosen rather than at the foot of a rules list
          * three viewport-heights below the live Import button. The detail —
          * which visits, and where the entries end up — stays in the rules.
          */}
        {collisions.length > 0 ? (
          <p className={classes.collide}>
            {`${collisions.length} of ` +
              `${plural(fileManifest !== null ? fileManifest.noteCount : 0,
                'entry', 'entries')} in this file ` +
              `${collisions.length === 1 ? 'names a visit' : 'name visits'} ` +
              'this chart has already written up. Nothing on file is replaced: ' +
              `${collisions.length === 1 ? 'it is' : 'they are'} kept unfiled ` +
              'at the foot of the records page.'}
          </p>
        ) : null}
        {fileManifest !== null ? (
          <div>
            {this.renderOtherPatient(fileManifest, patient)}
            <CaseFileFacts manifest={fileManifest} heading="This file carries" />
            {this.renderDemographics(fileManifest, patient)}
            <ul className={classes.rules}>
              <li>
                {plural(fileManifest.imageCount, 'image is', 'images are')} added
                to this chart, each on its own record tile, keeping its type, its
                visit label, its capture date, its tracing and its mm/px scale.
              </li>
              <li>
                A clinical entry is filed onto the visit its label names. A visit
                that already holds an entry on this chart keeps the entry it has —
                an import can never replace one.
                {collisions.length > 0 ? (
                  <strong className={classes.rule_emphasis}>
                    {` The ${collisions.length === 1 ? 'visit' : 'visits'} this ` +
                      'chart has already written up and this file also writes ' +
                      `up: ${collisions.join(', ')}. The file's ` +
                      `${collisions.length === 1 ? 'entry is' : 'entries are'} ` +
                      'kept unfiled at the foot of the records page, where ' +
                      `${collisions.length === 1 ? 'it' : 'they'} can be read ` +
                      'in full and filed by hand. Nothing is discarded.'}
                  </strong>
                ) : null}
                {' '}
                An entry whose visit this chart has no image of is listed unfiled
                in the same place.
              </li>
              <li>
                Nothing on this chart is deleted, and no image already on it is
                touched. Importing the same file twice files a second copy of its
                images rather than merging them.
              </li>
            </ul>
          </div>
        ) : null}
        {this.renderExclusions()}
      </div>
    );
  }

  /**
   * The file was written for somebody else — said once, in a sentence, above
   * everything else, and acknowledged before Import will run.
   */
  private renderOtherPatient = (
    fileManifest: CaseFileManifest, patient: Patient | null,
  ) => {
    const rows = compareDemographics(fileManifest, patient);
    if (!isDifferentPatient(rows)) {
      return null;
    }
    const { acknowledged, awaitingImport } = this.state;
    return (
      <section className={classes.alien}>
        <h4 className={classes.alien_heading}>
          This file was written for a different patient
        </h4>
        <p className={classes.alien_text}>
          The file names
          {' '}
          <strong>{nameOf(fileManifest.patient)}</strong>
          . You are opening it into
          {' '}
          <strong>{nameOf(patient)}</strong>
          {'. '}
          Its images will be filed on this chart and dated against
          <em>{' this '}</em>
          patient's date of birth, so every age-corrected norm on them will be
          computed for this patient and not for the one the file names.
        </p>
        <label className={classes.alien_ack}>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={awaitingImport}
            onChange={this.handleAcknowledge}
          />
          <span>
            I have checked this: these records belong on this chart.
          </span>
        </label>
      </section>
    );
  }

  private handleAcknowledge = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    this.setState({ acknowledged: event.target.checked });
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
   * Read the chosen file and report what is in it. Deliberately nothing is
   * dispatched here: the clinician sees the file's own manifest, and the
   * consequences for this chart, before a single action reaches the record.
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
      file, fileManifest: null, error: null, isReading: true,
      acknowledged: false,
    });
    try {
      const fileManifest = await readManifestFromFile(file);
      this.setState({ fileManifest, error: null, isReading: false });
    } catch (e) {
      this.setState({
        fileManifest: null,
        isReading: false,
        error: e && e.message
          ? e.message
          : 'This file could not be read as a WebCeph case file.',
      });
    }
  }

  private handleImport = () => {
    const { patient, onImport } = this.props;
    const { file, fileManifest } = this.state;
    if (file === null || fileManifest === null) {
      return;
    }
    const rows = compareDemographics(fileManifest, patient);
    // The demographic patch goes *with* the file: it is written only if the
    // import lands. @see Events['IMPORT_FILE_REQUESTED']#patientPatch
    this.setState({ awaitingImport: true, error: null });
    onImport(file, buildPatch(rows, fileManifest, patient));
  }

  // ---- Shared readings ------------------------------------------------------

  /**
   * The file's demographics against the chart's — the half of an import that used
   * to happen invisibly or not at all.
   *
   * Every field is named, both values are shown, and what will happen to each is
   * stated in the same row. And where the chart is *still* left without a date of
   * birth once the file has been read, that is said outright: it is the field nine
   * analyses index their norms by, and a chart that silently lacks it reports
   * uncorrected numbers that look exactly like corrected ones.
   */
  private renderDemographics = (
    manifest: CaseFileManifest, patient: Patient | null,
  ) => {
    const rows = compareDemographics(manifest, patient);
    const dobRow = rows.filter((row) => row.key === 'dateOfBirth')[0];
    const chartHasDob = dobRow.chartValue !== '';
    const willHaveDob = chartHasDob || dobRow.outcome === 'fill';
    const age = willHaveDob
      ? formatAgeFull(chartHasDob ? dobRow.chartValue : dobRow.fileValue)
      : null;
    return (
      <section className={classes.block}>
        <h4 className={classes.block_heading}>
          The patient's own details
        </h4>
        {manifest.patient === null ? (
          <p className={classes.note}>
            This file carries no patient details at all — it was written before
            the format held them. Everything below stays exactly as this chart
            records it.
          </p>
        ) : (
          <p className={classes.note}>
            A field this chart leaves blank is filled in from the file, once the
            import has actually gone in. A field this chart already records is
            kept as it is, even where the file disagrees — an import never
            overwrites what is on file.
          </p>
        )}
        <dl className={classes.facts}>
          {rows.map((row) => (
            <div key={row.key} className={classes.fact}>
              <dt className={classes.fact_key}>{row.label}</dt>
              <dd className={classes.fact_value}>
                <span className={classes.compare}>
                  <span className={classes.compare_side}>
                    <span className={classes.compare_who}>File</span>
                    <span className={classes.compare_what}>
                      {row.fileValue !== '' ? row.fileValue : 'not recorded'}
                    </span>
                  </span>
                  <span className={classes.compare_side}>
                    <span className={classes.compare_who}>This chart</span>
                    <span className={classes.compare_what}>
                      {row.chartValue !== '' ? row.chartValue : 'not recorded'}
                    </span>
                  </span>
                  <span
                    className={cx(classes.outcome, {
                      [classes.outcome__fill]: row.outcome === 'fill',
                      [classes.outcome__keep]: row.outcome === 'keep',
                    })}
                  >
                    {row.outcome === 'fill' ? 'will be filled in'
                      : row.outcome === 'keep' ? 'this chart\'s is kept'
                        : row.outcome === 'same' ? 'the same'
                          : 'unchanged'}
                  </span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {/* The measurements this case is followed on — a clinical setting, and
            the one field of the patient block that is not a demographic. Said
            here because it is filled in (or kept) by the same rule as the rows
            above, and because the file used to carry it nowhere at all: a board
            set to IMPA and U1-L1 came back on the default five.
            @see Patient#trendPlot */}
        {manifest.patient !== null && manifest.patient.trendPlot !== null ? (
          <p className={classes.note}>
            {`This file follows the case on ` +
              `${manifest.patient.trendPlot.join(', ')} in the measurement ` +
              'trend board. '}
            {chartHasTrendPlot(patient)
              ? 'This chart already plots a board of its own, and keeps it.'
              : 'This chart is on the default board, so it will be filled in ' +
                'from the file.'}
          </p>
        ) : null}
        {!willHaveDob ? (
          <p className={classes.warn}>
            This chart will still have no date of birth. Every analysis in this
            app corrects its norms for age, so until one is recorded the
            measurements are reported against uncorrected norms — add it in
            Edit patient details once the import is done.
          </p>
        ) : (
          <p className={classes.note}>
            {age !== null
              ? `Date of birth on file after the import — the chart reads ${age} ` +
                'today, and the analyses correct their norms for it.'
              : 'A date of birth will be on file after the import.'}
          </p>
        )}
      </section>
    );
  }

  /** What the format does not hold, stated in both directions. */
  private renderExclusions = () => (
    <section className={classes.block}>
      <h4 className={classes.block_heading}>Not in a case file</h4>
      <ul className={classes.rules}>
        {CASE_FILE_EXCLUSIONS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}

/** Re-exported so callers can format a date the way this dialog does. */
export { formatCaptureDate };
