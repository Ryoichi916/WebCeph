import * as React from 'react';

import * as cx from 'classnames';

import IconEdit from 'material-ui/svg-icons/image/edit';
import IconNote from 'material-ui/svg-icons/action/assignment';

import {
  VISIT_NOTE_FIELDS,
  VISIT_NOTE_RETRACTED_STATEMENT,
  VisitNoteFieldOption,
  VisitNoteReading,
  filledVisitNoteFields,
  formatVisitNoteProvenance,
  formatVisitNoteRefiling,
  formatVisitNoteStamp,
  formatVisitNoteVersionLabel,
  getVisitNoteVisitName,
  readVisitNote,
} from 'utils/visitNotes';

const classes = require('./visitnote.scss');

const iconStyle: React.CSSProperties = { width: 15, height: 15 };

export interface VisitNoteBlockProps {
  /**
   * The visit this note belongs to, as the record labels it — used in the
   * controls' accessible names and tooltips so a press on a page of six visits
   * says which visit it writes about.
   */
  visitName: string;
  /** The stored note of this visit, or undefined when nothing is on file. */
  note: VisitNote | undefined;
  /** Opens the editor on this visit (write a first entry, or amend the current). */
  onEdit(): any;
}

interface State {
  /** Whether the earlier versions of an amended note are expanded. */
  isHistoryShown: boolean;
  /**
   * Which earlier versions are being read **whole**, keyed by the moment they
   * were written. A superseded version otherwise shows only the fields the
   * amendment changed (see `renderHistory`): an entry amended twice is the same
   * fifteen lines three times, and the volume of near-identical prose is what
   * makes a trail unreadable — not the difficulty of spotting the change.
   */
  openVersions: { [savedAt: number]: true };
}

/**
 * A visit's **clinical note**, as the first row of the visit's own panel: what
 * the patient came for, what was found, what was decided, and what is in the
 * mouth — beside the films those decisions were made on.
 *
 * This is the half of a patient record the app had nowhere to keep: a case could
 * hold nine films, ninety-one measurements and no statement of what anybody had
 * decided. It is deliberately the *first* row of the visit block rather than a
 * footnote under the images, because that is the order a chart entry is read in.
 *
 * Three things it does not do, all of them on purpose:
 *
 * - It writes nothing. Every word shown here was typed by a clinician; a field
 *   nobody filled in is simply absent, and a visit nobody has written about says
 *   so in one quiet line ("No note recorded for this visit").
 * - It hides nothing. An amended entry states that it was amended, when, and how
 *   often, and its earlier versions are readable in place, labelled as earlier
 *   versions — a clinical record is not silently rewritten.
 * - It has no delete. The editor can empty an entry (that is a retraction, and it
 *   is kept in the trail like any other amendment), but nothing removes what was
 *   written — and a retracted entry *says* it has been cleared
 *   (`VISIT_NOTE_RETRACTED_STATEMENT`) rather than showing a provenance line with
 *   no words under it.
 *
 * Printed with the visit, in the same order, with the controls dropped and the
 * provenance line kept — see `visitnote.scss`'s print block.
 */
export default class VisitNoteBlock
  extends React.PureComponent<VisitNoteBlockProps, State> {
  state: State = { isHistoryShown: false, openVersions: {} };

  render() {
    const { visitName, note, onEdit } = this.props;
    const reading = readVisitNote(note);
    if (reading === null) {
      return (
        <div className={cx(classes.note, classes.note__empty)}>
          <span className={classes.note_key}>
            <IconNote color="#A9B4BE" style={iconStyle} />
            <span>Clinical note</span>
          </span>
          {/* The quiet empty state: a statement of the record, not a task the
              visit is failing. It prints too — on a filed sheet "no note
              recorded" is a fact worth having, and it is the same wording. */}
          <span className={classes.note_none}>No note recorded for this visit</span>
          <span className={classes.note_spacer} />
          <button
            type="button"
            className={classes.note_write}
            title={`Write the clinical note for ${visitName}`}
            aria-label={`Write the clinical note for ${visitName}`}
            onClick={onEdit}
          >
            <IconEdit color="currentColor" style={iconStyle} />
            <span>Write note</span>
          </button>
        </div>
      );
    }
    const fields = filledVisitNoteFields(reading.current);
    // Where this entry was written, when it has since been moved here. One line,
    // on screen and on paper: an entry re-filed onto another visit's day must not
    // read as though it had been written that day.
    const refiling = formatVisitNoteRefiling(reading, visitName);
    return (
      <div className={classes.note}>
        <div className={classes.note_head}>
          <span className={classes.note_key}>
            <IconNote color="#52616F" style={iconStyle} />
            <span>Clinical note</span>
          </span>
          {/* When it was written, who by, and — only when it has been — that it
              was amended, how often, and when last. On screen and on paper — in
              two versions, because an entry with **no** stored author says so
              here on screen (with the field that closes the gap one press away in
              the amendment dialog) and says it once for the whole sheet on paper.
              @see utils/visitNotes#formatVisitNoteProvenance */}
          <span className={cx(classes.note_stamp, classes.note_stamp__screen)}>
            {formatVisitNoteProvenance(reading)}
          </span>
          <span className={cx(classes.note_stamp, classes.note_stamp__print)}>
            {formatVisitNoteProvenance(reading, false)}
          </span>
          <span className={classes.note_spacer} />
          <button
            type="button"
            className={classes.note_write}
            title={`Amend the clinical note for ${visitName} — the current ` +
              `entry is kept and the amendment is dated`}
            aria-label={`Amend the clinical note for ${visitName}`}
            onClick={onEdit}
          >
            <IconEdit color="currentColor" style={iconStyle} />
            <span>Amend note</span>
          </button>
        </div>
        {refiling !== null ? (
          <p className={classes.note_refiled}>{refiling}</p>
        ) : null}
        {fields.length === 0 ? (
          /* Every field of the entry that stands has been cleared — a retraction,
             which the record keeps and this block must not render as *nothing*:
             the head above it says the entry exists and that it was amended, and a
             visit whose panel then showed a provenance line and no words at all
             read as a rendering fault on screen and on the filed sheet. The same
             sentence the clinical report prints, from the same constant. */
          <p className={classes.note_retracted}>
            {VISIT_NOTE_RETRACTED_STATEMENT}
          </p>
        ) : (
          <dl className={classes.note_fields}>
            {fields.map(({ option, value }) => (
              <div key={option.key} className={classes.note_field}>
                <dt className={classes.note_label}>{option.shortLabel}</dt>
                {/* `white-space: pre-wrap` in the stylesheet: a clinician's own
                    line breaks are part of what they wrote. */}
                <dd className={classes.note_value}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {reading.amendmentCount > 0 ? this.renderHistory(reading) : null}
      </div>
    );
  }

  /**
   * The versions this entry said before the current one — newest superseded
   * first, each dated and named as an earlier version.
   *
   * Collapsed by default and labelled with a count, because the note that matters
   * on a records page is the one that stands; expanded, it is the whole trail,
   * which is what makes "amended twice" a checkable claim rather than a badge.
   *
   * **A superseded version shows what the amendment changed, not the whole of
   * itself.** Reprinting every field of every version put the same fifteen lines
   * on the page three times for an entry amended twice — measured at over 1000px
   * of one visit's panel, about two thirds of it word-for-word the entry directly
   * above — and no marker on a changed field solves that, because the cost is the
   * scrolling, not the finding. So each version renders the fields the amendment
   * that replaced it touched, names the ones it did not in one muted line, and
   * carries its own control for reading the version whole. What is *not* reduced
   * is the record: every version, every field and every stamp is still here, one
   * press away, and the press is on the version itself.
   */
  private renderHistory = (reading: VisitNoteReading) => {
    const { isHistoryShown } = this.state;
    const count = reading.superseded.length;
    return (
      <div className={classes.note_history}>
        <button
          type="button"
          className={classes.note_history_toggle}
          aria-expanded={isHistoryShown}
          onClick={this.toggleHistory}
        >
          <span
            className={cx(classes.note_history_caret, {
              [classes.note_history_caret__open]: isHistoryShown,
            })}
            aria-hidden="true"
          />
          <span>
            {isHistoryShown ? 'Hide' : 'Show'}
            {count === 1
              ? ' the earlier version of this note'
              : ` the ${count} earlier versions of this note`}
          </span>
        </button>
        {isHistoryShown ? (
          <ol className={classes.note_versions}>
            {reading.superseded.map((version) => {
              // The fields the amendment that replaced this version changed, as a
              // lookup — so each one can be marked *in the body* of the version it
              // changed. Three near-identical blocks with one line naming the
              // changed field above them is a diff the reader has to do by eye.
              const changed: { [key: string]: true } = {};
              version.changed.forEach(({ key }) => { changed[key] = true; });
              // Read whole on request, and whole regardless where the trail's own
              // reading of it is empty (a version the amendment matched exactly
              // cannot happen through `appendVisitNoteEntry`, but a stored file
              // says what it says and this must not render as a blank).
              const isOpen = this.state.openVersions[version.savedAt] === true ||
                version.changed.length === 0;
              // The rows this version shows, in the catalogue's order: the changed
              // fields always — including a field the amendment *added*, which
              // holds nothing here and is stated as holding nothing rather than
              // silently missing from the version it was added to — and the
              // unchanged ones only when the version is being read whole.
              const rows: Array<{
                option: VisitNoteFieldOption;
                value: string | null;
                isChanged: boolean;
              }> = [];
              const unchanged: string[] = [];
              VISIT_NOTE_FIELDS.forEach((option) => {
                const value = version.fields[option.key].trim();
                const isChanged = changed[option.key] === true;
                if (value === '') {
                  if (isChanged) {
                    rows.push({ option, value: null, isChanged });
                  }
                  return;
                }
                if (isOpen || isChanged) {
                  rows.push({ option, value, isChanged });
                } else {
                  unchanged.push(option.shortLabel);
                }
              });
              const fields = filledVisitNoteFields(version.fields);
              return (
                <li key={version.savedAt} className={classes.note_version}>
                  <div className={classes.note_version_head}>
                    {/* Numbered, not merely called "earlier": two amendments can
                        fall in the same second, and an ordinal is the one label
                        that still puts the trail in order when they do. */}
                    <span className={classes.note_version_label}>
                      {formatVisitNoteVersionLabel(
                        version.version, reading.versionCount,
                      )}
                    </span>
                    <span className={classes.note_version_stamp}>
                      {`written ${formatVisitNoteStamp(version.savedAt)}, ` +
                        `replaced ${formatVisitNoteStamp(version.supersededAt)}`}
                    </span>
                    {version.author !== null ? (
                      <span className={classes.note_version_stamp}>
                        {`by ${version.author}`}
                      </span>
                    ) : null}
                  </div>
                  {/* Which fields the amendment that replaced it changed is stated
                      in the body, on the fields themselves — never twice. The
                      prose line that used to sit here ("Amendment changed: plan")
                      printed the same fact 4px above the PLAN label carrying its
                      own CHANGED tag; the marker on the field is the stronger of
                      the two, so it is the one that stayed. */}
                  <dl className={classes.note_fields}>
                    {fields.length === 0 && rows.length === 0 ? (
                      <div className={classes.note_field}>
                        <dd className={classes.note_value_empty}>
                          This version held no text.
                        </dd>
                      </div>
                    ) : rows.map(({ option, value, isChanged }) => (
                      <div key={option.key} className={classes.note_field}>
                        {this.renderVersionLabel(option, isChanged)}
                        {value !== null ? (
                          <dd className={classes.note_value}>{value}</dd>
                        ) : (
                          <dd className={classes.note_value_unset}>
                            Not written in this version.
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                  {/* The fields this version said exactly as the entry above it
                      says them, named rather than reprinted — and the press that
                      prints them. */}
                  {unchanged.length > 0 ? (
                    <div className={classes.note_version_rest}>
                      <span className={classes.note_version_same}>
                        {`${unchanged
                          .map((label, i) => (i === 0 ? label : label.toLowerCase()))
                          .join(', ')} unchanged`}
                      </span>
                      <button
                        type="button"
                        className={classes.note_version_toggle}
                        aria-expanded={false}
                        aria-label={`Show all fields of version ` +
                          `${version.version} of this note`}
                        onClick={this.openVersion(version.savedAt)}
                      >
                        Show the whole version
                      </button>
                    </div>
                  ) : this.state.openVersions[version.savedAt] === true ? (
                    <div className={classes.note_version_rest}>
                      <button
                        type="button"
                        className={classes.note_version_toggle}
                        aria-expanded
                        aria-label={`Show only what changed in version ` +
                          `${version.version} of this note`}
                        onClick={this.closeVersion(version.savedAt)}
                      >
                        Show only what changed
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    );
  };

  /**
   * A field's label inside an earlier version, marked where the amendment that
   * replaced that version changed *this* field.
   *
   * The marker is what makes the trail readable at all: an entry amended twice is
   * three blocks of near-identical text, and a reader who has to compare five
   * fields by eye to find the sentence that moved is not reading a trail, they are
   * proof-reading one. The word "changed" beside the label, not a colour alone.
   */
  private renderVersionLabel = (
    option: VisitNoteFieldOption, isChanged: boolean,
  ) => (
    <dt
      className={cx(classes.note_label, {
        [classes.note_label__changed]: isChanged,
      })}
    >
      {option.shortLabel}
      {isChanged ? (
        <span className={classes.note_changed_tag}>changed</span>
      ) : null}
    </dt>
  );

  private toggleHistory = () =>
    this.setState(({ isHistoryShown }) => ({ isHistoryShown: !isHistoryShown }));

  /** Read one earlier version whole — every field it held, changed or not. */
  private openVersion = (savedAt: number) => () =>
    this.setState(({ openVersions }) => ({
      openVersions: { ...openVersions, [savedAt]: true as true },
    }));

  /** …and back to what the amendment changed. */
  private closeVersion = (savedAt: number) => () =>
    this.setState(({ openVersions }) => {
      const next = { ...openVersions };
      delete next[savedAt];
      return { openVersions: next };
    });
}

export interface UnmatchedVisitNotesProps {
  /**
   * The notes whose timepoint key no image on file carries, keyed exactly as they
   * are stored. Never empty when this is rendered.
   */
  notes: Array<{ key: string; note: VisitNote }>;
  /** The visits on file that hold no note of their own, in the record's order. */
  destinations: Array<{ key: string; label: string }>;
  /** Re-file a note onto one of those visits, with its whole trail. */
  onRefile(from: string, to: string): any;
}

/**
 * The notes of this chart that no visit on file carries a label for — an entry
 * written at "T2", then relabelled "T2 Progress"; an entry whose visit's images
 * were all removed.
 *
 * It exists because the alternative is worse in exactly the way a records system
 * must not be: keyed by the visit's label, a note *can* be left pointing at a
 * label nothing carries, and an app that quietly dropped it would delete a
 * clinician's diagnosis to tidy up after a spelling correction. So nothing is
 * deleted and nothing is guessed — the entry is listed with the label it was
 * written under, and re-filing it onto a visit is an explicit press that names
 * that visit.
 *
 * Only visits with **no note of their own** are offered: moving an entry onto a
 * visit that already has one would have to overwrite it, and no path in this app
 * overwrites a clinician's note.
 */
export const UnmatchedVisitNotes = (
  { notes, destinations, onRefile }: UnmatchedVisitNotesProps,
) => (
  <section className={classes.orphans} aria-label="Notes with no visit on file">
    <div className={classes.orphans_head}>
      <h4 className={classes.orphans_title}>
        {notes.length === 1
          ? '1 note is not filed at any visit on file'
          : `${notes.length} notes are not filed at any visit on file`}
      </h4>
      <p className={classes.orphans_hint}>
        Each was written against the timepoint named below, and no image on file
        carries that label now — a visit relabelled, its images removed, or an
        entry that arrived with a case file for a visit that already had one of
        this chart's own. Nothing has been deleted or overwritten: file each note
        at the visit it belongs to.
      </p>
    </div>
    {notes.map(({ key, note }) => {
      const reading = readVisitNote(note);
      if (reading === null) {
        return null;
      }
      return (
        <div key={key} className={classes.orphan}>
          <span className={classes.orphan_key}>
            {key !== '' ? key : (
              /* One phrase for the unlabelled visit, from the one helper every
                 surface names it through. @see getVisitNoteVisitName */
              <span className={classes.orphan_key_unset}>
                {`Written for ${getVisitNoteVisitName(null)}`}
              </span>
            )}
            {' · '}
            <span className={classes.note_stamp}>
              {formatVisitNoteProvenance(reading)}
            </span>
          </span>
          {filledVisitNoteFields(reading.current).length === 0 ? (
            <p className={classes.note_retracted}>
              {VISIT_NOTE_RETRACTED_STATEMENT}
            </p>
          ) : (
            <dl className={classes.note_fields}>
              {filledVisitNoteFields(reading.current).map(({ option, value }) => (
                <div key={option.key} className={classes.note_field}>
                  <dt className={classes.note_label}>{option.shortLabel}</dt>
                  <dd className={classes.note_value}>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {destinations.length === 0 ? (
            /**
             * Nowhere to file it — and said so, because the heading above tells
             * the reader to "file each note at the visit it belongs to" and the
             * panel rendered no control and no explanation underneath it. This
             * is exactly the state a merge import produces when every visit on
             * file already holds an entry of this chart's own: the incoming
             * entry has nowhere to go, and no path in this app overwrites a
             * clinician's note to make room for one.
             */
            <p className={classes.orphan_nowhere}>
              Every visit on file already holds an entry of its own, so there is
              nowhere to file this without replacing one — and nothing here
              replaces a written entry. To fold this into the record, amend that
              visit's entry with what this one says. Nothing is deleted meanwhile:
              this entry stays here, in full, with its own trail.
            </p>
          ) : (
            <div className={classes.orphan_refile}>
              <span className={classes.orphan_refile_label}>File this note at</span>
              {destinations.map((destination) => (
                <button
                  key={destination.key}
                  type="button"
                  className={classes.orphan_pill}
                  title={`Move this note, with its amendment trail, to ` +
                    `${destination.label}`}
                  aria-label={`File this note at ${destination.label}`}
                  onClick={() => onRefile(key, destination.key)}
                >
                  {destination.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </section>
);
