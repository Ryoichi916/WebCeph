import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

// Who the entry is attributed to: the clinician this device signs its sheets
// with, read here so the editor can say whose name goes on the entry before it
// is written — and written here, from the gap the editor states, so the statement
// is not one the clinician has no way to answer. @see attribution
import {
  STORAGE_KEY_CLINICIAN, readLetterhead, writeStored,
} from 'components/ClinicalReport/letterhead';

import {
  VISIT_NOTE_FIELDS,
  VISIT_NOTE_FIELD_MAX_ROWS,
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
  /**
   * Whether Escape has been pressed on unsaved text and refused. The refusal is
   * the point (see `handleKeyDown`); this is what keeps it from being a dead key —
   * the dialog says what it did and what the two ways out are.
   */
  isEscapeRefused: boolean;
  /**
   * The clinician this device attributes its entries to, as it stands *now* — read
   * when the editor opens and re-read when the editor itself writes it (see
   * `renderAttributionGap`), so the effect line names the author the save will
   * actually stamp.
   */
  clinician: string;
  /** Whether the "add clinician" field is open, and what is typed in it. */
  isNamingClinician: boolean;
  clinicianDraft: string;
  /**
   * Whether the fields are scrolled away above / continue below the scrollport —
   * what the edge masks are drawn from (see `renderMask`). Kept in state rather
   * than left to a scrollbar because the scrollbar cannot be relied on to say it:
   * on this platform (and on any other with overlay scrollbars) a body that scrolls
   * 116px draws nothing at all until the clinician happens to drag, which is how a
   * Note field cut mid-box and an effect line below the fold came to look like the
   * whole of the dialog.
   */
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
}

/**
 * How tall a field is allowed to grow before it scrolls inside itself, in pixels:
 * `VISIT_NOTE_FIELD_MAX_ROWS` lines of `.dlg_input`'s 13.5px/1.5 text, plus its
 * 7px padding top and bottom and its 1px borders. Kept as a number rather than
 * measured off the element because a field that has not been laid out yet has no
 * line height to measure.
 */
const MAX_FIELD_HEIGHT =
  Math.round(VISIT_NOTE_FIELD_MAX_ROWS * 13.5 * 1.5) + 14 + 2;

/** `.dlg_input`'s borders, which `scrollHeight` does not include. */
const FIELD_BORDER = 2;

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
  state: State = {
    fields: fieldsOf(this.props.reading),
    isEscapeRefused: false,
    clinician: readLetterhead().clinician,
    isNamingClinician: false,
    clinicianDraft: '',
    hasMoreAbove: false,
    hasMoreBelow: false,
  };

  private first: HTMLTextAreaElement | null = null;

  /** The dialog's scrolling body — mui's own element. @see setFieldsBox */
  private scroller: HTMLElement | null = null;

  /** The refusal paragraph, scrolled to when Escape is refused. @see fix (1) */
  private refusal: HTMLParagraphElement | null = null;

  private focusTimer: any = null;

  private measureTimer: any = null;

  componentWillReceiveProps(next: VisitNoteDialogProps) {
    // Re-opening starts from what is actually stored, never from an abandoned
    // edit — the same rule EditPatientDialog follows. The letterhead is re-read
    // with it: it may have been filled in on the report since this dialog last
    // opened, and the effect line must not offer to close a gap that is closed.
    if (next.open && !this.props.open) {
      this.setState({
        fields: fieldsOf(next.reading),
        isEscapeRefused: false,
        clinician: readLetterhead().clinician,
        isNamingClinician: false,
        clinicianDraft: '',
        hasMoreAbove: false,
        hasMoreBelow: false,
      });
    }
  }

  componentDidUpdate(prev: VisitNoteDialogProps, prevState: State) {
    // mui renders the dialog's content into a layer of its own, one turn of the
    // event loop after this commit (see EditPatientDialog#componentDidUpdate).
    if (this.props.open && !prev.open) {
      this.focusTimer = setTimeout(this.focusFirstField, 0);
      // …and mui sizes the body in the same turn, so the first reading of what
      // fits is taken then rather than off a body with no maxHeight yet.
      this.measureTimer = setTimeout(this.measureScroll, 0);
    }
    // The refusal is pinned above the dialog's actions and so is on screen by
    // construction; this is the second guard on the thing that actually went
    // wrong — a clinician pressing a destructive key and being told nothing they
    // could see. If anything ever scrolls it out of view again, it scrolls back.
    if (this.state.isEscapeRefused && !prevState.isEscapeRefused &&
      this.refusal !== null && this.refusal.scrollIntoView !== undefined) {
      this.refusal.scrollIntoView({ block: 'nearest' });
    }
    // mui gives the body its `maxHeight` in its own didUpdate, and a field that has
    // just grown changes what fits: the masks are re-read after every commit.
    this.measureScroll();
  }

  componentWillUnmount() {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
    }
    if (this.measureTimer !== null) {
      clearTimeout(this.measureTimer);
    }
    if (this.scroller !== null) {
      this.scroller.removeEventListener('scroll', this.measureScroll);
      this.scroller = null;
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
        // **Everything the dialog states about the save lives here, not in the
        // scrolling body.** What saving will do to the record, the attribution gap
        // and the refusal of a destructive keypress are all statements *about the
        // press the clinician is about to make*, and mui gives its body a
        // `maxHeight` — so as the last children of the body they were laid out
        // below the scrollport and simply not seen: measured at 1280x720 the
        // refusal sat 147px past the bottom of a body scrolled to 0, which made
        // Escape on unsaved text a key that did nothing a clinician could see.
        // The actions container is outside that scroller, and mui subtracts its
        // height from the body's maxHeight (see Dialog#positionDialog), so this
        // strip is on screen at every window height and the fields page instead.
        actions={[
          // Escape is caught on this strip as well as on the fields: the clinician
          // field lives here, and a keypress made with the caret in it must be
          // refused with the same visible sentence rather than silently (the
          // surface behind already ignores Escape while this editor is open, so
          // nothing was ever lost — but a key that does nothing and says nothing is
          // what this message exists to prevent).
          <div
            key="strip"
            className={classes.dlg_strip}
            onKeyDown={this.handleKeyDown}
          >
            {this.renderEffect()}
            {this.renderAttributionGap()}
            {this.state.isEscapeRefused && dirty ? (
              <p
                className={classes.dlg_kept}
                role="status"
                ref={this.setRefusal}
              >
                Escape does not close an entry that has not been saved — there is
                no draft of it anywhere. Save it, or press Cancel to discard what
                is written here.
              </p>
            ) : null}
          </div>,
          <div key="buttons" className={classes.dlg_buttons}>
            <FlatButton
              label="Cancel"
              labelStyle={{ textTransform: 'none' }}
              onClick={onCancel}
            />
            <RaisedButton
              primary
              label={isAmendment ? 'Save amendment' : 'Save note'}
              labelStyle={{ textTransform: 'none', fontWeight: 600 }}
              style={{ marginLeft: 8 }}
              disabled={!dirty}
              onClick={this.handleSave}
            />
          </div>,
        ]}
        contentStyle={{ width: '94%', maxWidth: 680 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        // A scrollport that says it is one: on a 720px-tall clinic laptop the
        // fields *do* scroll, and the platform's overlay scrollbar drew nothing
        // until the clinician happened to drag. @see `.dlg_body` in visitnote.scss
        bodyClassName={classes.dlg_body}
        actionsContainerStyle={{ padding: '10px 24px 12px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
        autoScrollBodyContent
        paperProps={{
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        {/* Escape is caught here, on the dialog's own content, and refused while
            there is unsaved text in it — see `handleKeyDown`. Two handlers used to
            act on one keypress: mui's (which closes the dialog) and the records
            surface's document listener (which leaves the page), and between them
            an entry that existed nowhere else was gone. */}
        {/* The two edge masks that say the fields continue past the scrollport —
            see `State.hasMoreBelow`. They are siblings of the fields rather than
            children so they stick to the *scroller's* edges, and they take no
            layout height (negative margins in the stylesheet). */}
        {this.renderMask(true)}
        <div
          className={classes.dlg_fields}
          ref={this.setFieldsBox}
          onKeyDown={this.handleKeyDown}
        >
          {VISIT_NOTE_FIELDS.map((option, index) => (
            <label key={option.key} className={classes.dlg_field}>
              <span className={classes.dlg_label}>
                {option.label}
                {/* Nothing is required: a visit entry that states the appliance
                    and nothing else is a real entry, and demanding five fields
                    would be answered with filler. */}
                <span className={classes.dlg_optional}>{option.hint}</span>
              </span>
              {/* Opens at `option.rows` and grows to what is typed in it — see
                  `grow`. A diagnosis written through a three-line window, with
                  its own first line scrolled out of sight while the second is
                  being typed, is not an editor a clinician can proof-read in. */}
              <textarea
                className={classes.dlg_input}
                rows={option.rows}
                value={this.state.fields[option.key]}
                aria-label={option.label}
                ref={this.setField(index === 0)}
                onChange={this.handleChange(option.key)}
              />
            </label>
          ))}
        </div>
        {this.renderMask(false)}
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
          {`Saving files this note against this visit, dates it${this.attribution()} ` +
            'and writes it to the patient\'s project straight away. It is printed ' +
            'on the case sheet and shown on the clinical report of this visit\'s ' +
            'films.'}
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
            {`. It is dated${this.attribution()} and written to the patient's ` +
              'project straight away. The entry on file is kept and stays readable ' +
              'as an earlier version, and the record states that the note was ' +
              'amended.'}
          </span>
        )}
      </p>
    );
  };

  /**
   * Escape, while this dialog holds text that is not in the record, does nothing —
   * deliberately, and it says so.
   *
   * This is the one dialog in the app whose content exists nowhere else: there is
   * no draft, no autosave and no undo behind it, so a keypress that discards it
   * has to be one a clinician means. Cancel discards (it is a press, and it is
   * labelled); Escape does not.
   *
   * Two things acted on that one keypress, and both had to be stopped. mui closes
   * its own dialog on Escape unless `modal` is set, which is why `modal` is bound
   * to `isDirty()` in `render`. And the records surface *behind* this dialog
   * listens for Escape on `document` to leave the page — that is what took the
   * editor off screen with the surface it was mounted in, unsaved text and all — so
   * the keypress is stopped here rather than allowed to reach it (@see
   * RecordsDashboard#handleDocumentKeyDown, which now also ignores Escape while
   * this editor is open: one guard would have been enough, and a clinician's only
   * copy of an entry is worth two).
   *
   * With nothing unsaved in it, Escape closes the editor as any dialog's does.
   */
  private handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') {
      return;
    }
    if (!this.isDirty()) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // …and on the native event as well: the surface's listener is bound directly to
    // `document`, which React's synthetic propagation does not shield it from.
    e.nativeEvent.stopImmediatePropagation();
    this.setState({ isEscapeRefused: true });
  };

  /**
   * Who this entry will be attributed to, stated before it is written.
   *
   * The name is the device's letterhead clinician — the same person who signs
   * every sheet this app prints (@see components/ClinicalReport/letterhead) — and
   * it is stamped into the version at save time, so it is a fact about this entry
   * from then on and not a lookup that a later letterhead edit could rewrite.
   * Where no clinician has been entered on this device the entry is unattributed,
   * and this says so rather than leaving the clinician to find out from the
   * printed sheet — with the field that closes the gap beside it
   * (`renderAttributionGap`), because an append-only entry saved unattributed
   * carries "author not recorded" on screen, on the case sheet and on the report
   * for good.
   */
  private attribution = (): string => {
    const { clinician } = this.state;
    return clinician !== ''
      ? `, records ${clinician} as its author,`
      : ' — no clinician is entered on this device, so it will state that its ' +
        'author is not recorded —';
  };

  /**
   * The gap the effect line has just named, and the field that closes it.
   *
   * The app's own idiom for a value that is not on file and matters: the identity
   * band states a missing chart ID as a pill that *is* the control for entering it
   * (@see RecordsDashboard#renderIdentity). The gap here is worse than a missing
   * chart ID, because this record is append-only: an entry saved with no author
   * says "author not recorded" for the rest of its life, on every surface that
   * prints it. Until now the only place in the app that would take a clinician's
   * name was a contentEditable field inside the clinical report's certification
   * block, which nothing here linked to and nothing here mentioned.
   *
   * What it writes is the letterhead's clinician — the one name this device signs
   * with — so it is stated plainly as that and not as a per-note byline.
   */
  private renderAttributionGap = () => {
    if (this.state.clinician !== '') {
      return null;
    }
    const next = trimVisitNoteFields(this.state.fields);
    // Only where the save would actually stamp an author: a retraction and an
    // unchanged form attribute nothing, and the effect line says so.
    if (!this.isDirty() || isVisitNoteEmpty(next)) {
      return null;
    }
    if (!this.state.isNamingClinician) {
      return (
        <p className={classes.dlg_gap}>
          <button
            type="button"
            className={classes.dlg_gap_pill}
            onClick={this.openClinicianField}
          >
            Add the clinician's name
          </button>
          <span className={classes.dlg_gap_hint}>
            {'Stored on this device as the clinician who signs its printed ' +
              'sheets, and stamped into this entry when you save it.'}
          </span>
        </p>
      );
    }
    const draft = this.state.clinicianDraft.trim();
    return (
      <div className={classes.dlg_gap}>
        <label className={classes.dlg_gap_label} htmlFor="visit-note-clinician">
          Clinician
        </label>
        <input
          id="visit-note-clinician"
          className={classes.dlg_gap_input}
          type="text"
          value={this.state.clinicianDraft}
          placeholder="Name as it should appear"
          autoFocus
          onChange={this.handleClinicianChange}
          onKeyDown={this.handleClinicianKeyDown}
        />
        <button
          type="button"
          className={classes.dlg_gap_save}
          disabled={draft === ''}
          onClick={this.saveClinician}
        >
          Use this name
        </button>
      </div>
    );
  };

  private openClinicianField = () =>
    this.setState({ isNamingClinician: true });

  private handleClinicianChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ clinicianDraft: e.currentTarget.value });

  private handleClinicianKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.saveClinician();
    }
  };

  /**
   * Writes the name to the one place this app keeps a clinician
   * (`STORAGE_KEY_CLINICIAN`) — so the effect line above it re-states the
   * attribution the save will now make, and `connected#onSaveVisitNote`, which
   * reads the letterhead at dispatch, stamps it into the version.
   */
  private saveClinician = () => {
    const name = this.state.clinicianDraft.trim();
    if (name === '') {
      return;
    }
    writeStored(STORAGE_KEY_CLINICIAN, name);
    this.setState({ clinician: name, isNamingClinician: false });
  };

  /**
   * One edge of the scrollport, masked while the fields continue past it.
   *
   * The affordance that says "there is more" — and it has to be drawn by the page,
   * because the scrollbar is not something a clinical surface can lean on: measured
   * in this app's own browser, a body with 116px of overflow (and `overflow-y:
   * scroll`, and a fully styled `::-webkit-scrollbar`) draws **no** scrollbar until
   * it is dragged. The mask is shown from the scroll position itself, so it is a
   * statement about the content and not decoration on the edge.
   */
  private renderMask = (isTop: boolean) => (
    <span
      aria-hidden="true"
      className={cx(classes.dlg_mask, {
        [classes.dlg_mask__top]: isTop,
        [classes.dlg_mask__bottom]: !isTop,
        [classes.dlg_mask__shown]: isTop
          ? this.state.hasMoreAbove : this.state.hasMoreBelow,
      })}
    />
  );

  /**
   * The fields' box, and through it the dialog body mui scrolls: the body is mui's
   * own element, so this is where a listener can be put on it.
   */
  private setFieldsBox = (el: HTMLDivElement | null) => {
    if (this.scroller !== null) {
      this.scroller.removeEventListener('scroll', this.measureScroll);
      this.scroller = null;
    }
    if (el !== null && el.parentElement !== null) {
      this.scroller = el.parentElement;
      this.scroller.addEventListener('scroll', this.measureScroll);
      this.measureScroll();
    }
  };

  /** Whether the fields continue above or below what is on screen. */
  private measureScroll = () => {
    const el = this.scroller;
    if (el === null) {
      return;
    }
    const hasMoreAbove = el.scrollTop > 2;
    const hasMoreBelow = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    if (hasMoreAbove !== this.state.hasMoreAbove ||
      hasMoreBelow !== this.state.hasMoreBelow) {
      this.setState({ hasMoreAbove, hasMoreBelow });
    }
  };

  private setRefusal = (el: HTMLParagraphElement | null) => { this.refusal = el; };

  /**
   * A field's element as it mounts: grown to the text in it there and then, which
   * is what an amendment needs — its fields already hold the entry on file, and
   * the first thing a clinician does with an amendment is read it.
   */
  private setField = (isFirst: boolean) => (el: HTMLTextAreaElement | null) => {
    if (isFirst) {
      this.first = el;
    }
    if (el !== null) {
      this.grow(el);
    }
  };

  /**
   * Grows one field to the text it holds, between the `rows` it opens at and
   * `MAX_FIELD_HEIGHT`.
   *
   * The height is cleared first so the element falls back to its `rows` height:
   * that is the field's *minimum* (an empty Note field is four rows because four
   * rows is what it invites), and deleting a paragraph shrinks the box back to it
   * rather than leaving a well of white. Past the cap the field scrolls inside
   * itself, so the dialog stays paginated and the Save button stays on a 720px
   * screen.
   */
  private grow = (el: HTMLTextAreaElement) => {
    el.style.height = '';
    el.style.overflowY = 'hidden';
    const rowsHeight = el.clientHeight;
    if (el.scrollHeight > rowsHeight) {
      const wanted = el.scrollHeight + FIELD_BORDER;
      el.style.height = `${Math.min(wanted, MAX_FIELD_HEIGHT)}px`;
      el.style.overflowY = wanted > MAX_FIELD_HEIGHT ? 'auto' : 'hidden';
    }
  };

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
      // Grown on the same keystroke that changed it, off the element the event
      // came from — the line just typed is on screen before the next one starts.
      this.grow(e.currentTarget);
      this.setState(({ fields }) => ({ fields: { ...fields, [key]: value } as VisitNoteFields }));
    };

  private handleSave = () => {
    if (!this.isDirty()) {
      return;
    }
    this.props.onSave(trimVisitNoteFields(this.state.fields));
  };
}
