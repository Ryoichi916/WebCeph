import * as React from 'react';

import * as cx from 'classnames';

import RaisedButton from 'material-ui/RaisedButton';
import IconChevron from 'material-ui/svg-icons/navigation/chevron-right';
import IconBack from 'material-ui/svg-icons/navigation/arrow-back';
import IconEdit from 'material-ui/svg-icons/image/edit';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconAdd from 'material-ui/svg-icons/content/add';

import Props from './props';

import { PatientRecord } from 'store/reducers/workspace';

import EditRecordDialog from 'components/RecordMetaFields/EditRecordDialog';
import RemoveRecordDialog from 'components/RecordMetaFields/RemoveRecordDialog';
import EditPatientDialog, { PatientEditField } from './EditPatientDialog';

import { PatientDetails } from 'components/PatientFields';

import { formatScale } from 'components/TracingToolbar/CalibrationDialog';

import {
  formatAgeFull,
  formatSexFull,
} from 'utils/patient';

import {
  getImageTypeLabel,
  formatCaptureDate,
  formatDisplayDate,
  parseCaptureDate,
  formatInterval,
  getImpliedFilmSize,
  FILM_SIZE_BAND,
  getTimepointToken,
  groupRecordsByTimepoint,
  IMAGE_TYPE_OPTIONS,
  TimepointGroup,
} from 'utils/records';

import { getNameForAnalysis } from 'components/AnalysisSelector/strings';

const classes = require('./style.scss');

const actionIconStyle: React.CSSProperties = { width: 18, height: 18 };

/**
 * Below this many images the record counts as sparse and the panel states what
 * the record does *not* yet hold (`renderFilingChecklist`) under its cards —
 * information in the space a nearly-empty list would otherwise leave blank.
 *
 * Five, not three: grouping the record by timepoint made every row shorter, so a
 * three- or four-image record leaves a band of empty grey under a content-sized
 * panel — which is the state a newly opened case is in most often.
 *
 * The panel itself is *always* sized to its records now. Stretched to the page's
 * slack, a one-record chart was a 123px card above a 410px dashed box: the
 * record was 19% of the panel's ink and the eye landed on the empty target
 * rather than on the film.
 */
const SPARSE_RECORD_LIMIT = 5;

/**
 * The empty state's illustration: an open records folder — back panel, raised
 * tab, front pocket with a thumb cut — and, standing clear of it, a film card
 * carrying a lateral soft-tissue profile with three landmarks on it.
 *
 * Drawn at 200px in a 200-wide viewBox so every feature is at its intended size:
 * the previous mark was a 190px drawing whose folder read as a rounded rectangle
 * with a notch, whose profile read as a cursive "3", and whose landmarks (r=2.8,
 * blue on white) were effectively invisible. The profile is the one an
 * orthodontist traces — glabella, soft-tissue nasion, nasal tip, subnasale,
 * lips, pogonion, menton — and the landmarks are the editor's own amber-on-dark
 * dots at the size they are actually placed at.
 */
const EmptyIllustration = () => (
  <svg
    className={classes.empty_art}
    width={200}
    height={140}
    viewBox="0 0 200 140"
    aria-hidden="true"
  >
    {/* Folder back panel, with the tab standing above its top edge. */}
    <path
      className={classes.empty_folder}
      d="M12 44 v-9 a5 5 0 0 1 5 -5 h27 a5 5 0 0 1 5 5 v9 h49 a6 6 0 0 1 6 6
         v66 a6 6 0 0 1 -6 6 H18 a6 6 0 0 1 -6 -6 Z"
    />
    {/* Front pocket: a lower front edge with a thumb cut, so the folder has a
        mouth to file into rather than being a rectangle with a bite out of it. */}
    <path
      className={classes.empty_pocket}
      d="M12 76 h30 c4 0 5 5 9 5 h20 c4 0 5 -5 9 -5 h24 v40 a6 6 0 0 1 -6 6
         H18 a6 6 0 0 1 -6 -6 Z"
    />
    {/* Film card, tilted, clear to the right of the folder. */}
    <g transform="rotate(6 158 70)">
      <rect
        x="122" y="20" width="72" height="100" rx="6"
        className={classes.empty_card}
      />
      {/* Soft-tissue profile, facing right. */}
      <path
        className={classes.empty_profile}
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M144 32
           C156 36 161 46 160 55
           C159 60 156 61 155 64
           C159 68 166 75 167 79
           C167 82 163 83 158 83
           C157 87 160 89 159 92
           C158 95 161 98 159 101
           C157 104 160 109 155 114
           C149 118 143 117 139 114"
      />
      {/* Three landmarks, in the editor's own amber-on-dark: soft-tissue
          nasion, pronasale, pogonion. Ringed and at placement size, so they
          read as plotted points rather than as stray specks. */}
      <g className={classes.empty_dots}>
        <circle cx="155" cy="64" r="4.2" />
        <circle cx="167" cy="79" r="4.2" />
        <circle cx="160" cy="107" r="4.2" />
      </g>
    </g>
  </svg>
);

/**
 * The tracing-progress chip for one record — never overstates what exists, and
 * never disagrees with the dots plotted on the thumbnail 100px to its left.
 *
 * The counts are landmarks, and say so: the analysis stepper counts every step
 * of the analysis (landmarks plus the lines and angles computed from them), so
 * an unlabelled "10 of 10" beside the stepper's "32/32" would read as a
 * contradiction.
 *
 * The analysis is named *inside* the count, because the count is of that
 * analysis's manual steps and nothing else: after a film was auto-plotted under
 * Downs, plotted again under Jarabak and switched back, the card read "Traced ·
 * 16 of 16 landmarks" beside a thumbnail carrying 18 amber dots — one number
 * with two readings. Where the film carries landmarks outside the active
 * analysis, the total actually stored (which *is* the number of dots) is stated
 * beside it rather than being quietly dropped.
 */
const StatusChip = (
  { record, analysisName }: { record: PatientRecord; analysisName: string | null },
) => {
  if (!record.isTraceable) {
    return (
      <span className={cx(classes.chip, classes.chip__muted)}>
        View only · not analysable
      </span>
    );
  }
  const { landmarksPlaced, landmarksRequired, landmarkPoints } = record;
  if (landmarksRequired === 0 || analysisName === null) {
    return (
      <span className={cx(classes.chip, classes.chip__muted)}>No analysis set</span>
    );
  }
  const plotted = landmarkPoints.length;
  const extra = plotted !== landmarksPlaced
    ? <span className={classes.chip_note}>· {plotted} plotted in all</span>
    : null;
  const title = plotted !== landmarksPlaced
    ? `${plotted} landmarks are stored for this film — the thumbnail plots all ` +
      `of them; ${landmarksPlaced} of them are manual steps of ${analysisName}.`
    : undefined;
  const count = `${landmarksPlaced} of ${landmarksRequired} ${analysisName} landmarks`;
  if (landmarksPlaced === 0) {
    // Outstanding work, not a permanent property of the film: a lateral ceph
    // that still needs tracing is tinted amber like "Partly traced" — the same
    // axis of the same job — never in the same grey as "View only · not
    // analysable", which is what a PA film or a photograph will always be.
    // Printed in one grey, the chip row could not be scanned for the films that
    // still need work.
    return (
      <span className={cx(classes.chip, classes.chip__todo)} title={title}>
        Not traced · {count}{extra}
      </span>
    );
  }
  if (landmarksPlaced >= landmarksRequired) {
    return (
      <span className={cx(classes.chip, classes.chip__ok)} title={title}>
        Traced · {count}{extra}
      </span>
    );
  }
  return (
    <span className={cx(classes.chip, classes.chip__partial)} title={title}>
      Partly traced · {count}{extra}
    </span>
  );
};

/**
 * The card's film, with this image's own stored tracing plotted over it.
 *
 * A thumbnail that is only a 15×-downscaled radiograph is not information: a
 * traced ceph, an untraced ceph and a panoramic all read as the same near-black
 * rectangle, and "Traced · 16 of 16" existed on the card as text only. The
 * landmarks are the ones actually recorded for the image (`landmarkPoints`, read
 * straight off the tracing state) in the image's own pixel coordinates, so the
 * overlay is the tracing rather than a decoration of it — an image with nothing
 * plotted gets no marks at all.
 *
 * The SVG shares the `<img>`'s box and fits its viewBox the same way
 * `object-fit: contain` fits the bitmap (`xMidYMid meet` over a viewBox of the
 * image's natural size), which is what keeps a dot on the point it was placed
 * on for a portrait film and a landscape one alike.
 */
const FilmThumb = ({ record }: { record: PatientRecord }) => {
  const { width, height, landmarkPoints } = record;
  const marks = (
    width !== null && height !== null && width > 0 && height > 0 &&
    landmarkPoints.length > 0
  ) ? { w: width, h: height } : null;
  return (
    <span className={classes.thumb}>
      {record.thumbnail !== null ? (
        <img
          className={classes.thumb_img}
          src={record.thumbnail}
          alt=""
          draggable={false}
        />
      ) : null}
      {marks !== null ? (
        <svg
          className={classes.thumb_marks}
          viewBox={`0 0 ${marks.w} ${marks.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {landmarkPoints.map((point, i) => (
            <circle
              key={i}
              className={classes.thumb_dot}
              cx={point.x}
              cy={point.y}
              // In image pixels: the dot keeps the same on-screen size whatever
              // the film's resolution is (the rim is `non-scaling-stroke`).
              r={Math.max(marks.w, marks.h) / 58}
            />
          ))}
        </svg>
      ) : null}
    </span>
  );
};

interface State {
  /** Image id whose details are being edited, or null. */
  editingImageId: string | null;
  /** Image id queued for removal (awaiting confirmation), or null. */
  removingImageId: string | null;
  /** Whether the patient's own details are being corrected. */
  isEditingPatient: boolean;
  /**
   * Which field of the patient form the dialog should open on. A cell that
   * names one gap ("Add date of birth") must land the caret in *that* field —
   * otherwise a keyboard user has to Tab past name and chart ID to reach the
   * field the link they pressed was named after. Null opens the form as a whole
   * (the band's "Edit patient details" button).
   */
  patientFocusField: PatientEditField | null;
  /**
   * Whether the panel's sticky header currently floats over the list — i.e. the
   * panel's own top edge has scrolled above the scrollport. Only then does the
   * header get its shadow and the fade scrim beneath it: a bar that is at its
   * natural position has nothing passing under it to fade.
   */
  isHeadFloating: boolean;
  /** The same, for the footer: content continues below the panel's bottom edge. */
  isFootFloating: boolean;
}

/**
 * The body class the dashboard wears while it is the open surface, so the app's
 * own top bar can stand down on paper — the printed chart carries a running head
 * of its own (`.print_head`) and named the patient twice without this. Same
 * mechanism the report, superimposition and simulation overlays use.
 */
const BODY_OPEN_CLASS = 'records-dashboard-open';

/**
 * The patient's records dashboard — a full workspace surface, not a dialog: it
 * takes the place of the tracing editor below the top bar the same way the
 * read-only RecordViewer takes the place of the tracing canvas, and it is where
 * a patient with images on file opens.
 *
 * The header band is the patient's identity — the demographics every analysis
 * and every printed report is read against, editable here because correcting a
 * wrong date of birth or sex is routine clinical work. Below it, filling the
 * rest of the page, is the imaging record — grouped by timepoint, not listed by
 * file: one visit per row of the timeline, headed by its label, the day (or
 * span) it covers and the patient's age then, with that visit's films and
 * photographs beside it as cards. Each card opens its image and carries the two
 * recovery actions the record needs (correct the details, or drop the image).
 *
 * The way back to the editor is a fixed control in the page bar, and Escape
 * does the same thing.
 *
 * Everything shown is read off the store — a card never claims a timepoint, a
 * capture date or a tracing that is not actually recorded.
 */
export default class RecordsDashboard extends React.PureComponent<Props, State> {
  state: State = {
    editingImageId: null,
    removingImageId: null,
    isEditingPatient: false,
    patientFocusField: null,
    isHeadFloating: false,
    isFootFloating: false,
  };

  private root: HTMLElement | null = null;
  private scroller: HTMLElement | null = null;
  private panel: HTMLElement | null = null;

  componentDidMount() {
    document.addEventListener('keydown', this.handleDocumentKeyDown);
    window.addEventListener('resize', this.updateStickyState);
    document.body.classList.add(BODY_OPEN_CLASS);
    // Land keyboard focus on the surface itself, so Escape and Tab start here
    // rather than wherever the editor left them.
    if (this.root !== null) {
      this.root.focus();
    }
    this.updateStickyState();
  }

  componentDidUpdate() {
    this.updateStickyState();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleDocumentKeyDown);
    window.removeEventListener('resize', this.updateStickyState);
    document.body.classList.remove(BODY_OPEN_CLASS);
  }

  render() {
    const { className, records, onBackToEditor } = this.props;
    // The exit names where it lands. The surface behind this one holds whichever
    // record is open, and half of the record types this app files are not
    // traceable — a photograph opens in the read-only viewer, so "Back to
    // editor" was wrong on exactly the rows that say "View only".
    const active = records.filter((r) => r.isActive)[0];
    const destination = active !== undefined
      ? [active.timepoint, getImageTypeLabel(active.type)]
        .filter((part) => part !== null).join(' · ')
      : null;
    const note = this.getTraceableNote();
    const { isHeadFloating } = this.state;
    return (
      <section
        className={cx(classes.surface, className)}
        aria-label="Patient records"
        tabIndex={-1}
        ref={this.setRoot}
      >
        {/* Page bar. The way out of this surface is its first control and never
            scrolls away — this screen has no other exit. Its content sits in the
            page's own centred column (same max-width, same gutter at every
            breakpoint), so the back control's left edge is the left edge of the
            cards beneath it instead of drifting 8-50px off them. */}
        <div className={classes.pagebar}>
          <div className={classes.pagebar_inner}>
            <button
              type="button"
              className={classes.back}
              onClick={onBackToEditor}
              title={destination === null
                ? 'Return to the workspace (Esc)'
                : (active.isTraceable
                  ? `Return to the tracing editor · ${destination} (Esc)`
                  : `Return to ${destination} — view only, not analysable (Esc)`)}
            >
              <IconBack color="currentColor" style={{ width: 18, height: 18 }} />
              <span className={classes.back_label}>
                {/* With no record open the surface behind this one is the upload
                    screen, not an editor — the label says what the title says. */}
                {destination === null
                  ? 'Back to the workspace' : `Back to ${destination}`}
              </span>
              <kbd className={classes.back_key}>Esc</kbd>
            </button>
            <span className={classes.pagebar_rule} aria-hidden="true" />
            <div className={classes.pagebar_titles}>
              <h2 className={classes.pagebar_title}>Patient records</h2>
              {/* The patient is named once on this page — by the identity band
                  40px below, which is the surface that owns the identity. Named
                  here as well, a long name was clamped to
                  "…for Alexandra Katherin…" on screen and cut on paper for no
                  gain. */}
              <span className={classes.pagebar_caption}>
                Every image on file, grouped by timepoint
              </span>
            </div>
            <span className={classes.pagebar_spacer} />
            {/* One primary action per view: with nothing on file the empty state
                below owns it, and repeating it here would give the screen two.
                The wrapper carries the surface's own focus ring — mui's pale
                keyboard ripple is invisible on a clinic monitor. */}
            {records.length > 0 ? (
              <RaisedButton
                primary
                className={classes.primary_action}
                label="Add image"
                icon={<IconAdd color="#FFFFFF" style={actionIconStyle} />}
                labelStyle={{ textTransform: 'none', fontWeight: 600 }}
                onClick={this.handleAddImage}
              />
            ) : null}
          </div>
        </div>

        <div
          className={classes.scroll}
          ref={this.setScroller}
          onScroll={this.updateStickyState}
        >
          {/* A table, and a presentational one: the running head below has to
              repeat on every printed sheet, and a real `<thead>` is the only
              construction a browser repeats *and* reserves the space for —
              `position: fixed` repeats but the flow then runs underneath it from
              sheet 2 on, and a div with `display: table-header-group` is not
              repeated at all (both verified in Chrome). On screen the table
              parts are `display: contents` and this is the flex column it has
              always been. */}
          <table className={classes.page} role="presentation">
            {/* Paper only, and on every sheet of it (see `.print_head`): a
                multi-page chart whose second and third sheets carry six films
                with no name, chart ID or date of birth on them is a loose page
                of radiographic records. */}
            {this.renderPrintHead()}
            <tbody className={classes.page_body}>
            <tr className={classes.page_row}>
            <td className={classes.page_cell}>
            {this.renderIdentity()}
            {/* The panel is sized to its records at every list length. Its head
                and foot stay put while the page scrolls, and both wear a shadow
                and a fade scrim for exactly as long as there is list passing
                under them (see `updateStickyState`) — without them a card was
                simply cut in half by a bar of panel chrome with nothing to say
                it had been. */}
            <section className={classes.records} ref={this.setPanel}>
              <div
                className={cx(classes.records_head, {
                  [classes.records_head__floating]: isHeadFloating,
                })}
              >
                <h3 className={classes.records_title}>Imaging records</h3>
                <span className={classes.records_count}>
                  {records.length === 1 ? '1 on file' : `${records.length} on file`}
                </span>
                <span className={classes.records_spacer} />
                {/* With nothing on file the empty block below owns the message;
                    stated here as well, the screen said the same thing twice
                    200px apart. */}
                {note !== null ? (
                  <p className={classes.records_note}>{note}</p>
                ) : null}
              </div>
              <div
                className={cx(classes.records_body, {
                  [classes.records_body__flush]: records.length === 0,
                })}
              >
                {records.length === 0 ? (
                  <div className={classes.empty}>
                    <EmptyIllustration />
                    <p className={classes.empty_title}>No images on file yet</p>
                    <p className={classes.empty_hint}>
                      Add a lateral cephalogram to start tracing. Frontal films,
                      panoramics and photographs can be filed alongside it.
                    </p>
                    <span className={classes.empty_action}>
                      <RaisedButton
                        primary
                        className={classes.primary_action}
                        label="Add image"
                        icon={<IconAdd color="#FFFFFF" style={actionIconStyle} />}
                        labelStyle={{ textTransform: 'none', fontWeight: 600 }}
                        onClick={this.handleAddImage}
                      />
                    </span>
                  </div>
                ) : (
                  <ol className={classes.timeline}>
                    {/* One rail for the whole timeline, drawn from the first
                        timepoint's node down to the last (the tail below the last
                        node is masked by that group's stamp) — never one stub per
                        group. */}
                    <span className={classes.timeline_rail} aria-hidden="true" />
                    {groupRecordsByTimepoint(records).map(
                      (group, index) => this.renderGroup(group, index),
                    )}
                    {/* The list closes on the way to add the next film — the
                        same action as the page bar's, offered where a reader
                        arrives after the newest record. One height at every list
                        length: grown to the panel's slack it was a 410px dashed
                        box under a 123px card, and the eye landed on the empty
                        target instead of on the film. */}
                    <li className={classes.add_entry}>
                      <button
                        type="button"
                        className={classes.add_row}
                        onClick={this.handleAddImage}
                      >
                        <span className={classes.add_row_line}>
                          {/* mui SvgIcon resolves `currentColor` against its own
                              inline palette colour, not the button's — state the
                              colour outright. */}
                          <IconAdd color="#52616F" style={actionIconStyle} />
                          <span>Add another image to this record</span>
                        </span>
                      </button>
                    </li>
                  </ol>
                )}
                {/* What the record does not yet hold, while it is short enough
                    for that to be the useful thing to say. This is the space a
                    grown add row used to occupy, carrying information instead of
                    a bigger button. */}
                {records.length > 0 && records.length < SPARSE_RECORD_LIMIT
                  ? this.renderFilingChecklist() : null}
              </div>
              {this.renderRecordsFooter()}
            </section>
            </td>
            </tr>
            </tbody>
          </table>
        </div>
        {this.renderDialogs()}
      </section>
    );
  }

  private setRoot = (el: HTMLElement | null) => { this.root = el; };
  private setScroller = (el: HTMLElement | null) => { this.scroller = el; };
  private setPanel = (el: HTMLElement | null) => { this.panel = el; };

  /**
   * Whether the panel's sticky head and foot are currently floating over the
   * list, measured rather than guessed: the head floats exactly while the
   * panel's top edge is above the scrollport's, the foot exactly while its
   * bottom edge is below it. (Deriving this from `scrollTop` alone would fade
   * the head while the identity band was still scrolling past and nothing was
   * under it.)
   *
   * The scrims and shadows those two flags switch on are the surface's answer to
   * a bar that overlaps content: at 6 records the head covered the top 63px of a
   * 123px card, and at the default list the foot covered the bottom half of the
   * last one — with no shadow, no fade and no shift in the card, so a film simply
   * ended mid-line.
   */
  private updateStickyState = () => {
    const { scroller, panel } = this;
    if (scroller === null || panel === null) {
      return;
    }
    const port = scroller.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const isHeadFloating = box.top < port.top - 0.5;
    const isFootFloating = box.bottom > port.bottom + 0.5;
    if (
      isHeadFloating !== this.state.isHeadFloating ||
      isFootFloating !== this.state.isFootFloating
    ) {
      this.setState({ isHeadFloating, isFootFloating });
    }
  };

  /**
   * Escape leaves the surface, exactly like the page bar's back control — but
   * not while one of this screen's own dialogs is open, where Escape belongs to
   * the dialog.
   */
  private handleDocumentKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') {
      return;
    }
    const { editingImageId, removingImageId, isEditingPatient } = this.state;
    if (editingImageId !== null || removingImageId !== null || isEditingPatient) {
      return;
    }
    this.props.onBackToEditor();
  };

  /**
   * The printed chart's running head: it repeats on every sheet, because a
   * sheet of a patient's imaging record that does not name the patient is not
   * filable. Never rendered on screen — the page bar and the identity band own
   * that job there — and it replaces the page bar on paper, where an exit
   * control and a keyboard shortcut mean nothing.
   *
   * Every part is read off the patient record; a part that is not recorded is
   * simply not printed, and the identity band below states the gap in full.
   */
  private renderPrintHead = () => {
    const { patient } = this.props;
    const name = patient !== null && patient.name ? patient.name : null;
    const chartId = patient !== null && patient.chartId ? patient.chartId : null;
    const dob = patient !== null ? formatDisplayDate(patient.dateOfBirth) : null;
    const sex = patient !== null ? formatSexFull(patient.sex) : null;
    const heading = name !== null ? name
      : (chartId !== null ? chartId : '(unnamed patient)');
    const parts: string[] = [];
    if (name !== null && chartId !== null) {
      parts.push(`Chart ${chartId}`);
    }
    if (dob !== null) {
      parts.push(`DOB ${dob}`);
    }
    if (sex !== null) {
      parts.push(sex);
    }
    return (
      <thead className={classes.print_head} aria-hidden="true">
        <tr>
          <th className={classes.print_head_cell} scope="col">
            <span className={classes.print_head_inner}>
              <span className={classes.print_head_label}>Imaging records</span>
              <span className={classes.print_head_name}>{heading}</span>
              {parts.length > 0 ? (
                <span className={classes.print_head_facts}>{parts.join(' · ')}</span>
              ) : null}
            </span>
          </th>
        </tr>
      </thead>
    );
  };

  /**
   * The patient's identity: who this record belongs to, and the demographics
   * every analysis and printed report is read against. Unrecorded values are
   * shown as unrecorded rather than hidden — a missing date of birth is a fact
   * about the record, and the button underneath is how it gets filled in.
   */
  private renderIdentity = () => {
    const { patient, records } = this.props;
    // Whose record this is. Saving a blank name is legal wherever a chart ID
    // exists, and then the chart ID *is* the heading — so it must not be printed
    // a second time as the pill under it (the guard PatientBar keeps): a
    // name-less patient read "C-2014-0087" as an <h3> with "C-2014-0087" as a
    // chip 4px below it. The pill states the gap that is actually there
    // instead, and is the control that closes it.
    const name = patient !== null && patient.name ? patient.name : null;
    const chartId = patient !== null && patient.chartId ? patient.chartId : null;
    const heading = name !== null ? name
      : (chartId !== null ? chartId
        : (patient !== null ? '(unnamed patient)' : '—'));
    // Which identifier is missing, named honestly, and the field the pill opens.
    const gapLabel = name === null && chartId === null ? 'No name or chart ID'
      : (name === null ? 'No name recorded' : 'No chart ID');
    const gapField: PatientEditField = name === null ? 'name' : 'chartId';
    // ISO, from the app's one date formatter: this panel showed `1998/04/12`
    // while the printed report showed `1998-04-12` for the same patient.
    const dob = patient !== null ? formatDisplayDate(patient.dateOfBirth) : null;
    const age = patient !== null ? formatAgeFull(patient.dateOfBirth) : null;
    const sex = patient !== null ? formatSexFull(patient.sex) : null;
    // Counted off the very grouping the timeline below draws, so the band and
    // the timeline can never disagree: labelled timepoints (T1, T2, …) are the
    // count, and the images that carry no label — which the timeline still
    // draws as a row of its own, with its own pill, date and age — are stated
    // beside it rather than silently left out of the total. "TIMEPOINTS 3"
    // above four visible rows was one number with two readings, 120px apart.
    const groups = groupRecordsByTimepoint(records);
    const timepointCount = groups.filter(({ label }) => label !== null).length;
    const unlabelled = groups
      .filter(({ label }) => label === null)
      .reduce((total, group) => total + group.records.length, 0);
    // How long the record actually spans, counted between the earliest and the
    // latest capture date on file. The panel states the two dates; how much
    // growth sits between them is what a longitudinal record is read for, and
    // nothing else on this screen says it.
    const dated = records
      .map(({ captureDate }) => formatCaptureDate(captureDate))
      .filter((d): d is string => d !== null)
      .sort();
    const span = getRecordSpan(dated);
    return (
      <header className={classes.identity}>
        <div className={classes.identity_head}>
          <span className={classes.identity_avatar} aria-hidden="true">
            {getInitials(heading)}
          </span>
          <div className={classes.identity_names}>
            <h3 className={classes.identity_name}>{heading}</h3>
            {name !== null && chartId !== null ? (
              <span className={classes.identity_chart}>{chartId}</span>
            ) : patient !== null ? (
              <button
                type="button"
                className={cx(classes.identity_chart, classes.identity_chart__unset)}
                title={`${gapLabel} — click to add it`}
                onClick={this.openEditPatientField(gapField)}
              >
                {gapLabel}
              </button>
            ) : null}
          </div>
        </div>

        {/* The record count is deliberately absent: the panel below carries it
            as a chip beside its own heading, and the top bar carries it as
            "Records (3)" — a third wording of one number, inside 120 vertical
            pixels, is not information. */}
        <dl className={classes.facts}>
          <IdentityFact
            label="Date of birth"
            value={dob}
            // The gap is shown where it matters and closed from there — with the
            // caret already in the field this cell named.
            onFix={patient !== null
              ? this.openEditPatientField('dateOfBirth') : undefined}
            fixLabel="Add date of birth"
          />
          <IdentityFact
            label="Age today"
            value={age}
            // Age is derived from the date of birth, never recorded, so it does
            // not claim to be "not recorded".
            fallback="Needs date of birth"
          />
          <IdentityFact
            label="Sex"
            value={sex}
            onFix={patient !== null ? this.openEditPatientField('sex') : undefined}
            fixLabel="Add sex"
          />
          {/* What is on file — dropped entirely when nothing is. On an empty
              record these two cells spent a third of the band on facts that
              cannot exist ("TIMEPOINTS 0", "RECORD SPAN — No capture dates");
              the demographics, which do exist the moment a patient is
              registered, have the strip to themselves instead. */}
          {records.length > 0 ? (
            <span className={classes.facts_rule} aria-hidden="true" />
          ) : null}
          {records.length > 0 ? (
            <IdentityFact
              label="Timepoints"
              // With images on file but none labelled, "None labelled" is the
              // honest reading.
              value={timepointCount > 0 ? String(timepointCount) : null}
              fallback="None labelled"
              note={timepointCount > 0 && unlabelled > 0
                ? `+ ${unlabelled} unlabelled ${unlabelled === 1 ? 'image' : 'images'}`
                : undefined}
            />
          ) : null}
          {/* Only where there is a span to state. On a record captured on one
              day this cell read "RECORD SPAN — One capture date", which is
              "TIMEPOINTS 1" beside it in other words; and the panel's footer
              then restated the day itself a third time. The endpoints are the
              value, with the elapsed time beside them — the same interval
              formatter the superimposition prints ("1 y 4 mo"), which used to
              read "1 y 4 m" here for the identical pair of dates. */}
          {span !== null ? (
            <IdentityFact
              label="Record span"
              value={span.dates}
              note={span.interval !== null ? span.interval : undefined}
            />
          ) : null}
        </dl>

        {/* Authored, not a mui FlatButton: FlatButton paints hover and keyboard
            focus with the *same* grey wash (RaisedButton/FlatButton both read
            `state.hovered || state.isKeyboardFocused`), so the identity header's
            only control had no focus state a keyboard user could see. This is
            the page bar's back control in the same idiom — one focus system on
            the surface. */}
        <button
          type="button"
          className={classes.identity_edit}
          onClick={this.openEditPatient}
          title="Correct this patient's name, chart ID, date of birth or sex"
        >
          <IconEdit color="currentColor" style={actionIconStyle} />
          <span>Edit patient details</span>
        </button>
      </header>
    );
  };

  /**
   * The panel's closing line — or nothing at all.
   *
   * Every figure here is counted off the records, and every figure that only
   * restates what is already on the screen is dropped: on a one-film chart this
   * bar printed "Captured 2025-03-14 · 1 of 1 lateral ceph traced · 1 of 1
   * lateral ceph calibrated" 500px below the card's own "Traced · 16 of 16" and
   * "Calibrated" chips and below an identity band that already carried the span.
   * The tallies are an aggregate, so they appear once there is something to
   * aggregate; the dates are the band's job. With nothing left to say the bar is
   * not rendered — a sticky strip of chrome with one restated fact in it is worse
   * than no strip at all, because it also floats over the last card.
   */
  private renderRecordsFooter = () => {
    const { records } = this.props;
    const traceable = records.filter((r) => r.isTraceable);
    const traced = traceable.filter(
      (r) => r.landmarksRequired > 0 && r.landmarksPlaced >= r.landmarksRequired,
    ).length;
    const calibrated = traceable.filter((r) => r.isCalibrated).length;
    // One traceable film says everything twice: its own two chips are the two
    // tallies. Two or more, and "2 of 3 traced" is a reading of the record that
    // no single card carries.
    if (traceable.length < 2) {
      return null;
    }
    const { isFootFloating } = this.state;
    const noun = 'lateral cephs';
    return (
      <div
        className={cx(classes.records_foot, {
          [classes.records_foot__floating]: isFootFloating,
        })}
      >
        {/* The base is named. Counted over the traceable films but printed as a
            bare "3 of 3", these two figures read as "the whole record is done"
            on a record where half the images are photographs. */}
        <span className={classes.records_foot_item}>
          {traced} of {traceable.length} {noun} traced
        </span>
        <span className={classes.records_foot_item}>
          {calibrated} of {traceable.length} {noun} calibrated
        </span>
        <span className={classes.records_foot_spacer} />
      </div>
    );
  };

  /**
   * What this record does not yet hold, while it is short enough for that to be
   * worth stating: every image type the app files, ticked where the record has
   * one and hollow where it does not, with the count where there are several.
   *
   * This is information, not a requirement — a case is not incomplete for having
   * no panoramic — and it is read straight off the records, so it can never claim
   * a film that is not there. It occupies the space a one-record chart used to
   * spend on a 410px dashed button.
   */
  private renderFilingChecklist = () => {
    const { records } = this.props;
    const counts: { [type: string]: number } = {};
    records.forEach(({ type }) => {
      if (type !== null) {
        counts[type] = (counts[type] || 0) + 1;
      }
    });
    const filed = IMAGE_TYPE_OPTIONS.filter(
      ({ id }) => (counts[id] || 0) > 0,
    ).length;
    return (
      <div className={classes.filing}>
        <div className={classes.filing_head}>
          <span className={classes.filing_title}>Image types in this record</span>
          <span className={classes.filing_count}>
            {filed} of {IMAGE_TYPE_OPTIONS.length} filed
          </span>
        </div>
        <ul className={classes.filing_list}>
          {IMAGE_TYPE_OPTIONS.map(({ id, label }) => {
            const held = counts[id] || 0;
            return (
              <li
                key={id}
                className={cx(classes.filing_item, {
                  [classes.filing_item__held]: held > 0,
                })}
              >
                {held > 0 ? (
                  <svg
                    className={classes.filing_mark}
                    width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
                  >
                    <circle className={classes.filing_mark_disc} cx="7" cy="7" r="7" />
                    <path
                      className={classes.filing_mark_tick}
                      fill="none"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.6 7.2 L6 9.5 L10.4 4.6"
                    />
                  </svg>
                ) : (
                  <svg
                    className={classes.filing_mark}
                    width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
                  >
                    <circle
                      className={classes.filing_mark_ring}
                      cx="7" cy="7" r="6"
                      fill="none"
                      strokeWidth="1.5"
                    />
                  </svg>
                )}
                <span className={classes.filing_label}>{label}</span>
                <span className={classes.filing_state}>
                  {held > 0 ? (held === 1 ? '1 image' : `${held} images`)
                    : 'Not on file'}
                </span>
              </li>
            );
          })}
        </ul>
        {/* Stated once, so a hollow circle is never read as an outstanding
            task: a cephalometric record is whatever the case needs. */}
        <p className={classes.filing_note}>
          A record may hold any of these — this is what has been filed, not a
          checklist a case has to complete.
        </p>
      </div>
    );
  };

  /**
   * The note beside the section heading, or null when the panel is empty — the
   * empty block below already says what can be traced, and the two lines said it
   * twice. Every branch is grammatical for one image as well as many: a clinical
   * surface cannot ship "0 of 1 images are …".
   */
  private getTraceableNote = (): string | null => {
    const { records } = this.props;
    const total = records.length;
    const traceable = records.filter((r) => r.isTraceable).length;
    if (total === 0) {
      return null;
    }
    if (traceable === total) {
      return total === 1
        ? 'The image on file is a lateral cephalogram and can be traced.'
        : `All ${total} images are lateral cephalograms and can be traced.`;
    }
    const noun = total === 1 ? 'image' : 'images';
    return `${traceable} of ${total} ${noun} can be traced — tracing is offered ` +
      'on lateral cephalograms only.';
  };

  /**
   * The patient's age on a given day of the record, or null unless both the date
   * of birth and that day are actually recorded. This is the number that makes
   * an imaging record clinical rather than a file listing: a norm, a growth
   * increment and a treatment decision are all read against the age on the film,
   * never against the age on the day the chart is opened.
   */
  private getAgeOn = (isoDate: string | null): string | null => {
    const { patient } = this.props;
    const day = parseCaptureDate(isoDate);
    if (patient === null || day === null) {
      return null;
    }
    return formatAgeFull(patient.dateOfBirth, day);
  };

  /**
   * One timepoint of the record: its stamp in the timeline gutter (the label, the
   * day or the span it covers, and the patient's age then), and its images beside
   * it as a compact grid — a visit is one row of this page, so a six-timepoint
   * case is read without scrolling T1 off the top.
   */
  private renderGroup = (
    group: TimepointGroup<PatientRecord>, index: number,
  ) => {
    const { patient } = this.props;
    // The day, or the span, the visit actually covers — never a borrowed date.
    const hasDate = group.firstDate !== null;
    const spansDays = group.lastDate !== null && group.lastDate !== group.firstDate;
    // Age then. A visit whose images span two days that fall either side of a
    // birthday states both readings rather than picking one.
    const ageFirst = this.getAgeOn(group.firstDate);
    const ageLast = this.getAgeOn(group.lastDate);
    const ageLabel = ageFirst === null ? null
      : (ageLast !== null && ageLast !== ageFirst
        ? `${ageFirst} – ${ageLast}` : ageFirst);
    // Age is derived, never recorded: with no date of birth on file there is no
    // age to print at any timepoint. The gap is offered for closing once, at the
    // first timepoint, instead of six times down the page.
    const showAgeGap = ageLabel === null && hasDate &&
      patient !== null && index === 0;
    const label = group.label;
    // The pill carries the label's first token — "T2" out of
    // "T2 mid-treatment" — exactly as the image rail's tile does, and the rest
    // of the label is written underneath it. Set whole in the pill, a free-text
    // label pushed the timepoint's node off the timeline's rail; ellipsised in
    // the pill, half of what the clinician typed was simply not on the page.
    const token = getTimepointToken(label);
    const rest = (label !== null && token !== null)
      ? label.trim().slice(token.length).trim() : '';
    return (
      <li key={group.key !== '' ? group.key : '__untimepointed'} className={classes.group}>
        <div className={classes.group_when}>
          {/* The app's timepoint badge: a filled pill carrying the label's first
              token, with the rest of a free-text label written beside/below it.
              The same construction the Summary dialog's title row uses (the rail
              shows the same token as plain caption type, sized to a 60px tile).
              The label is its own element inside the pill because `text-overflow`
              never applies to an inline-flex box, so a long single-token label
              would otherwise be cut mid-word with nothing to say it had been. */}
          <span
            className={cx(classes.timepoint, classes.timepoint__group, {
              [classes.timepoint__unset]: label === null,
            })}
            title={label !== null ? label : 'These images carry no timepoint label'}
          >
            <span className={classes.timepoint_label}>
              {token !== null ? token : 'No timepoint'}
            </span>
          </span>
          {rest !== '' ? (
            <span className={classes.group_note} title={label !== null ? label : undefined}>
              {rest}
            </span>
          ) : null}
          {/* Each date is its own unbreakable run (`.group_date_day`), and the
              dash is joined to the first of them by a non-breaking space, so
              the one break the stamp allows is the one before the second date.
              Left to wrap as a single string, the browser broke a two-day visit
              at the ISO hyphens — "2025-10-02 – 2025-" / "10-03" — which is not
              a date. */}
          <span className={classes.group_date}>
            {hasDate ? (
              spansDays ? (
                <span>
                  <span className={classes.group_date_day}>{group.firstDate}</span>
                  {' – '}
                  <span className={classes.group_date_day}>{group.lastDate}</span>
                </span>
              ) : (
                <span className={classes.group_date_day}>{group.firstDate}</span>
              )
            ) : (
              <span className={classes.group_date_unset}>No capture date</span>
            )}
          </span>
          {/* A visit where only some of the images are dated says so — the span
              above is then the span of the dated ones only. */}
          {group.undatedCount > 0 && hasDate ? (
            <span className={classes.group_undated}>
              {group.undatedCount === 1
                ? '1 image undated' : `${group.undatedCount} images undated`}
            </span>
          ) : null}
          {ageLabel !== null ? (
            <span className={classes.group_age}>
              <span className={classes.group_age_key}>Age</span>
              <span className={classes.group_age_value}>{ageLabel}</span>
            </span>
          ) : showAgeGap ? (
            <span className={classes.fact_gap}>
              <button
                type="button"
                className={classes.fact_fix}
                onClick={this.openEditPatientField('dateOfBirth')}
              >
                Add date of birth
              </button>
              {/* On paper the line is a statement about the record, not a
                  control: nobody can press "Add date of birth" on a chart. */}
              <span className={classes.fact_print}>Age needs date of birth</span>
            </span>
          ) : null}
          {/* The node carries a fact as well as a position: filled for a visit
              whose day is on file, hollow for one that carries no capture date
              (the label alone cannot be placed in a chronology). */}
          <span
            className={cx(classes.group_node, {
              [classes.group_node__dated]: hasDate,
            })}
            aria-hidden="true"
          />
        </div>
        <div className={classes.group_cards}>
          {/* The card is handed its group: what the stamp beside it already
              states, the card does not repeat. */}
          {group.records.map((record) => this.renderRecord(record, group))}
        </div>
      </li>
    );
  };

  /**
   * One image of the record, as a card inside its timepoint: the film itself
   * with its tracing plotted on it, what it is, whether it is calibrated, how
   * far its tracing has got, which analysis it is measured with, and the file's
   * own technicals in a column of their own at the card's right. The timepoint
   * label, the age and (unless it differs) the capture date are not repeated
   * here — the group's stamp two centimetres to the left states them once for
   * every card in the row.
   */
  private renderRecord = (
    record: PatientRecord, group: TimepointGroup<PatientRecord>,
  ) => {
    const dateLabel = formatCaptureDate(record.captureDate);
    const typeLabel = getImageTypeLabel(record.type);
    const analysisName = record.analysisId !== null
      ? getNameForAnalysis(record.analysisId)
      : null;
    const identity = [record.timepoint, typeLabel, dateLabel]
      .filter((part) => part !== null).join(' · ');
    // The card carries its own capture day only where that day is not the one
    // already stamped beside the row: a visit spanning two days, or an image
    // filed undated into a dated visit. Printed unconditionally, the same date
    // appeared two and three times in a single row of the timeline.
    const showDate = group.firstDate !== group.lastDate ||
      dateLabel !== group.firstDate;
    // What the calibration says the film physically measures — the one reading of
    // a mm/px scale a clinician can check without the ruler in front of them.
    const filmSize = getImpliedFilmSize(
      record.width, record.height, record.scaleFactor,
    );
    const isScaleSuspect = filmSize !== null && !filmSize.isPlausible;
    return (
      <div
        key={record.imageId}
        className={cx(classes.card, {
          [classes.card__active]: record.isActive,
        })}
      >
        <button
          type="button"
          className={classes.card_open}
          onClick={this.handleOpen(record)}
          // Half the record types this app files have no editor: a photograph
          // opens in the read-only viewer, which is exactly what its own chip
          // says two lines below. The same class of error the page bar's back
          // control was already corrected for.
          title={record.isTraceable
            ? `Open ${identity} in the tracing editor`
            : `Open ${identity} — view only, not analysable`}
        >
          <FilmThumb record={record} />
          <span className={classes.card_main}>
            <span className={classes.card_head}>
              <span className={classes.card_type}>{typeLabel}</span>
              {record.isActive ? (
                <span className={cx(classes.chip, classes.chip__active)}>
                  {/* A photograph or a PA film is open in the read-only viewer,
                      not in an editor — the chip must not promise the record the
                      editor it is not entitled to. */}
                  {record.isTraceable ? 'Open in editor' : 'Currently open'}
                </span>
              ) : null}
              {/* Labelled, because it is here only when it disagrees with the
                  stamp: an unlabelled second date in a row that already carries
                  one is a puzzle. The undated case uses the stamp's own wording
                  rather than a second one for the same fact. */}
              {showDate ? (
                dateLabel !== null ? (
                  <span className={classes.card_date}>
                    <span className={classes.card_date_key}>Captured</span>
                    {dateLabel}
                  </span>
                ) : (
                  <span className={cx(classes.card_date, classes.card_date__unset)}>
                    No capture date
                  </span>
                )
              ) : null}
            </span>
            <span className={classes.card_chips}>
              {/* The analysis is named inside the tracing count (it is that
                  analysis's count), so the card no longer carries a separate
                  "Analysis · Downs" pill saying the same thing a second time. */}
              <StatusChip record={record} analysisName={analysisName} />
              {record.isTraceable ? (
                <span
                  className={cx(classes.chip, {
                    [classes.chip__ok]: record.isCalibrated && !isScaleSuspect,
                    // A calibration is a claim about the physical film, and this
                    // is the surface where a wrong one must be caught: a green
                    // "Calibrated" over 0.104 mm/px on an 800 × 960 radiograph
                    // certifies an 83 × 100 mm cephalogram — a third of life
                    // size — and every millimetre measured from it is wrong by
                    // the same factor. The chip is demoted to the amber it
                    // deserves and says what to do about it.
                    [classes.chip__partial]: record.isCalibrated && isScaleSuspect,
                    // Outstanding work, in the palette's warn tint — not the
                    // grey that means "this film can never be measured".
                    [classes.chip__todo]: !record.isCalibrated,
                  })}
                  title={isScaleSuspect && filmSize !== null
                    ? `This scale makes the film ${filmSize.label} — outside the ` +
                      `${FILM_SIZE_BAND.minMm}–${FILM_SIZE_BAND.maxMm} mm a ` +
                      'cephalogram measures. Re-calibrate against a known ' +
                      'distance on the film.'
                    : undefined}
                >
                  {record.isCalibrated
                    ? (isScaleSuspect ? 'Calibrated · check scale' : 'Calibrated')
                    : 'Not calibrated'}
                </span>
              ) : null}
            </span>
          </span>
          {/* What the file actually is, as a column at the card's right rather
              than a fourth line under the chips: the cards of a visit are one
              width, so pixel size and scale line up down the page and the row's
              slack falls in one place instead of stretching the gap between a
              film's name and its date to 700px. Every value is read off the
              store; an item is omitted, not guessed. */}
          <span className={classes.card_tech}>
            <FactRow
              label="Pixels"
              value={record.width !== null && record.height !== null
                ? `${record.width} × ${record.height}`
                : null}
            />
            {/* Only the scale that exists. "Not calibrated" is the chip
                20px above this line — printed here as well, the card stated
                one fact twice in two visual languages.
                The implied physical size is printed beside it, because that is
                what the number means: "0.104 mm/px" is unreadable as a claim,
                "83 × 100 mm" on a lateral cephalogram is obviously wrong. */}
            <FactRow
              label="Scale"
              value={record.scaleFactor !== null
                ? formatScale(record.scaleFactor) : null}
              note={filmSize !== null ? `film ${filmSize.label}` : undefined}
              isNoteWarn={isScaleSuspect}
            />
            {record.name !== null ? (
              <span className={classes.card_file} title={record.name}>
                {record.name}
              </span>
            ) : null}
          </span>
          <span className={classes.card_go} aria-hidden="true">
            <IconChevron color="#7B8794" style={{ width: 20, height: 20 }} />
          </span>
        </button>
        <span className={classes.card_actions}>
          <button
            type="button"
            className={classes.icon_button}
            title={`Edit the record details of ${identity}`}
            aria-label={`Edit details of ${identity}`}
            onClick={this.handleEditClick(record)}
          >
            <IconEdit color="currentColor" style={actionIconStyle} />
          </button>
          <button
            type="button"
            className={cx(classes.icon_button, classes.icon_button__danger)}
            title={`Remove ${identity} from this patient's record`}
            aria-label={`Remove ${identity} from the record`}
            onClick={this.handleRemoveClick(record)}
          >
            <IconDelete color="currentColor" style={actionIconStyle} />
          </button>
        </span>
      </div>
    );
  };

  private renderDialogs = () => {
    const { records, patient, otherChartIds } = this.props;
    const {
      editingImageId, removingImageId, isEditingPatient, patientFocusField,
    } = this.state;
    const editing = records.filter((r) => r.imageId === editingImageId)[0];
    const removing = records.filter((r) => r.imageId === removingImageId)[0];
    return (
      <div>
        <EditPatientDialog
          open={isEditingPatient}
          patient={patient}
          otherChartIds={otherChartIds}
          focusField={patientFocusField}
          onSave={this.handleSavePatient}
          onCancel={this.closeEditPatient}
        />
        <EditRecordDialog
          open={editing !== undefined}
          initialValue={editing !== undefined ? {
            type: editing.type,
            timepoint: editing.timepoint,
            captureDate: editing.captureDate,
          } : { type: null, timepoint: null, captureDate: null }}
          fileName={editing !== undefined ? editing.name : null}
          onSave={this.handleSaveMeta}
          onCancel={this.closeEdit}
        />
        <RemoveRecordDialog
          open={removing !== undefined}
          type={removing !== undefined ? removing.type : null}
          timepoint={removing !== undefined ? removing.timepoint : null}
          captureDate={removing !== undefined ? removing.captureDate : null}
          fileName={removing !== undefined ? removing.name : null}
          landmarksPlaced={removing !== undefined ? removing.landmarksPlaced : 0}
          onConfirm={this.handleConfirmRemove}
          onCancel={this.closeRemove}
        />
      </div>
    );
  };

  private handleOpen = (record: PatientRecord) => () =>
    this.props.onOpenRecord(record);

  private handleAddImage = () => this.props.onAddImage(this.props.emptyWorkspaceId);

  /** The band's own button: the whole form, no field singled out. */
  private openEditPatient = () =>
    this.setState({ isEditingPatient: true, patientFocusField: null });

  /**
   * Open the patient form on one named field. A cell that offers to fill a
   * specific gap ("Add date of birth", "No name recorded") lands the caret in
   * that field, so the promise the link makes is the one the dialog keeps.
   */
  private openEditPatientField = (field: PatientEditField) => () =>
    this.setState({ isEditingPatient: true, patientFocusField: field });

  private closeEditPatient = () =>
    this.setState({ isEditingPatient: false, patientFocusField: null });

  private handleSavePatient = (details: PatientDetails) => {
    const { patient } = this.props;
    if (patient !== null) {
      this.props.onSavePatient(patient.id, details);
    }
    this.setState({ isEditingPatient: false, patientFocusField: null });
  };

  private handleEditClick = (record: PatientRecord) => () =>
    this.setState({ editingImageId: record.imageId });

  private closeEdit = () => this.setState({ editingImageId: null });

  private handleSaveMeta = (meta: ImageRecordMeta) => {
    const { editingImageId } = this.state;
    const record = this.props.records.filter((r) => r.imageId === editingImageId)[0];
    if (record !== undefined) {
      this.props.onSaveRecordMeta(record, meta);
    }
    this.setState({ editingImageId: null });
  };

  private handleRemoveClick = (record: PatientRecord) => () =>
    this.setState({ removingImageId: record.imageId });

  private closeRemove = () => this.setState({ removingImageId: null });

  private handleConfirmRemove = () => {
    const { removingImageId } = this.state;
    const { records } = this.props;
    const record = records.filter((r) => r.imageId === removingImageId)[0];
    if (record !== undefined) {
      // Another record's rail tile to land on, if the patient has one.
      const fallback = records
        .filter((r) => r.workspaceId !== record.workspaceId)
        .map((r) => r.workspaceId)[0];
      this.props.onRemoveRecord(record, fallback !== undefined ? fallback : null);
    }
    this.setState({ removingImageId: null });
  };
}

/**
 * One cell of the identity strip. An absent value is stated as absent, in muted
 * type — never blank, and never guessed. Where the absence is a gap a clinician
 * can close (a date of birth, a sex — both index the corrected norms), the cell
 * itself is the control that opens the edit dialog: the fix is one click from
 * where the gap is seen.
 */
const IdentityFact = (
  { label, value, fallback = 'Not recorded', onFix, fixLabel, note }:
  {
    label: string;
    value: string | null;
    fallback?: string;
    onFix?: () => any;
    fixLabel?: string;
    /** A qualification the value cannot carry on its own, in muted type. */
    note?: string;
  },
) => (
  <div className={classes.fact_row}>
    <dt className={classes.fact_row_key}>{label}</dt>
    <dd
      className={cx(classes.fact_row_value, {
        [classes.fact_row_value__unset]: value === null,
      })}
    >
      {value !== null ? (
        note !== undefined ? (
          <span className={classes.fact_row_pair}>
            {value}
            <span className={classes.fact_row_note}>{note}</span>
          </span>
        ) : value)
        : (onFix !== undefined && fixLabel !== undefined ? (
          <span className={classes.fact_gap}>
            <button type="button" className={classes.fact_fix} onClick={onFix}>
              {fixLabel}
            </button>
            {/* On paper the cell is a statement about the record, not a
                control: "Add sex" is an instruction nobody can carry out on a
                printed chart, so the sheet carries the fact instead. */}
            <span className={classes.fact_print}>{fallback}</span>
          </span>
        ) : fallback)}
    </dd>
  </div>
);

/**
 * What the imaging record covers: its first and last capture date, and the time
 * elapsed between them. Null unless the record actually spans two different days
 * — an invented span on a single film would be a claim about growth nobody made,
 * and a cell reading "One capture date" is only "Timepoints 1" in other words.
 *
 * The interval comes from the app's one duration formatter (`utils/records`), the
 * same one the superimposition prints beside its change figures: this cell read
 * "1 y 4 m" while that view read "1 y 4 mo" for the identical pair of dates.
 */
const getRecordSpan = (
  datesAscending: string[],
): { dates: string; interval: string | null } | null => {
  if (datesAscending.length < 2) {
    return null;
  }
  const first = datesAscending[0];
  const last = datesAscending[datesAscending.length - 1];
  if (first === last) {
    return null;
  }
  return {
    dates: `${first} – ${last}`,
    interval: formatInterval(parseCaptureDate(first), parseCaptureDate(last)),
  };
};

/**
 * One labelled fact on a record card; renders nothing without a value. The
 * optional note is a reading of the value the value cannot carry itself — what a
 * mm/px scale means in millimetres of film — tinted `$warn` when that reading is
 * the reason the record needs a second look.
 */
const FactRow = (
  { label, value, note, isNoteWarn = false }: {
    label: string;
    value: string | null;
    note?: string;
    isNoteWarn?: boolean;
  },
) => {
  if (value === null) {
    return null;
  }
  return (
    <span className={classes.fact}>
      <span className={classes.fact_key}>{label}</span>
      <span className={classes.fact_value}>{value}</span>
      {note !== undefined ? (
        <span
          className={cx(classes.fact_note, {
            [classes.fact_note__warn]: isNoteWarn,
          })}
        >
          {note}
        </span>
      ) : null}
    </span>
  );
};

/**
 * Initials for the avatar: first character for CJK names (山田 太郎 → 山),
 * first letters of the first two words otherwise. Mirrors PatientBar.
 */
const getInitials = (text: string): string => {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return '';
  }
  if (/[　-〿぀-ヿ㐀-鿿豈-﫿]/.test(tokens[0])) {
    return tokens[0].charAt(0);
  }
  return tokens.slice(0, 2).map((t) => t.charAt(0).toUpperCase()).join('');
};
