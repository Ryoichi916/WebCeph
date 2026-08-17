import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import RecordMetaFields, { normalizeRecordMeta } from './index';

import {
  getImageTypeLabelWithArticle,
  isTraceableImageType,
} from 'utils/records';

// A visit's clinical note is filed under the visit's own label, so correcting that
// label here moves the note with it — or detaches it. Either way this dialog says
// so before it is saved. @see visitNote
import {
  VisitNoteReading,
  formatVisitNoteStamp,
  getVisitNoteKey,
  getVisitNoteVisitName,
} from 'utils/visitNotes';

const classes = require('./dialog.scss');

export interface EditRecordDialogProps {
  open: boolean;
  /** The metadata currently on the record — the dialog opens on these values. */
  initialValue: ImageRecordMeta;
  /** File name of the image being edited, shown so the right film is edited. */
  fileName: string | null;
  /**
   * The clinical note filed at the visit this image is filed at, or null when
   * that visit has none.
   *
   * A note is keyed by the visit's timepoint label (@see
   * utils/visitNotes#getVisitNoteKey), which is one of the fields this dialog
   * edits: relabelling "T1" to "T1 Pre-treatment" used to leave the visit reading
   * "No note recorded for this visit" and drop the clinician's entry into the
   * dashboard's unfiled-notes panel, with nothing in this dialog mentioning the
   * note before or after the new label was typed.
   */
  visitNote: VisitNoteReading | null;
  /**
   * Whether this image is the **only** one filed at that visit — i.e. whether
   * relabelling it moves the visit itself, and the note with it. With other images
   * still filed under the old label the visit stays where it is and so does its
   * note, and this dialog says that instead.
   */
  isOnlyImageAtVisit: boolean;
  /**
   * Whether a note is already filed at the visit label typed in — asked live,
   * because a move onto a visit that holds an entry is refused (no path in this app
   * overwrites a clinician's note) and the dialog must state that outcome rather
   * than promise a move that will not happen.
   */
  hasNoteAt(visitKey: string): boolean;
  onSave(value: ImageRecordMeta): any;
  onCancel(): any;
}

/**
 * "Edit details" for an image already on file: the same three fields the upload
 * screen offers, re-opened so a mis-typed film, a wrong timepoint or a wrong
 * capture date can be corrected. Without this, record metadata was write-once
 * and a photograph filed as a lateral ceph (or the reverse) was permanent.
 *
 * Changing the type to a lateral cephalogram makes the image traceable again;
 * changing it away from one hands it to the read-only record viewer. The dialog
 * says which of the two will happen before the change is saved — and, where the
 * visit being relabelled carries a clinical note, what happens to that note
 * (`renderNoteEffect`).
 */
export default class EditRecordDialog
  extends React.PureComponent<EditRecordDialogProps, { value: ImageRecordMeta }> {
  state = { value: this.props.initialValue };

  componentWillReceiveProps(next: EditRecordDialogProps) {
    // Re-opening on a different record (or after a cancel) starts from what is
    // actually stored, never from the previous edit.
    if (next.open && !this.props.open) {
      this.setState({ value: next.initialValue });
    }
  }

  render() {
    const { open, fileName, onCancel } = this.props;
    const { value } = this.state;
    const wasTraceable = isTraceableImageType(this.props.initialValue.type);
    const willBeTraceable = isTraceableImageType(value.type);
    const isEffectShown = willBeTraceable !== wasTraceable;
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onCancel}
        // Screen-only chrome: printing the records chart with this dialog open
        // put the modal's grey wash over the whole sheet and the dialog itself
        // on top of the films.
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <h3 className={classes.title_heading}>Edit record details</h3>
            <span className={classes.title_caption}>
              {fileName !== null ? fileName : 'Image on file'}
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
        // 600, not 560: the record fields are laid out on a documented basis
        // (see RecordMetaFields/style.scss) — 186 + 164 for the type and the
        // capture date, then the timepoint's own row of 74 + 148 + note — which
        // needs ~506px of well. At 560 the well was 478 and the first row
        // wrapped, so one component had two layouts, tidy on the upload surface
        // and broken in the dialog.
        contentStyle={{ width: '92%', maxWidth: 600 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
      >
        <RecordMetaFields
          value={value}
          onChange={this.handleChange}
          className={classes.fields}
          // One amber panel per consequence: the effect line below states it
          // for the type being chosen, so the field's own note stands down.
          showTypeNote={!isEffectShown}
        />
        {isEffectShown ? (
          <p className={willBeTraceable ? classes.effect__ok : classes.effect__warn}>
            {/* The label and its article both come from the catalogue: built
                here from `getImageTypeLabel(...).toLowerCase()` and a hardcoded
                "a", this line printed "as a frontal (pa) cephalogram" — the PA
                abbreviation destroyed on the single likeliest use of this
                dialog — and "as a intraoral photograph". */}
            {willBeTraceable
              ? `Saving will re-file this image as ` +
                `${getImageTypeLabelWithArticle(value.type)}: landmark ` +
                `tracing, analyses and the clinical report become available on it.`
              : `Saving will re-file this image as ` +
                `${getImageTypeLabelWithArticle(value.type)}: it will be kept ` +
                `with the record but shown read-only, and any tracing already ` +
                `placed on it will no longer be analysed.`}
          </p>
        ) : null}
        {this.renderNoteEffect()}
      </Dialog>
    );
  }

  /**
   * What this edit does to the visit's **clinical note** — stated whenever the
   * visit carries one, before and after the label is changed.
   *
   * The note is filed under the visit's label, so the VISIT field on this dialog
   * is also the note's filing. Three outcomes, and each is named:
   *
   * - The label is unchanged, or other images keep the old label alive: the note
   *   stays where it is, and the line says so quietly so the clinician knows the
   *   field they are typing in is one the note hangs on.
   * - The label changes and the new visit holds no note: the note moves with the
   *   image, whole trail included, and the record states which visit it was
   *   written for (@see utils/visitNotes#formatVisitNoteRefiling).
   * - The label changes onto a visit that already holds a note: the move is
   *   refused — nothing here overwrites an entry somebody wrote — so the note is
   *   left listed as unfiled on the dashboard, and this says that rather than
   *   promising a move.
   */
  private renderNoteEffect = () => {
    const { visitNote, isOnlyImageAtVisit, hasNoteAt } = this.props;
    if (visitNote === null) {
      return null;
    }
    const fromKey = getVisitNoteKey(this.props.initialValue.timepoint);
    const toKey = getVisitNoteKey(this.state.value.timepoint);
    const from = getVisitNoteVisitName(fromKey);
    const recorded = `recorded ${formatVisitNoteStamp(visitNote.recordedAt)}`;
    if (toKey === fromKey || !isOnlyImageAtVisit) {
      return (
        <p className={classes.note_effect}>
          {`${from} carries a clinical note (${recorded}). `}
          {toKey !== fromKey
            ? `Other images stay filed at ${from}, so the note stays there with ` +
              'them.'
            : 'It is filed under this visit label, and moves with it if the ' +
              'label is changed.'}
        </p>
      );
    }
    const to = getVisitNoteVisitName(toKey);
    if (hasNoteAt(toKey)) {
      return (
        <p className={classes.note_effect__warn}>
          {`${to} already carries a clinical note of its own, so the note at ` +
            `${from} (${recorded}) cannot be moved onto it — nothing here ` +
            'overwrites an entry somebody wrote. It is kept, and listed on the ' +
            'records page as a note not filed at any visit until you file it.'}
        </p>
      );
    }
    return (
      <p className={classes.note_effect__warn}>
        {`The clinical note at ${from} (${recorded}) moves to ${to} with this ` +
          'image, with its whole amendment trail. The record will state that it ' +
          `was written for ${from}.`}
      </p>
    );
  };

  private handleChange = (value: ImageRecordMeta) => this.setState({ value });

  private handleSave = () => this.props.onSave(normalizeRecordMeta(this.state.value));
}
