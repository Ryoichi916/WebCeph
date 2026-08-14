import * as React from 'react';

import * as cx from 'classnames';

import IconInfo from 'material-ui/svg-icons/action/info-outline';
import IconRecords from 'material-ui/svg-icons/action/view-list';
import IconEdit from 'material-ui/svg-icons/image/edit';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconZoomIn from 'material-ui/svg-icons/action/zoom-in';
import IconZoomOut from 'material-ui/svg-icons/action/zoom-out';
import IconZoomFit from 'material-ui/svg-icons/maps/zoom-out-map';
import IconPrev from 'material-ui/svg-icons/navigation/chevron-left';
import IconNext from 'material-ui/svg-icons/navigation/chevron-right';

import Props from './props';

import { PatientRecord } from 'store/reducers/workspace';

import EditRecordDialog from 'components/RecordMetaFields/EditRecordDialog';
import RemoveRecordDialog from 'components/RecordMetaFields/RemoveRecordDialog';
import EditPatientDialog from 'components/RecordsDashboard/EditPatientDialog';

import { PatientDetails } from 'components/PatientFields';

import {
  getImageTypeLabel,
  getImageTypeShortLabel,
  getImageTypeLabelInSentence,
  formatCaptureDate,
  parseCaptureDate,
  // Which frame of the photographic series a photograph is — a fact of the
  // record, so the surface a photograph opens on states it (see `PhotoView`).
  isPhotographType,
  getPhotoViewLabel,
} from 'utils/records';

import { formatAgeFull } from 'utils/patient';

// This panel's "Edit details" edits the visit label a clinical note is filed
// under, so it reads the note filed there. @see handleSaveMeta
import { getVisitNoteKey, readVisitNote } from 'utils/visitNotes';

import { LATERAL_ANALYSES } from 'analyses/lateral';

const classes = require('./style.scss');

const iconStyle: React.CSSProperties = { width: 18, height: 18 };

/** Same bounds and step as the tracing canvas's zoom controls. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

interface State {
  /**
   * `null` means "fitted to the window". A number is the fraction of the
   * image's natural size (1 = one image pixel per screen pixel) — stated that
   * way in the readout's tooltip so the percentage means something exact.
   */
  zoom: number | null;
  isEditOpen: boolean;
  isRemoveOpen: boolean;
  /**
   * Whether the patient's own details are being corrected — opened from the one
   * gap on this panel that no record edit can close: the date of birth every
   * age-corrected norm is read against, and the reason "Age then" is blank.
   */
  isEditPatientOpen: boolean;
  /** Whether a zoomed image is being dragged around its well right now. */
  isPanning: boolean;
  /**
   * Whether the image currently overflows its well, i.e. whether there is
   * anything to pan. Measured, not inferred from the zoom: a zoom below fit
   * leaves a small film smaller than the well, and the grab cursor and the "drag
   * to move it" line must not appear over an image that cannot be moved.
   */
  isPannable: boolean;
  /**
   * Whether the list of analyses behind "tracing is offered on lateral
   * cephalograms only" is open. Closed by default: the fact is one sentence, and
   * the nine names are the evidence for it — spelled out unconditionally they
   * were twelve lines of prose that pushed "Open patient records" off a 900px
   * panel.
   */
  isAnalysisListOpen: boolean;
}

/**
 * The editor state for an image that is part of the patient's record but is
 * not a lateral cephalogram: a frontal ceph, a panoramic film, a profile or
 * intraoral photograph.
 *
 * These are displayed, never analysed. Every implemented analysis in this app
 * is defined on lateral-ceph landmarks, so instead of handing the user a
 * stepper that could never complete, this view shows the image with its record
 * metadata and says plainly what is and is not available.
 *
 * It keeps the editor's 44px bottom strip (with only the controls that apply
 * here — zoom out / % / zoom in / fit), so a 2000px panoramic can be read at
 * full size and switching rail tiles does not shift the canvas height.
 */
export default class RecordViewer extends React.PureComponent<Props, State> {
  state: State = {
    zoom: null,
    isEditOpen: false,
    isRemoveOpen: false,
    isEditPatientOpen: false,
    isPanning: false,
    isPannable: false,
    isAnalysisListOpen: false,
  };

  /** The scrolling well a zoomed image is panned inside. */
  private well: HTMLElement | null = null;

  /** Where a grab-to-pan drag started: pointer position and the well's scroll. */
  private panFrom: {
    x: number; y: number; left: number; top: number;
  } | null = null;

  componentDidMount() {
    window.addEventListener('resize', this.measurePannable);
    this.measurePannable();
  }

  componentWillReceiveProps(next: Props) {
    // A different film starts fitted, not at the previous film's zoom.
    if (next.imageId !== this.props.imageId) {
      this.setState({ zoom: null });
    }
  }

  componentDidUpdate() {
    this.measurePannable();
  }

  componentWillUnmount() {
    // The listeners, not `endPan`: setting state on the way out is a warning.
    window.removeEventListener('mousemove', this.handlePanMove);
    window.removeEventListener('mouseup', this.endPan);
    window.removeEventListener('resize', this.measurePannable);
  }

  render() {
    const {
      className, src, name, type, timepoint, captureDate, photoView,
      width, height,
      patient, otherChartIds, records, imageId, notes, onOpenRecordsClick,
    } = this.props;
    const dateOfBirth = patient !== null ? patient.dateOfBirth : null;
    const { zoom, isPanning, isPannable } = this.state;
    const typeLabel = getImageTypeLabel(type);
    const dateLabel = formatCaptureDate(captureDate);
    // A photograph is not a film, and the ground it is shown on has to say so:
    // a studio-grey portrait floating on the radiograph light-box black read as
    // a film on the one surface whose job is to say it is not one.
    const isPhotograph = isPhotographType(type);
    // The age *at this capture date*, derived exactly as the dashboard's group
    // stamp derives it (RecordsDashboard#getAgeOn), so the two surfaces cannot
    // describe one record at two depths.
    const captureDay = parseCaptureDate(captureDate);
    const ageAtCapture = captureDay !== null
      ? formatAgeFull(dateOfBirth || undefined, captureDay) : null;
    const index = records.map((r) => r.imageId).indexOf(imageId);
    const current = index >= 0 ? records[index] : undefined;
    const previous = index > 0 ? records[index - 1] : undefined;
    const next = index >= 0 && index < records.length - 1
      ? records[index + 1]
      : undefined;
    // Fitted: the browser scales the image down to the viewport. Zoomed: the
    // image is laid out at its own pixels × zoom and the viewport scrolls.
    const imageStyle: React.CSSProperties = zoom === null
      ? { }
      : {
        maxWidth: 'none',
        maxHeight: 'none',
        width: width !== null ? Math.round(width * zoom) : undefined,
        height: height !== null ? Math.round(height * zoom) : undefined,
      };
    return (
      <div className={cx(classes.root, className)}>
        <div className={classes.canvas}>
          {/* Zoomed, the well is dragged around the image — the same grab-to-pan
              the tracing canvas beside it has always had. Without it the zoom
              buttons led somewhere the clinician could not move: at 400% a
              1056 × 808 well over a 3120 × 4144 photograph showed one corner of a
              cheek, the pointer was a plain arrow and dragging did nothing. */}
          <div
            ref={this.setWell}
            className={cx(classes.viewport, {
              [classes.viewport__zoomed]: zoom !== null,
              [classes.viewport__pannable]: isPannable,
              [classes.viewport__panning]: isPanning,
              [classes.viewport__photo]: isPhotograph,
            })}
            onMouseDown={isPannable ? this.startPan : undefined}
          >
            {src !== null ? (
              <img
                className={cx(classes.image, {
                  [classes.image__photo]: isPhotograph,
                })}
                style={imageStyle}
                src={src}
                alt={name || typeLabel}
                // The image's own box is what decides whether there is anything
                // to pan, and it is not known until the bitmap has laid out.
                onLoad={this.measurePannable}
                // The browser's own image drag would otherwise start a ghost
                // drag the moment a pan begins on the image itself.
                draggable={false}
              />
            ) : (
              <span className={classes.no_image}>Image data unavailable</span>
            )}
          </div>
          <div className={classes.toolbar} role="toolbar" aria-label="View controls">
            <div className={classes.zoom_group} role="group" aria-label="Zoom">
              <button
                type="button"
                className={cx(classes.tool_button, classes.tool_button__icon)}
                disabled={zoom === null || zoom <= ZOOM_MIN}
                title={zoom === null
                  ? 'Already fitted to the window'
                  : 'Zoom out'}
                aria-label="Zoom out"
                onClick={this.zoomOut}
              >
                <IconZoomOut color="currentColor" style={iconStyle} />
              </button>
              <button
                type="button"
                className={cx(classes.tool_button, classes.zoom_value)}
                title="Show the image at its own pixels (100% = 1 image pixel per screen pixel)"
                aria-label="Show at 100%"
                onClick={this.zoomActual}
              >
                {zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}
              </button>
              <button
                type="button"
                className={cx(classes.tool_button, classes.tool_button__icon)}
                disabled={zoom !== null && zoom >= ZOOM_MAX}
                title="Zoom in"
                aria-label="Zoom in"
                onClick={this.zoomIn}
              >
                <IconZoomIn color="currentColor" style={iconStyle} />
              </button>
              <span className={classes.zoom_divider} />
              <button
                type="button"
                className={cx(classes.tool_button, classes.tool_button__icon)}
                disabled={zoom === null}
                title="Fit image to the window"
                aria-label="Fit image to the window"
                onClick={this.zoomFit}
              >
                <IconZoomFit color="currentColor" style={iconStyle} />
              </button>
            </div>
            {/* Stated where the zoom is, and only while there is something to
                pan: a grab cursor is the affordance, this is the sentence. */}
            {isPannable ? (
              <span className={classes.pan_hint}>Drag the image to move it</span>
            ) : null}
            <span className={classes.toolbar_note}>
              {/* Say why the tracing tools are absent instead of showing a row
                  of disabled labels. Only the first letter is lowered — set with
                  `toLowerCase()` this line read "frontal (pa) cephalograms" on
                  every PA film. */}
              View only — {getImageTypeLabelInSentence(type)}s are not traced
            </span>
          </div>
        </div>
        <aside className={classes.panel} aria-label="Record details">
          <header className={classes.panel_head}>
            <span className={classes.panel_eyebrow}>Record image</span>
            <h2 className={classes.panel_title}>{typeLabel}</h2>
          </header>
          <dl className={classes.meta}>
            {/* An unrecorded timepoint or capture date is a gap a clinician can
                close, so — exactly as the dashboard's identity band does with a
                missing date of birth (IdentityFact's `onFix`) — the empty value
                *is* the control that opens the form. Inert grey "Not recorded"
                on a records surface is a dead end. */}
            <MetaRow
              label="Timepoint"
              value={timepoint}
              onFix={this.openEdit}
              fixLabel="Add timepoint"
            />
            {/* Photographs only, because only a photograph holds a position in
                the photographic series — and it is offered for filling the same
                way the timepoint above it is, because an unplaced photograph is
                missing from the visit's series grid on the records dashboard. */}
            {isPhotograph ? (
              <MetaRow
                label="Series position"
                value={photoView !== null ? getPhotoViewLabel(photoView) : null}
                onFix={this.openEdit}
                fixLabel="Set series position"
              />
            ) : null}
            <MetaRow
              label="Capture date"
              value={dateLabel}
              isNumeric
              onFix={this.openEdit}
              fixLabel="Add capture date"
            />
            {/* The patient's age on the day of this film — the number every norm
                and every growth increment is read against, and the one the
                dashboard's group stamp already carries for this record. Derived,
                never recorded, so it names what it needs instead of claiming to
                be unrecorded.
                …and naming it is not enough where the app can close it: a missing
                date of birth disables every age-corrected norm in the report, and
                this row sat inert three lines under two rows that model exactly
                the affordance it needed. It opens the patient form on that field —
                the dashboard's IdentityFact idiom. (The capture-date branch stays
                a statement: the row directly above it is the control for that
                gap, and two buttons for one field one line apart is not an
                affordance, it is a repetition.) */}
            <MetaRow
              label="Age then"
              value={ageAtCapture}
              isNumeric
              fallback={dateLabel === null
                ? 'Needs a capture date'
                : 'Needs the date of birth'}
              onFix={dateLabel !== null && patient !== null
                ? this.openEditPatient : undefined}
              fixLabel="Needs the date of birth"
              fixTitle={"Add this patient's date of birth — every age-corrected " +
                'norm in this app is read against it'}
            />
            <MetaRow label="File" value={name} fallback="Unnamed" />
            <MetaRow
              label="Pixels"
              value={width !== null && height !== null
                ? `${width} × ${height}` : null}
              isNumeric
              fallback="Unknown"
            />
          </dl>
          {/* Record metadata is correctable from here as well as from the
              dashboard: this is the surface a mis-typed film lands on. */}
          <div className={classes.panel_actions}>
            <button
              type="button"
              className={classes.panel_action}
              onClick={this.openEdit}
            >
              <IconEdit color="#1565C0" style={iconStyle} />
              Edit details
            </button>
            <button
              type="button"
              className={cx(classes.panel_action, classes.panel_action__danger)}
              disabled={current === undefined}
              onClick={this.openRemove}
            >
              <IconDelete color="#C62828" style={iconStyle} />
              Remove from record
            </button>
          </div>
          {/* One sentence, not a wall. The fact that this image is not analysable
              is already stated by the panel's title, by its card's chip on the
              dashboard and by the toolbar note below the image; at four records
              a twelve-line restatement of it consumed 250px of this 900px panel
              and pushed "Open patient records" below the fold. What is left is
              the one thing the other three do not say — how to correct a
              mis-typed film — with the evidence (the nine analyses) behind a
              disclosure for the reader who wants it. */}
          <div className={classes.note}>
            <span className={classes.note_icon} aria-hidden="true">
              <IconInfo color="#B26A00" style={iconStyle} />
            </span>
            <div className={classes.note_body}>
              <p className={classes.note_text}>
                Tracing and analyses are offered on lateral cephalograms only. If
                this <em>is</em> a lateral cephalogram, correct its type with Edit
                details above and it becomes traceable.
              </p>
              <button
                type="button"
                className={classes.note_toggle}
                aria-expanded={this.state.isAnalysisListOpen}
                onClick={this.toggleAnalysisList}
              >
                {this.state.isAnalysisListOpen ? 'Hide' : 'Why?'}
                <span className={classes.note_toggle_hint}>
                  {LATERAL_ANALYSES.length} analyses, all lateral
                </span>
              </button>
              {this.state.isAnalysisListOpen ? (
                <p className={classes.note_text}>
                  Every analysis this app ships is defined on lateral-ceph
                  landmarks: {LATERAL_ANALYSES.map((a) => a.name).join(', ')}.
                  Images of other types are kept and displayed with the record,
                  never presented as analysable.
                </p>
              ) : null}
            </div>
          </div>

          {records.length > 1 ? (
            <section className={classes.context}>
              <div className={classes.context_head}>
                <span className={classes.context_title}>
                  This patient's timepoints
                </span>
                <span className={classes.context_nav}>
                  <button
                    type="button"
                    className={classes.nav_button}
                    disabled={previous === undefined}
                    title={previous !== undefined
                      ? `Previous record: ${describe(previous)}`
                      : 'This is the earliest record'}
                    aria-label="Previous record"
                    onClick={this.openSibling(previous)}
                  >
                    <IconPrev color="currentColor" style={iconStyle} />
                  </button>
                  <button
                    type="button"
                    className={classes.nav_button}
                    disabled={next === undefined}
                    title={next !== undefined
                      ? `Next record: ${describe(next)}`
                      : 'This is the latest record'}
                    aria-label="Next record"
                    onClick={this.openSibling(next)}
                  >
                    <IconNext color="currentColor" style={iconStyle} />
                  </button>
                </span>
              </div>
              <ul className={classes.context_list}>
                {records.map((record) => (
                  <li key={record.imageId}>
                    <button
                      type="button"
                      className={cx(classes.context_item, {
                        [classes.context_item__current]: record.imageId === imageId,
                      })}
                      disabled={record.imageId === imageId}
                      title={`Open ${describe(record)}`}
                      onClick={this.openSibling(record)}
                    >
                      <span className={classes.context_thumb}>
                        {record.thumbnail !== null ? (
                          <img
                            className={classes.context_thumb_img}
                            src={record.thumbnail}
                            alt=""
                            draggable={false}
                          />
                        ) : null}
                      </span>
                      <span className={classes.context_text}>
                        <span className={classes.context_label}>
                          {record.timepoint !== null
                            ? record.timepoint
                            : getImageTypeShortLabel(record.type)}
                          {record.imageId === imageId ? (
                            <span className={classes.context_current_tag}>
                              shown
                            </span>
                          ) : null}
                        </span>
                        <span className={classes.context_sub}>
                          {getImageTypeShortLabel(record.type)}
                          {formatCaptureDate(record.captureDate) !== null
                            ? ` · ${formatCaptureDate(record.captureDate)}`
                            : ''}
                        </span>
                      </span>
                      {record.isTraceable ? (
                        <span className={classes.context_flag}>Traceable</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* The panel's own idiom, not mui's: "Edit details" and "Remove from
              record" 400px above are authored `.panel_action`s at 13px in a 32px
              row, and this was the module's last default-Material control —
              FlatButton's own padding, ripple and 13.5px label, visibly off the
              rhythm of the two siblings it belongs with. */}
          <div className={classes.panel_foot}>
            <button
              type="button"
              className={cx(classes.panel_action, classes.panel_action__lead)}
              title="Open this patient's records dashboard — every image on file"
              onClick={onOpenRecordsClick}
            >
              <IconRecords color="#1565C0" style={iconStyle} />
              Open patient records
            </button>
          </div>
        </aside>

        {/* The same dialog the records dashboard corrects a record with, told the
            same three things about the visit's clinical note: what is filed there,
            whether this image is the last thing holding the label the note hangs
            on, and whether the label being typed already carries an entry of its
            own. @see EditRecordDialog#renderNoteEffect */}
        <EditRecordDialog
          open={this.state.isEditOpen}
          initialValue={{ type, timepoint, captureDate, photoView }}
          fileName={name}
          visitNote={readVisitNote(notes[getVisitNoteKey(timepoint)])}
          isOnlyImageAtVisit={this.countImagesAtVisit(timepoint) === 1}
          hasNoteAt={this.hasNoteAt}
          onSave={this.handleSaveMeta}
          onCancel={this.closeEdit}
        />
        {/* The same form the dashboard corrects a patient with, opened on the
            field this panel named. */}
        <EditPatientDialog
          open={this.state.isEditPatientOpen}
          patient={patient}
          otherChartIds={otherChartIds}
          focusField="dateOfBirth"
          onSave={this.handleSavePatient}
          onCancel={this.closeEditPatient}
        />
        <RemoveRecordDialog
          open={this.state.isRemoveOpen}
          type={type}
          timepoint={timepoint}
          captureDate={captureDate}
          fileName={name}
          // The film itself, so the dialog shows what it is about to remove.
          thumbnail={current !== undefined ? current.thumbnail : src}
          otherRecordCount={Math.max(records.length - 1, 0)}
          landmarksPlaced={current !== undefined ? current.landmarksPlaced : 0}
          onConfirm={this.handleConfirmRemove}
          onCancel={this.closeRemove}
        />
      </div>
    );
  }

  private zoomIn = () => {
    const { zoom } = this.state;
    this.setState({
      zoom: zoom === null ? 1 : Math.min(zoom * ZOOM_STEP, ZOOM_MAX),
    });
  };

  private zoomOut = () => {
    const { zoom } = this.state;
    if (zoom === null) {
      return;
    }
    this.setState({ zoom: Math.max(zoom / ZOOM_STEP, ZOOM_MIN) });
  };

  private zoomActual = () => this.setState({ zoom: 1 });
  private zoomFit = () => this.setState({ zoom: null });

  private toggleAnalysisList = () =>
    this.setState({ isAnalysisListOpen: !this.state.isAnalysisListOpen });

  private openEdit = () => this.setState({ isEditOpen: true });
  private closeEdit = () => this.setState({ isEditOpen: false });

  private openEditPatient = () => this.setState({ isEditPatientOpen: true });
  private closeEditPatient = () => this.setState({ isEditPatientOpen: false });

  private handleSavePatient = (details: PatientDetails) => {
    const { patient, onSavePatient } = this.props;
    this.setState({ isEditPatientOpen: false });
    if (patient !== null) {
      onSavePatient(patient.id, details);
    }
  };

  private setWell = (el: HTMLElement | null) => {
    this.well = el;
    this.measurePannable();
  };

  /**
   * Whether the image currently overflows its well — the one honest test of "can
   * this be dragged", taken off the box itself rather than guessed from the zoom
   * factor (a 800 × 960 film at 25% is smaller than the well; a 3120 × 4144
   * photograph at 25% is not).
   */
  private measurePannable = () => {
    const well = this.well;
    const isPannable = well !== null && this.state.zoom !== null && (
      well.scrollWidth > well.clientWidth + 1 ||
      well.scrollHeight > well.clientHeight + 1
    );
    if (isPannable !== this.state.isPannable) {
      this.setState({ isPannable });
    }
  };

  /**
   * Grab-to-pan on a zoomed image. The move and release are taken from the
   * window, not the well: a pan that leaves the well — which is most of them at
   * 400% — would otherwise stick to the pointer with the button already released.
   */
  private startPan = (e: React.MouseEvent<HTMLDivElement>) => {
    const well = this.well;
    // Primary button only, and only where there is something to move.
    if (well === null || e.button !== 0 || !this.state.isPannable) {
      return;
    }
    e.preventDefault();
    this.panFrom = {
      x: e.clientX, y: e.clientY,
      left: well.scrollLeft, top: well.scrollTop,
    };
    window.addEventListener('mousemove', this.handlePanMove);
    window.addEventListener('mouseup', this.endPan);
    this.setState({ isPanning: true });
  };

  private handlePanMove = (e: MouseEvent) => {
    const { well, panFrom } = this;
    if (well === null || panFrom === null) {
      return;
    }
    // The image follows the pointer, so the scroll moves against it.
    well.scrollLeft = panFrom.left - (e.clientX - panFrom.x);
    well.scrollTop = panFrom.top - (e.clientY - panFrom.y);
  };

  private endPan = () => {
    window.removeEventListener('mousemove', this.handlePanMove);
    window.removeEventListener('mouseup', this.endPan);
    if (this.panFrom !== null) {
      this.panFrom = null;
      this.setState({ isPanning: false });
    }
  };

  /** How many images are filed at one visit label, as the record groups them. */
  private countImagesAtVisit = (timepoint: string | null): number => {
    const key = getVisitNoteKey(timepoint);
    return this.props.records
      .filter((r) => getVisitNoteKey(r.timepoint) === key).length;
  };

  /** Whether a visit key already holds a clinical note. */
  private hasNoteAt = (key: string): boolean =>
    readVisitNote(this.props.notes[key]) !== null;

  /**
   * Save the corrected details — and carry the visit's clinical note across when
   * the correction is what moves the visit.
   *
   * The same rule, for the same reason, as the records dashboard's own path (see
   * `RecordsDashboard#handleSaveMeta`): a note is filed under the visit's label, so
   * relabelling the last image of a visit would otherwise leave a clinician's
   * diagnosis pointing at a label nothing carries.
   */
  private handleSaveMeta = (meta: ImageRecordMeta) => {
    const from = getVisitNoteKey(this.props.timepoint);
    const to = getVisitNoteKey(meta.timepoint);
    this.setState({ isEditOpen: false });
    if (from !== to && this.hasNoteAt(from) &&
      this.countImagesAtVisit(this.props.timepoint) === 1) {
      this.props.onRefileVisitNote(from, to);
    }
    this.props.onSaveMeta(meta);
  };

  private openRemove = () => this.setState({ isRemoveOpen: true });
  private closeRemove = () => this.setState({ isRemoveOpen: false });

  private handleConfirmRemove = () => {
    const { records, imageId, onRemoveRecord } = this.props;
    const record = records.filter((r) => r.imageId === imageId)[0];
    this.setState({ isRemoveOpen: false });
    if (record === undefined) {
      return;
    }
    const fallback = records
      .filter((r) => r.workspaceId !== record.workspaceId)
      .map((r) => r.workspaceId)[0];
    onRemoveRecord(record, fallback !== undefined ? fallback : null);
  };

  private openSibling = (record: PatientRecord | undefined) => () => {
    if (record !== undefined && record.imageId !== this.props.imageId) {
      this.props.onOpenRecord(record);
    }
  };
}

/**
 * One row of the record's detail list. An absent value is stated as absent —
 * and, where the absence is a gap this dialog can close (an unrecorded timepoint
 * or capture date), the value itself is the control that opens "Edit details",
 * the idiom the dashboard's identity band already uses for a missing date of
 * birth. Derived values (the age at capture) name what they need instead.
 */
const MetaRow = (
  {
    label, value, fallback = 'Not recorded', isNumeric = false,
    onFix, fixLabel, fixTitle,
  }:
  {
    label: string;
    value: string | null;
    fallback?: string;
    isNumeric?: boolean;
    onFix?: () => any;
    fixLabel?: string;
    /** What pressing the fix will do, where the label cannot say all of it. */
    fixTitle?: string;
  },
) => (
  <div className={classes.meta_row}>
    <dt className={classes.meta_key}>{label}</dt>
    <dd className={cx(classes.meta_value, {
      [classes.meta_value__num]: isNumeric,
    })}>
      {value !== null ? value
        : (onFix !== undefined && fixLabel !== undefined ? (
          <button
            type="button"
            className={classes.meta_fix}
            title={fixTitle}
            onClick={onFix}
          >
            {fixLabel}
          </button>
        ) : (
          <span className={classes.meta_unset}>{fallback}</span>
        ))}
    </dd>
  </div>
);

/** One-line identity of a record for tooltips: `T2 · Panoramic · 2026/03/19`. */
const describe = (record: PatientRecord): string =>
  [
    record.timepoint,
    getImageTypeLabel(record.type),
    formatCaptureDate(record.captureDate),
  ].filter((part) => part !== null).join(' · ');
