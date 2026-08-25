import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import {
  PatientTextField,
  DateOfBirthField,
  SexField,
  PatientDetails,
  PatientDetailsError,
  validatePatientDetails,
} from 'components/PatientFields';

import { formatAgeFull } from 'utils/patient';

const classes = require('./editpatient.scss');

/** A field of the patient form, nameable by whatever opened the dialog. */
export type PatientEditField =
  'name' | 'chartId' | 'dateOfBirth' | 'sex' | 'reading';

export interface EditPatientDialogProps {
  open: boolean;
  /** The patient being corrected; the dialog opens on their stored values. */
  patient: Patient | null;
  /**
   * The field to land keyboard focus in when the dialog opens, when whatever
   * opened it named one ("Add date of birth" on the records dashboard). Null
   * opens the form with focus untouched.
   */
  focusField?: PatientEditField | null;
  /**
   * Chart IDs of every *other* patient, so a collision is caught here rather
   * than producing two records with one chart ID. The patient keeping their own
   * chart ID is not a duplicate of themselves.
   */
  otherChartIds: string[];
  onSave(details: PatientDetails): any;
  onCancel(): any;
}

interface State {
  details: PatientDetails;
  error: PatientDetailsError | null;
}

const emptyDetails = (): PatientDetails => ({
  name: '', chartId: '', dateOfBirth: '', sex: '', reading: '',
});

const detailsOf = (patient: Patient | null): PatientDetails =>
  patient === null ? emptyDetails() : {
    name: patient.name || '',
    chartId: patient.chartId || '',
    dateOfBirth: patient.dateOfBirth || '',
    sex: patient.sex || '',
    reading: patient.reading || '',
  };

/**
 * "Edit patient details" — the same four fields registration asks for
 * (components/PatientFields), re-opened on a patient already on file.
 *
 * Correcting a mistyped date of birth or a wrong sex is routine clinical work,
 * and it is not cosmetic here: both index the age- and sex-corrected norms the
 * analyses report against, so a wrong date of birth silently biases every
 * measurement's interpretation. The dialog therefore restates the age the
 * entered date of birth implies today, before it is saved.
 */
export default class EditPatientDialog
  extends React.PureComponent<EditPatientDialogProps, State> {
  state: State = {
    details: detailsOf(this.props.patient),
    error: null,
  };

  private fields: HTMLElement | null = null;

  private focusTimer: any = null;

  componentWillReceiveProps(next: EditPatientDialogProps) {
    // Re-opening starts from what is actually stored, never from an abandoned
    // edit.
    if (next.open && !this.props.open) {
      this.setState({ details: detailsOf(next.patient), error: null });
    }
  }

  componentDidUpdate(prev: EditPatientDialogProps) {
    // mui's Dialog renders its content into a layer of its own, and React
    // flushes that nested render *after* this commit — the fields do not exist
    // yet at this point in the update. The focus is therefore taken one turn of
    // the event loop later, once the layer is on the page.
    if (this.props.open && !prev.open) {
      this.focusTimer = setTimeout(this.focusRequestedField, 0);
    }
  }

  componentWillUnmount() {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
    }
  }

  render() {
    const { open, patient, onCancel } = this.props;
    const { details, error } = this.state;
    const nameInvalid =
      error !== null && (error.field === 'name' || error.field === 'both');
    const chartIdInvalid =
      error !== null && (error.field === 'chartId' || error.field === 'both');
    // The message is anchored under the field it concerns; the "both" case
    // reads under the first (name) field while both inputs are outlined.
    const nameMessage = nameInvalid ? error!.message : null;
    const chartIdMessage =
      error !== null && error.field === 'chartId' ? error.message : null;
    const ageFromEntered = formatAgeFull(details.dateOfBirth);
    const storedAge = patient !== null ? formatAgeFull(patient.dateOfBirth) : null;
    return (
      <Dialog
        open={open}
        // A started edit is not dismissed by a stray click on the page behind
        // it. Entering a date of birth and clicking once on the background threw
        // the entry away silently — and the date of birth indexes every
        // age-corrected norm in the app, so that is clinical data lost to a
        // misplaced click. An untouched form still light-dismisses; a form with
        // unsaved changes is left through Cancel or Save.
        modal={this.isDirty()}
        onRequestClose={onCancel}
        // Screen-only chrome: printing the records chart with this dialog open
        // put the overlay's grey wash over the whole sheet and the dialog on
        // top of the films.
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <h3 id="edit-patient-dialog-title" className={classes.title_heading}>Edit patient details</h3>
            <span className={classes.title_caption}>
              Corrections apply to this patient's whole record
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="cancel"
            label="Cancel"
            labelStyle={{ textTransform: 'none' }}
            onClick={onCancel}
          />,
          <RaisedButton
            key="save"
            primary
            label="Save details"
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            style={{ marginLeft: 8 }}
            onClick={this.handleSave}
          />,
        ]}
        contentStyle={{ width: '92%', maxWidth: 560 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
        paperProps={{
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'edit-patient-dialog-title',
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        <div className={classes.fields} ref={this.setFields}>
          <div className={classes.row}>
            <PatientTextField
              label="Patient name"
              placeholder="e.g. 山田 太郎"
              value={details.name}
              invalid={nameInvalid}
              message={nameMessage}
              onChange={this.handleName}
              onKeyDown={this.handleKeyDown}
            />
            <PatientTextField
              label="Chart ID"
              placeholder="e.g. C-0001"
              value={details.chartId}
              invalid={chartIdInvalid}
              message={chartIdMessage}
              onChange={this.handleChartId}
              onKeyDown={this.handleKeyDown}
            />
          </div>
          <div className={classes.row}>
            {/* The reading of the name, which is what a Japanese case list is
                ordered by — 長谷川 is filed under は, and kanji carry no
                reading a collator can find. Optional, like the two below it. */}
            <PatientTextField
              label="Reading (かな)"
              placeholder="e.g. やまだ たろう"
              optional
              value={details.reading}
              onChange={this.handleReading}
              onKeyDown={this.handleKeyDown}
            />
            <span className={classes.spacer} />
          </div>
          <div className={classes.row}>
            <DateOfBirthField
              className={classes.dob}
              value={details.dateOfBirth}
              onChange={this.handleDateOfBirth}
              onKeyDown={this.handleKeyDown}
            />
            <SexField value={details.sex} onChange={this.handleSex} />
            <span className={classes.spacer} />
          </div>
        </div>
        {/* Why the two optional fields are not cosmetic. */}
        <p className={classes.why}>
          Date of birth and sex index the age- and sex-corrected norms the
          analyses report against, and both are printed on the clinical report.
        </p>
        {/* What the entered date of birth means, before it is saved. Only
            shown when it would actually change the age on file. */}
        {ageFromEntered !== null && ageFromEntered !== storedAge ? (
          <p className={classes.effect}>
            Saving records this patient as <strong>{ageFromEntered}</strong> old
            today. Age indexes the norms of every analysis that publishes
            age-corrected values, so the interpretation of existing tracings is
            re-read against it.
          </p>
        ) : null}
      </Dialog>
    );
  }

  private setFields = (el: HTMLElement | null) => { this.fields = el; };

  /**
   * Whether the form holds an unsaved change. Compared field by field against
   * what is actually stored, with the two text fields trimmed the same way
   * saving trims them, so trailing whitespace alone is not "an edit".
   */
  private isDirty = (): boolean => {
    const stored = detailsOf(this.props.patient);
    const { details } = this.state;
    return details.name.trim() !== stored.name.trim() ||
      details.chartId.trim() !== stored.chartId.trim() ||
      details.reading.trim() !== stored.reading.trim() ||
      details.dateOfBirth !== stored.dateOfBirth ||
      details.sex !== stored.sex;
  };

  /**
   * Land the caret in the field the opener named. The four controls are found by
   * what they are rather than by DOM order, so re-arranging the rows cannot
   * silently focus the wrong one.
   */
  private focusRequestedField = () => {
    this.focusTimer = null;
    const { focusField } = this.props;
    const root = this.fields;
    if (!this.props.open || root === null ||
      focusField === undefined || focusField === null) {
      return;
    }
    const texts = root.querySelectorAll('input[type="text"]');
    const target: Element | null =
      focusField === 'dateOfBirth' ? root.querySelector('input[type="date"]')
      : focusField === 'sex' ? root.querySelector('[role="group"] button')
      : focusField === 'chartId' ? (texts.length > 1 ? texts[1] : null)
      : focusField === 'reading' ? (texts.length > 2 ? texts[2] : null)
      : (texts.length > 0 ? texts[0] : null);
    if (target !== null) {
      (target as HTMLElement).focus();
    }
  };

  private handleName = (name: string) => this.change({ name });

  private handleChartId = (chartId: string) => this.change({ chartId });

  private handleReading = (reading: string) => this.change({ reading });

  private handleDateOfBirth = (dateOfBirth: string) =>
    this.change({ dateOfBirth });

  private handleSex = (sex: PatientSex) => this.change({ sex });

  private change = (patch: Partial<PatientDetails>) =>
    this.setState(({ details }) => ({
      details: { ...details, ...patch },
      error: null,
    }));

  private handleKeyDown = (e: React.KeyboardEvent<{}>) => {
    if (e.key === 'Enter') {
      this.handleSave();
    }
  };

  private handleSave = () => {
    const { details } = this.state;
    const trimmed: PatientDetails = {
      ...details,
      name: details.name.trim(),
      chartId: details.chartId.trim(),
      reading: details.reading.trim(),
    };
    const error = validatePatientDetails(
      trimmed, this.props.otherChartIds, 'save',
    );
    if (error !== null) {
      this.setState({ error });
      return;
    }
    this.props.onSave(trimmed);
  };
}
