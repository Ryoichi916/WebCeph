import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import {
  VISIT_NOTE_FIELDS,
  VisitNoteReading,
  changedVisitNoteFields,
  emptyVisitNoteFields,
  formatVisitNoteStamp,
  isVisitNoteEmpty,
  sameVisitNoteFields,
  trimVisitNoteFields,
} from 'utils/visitNotes';

const classes = require('./visitnote.scss');

export interface VisitNoteDialogProps {
  open: boolean;
  /** The visit being written about, as the record labels it ("T2 Progress"). */
  visitName: string;
  /** The day (or span) that visit covers, or null when it carries no date. */
  visitDate: string | null;
  /** The patient's age at that visit, when it can be worked out. */
  visitAge: string | null;
  /**
   * What is already on file for this visit, or null when nothing is — which is
   * the difference between writing an entry and amending one, and the dialog says
   * which of the two is happening.
   */
  reading: VisitNoteReading | null;
  onSave(fields: VisitNoteFields): any;
  onCancel(): any;
}

interface State {
  fields: VisitNoteFields;
}

const fieldsOf = (reading: VisitNoteReading | null): VisitNoteFields =>
  reading === null ? emptyVisitNoteFields() : { ...reading.current };

/**
 * The visit note editor: the four fields a visit entry is expected to state —
 * chief complaint, diagnosis, treatment plan, appliance — plus a free-text note,
 * on the visit they belong to.
 *
 * Every field is empty until a clinician types in it. There is no template, no
 * suggested wording and no value carried over from the analyses: the app's own
 * reading of a tracing belongs in the analysis panels, and a diagnosis field
 * pre-filled from a measurement would put the app's words into the record under
 * the clinician's name.
 *
 * Amending states its consequence before it happens (see `renderEffect`): the
 * entry on file is kept, the amendment is dated, and both are readable
 * afterwards. Nothing here can delete an entry — clearing every field is a
 * retraction, is saved as one more version, and says so.
 */
export default class VisitNoteDialog
  extends React.PureComponent<VisitNoteDialogProps, State> {
  state: State = { fields: fieldsOf(this.props.reading) };

  private first: HTMLTextAreaElement | null = null;

  private focusTimer: any = null;

  componentWillReceiveProps(next: VisitNoteDialogProps) {
    // Re-opening starts from what is actually stored, never from an abandoned
    // edit — the same rule EditPatientDialog follows.
    if (next.open && !this.props.open) {
      this.setState({ fields: fieldsOf(next.reading) });
    }
  }

  componentDidUpdate(prev: VisitNoteDialogProps) {
    // mui renders the dialog's content into a layer of its own, one turn of the
    // event loop after this commit (see EditPatientDialog#componentDidUpdate).
    if (this.props.open && !prev.open) {
      this.focusTimer = setTimeout(this.focusFirstField, 0);
    }
  }

  componentWillUnmount() {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
    }
  }

  render() {
    const { open, visitName, visitDate, visitAge, reading, onCancel } = this.props;
    const isAmendment = reading !== null;
    const dirty = this.isDirty();
    return (
      <Dialog
        open={open}
        // A written entry is not thrown away by a stray click on the page behind
        // it: this is a clinician's own text, and there is no draft anywhere else.
        modal={dirty}
        onRequestClose={onCancel}
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.dlg_title}>
            <h3 className={classes.dlg_heading}>
              {isAmendment ? 'Amend clinical note' : 'Write clinical note'}
            </h3>
            {/* Which visit is being written about — the record's own label, its
                day and the patient's age then, so an entry cannot be written
                onto the wrong visit from a page of six. */}
            <span className={classes.dlg_caption}>
              {[
                visitName,
                visitDate !== null ? visitDate : 'no capture date',
                visitAge !== null ? `age ${visitAge}` : null,
              ].filter((part) => part !== null).join(' · ')}
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
            label={isAmendment ? 'Save amendment' : 'Save note'}
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            style={{ marginLeft: 8 }}
            disabled={!dirty}
            onClick={this.handleSave}
          />,
        ]}
        contentStyle={{ width: '94%', maxWidth: 680 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
        autoScrollBodyContent
        paperProps={{
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        <div className={classes.dlg_fields}>
          {VISIT_NOTE_FIELDS.map((option, index) => (
            <label key={option.key} className={classes.dlg_field}>
              <span className={classes.dlg_label}>
                {option.label}
                {/* Nothing is required: a visit entry that states the appliance
                    and nothing else is a real entry, and demanding five fields
                    would be answered with filler. */}
                <span className={classes.dlg_optional}>{option.hint}</span>
              </span>
              <textarea
                className={classes.dlg_input}
                rows={option.rows}
                value={this.state.fields[option.key]}
                aria-label={option.label}
                ref={index === 0 ? this.setFirst : undefined}
                onChange={this.handleChange(option.key)}
              />
            </label>
          ))}
        </div>
        {this.renderEffect()}
      </Dialog>
    );
  }

  /**
   * What saving will do to the record, stated before it is done.
   *
   * On a first entry: that it is filed against this visit and dated. On an
   * amendment: that the entry on file is kept, which fields this amendment
   * changes, and — for the case where every field has been cleared — that the
   * retraction is itself recorded rather than erasing anything.
   */
  private renderEffect = () => {
    const { reading } = this.props;
    const next = trimVisitNoteFields(this.state.fields);
    if (reading === null) {
      if (isVisitNoteEmpty(next)) {
        return (
          <p className={classes.dlg_effect}>
            Nothing is written yet. A note is stored only once it holds text.
          </p>
        );
      }
      return (
        <p className={classes.dlg_effect}>
          Saving files this note against this visit and dates it. It is kept with
          the patient's project, printed on the case sheet, and shown on the
          clinical report of this visit's films.
        </p>
      );
    }
    const changed = changedVisitNoteFields(reading.current, next);
    if (changed.length === 0) {
      return (
        <p className={classes.dlg_effect}>
          {`Unchanged since it was recorded ` +
            `${formatVisitNoteStamp(reading.updatedAt)}.`}
        </p>
      );
    }
    return (
      <p className={cx(classes.dlg_effect, classes.dlg_effect__amend)}>
        {isVisitNoteEmpty(next) ? (
          <span>
            This clears every field. The entry recorded{' '}
            {formatVisitNoteStamp(reading.updatedAt)} is <strong>kept</strong> and
            stays readable as an earlier version — a note is never deleted here.
          </span>
        ) : (
          <span>
            {'This is an amendment to the entry recorded '}
            {formatVisitNoteStamp(reading.updatedAt)}
            {'. It changes '}
            <strong>
              {changed.map(({ shortLabel }) => shortLabel.toLowerCase()).join(', ')}
            </strong>
            {'. The entry on file is kept and stays readable as an earlier ' +
              'version, and the record states that the note was amended.'}
          </span>
        )}
      </p>
    );
  };

  private setFirst = (el: HTMLTextAreaElement | null) => { this.first = el; };

  private focusFirstField = () => {
    this.focusTimer = null;
    if (this.props.open && this.first !== null) {
      this.first.focus();
    }
  };

  /** Whether the form holds anything the stored note does not already say. */
  private isDirty = (): boolean => {
    const { reading } = this.props;
    const next = trimVisitNoteFields(this.state.fields);
    if (reading === null) {
      return !isVisitNoteEmpty(next);
    }
    return !sameVisitNoteFields(reading.current, next);
  };

  private handleChange = (key: keyof VisitNoteFields) =>
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.currentTarget.value;
      this.setState(({ fields }) => ({ fields: { ...fields, [key]: value } as VisitNoteFields }));
    };

  private handleSave = () => {
    if (!this.isDirty()) {
      return;
    }
    this.props.onSave(trimVisitNoteFields(this.state.fields));
  };
}
