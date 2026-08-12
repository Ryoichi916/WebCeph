import * as React from 'react';

import * as cx from 'classnames';

import {
  IMAGE_TYPE_OPTIONS,
  DEFAULT_IMAGE_TYPE,
  getTodayISO,
  getImageTypeLabel,
  isTraceableImageType,
  formatCaptureDate,
  composeTimepointLabel,
  parseTimepointLabel,
  TIMEPOINT_STAGES,
  TimepointParts,
  normalizeSeriesToken,
  // The photographic series: the frame a photograph is, which is one fact of the
  // record and not a display detail (see `utils/records#PHOTO_VIEW_OPTIONS`).
  PHOTO_SERIES_ROWS,
  findPhotoView,
  isPhotographType,
  getDefaultPhotoView,
  getPhotoViewLabel,
  reconcilePhotoView,
} from 'utils/records';

const classes = require('./style.scss');

/** @see RecordMetaFields#state */
interface TimepointState {
  parts: TimepointParts | null;
}

export interface RecordMetaFieldsProps {
  /** The record metadata being edited. */
  value: ImageRecordMeta;
  /** Called with the whole metadata object on every edit. */
  onChange(value: ImageRecordMeta): void;
  /** Micro-label + hint above the fields; omitted when the dialog says it. */
  title?: string;
  hint?: string;
  /** Latest date the capture-date field accepts (defaults to today). */
  maxCaptureDate?: string;
  /**
   * Whether the field-level note about a non-traceable type is shown
   * (default true).
   *
   * The "Edit details" dialog states the consequence of the type it is being
   * changed *to* in its own effect line, and with both on screen the dialog
   * stacked two amber panels saying one thing twice: "Intraoral photographs are
   * stored and displayed with the record, but cephalometric tracing is only
   * offered on lateral cephalograms" immediately above "…it will be kept with
   * the record but shown read-only…". The surface that says it better keeps it.
   */
  showTypeNote?: boolean;
  className?: string;
}

/**
 * The three record fields — image type, timepoint, capture date — shared by the
 * upload screen (where they are filled before a file is added) and by "Edit
 * details" on an existing record. One component so the two surfaces can never
 * disagree about what a record can hold or about what the app will refuse to
 * trace.
 *
 * The capture date uses `input[type=date]`, which renders in the browser's
 * locale (US Chrome shows 08/06/2026). Every display surface in this app writes
 * dates as ISO `YYYY-MM-DD`, so the parsed value is echoed under the field in
 * that form — on a clinical record an ambiguous 08/06 is not acceptable.
 *
 * The timepoint is **composed**, not typed (see `utils/records#TIMEPOINT_STAGES`):
 * the series token this app's whole surface reads a label through, one of five
 * treatment stages, and an optional note. Typed as free text alone, "T1" was
 * whatever the person filing felt like — one record carried "T2 post-tx", "T2
 * post-treatment" and "T2 debond" for one visit, and no surface could group them.
 * The parts are read back off the stored label and written back to it verbatim, so
 * a project filed before the vocabulary existed opens with its own words intact.
 */
export default class RecordMetaFields
  extends React.PureComponent<RecordMetaFieldsProps, TimepointState> {
  /**
   * The three timepoint controls as they are being typed in.
   *
   * The parts are held here as well as parsed from the label because a label is
   * *one string* and the parse has to be unambiguous: mid-way through typing
   * "T2", the string is "T" — which is not a series token, so a pure
   * parse-on-render moved the character the clinician had just typed out of the
   * Visit field and into the Note field under their cursor. The local parts win
   * for exactly as long as they compose to the label the record actually holds
   * (see `getParts`); any other value — the dialog re-opened on another record,
   * a slot prefilling the form — replaces them.
   */
  state: TimepointState = { parts: null };

  render() {
    const {
      className, title, hint, maxCaptureDate, showTypeNote = true,
    } = this.props;
    const { type, captureDate } = this.props.value;
    const dateEcho = formatCaptureDate(captureDate);
    // A photograph carries a second fact a radiograph does not: which frame of
    // the series it is. Shown only on the photographs, because a cephalogram
    // holds no position in a photographic series and an empty select saying so
    // would be a field the record can never fill.
    const isPhoto = isPhotographType(type);
    const photoView = reconcilePhotoView(type, this.props.value.photoView);
    const parts = this.getParts();
    const composed = composeTimepointLabel(parts);
    // …and whether the composed label is worth stating: it is not, when it is the
    // Visit field's own value. Kept for the empty case, where "No timepoint" is the
    // one statement the three blank controls do not make themselves.
    const showEcho = composed === '' || composed !== parts.series.trim();
    return (
      <div className={cx(classes.record_form, className)}>
        {title !== undefined ? (
          <div className={classes.record_form_head}>
            <span className={classes.record_form_title}>{title}</span>
            {hint !== undefined ? (
              <span className={classes.record_form_hint}>{hint}</span>
            ) : null}
          </div>
        ) : null}
        <div className={classes.record_form_row}>
          <label className={classes.record_field}>
            <span className={classes.record_label}>Image type</span>
            <select
              className={cx(classes.record_input, classes.record_select)}
              value={type || DEFAULT_IMAGE_TYPE}
              onChange={this.handleTypeChange}
            >
              {IMAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={cx(classes.record_field, classes.record_field__date)}>
            <span className={classes.record_label}>Capture date</span>
            <input
              type="date"
              className={cx(classes.record_input, classes.record_input_date)}
              value={captureDate || ''}
              max={maxCaptureDate !== undefined ? maxCaptureDate : getTodayISO()}
              onChange={this.handleCaptureDateChange}
            />
            {/* Labelled: this slot states what will be written to the record,
                and must not be read as a hint about the field above it. */}
            <span
              className={cx(classes.record_help, classes.record_help__num, {
                [classes.record_help__unset]: dateEcho === null,
              })}
            >
              Stored as {dateEcho !== null ? dateEcho : 'YYYY-MM-DD'}
            </span>
          </label>
        </div>
        {/* Which frame of the photographic series this is — the photographs'
            own row, and only theirs.
            The select lists all nine frames and not just the ones belonging to
            the type above it, because the frame is the fact a clinician actually
            knows ("this is the left buccal") and the type follows from it: one
            frame belongs to exactly one type, so choosing "Left buccal" files the
            record as an intraoral photograph without asking twice. Leaving it
            unrecorded stays possible — that is what every photograph filed before
            this field existed is, and the record must be able to say so. */}
        {isPhoto ? (
          <div className={cx(classes.record_form_row, classes.record_form_row__view)}>
            <label className={cx(classes.record_field, classes.record_field__view)}>
              <span className={classes.record_label}>Series position</span>
              <select
                className={cx(classes.record_input, classes.record_select)}
                value={photoView !== null ? photoView : ''}
                onChange={this.handlePhotoViewChange}
              >
                <option value="">Not recorded</option>
                {PHOTO_SERIES_ROWS.map((row) => (
                  <optgroup key={row.key} label={row.label}>
                    {row.views.map((id) => (
                      <option key={id} value={id}>{getPhotoViewLabel(id)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span
                className={cx(classes.record_help, {
                  [classes.record_help__unset]: photoView === null,
                })}
              >
                {photoView !== null
                  ? 'Places this photograph in the visit’s series grid'
                  : 'Unplaced in the series grid until a position is set'}
              </span>
            </label>
          </div>
        ) : null}
        {/* The timepoint on a row of its own, because it is three controls and
            not one. Squeezed into the row above beside the type select and the
            native date control it had 132px — enough for "T1" and not for the
            vocabulary that keeps a record's labels comparable. */}
        <div className={cx(classes.record_form_row, classes.record_form_row__tp)}>
          <span className={cx(classes.record_field, classes.record_field__series)}>
            <span className={classes.record_label}>Visit</span>
            {/* The cap is a guard against a pasted paragraph, not an editorial
                decision: at 16 characters a typed "T2 post-treatment" was
                *stored* as "T2 post-treatmen", and that stump then identified
                the record on its card, in its tooltip, in the edit and remove
                labels and in the remove confirmation. Long labels are truncated
                for display where they are displayed (with the full text in the
                tooltip) — never on the way into the record. */}
            <input
              type="text"
              className={classes.record_input}
              value={parts.series}
              placeholder="T1"
              maxLength={16}
              aria-label="Visit number, e.g. T1"
              onChange={this.handleSeriesChange}
              onBlur={this.handleSeriesBlur}
            />
            {/* The convention, restored. The field this replaced carried it ("T1,
                T2, T3…") and the composed one shipped with a placeholder and
                nothing else: a "2" typed here was stored as "2", which is a visit
                label no surface of this app can read — the rail's pill printed
                "2" and the series it belongs to counted no number from it. The
                hint says the convention, and `handleSeriesBlur` writes it. */}
            <span className={classes.record_help}>T1, T2, T3…</span>
          </span>
          <span className={cx(classes.record_field, classes.record_field__stage)}>
            <span className={classes.record_label}>Stage</span>
            <select
              className={cx(classes.record_input, classes.record_select)}
              value={parts.stage}
              aria-label="Treatment stage of this visit"
              onChange={this.handleStageChange}
            >
              {/* Not a requirement: a record may carry a series and no stage,
                  and a label filed before this vocabulary existed keeps its own
                  wording in the note beside this. */}
              <option value="">No stage</option>
              {TIMEPOINT_STAGES.map((stage) => (
                <option key={stage.id} value={stage.id} title={stage.hint}>
                  {stage.label}
                </option>
              ))}
            </select>
          </span>
          <span className={cx(classes.record_field, classes.record_field__note)}>
            <span className={classes.record_label}>Note (optional)</span>
            <input
              type="text"
              className={classes.record_input}
              value={parts.note}
              placeholder="e.g. post-surgical review"
              maxLength={64}
              aria-label="Free-text note added after the stage"
              onChange={this.handleNoteChange}
            />
          </span>
          {/* What the record will actually hold, in the same idiom the capture
              date states its own stored form: three controls writing one string
              have to show the string — *where the string is not simply the Visit
              field back again*. In the common case it was: with only "T1" filled
              the row read "VISIT T1 … STORED AS T1", one value restated 300px to
              the right of itself. The capture date's own echo earns its place by
              differing from what the native control renders; this one earns it
              once two or three parts compose. */}
          {showEcho ? (
          <span className={classes.record_form_echo}>
            <span className={classes.record_label}>Stored as</span>
            {/* …and it states the whole string, not the first 24 characters of
                it. This line exists solely to show what three controls are about
                to write, and it stopped doing that at exactly the length where a
                label needs stating: "T12 Post-surgical bimaxillary osteoto…". It
                wraps to a second line now, and it carries the full text in its
                own `title` as well — the pattern the dashboard's own `.card_file`
                uses for a name it cannot fit. */}
            <span
              title={composed !== '' ? composed : undefined}
              className={cx(classes.record_help, classes.record_help__num, {
                [classes.record_help__unset]: composed === '',
              })}
            >
              {composed !== '' ? composed : 'No timepoint'}
            </span>
          </span>
          ) : null}
        </div>
        {isTraceableImageType(type) || !showTypeNote ? null : (
          <p className={classes.record_note}>
            {getImageTypeLabel(type)}s are stored and displayed with the
            record, but cephalometric tracing is only offered on lateral
            cephalograms.
          </p>
        )}
      </div>
    );
  }

  /**
   * The type, and with it the series position — the two are one fact of a
   * photograph and are written together.
   *
   * A position the new type cannot hold is replaced by that type's own default
   * (`getDefaultPhotoView`) rather than left contradicting it or silently
   * cleared: re-filing a frontal photograph as an intraoral one proposes the
   * centre frame, on screen, for the clinician to correct — which is exactly what
   * the field beside it is for. Filing away from photographs altogether drops the
   * position, because a cephalogram holds none.
   */
  private handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as ImageType;
    const kept = reconcilePhotoView(type, this.props.value.photoView);
    this.emit({
      type,
      photoView: kept !== null ? kept : getDefaultPhotoView(type),
    });
  };

  /**
   * The series position, and with it the type: one frame belongs to exactly one
   * image type, so choosing "Upper occlusal" files the record as an intraoral
   * photograph in the same edit. Clearing it back to "Not recorded" leaves the
   * type alone — the record still states what kind of photograph it is.
   */
  private handlePhotoViewChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const view = findPhotoView(e.target.value as PhotoView);
    if (view === undefined) {
      this.emit({ photoView: null });
      return;
    }
    this.emit({ photoView: view.id, type: view.imageType });
  };

  /**
   * Each of the three timepoint controls writes the whole label, recomposed from
   * the other two as they are currently stored — so the stored string is always
   * exactly what the "Stored as" line beside them says.
   */
  private handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.emitTimepoint({ series: e.target.value });
  };

  /**
   * A bare visit number becomes the label the whole app reads: "2" → "T2".
   *
   * On blur and never mid-keystroke — normalising as the clinician types would fight
   * someone typing "T2" — and only where the field holds nothing but a number, so
   * a clinic's own wording is never rewritten. Without it a record filed as "2" was
   * stored as "2": the rail's pill read "2", `getNextTimepointLabel` counted no
   * number from it, and the series was broken from that visit on.
   */
  private handleSeriesBlur = (e: React.ChangeEvent<HTMLInputElement>) => {
    const series = normalizeSeriesToken(e.target.value);
    if (series !== e.target.value) {
      this.emitTimepoint({ series });
    }
  };

  private handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.emitTimepoint({ stage: e.target.value });
  };

  private handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.emitTimepoint({ note: e.target.value });
  };

  private emitTimepoint = (patch: Partial<TimepointParts>) => {
    const parts = { ...this.getParts(), ...patch };
    this.setState({ parts });
    this.emit({ timepoint: composeTimepointLabel(parts) });
  };

  /** @see RecordMetaFields#state */
  private getParts = (): TimepointParts => {
    const { parts } = this.state;
    const stored = (this.props.value.timepoint || '').trim();
    if (parts !== null && composeTimepointLabel(parts) === stored) {
      return parts;
    }
    return parseTimepointLabel(stored);
  };

  private handleCaptureDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.emit({ captureDate: e.target.value });
  };

  private emit = (patch: Partial<ImageRecordMeta>) => {
    this.props.onChange({ ...this.props.value, ...patch });
  };
}

/**
 * The metadata as it should be stored: blank strings become nulls, so an
 * untouched field is recorded as "not recorded" rather than as an empty value
 * that later prints as a date.
 */
export const normalizeRecordMeta = (value: ImageRecordMeta): ImageRecordMeta => {
  const timepoint = (value.timepoint || '').trim();
  const captureDate = (value.captureDate || '').trim();
  return {
    type: value.type,
    timepoint: timepoint !== '' ? timepoint : null,
    captureDate: captureDate !== '' ? captureDate : null,
    // The position a record of this type may honestly carry: a radiograph carries
    // none, and a frame belonging to another type is dropped rather than stored
    // against a type that contradicts it (see `utils/records#reconcilePhotoView`).
    photoView: reconcilePhotoView(value.type, value.photoView),
  };
};
