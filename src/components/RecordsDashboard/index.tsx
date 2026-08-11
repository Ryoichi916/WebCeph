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
import AnalysisFindings, { FilmFindings } from './AnalysisFindings';
import TrendChart from './TrendChart';

import { PatientDetails } from 'components/PatientFields';

import { formatScale } from 'components/TracingToolbar/CalibrationDialog';

import {
  formatAgeFull,
  formatSexFull,
} from 'utils/patient';

import {
  getImageTypeLabel,
  getImageTypeLabelInSentence,
  getAddSlotLabel,
  IMAGE_TYPE_OPTIONS,
  DEFAULT_IMAGE_TYPE,
  getDefaultTimepoint,
  getMissingImageTypes,
  formatCaptureDate,
  formatDisplayDate,
  parseCaptureDate,
  formatInterval,
  getImpliedFilmSize,
  FILM_SIZE_BAND,
  getTimepointToken,
  groupRecordsByTimepoint,
  TimepointGroup,
} from 'utils/records';

import { getNameForAnalysis } from 'components/AnalysisSelector/strings';

const classes = require('./style.scss');

const actionIconStyle: React.CSSProperties = { width: 18, height: 18 };

/**
 * The `+` on an empty type slot: authored, not mui's IconAdd, because a mui
 * SvgIcon resolves `currentColor` against its own inline palette colour rather
 * than its parent's — so a fixed grey plus stayed grey inside a slot whose
 * border and label had both turned blue under the pointer. Drawn as two strokes
 * in `currentColor`, the whole chip changes colour as one thing.
 */
const SlotPlus = () => (
  <svg
    className={classes.slot_plus}
    width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
  >
    <path
      d="M5 1 V9 M1 5 H9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * The empty state's mark: a records folder — raised tab, front pocket with a
 * thumb cut — with a lateral cephalogram standing in it.
 *
 * Both halves are drawn as *filled* shapes, because a 200px illustration made of
 * 2px strokes does not survive its own size: the mark this replaces was a folder
 * that read as a rounded rectangle with a notch beside a stroked profile that
 * read as a cursive "3", and its three landmarks (r=2.8, blue on white) were
 * invisible. The film is the app's own canvas black carrying a soft-tissue
 * profile as a silhouette — the one shape that stays a human head at this size —
 * cropped by the film's edge the way a real ceph crops the neck, with three
 * landmarks (nasion, pronasale, pogonion) in the editor's amber-on-dark at the
 * radius they are actually placed at.
 *
 * Every colour is the palette's: $bg-sunken / $bg-surface / $border-strong for
 * the folder, $canvas-bg / $canvas-border for the film, $text-secondary for the
 * profile, #FFC400 over #14181D for the landmarks.
 */
const EmptyIllustration = () => (
  <svg
    className={classes.empty_art}
    width={200}
    height={140}
    viewBox="0 0 200 140"
    aria-hidden="true"
  >
    <defs>
      {/* The film crops the silhouette, so the profile can run off the bottom
          edge as a neck instead of closing into a point. */}
      <clipPath id="records-empty-film">
        <rect x="98" y="8" width="86" height="108" rx="5" />
      </clipPath>
    </defs>
    {/* Folder tab, standing above the pocket's top edge. */}
    <path
      className={classes.empty_tab}
      d="M8 60 v-10 a5 5 0 0 1 5 -5 h30 a5 5 0 0 1 5 5 v10 Z"
    />
    {/* The film, behind the folder's front pocket. */}
    <rect
      className={classes.empty_film}
      x="98" y="8" width="86" height="108" rx="5"
    />
    <g clipPath="url(#records-empty-film)">
      <g transform="translate(101 18) scale(0.82)">
        {/* Soft-tissue profile facing right, in the order it is traced:
            occiput, cranium, forehead, nasion, nasal tip, subnasale, upper and
            lower lip, pogonion, menton, jawline, neck. */}
        <path
          className={classes.empty_profile}
          d="M22 130
             C16 110 10 80 18 54
             C26 26 56 14 74 30
             C82 38 84 46 80 52
             L78 58
             C84 62 90 68 92 72
             C88 74 82 74 78 75
             C82 79 82 82 77 84
             C82 87 81 90 76 92
             C74 94 76 97 79 100
             C80 108 74 112 64 114
             C52 116 44 114 38 110
             C40 118 42 124 42 130 Z"
        />
      </g>
    </g>
    {/* Nasion, pronasale, pogonion — on the profile, at placement radius. */}
    <g className={classes.empty_dots}>
      <circle cx="164.9" cy="65.6" r="4.4" />
      <circle cx="176.4" cy="77" r="4.4" />
      <circle cx="166.6" cy="100" r="4.4" />
    </g>
    {/* Front pocket, over the film: the folder has a mouth to file into. */}
    <path
      className={classes.empty_pocket}
      d="M8 58 h40 c5 0 6 6 11 6 h22 c5 0 6 -6 11 -6 h16
         a6 6 0 0 1 6 6 v58 a6 6 0 0 1 -6 6 H14 a6 6 0 0 1 -6 -6 Z"
    />
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
    // Only a film that can actually be traced carries marks. Landmarks outlive a
    // re-filing: a lateral ceph that was traced and then corrected to "Profile
    // photograph" keeps its stored points, and plotted here they put a
    // cephalometric tracing on a card whose own chip reads "View only · not
    // analysable" — the tracing state the record is not entitled to, drawn 100px
    // from the sentence denying it.
    record.isTraceable &&
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

/**
 * A visit an untimepointed image can be filed at from its own card: one of the
 * record's labelled groups, or — where it has none — the T1 that would start the
 * series. `date` is the day that gets written onto the image, null where the
 * target lends none and the image keeps its own.
 */
interface FileTarget {
  key: string;
  label: string;
  date: string | null;
  /** True for the proposed first visit, which is not on file yet. */
  isNew?: boolean;
}

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
  private panel: HTMLElement | null = null;
  private head: HTMLElement | null = null;
  private foot: HTMLElement | null = null;

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
    // The grouping the timeline draws, read once here and handed down, so the
    // rail, the groups and the identity band's counts are all the same reading of
    // the same records.
    const groups = groupRecordsByTimepoint(records);
    // The traced films of this record, read once for both analysis panels below.
    const films = this.getFilmFindings();
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

        <div className={classes.scroll} onScroll={this.updateStickyState}>
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
                ref={this.setHead}
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
                  // The footer is sticky, so at a list taller than the window it
                  // floats over the foot of this well. Without the reserve below,
                  // the pane's closing content was *permanently* under it: at four
                  // records the coverage note ended "a case is complete without a
                  // panoramic or a" with "photographic series." hidden, and the
                  // trailing add row shared the same 20px.
                  [classes.records_body__footed]: this.hasRecordsFooter(),
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
                    {/* Typed, like every affordance after it. The prose above
                        names the types a first visit can hold while the only
                        control offered was an untyped "Add image", so the first
                        record of a case was the one record whose type had to be
                        typed into the form by hand — and the screen's words and
                        its controls disagreed. The primary action files the film
                        this app traces; the row beneath it files any of the
                        others at the same first visit. */}
                    <span className={classes.empty_action}>
                      <RaisedButton
                        primary
                        className={classes.primary_action}
                        label="Add lateral cephalogram"
                        icon={<IconAdd color="#FFFFFF" style={actionIconStyle} />}
                        labelStyle={{ textTransform: 'none', fontWeight: 600 }}
                        onClick={this.handleFillFirstSlot(DEFAULT_IMAGE_TYPE)}
                      />
                    </span>
                    <div className={cx(classes.slots, classes.slots__empty)}>
                      <span className={classes.slots_label}>
                        Or file at {getDefaultTimepoint(0)}
                      </span>
                      <span className={classes.slots_list}>
                        {IMAGE_TYPE_OPTIONS
                          .filter(({ id }) => id !== DEFAULT_IMAGE_TYPE)
                          .map(({ id, slotLabel }) => (
                            <button
                              key={id}
                              type="button"
                              className={classes.slot}
                              title={`Add ${getImageTypeLabelInSentence(id)} ` +
                                `at ${getDefaultTimepoint(0)}`}
                              aria-label={`Add ${getImageTypeLabelInSentence(id)} ` +
                                `at ${getDefaultTimepoint(0)}`}
                              onClick={this.handleFillFirstSlot(id)}
                            >
                              <SlotPlus />
                              <span className={classes.slot_label}>
                                {getAddSlotLabel(id)}
                              </span>
                              <span className={classes.slot_print}>{slotLabel}</span>
                            </button>
                          ))}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* A chronology needs two points on it: with a single visit on
                     file the rail and its node are suppressed, because a lone
                     12px dot in an empty gutter with no line through it is a
                     decoration, and the one thing it could have said — the day
                     of the visit — is written beside it. */
                  /* Two panes at a wide window: the chronology, and what the
                     case holds across all of its visits (see `renderCoverage`) —
                     the one reading of the record the timeline cannot give. Both
                     panes are sized to their own content; neither is stretched to
                     the window. */
                  <div className={classes.records_panes}>
                  <div
                    className={cx(classes.timeline, {
                      [classes.timeline__single]: groups.length < 2,
                    })}
                  >
                    {/* The visits, and nothing else: the rail is drawn inside
                        *this* wrapper, so it can only ever span the first
                        timepoint's node to the last one's. Drawn on a list that
                        also held the trailing "add" row, its bottom edge was that
                        row's — a grey line hanging ~90px below the final node
                        into empty space whenever the last visit's panel was
                        short. */}
                    <ol className={classes.groups}>
                      <span className={classes.timeline_rail} aria-hidden="true" />
                      {groups.map(
                        (group, index) => this.renderGroup(group, index, groups),
                      )}
                    </ol>
                    {/* The list closes on the way to add the next film — the
                        same action as the page bar's, offered where a reader
                        arrives after the newest record, directly beneath the last
                        visit. One height at every list length, and no longer
                        pushed to the panel's bottom edge: pinned there it left
                        ~390px of void between the newest film and itself, and at
                        a long list it slid under the sticky footer. */}
                    <div className={classes.add_entry}>
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
                    </div>
                  </div>
                  {this.renderCoverage(groups)}
                  </div>
                )}
              </div>
              {this.renderRecordsFooter()}
            </section>
            {/* …how the measurements moved across the visits above, and what
                the analyses say about each film in it. Both panels are handed
                the one reading of the record's traced films (`films` above), so
                a figure in the chart is the figure in the table under it.
                Read only: neither dispatches, and neither changes which analysis
                is active. */}
            {this.renderTrend(films, groups)}
            {this.renderAnalysisFindings(films)}
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
  private setPanel = (el: HTMLElement | null) => { this.panel = el; };
  private setHead = (el: HTMLElement | null) => { this.head = el; };
  private setFoot = (el: HTMLElement | null) => { this.foot = el; };

  /**
   * Whether the panel's sticky head and foot are currently floating over the
   * list — measured off the bars themselves, which is the only test that cannot
   * disagree with what the eye sees: a sticky bar is displaced from its natural
   * place in the panel *exactly* when it is holding position over content. So
   * the head floats while it sits below the panel's own top edge, and the foot
   * while it sits above the panel's bottom edge.
   *
   * (Comparing the panel's edges to the scrollport's instead — the first
   * formulation here — missed the last few pixels of a scroll: at the end of a
   * five-record list the head was measured as "not floating" while it was in fact
   * 5px over the first card, so the shadow the overlap exists to announce never
   * appeared.)
   *
   * The scrims and shadows these two flags switch on are the surface's answer to
   * a bar that overlaps content: at 6 records the head covered the top 63px of a
   * 123px card, and at the default list the foot covered the bottom half of the
   * last one — with no shadow, no fade and no shift in the card, so a film simply
   * ended mid-line.
   */
  private updateStickyState = () => {
    const { panel, head, foot } = this;
    if (panel === null) {
      return;
    }
    const box = panel.getBoundingClientRect();
    // The bars' natural place is inside the panel's own 1px border, so the border
    // is discounted before a displacement is called one: measured against the
    // panel's outer edge, both bars were "floating" by exactly 1px at rest and
    // the scrim the overlap exists to announce was on before anything had
    // scrolled at all.
    const inset = panel.clientTop;
    const isHeadFloating = head !== null &&
      head.getBoundingClientRect().top > box.top + inset + 0.5;
    const isFootFloating = foot !== null &&
      foot.getBoundingClientRect().bottom < box.bottom - inset - 0.5;
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
   * The printed chart's running head — and, on paper, the record's *only* header:
   * it repeats on every sheet, because a sheet of a patient's imaging record that
   * does not name the patient is not filable, and the identity band is hidden
   * behind it (see the print block) so no fact is printed twice. It replaces the
   * page bar, whose exit control and keyboard shortcut mean nothing on paper.
   *
   * It therefore carries everything the band carries except the age today, which
   * a printed chart does not need and cannot keep true: the identity (name, chart
   * ID, date of birth, sex) and what the record covers (its timepoints and the
   * span between its first and last capture date). A value that is not recorded is
   * printed *as* unrecorded: a sheet that simply leaves the date of birth out
   * cannot be told from one belonging to a patient who has one, and every norm in
   * this app is age- and sex-corrected.
   *
   * Never rendered on screen: the page bar and the identity band own that job
   * there.
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
    if (name !== null) {
      parts.push(chartId !== null ? `Chart ${chartId}` : 'No chart ID');
    }
    if (patient !== null) {
      parts.push(dob !== null ? `DOB ${dob}` : 'Date of birth not recorded');
      parts.push(sex !== null ? sex : 'Sex not recorded');
    }
    // What the record covers, on the same terms the band states it on screen.
    const { groups, timepointCount, unlabelled, span } = this.getRecordFacts();
    if (groups.length > 1) {
      const labelled = timepointCount > 0
        ? `${timepointCount} timepoints` : 'No timepoint labels';
      parts.push(unlabelled > 0
        ? `${labelled} + ${unlabelled} unlabelled ` +
          `${unlabelled === 1 ? 'image' : 'images'}`
        : labelled);
    }
    if (span !== null) {
      parts.push(span.interval !== null
        ? `${span.dates} (${span.interval})` : span.dates);
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
   * What the imaging record covers, counted off the very grouping the timeline
   * draws so no two parts of this surface can disagree about it: the labelled
   * timepoints (T1, T2, …), the images that carry no label at all — which the
   * timeline still draws as a row of their own — and the span between the first
   * and last capture date on file.
   *
   * Read by the identity band on screen and by the running head on paper, which is
   * the whole point: "TIMEPOINTS 3" above four visible rows was one number with
   * two readings, 120px apart.
   */
  private getRecordFacts = () => {
    const { records } = this.props;
    const groups = groupRecordsByTimepoint(records);
    const dated = records
      .map(({ captureDate }) => formatCaptureDate(captureDate))
      .filter((d): d is string => d !== null)
      .sort();
    return {
      groups,
      timepointCount: groups.filter(({ label }) => label !== null).length,
      unlabelled: groups
        .filter(({ label }) => label === null)
        .reduce((total, group) => total + group.records.length, 0),
      span: getRecordSpan(dated),
    };
  };

  /**
   * The patient's identity: who this record belongs to, and the demographics
   * every analysis and printed report is read against. Unrecorded values are
   * shown as unrecorded rather than hidden — a missing date of birth is a fact
   * about the record, and the button underneath is how it gets filled in.
   *
   * Screen only: on paper the running head carries all of this on every sheet
   * (see `renderPrintHead`), and printing it twice named the patient in two
   * adjacent rows and cost the chart a band of its first page.
   */
  private renderIdentity = () => {
    const { patient } = this.props;
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
    const { groups, timepointCount, unlabelled, span } = this.getRecordFacts();
    // A count of one is not a chronology, and the record it counts is the single
    // stamp 120px below this cell: on a one-visit chart "TIMEPOINTS 1" was the
    // fourth statement of "one" inside one screen (the top bar's "Records (1)",
    // the panel's "1 on file", the timeline's own single row). The cell earns its
    // place from two visits on, or where some images carry no label at all.
    const showTimepoints = groups.length > 1;
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
          {/* What is on file — and only where it is something the record does not
              already state. On an empty record these two cells spent a third of
              the band on facts that cannot exist ("TIMEPOINTS 0", "RECORD SPAN —
              No capture dates"); on a one-visit record they restated the single
              stamp below. The rule goes with them: a group boundary with nothing
              after it is a hairline at the end of a strip. */}
          {showTimepoints || span !== null ? (
            <span className={classes.facts_rule} aria-hidden="true" />
          ) : null}
          {showTimepoints ? (
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
  /**
   * Whether the closing bar is rendered at all — one traceable film says
   * everything twice (its own two chips *are* the two tallies), so the bar earns
   * its place from two on. Asked here as well as in `renderRecordsFooter`,
   * because the well above has to reserve the height of a bar that floats over
   * it (see `.records_body__footed`).
   */
  private hasRecordsFooter = (): boolean =>
    this.props.records.filter((r) => r.isTraceable).length >= 2;

  private renderRecordsFooter = () => {
    const { records } = this.props;
    const traceable = records.filter((r) => r.isTraceable);
    const traced = traceable.filter(
      (r) => r.landmarksRequired > 0 && r.landmarksPlaced >= r.landmarksRequired,
    ).length;
    const calibrated = traceable.filter((r) => r.isCalibrated).length;
    // A calibration whose implied film size is outside the band a cephalogram
    // measures is counted separately: a bare "3 of 3 calibrated" under three
    // cards that each read "Calibrated · check scale" is the panel's summary line
    // contradicting every card it summarises.
    const suspect = traceable.filter((r) => {
      const size = getImpliedFilmSize(r.width, r.height, r.scaleFactor);
      return r.isCalibrated && size !== null && !size.isPlausible;
    }).length;
    // One traceable film says everything twice: its own two chips are the two
    // tallies. Two or more, and "2 of 3 traced" is a reading of the record that
    // no single card carries.
    if (!this.hasRecordsFooter()) {
      return null;
    }
    const { isFootFloating } = this.state;
    // Traceability is a property of the *type*, and an image filed before the
    // records layer existed carries no type at all — those are traceable too, so
    // the tally cannot call them lateral cephalograms.
    const noun = traceable.filter((r) => r.type !== 'ceph_lateral').length === 0
      ? 'lateral cephs' : 'traceable images';
    return (
      <div
        ref={this.setFoot}
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
        {suspect > 0 ? (
          <span
            className={cx(classes.records_foot_item, classes.records_foot_item__warn)}
            title={`The scale on ${suspect === 1 ? 'this film makes it' : 'these films makes them'} ` +
              `smaller or larger than the ${FILM_SIZE_BAND.minMm}–` +
              `${FILM_SIZE_BAND.maxMm} mm a cephalogram measures.`}
          >
            {suspect === 1
              ? '1 scale needs checking' : `${suspect} scales need checking`}
          </span>
        ) : null}
        <span className={classes.records_foot_spacer} />
      </div>
    );
  };

  /**
   * What this visit does not hold: one quiet slot per image type the app files
   * and this timepoint has not got, as the closing row of the visit's own panel.
   *
   * This is the surface's answer to the question a clinician opens a chart with —
   * *what is this case missing?* — asked where it can be answered: pressing
   * "Add profile photo" under T2 opens the upload form already filed as a profile
   * photograph at T2 on that visit's day (see `handleFillSlot`), so the record
   * details are not re-entered by hand.
   *
   * It is information and an invitation, never a requirement: a case is not
   * incomplete for having no panoramic, which is why the slots are hairline-dashed
   * and grey rather than amber, and why the row is headed "Not filed" and not
   * "Missing". A visit that holds every type gets no row at all.
   *
   * (This replaced a record-level checklist of the same five types under the
   * timeline. Per visit it says strictly more — *which* visit lacks the
   * photograph — and it is actionable where the checklist could only be read;
   * kept as well, the two blocks listed the same types twice on the one-visit
   * chart that is a newly opened case's normal state.)
   */
  private renderGroupSlots = (
    group: TimepointGroup<PatientRecord>,
    groups: TimepointGroup<PatientRecord>[],
  ) => {
    if (group.label === null) {
      // An untimepointed group gets no slots of its own: filing *into* it would
      // mean adding an image with no timepoint on purpose, and a records surface
      // should not invite that. Its images are corrected onto a visit from their
      // own cards ("File this at").
      //
      // Unless there is no visit to correct them onto. A record whose only image
      // carries no label then had *no* typed affordance anywhere on the surface —
      // no slot row, no file-at chip — while the coverage pane beside it printed
      // five "Not on file" rows nobody could act on, and the only control left
      // was the untyped "Add another image", which re-asked for the very three
      // fields the slots exist to fill in. So the first visit's own slot row is
      // offered here, exactly as the empty state offers it.
      if (groups.some((g) => g.label !== null)) {
        return null;
      }
      const first = getDefaultTimepoint(0);
      return (
        <div
          className={classes.slots}
          title={`Nothing is filed at a timepoint yet — these slots open the ` +
            `upload form filed at ${first}`}
        >
          <span className={classes.slots_label}>Or file at {first}</span>
          <span className={classes.slots_list}>
            {IMAGE_TYPE_OPTIONS.map(({ id, slotLabel }) => (
              <button
                key={id}
                type="button"
                className={classes.slot}
                title={`Add ${getImageTypeLabelInSentence(id)} at ${first}`}
                aria-label={`Add ${getImageTypeLabelInSentence(id)} at ${first}`}
                onClick={this.handleFillFirstSlot(id)}
              >
                <SlotPlus />
                <span className={classes.slot_label}>{getAddSlotLabel(id)}</span>
                <span className={classes.slot_print}>{slotLabel}</span>
              </button>
            ))}
          </span>
        </div>
      );
    }
    const missing = getMissingImageTypes(group.records);
    if (missing.length === 0) {
      return null;
    }
    // The row's micro-label carries the label's *token* — "T2" out of "T2
    // post-treatment" — exactly as the timepoint pill 2cm to its left does, with
    // the whole label in the row's tooltip. Set whole and in caps it read "NOT
    // FILED AT T2 POST-TREATMENT REVIEW" on screen and on the print sheet, and a
    // slightly longer visit label pushed the five pills into an ugly wrap.
    const token = getTimepointToken(group.label);
    return (
      <div
        className={classes.slots}
        title={`Not filed at ${group.label}` +
          (group.firstDate !== null ? ` · ${group.firstDate}` : '')}
      >
        <span className={classes.slots_label}>
          Not filed at {token !== null ? token : group.label}
        </span>
        <span className={classes.slots_list}>
          {missing.map(({ id, slotLabel }) => (
            <button
              key={id}
              type="button"
              className={classes.slot}
              // The label is short ("Add profile photo"); the tooltip and the
              // accessible name state the whole of what the click will do,
              // including the visit it files into. Only the first letter of the
              // type is lowered — `label.toLowerCase()` had a screen reader and
              // the tooltip both saying "Add frontal (pa) cephalogram to T1".
              title={`Add ${getImageTypeLabelInSentence(id)} to ${group.label}` +
                (group.firstDate !== null ? ` · ${group.firstDate}` : '')}
              aria-label={
                `Add ${getImageTypeLabelInSentence(id)} to ${group.label}`
              }
              onClick={this.handleFillSlot(group, id)}
            >
              <SlotPlus />
              <span className={classes.slot_label}>{getAddSlotLabel(id)}</span>
              {/* On paper the slot is a statement about the visit, not a
                  control: nobody can press "Add profile photo" on a printed
                  chart, so the sheet lists what the visit lacks instead. Same
                  mechanism as `.fact_print` in the identity band. */}
              <span className={classes.slot_print}>{slotLabel}</span>
            </button>
          ))}
        </span>
      </div>
    );
  };

  /**
   * The record's measurements across its timepoints, plotted (see `TrendChart`):
   * one cell per measurement, every cell on the same standard-deviation axis with
   * its own norm band behind the patient's readings.
   *
   * It sits above the per-film blocks because that is the order it is read in —
   * the chronology, then how the numbers moved along it, then the numbers
   * themselves — and it is drawn from the very same films those blocks tabulate,
   * so the two panels cannot disagree.
   *
   * Its empty state is given the two actions that would fill it: the slot path
   * that files a film at the record's next visit, and the editor for a film that
   * is on file but untraced. A panel that says "trace a second film" while the
   * controls that do it are 600px up the page is a panel giving instructions.
   */
  private renderTrend = (
    films: FilmFindings[] | null,
    groups: Array<TimepointGroup<PatientRecord>>,
  ) => {
    if (films === null) {
      return null;
    }
    const { patient } = this.props;
    // The next visit this record does not have yet — the same label the timeline's
    // closing "add" row proposes, so both offer one filing rather than two.
    const labelled = groups.filter(({ label }) => label !== null).length;
    const next = getDefaultTimepoint(Math.max(labelled, 1));
    return (
      <TrendChart
        films={films}
        // The axis is the patient's age on the day of each film wherever the
        // record holds a birthday; the chart falls back to the capture date and
        // says so, rather than plotting an age it cannot know.
        dateOfBirth={patient !== null ? patient.dateOfBirth : undefined}
        nextTimepointLabel={next}
        onAddFilmAtNextTimepoint={this.handleAddFilmAt(next)}
        onOpenFilm={this.props.onOpenRecord}
      />
    );
  };

  /**
   * File a lateral cephalogram at a named visit — the trend panel's empty state,
   * on the very path the visit slots use (`handleFillSlot`): the upload form opens
   * already stating the type and the timepoint. No capture date is proposed,
   * because a visit that does not exist yet has no day to lend.
   */
  private handleAddFilmAt = (timepoint: string) => () =>
    this.props.onAddImage(this.props.emptyWorkspaceId, {
      type: DEFAULT_IMAGE_TYPE,
      timepoint,
      captureDate: null,
    });

  /**
   * What the analyses already say about this patient — one block per traced
   * film, oldest first, headline first (see `AnalysisFindings`).
   *
   * Rendered only where the record holds a film that can carry a tracing at all:
   * on a patient whose images are photographs the panel would be a heading over
   * a sentence the records panel above already states ("tracing is offered on
   * lateral cephalograms only").
   */
  private renderAnalysisFindings = (films: FilmFindings[] | null) => {
    if (films === null) {
      return null;
    }
    return (
      <AnalysisFindings films={films} onOpenFilm={this.props.onOpenRecord} />
    );
  };

  /**
   * The traced films of this record, each with what its analysis reports and
   * whether the norms could be read against the patient's age — resolved once
   * and read by both the trend chart and the findings panel, so the two are one
   * reading of one evaluation rather than two.
   *
   * The two demographics the norms are read against are resolved here rather
   * than inside a panel, so the age either of them prints is the age the
   * timeline stamps for the same film — one reading of one date of birth on one
   * page. Null where there is no film to report on at all.
   */
  private getFilmFindings = (): FilmFindings[] | null => {
    const { records, analyses, patient } = this.props;
    if (analyses.length === 0 || records.length === 0) {
      return null;
    }
    // Whether the record holds the patient's birthday at all — the first half of
    // any age, and the half a film's own capture date cannot supply.
    const hasDateOfBirth = patient !== null &&
      typeof patient.dateOfBirth === 'string' && patient.dateOfBirth !== '';
    const byImageId: { [imageId: string]: PatientRecord | undefined } = {};
    records.forEach((record) => { byImageId[record.imageId] = record; });
    const films: FilmFindings[] = [];
    analyses.forEach((analysis) => {
      const record = byImageId[analysis.imageId];
      if (record === undefined) {
        return;
      }
      films.push({
        record,
        analysis,
        // Which of the two facts an age needs is the missing one: an age-indexed
        // norm read against a film with no capture date was read against the age
        // *today*, and the panel's norms line says so rather than quoting the
        // figure as the age on the film.
        //
        // The date of birth is tested first, and it has to be: with neither date
        // on record this reported `captureDate`, so the panel asked for the film
        // date of a patient whose birthday it did not know — an instruction that
        // cannot produce an age.
        ageGap: this.getAgeOn(record.captureDate) !== null ? null
          : (!hasDateOfBirth ? 'dateOfBirth' : 'captureDate'),
        analysisName: analysis.analysisId !== null
          ? getNameForAnalysis(analysis.analysisId)
          : null,
      });
    });
    return films.length > 0 ? films : null;
  };

  /**
   * What the case holds, read across every visit at once: one row per image type
   * this app files, naming the timepoints that hold it — or stating that it is not
   * on file anywhere.
   *
   * This is the one reading of the record the timeline cannot give. A visit's own
   * slot row answers "what is missing *here*"; scanning six visits for "does this
   * case have a panoramic at all" was the reader's job.
   *
   * It is information, not filler. It was introduced partly to fill a panel that
   * had been stretched to the window, and pinning its closing note to the pane's
   * foot for that reason turned one void into two (~390px in both columns at one
   * record) and slid the note under the sticky footer at four. The panel is sized
   * to its records again; this pane is sized to its rows.
   *
   * Screen only, and only at ≥1200px (see the stylesheet): on paper each visit
   * prints its own "not filed" list, and below 1200 the timeline gets the width.
   */
  private renderCoverage = (groups: TimepointGroup<PatientRecord>[]) => {
    const held = IMAGE_TYPE_OPTIONS.map((option) => ({
      option,
      // Where it is held, in chronological order — the timeline's own order.
      at: groups
        .filter((group) => group.records.some((r) => r.type === option.id))
        .map((group) => group.label !== null
          ? getTimepointToken(group.label) : 'Unlabelled'),
    }));
    const onFile = held.filter(({ at }) => at.length > 0).length;
    return (
      <aside className={classes.coverage} aria-label="What this case holds">
        <div className={classes.coverage_head}>
          <span className={classes.coverage_title}>Across all visits</span>
          <span className={classes.coverage_count}>
            {onFile} of {IMAGE_TYPE_OPTIONS.length} types
          </span>
        </div>
        <dl className={classes.coverage_list}>
          {held.map(({ option, at }) => (
            <div key={option.id} className={classes.coverage_row}>
              <dt className={classes.coverage_type}>{option.label}</dt>
              <dd className={classes.coverage_at}>
                {at.length > 0 ? at.map((token, i) => (
                  <span key={i} className={classes.coverage_token}>{token}</span>
                )) : (
                  <span className={classes.coverage_none}>Not on file</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {/* The same standing this surface gives its empty slots: this is what is
            on file, not a checklist a case can fail. */}
        <p className={classes.coverage_note}>
          What is on file, not a requirement — a case is complete without a
          panoramic or a photographic series.
        </p>
      </aside>
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
    groups: TimepointGroup<PatientRecord>[],
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
          {group.records.map(
            (record) => this.renderRecord(record, group, groups),
          )}
          {/* …and the visit closes with what it has not got. */}
          {this.renderGroupSlots(group, groups)}
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
    groups: TimepointGroup<PatientRecord>[],
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
    // An image that carries no timepoint can be filed onto a visit from here.
    // Until now the only way was Edit details, re-typing by hand the label and
    // the day this surface already knows — one row under the slots that offer
    // exactly the inverse.
    //
    // Where there is no labelled visit to file onto, the chip *starts* the series
    // at T1 instead of disappearing: on a record whose only image is
    // untimepointed, this was the gap — the surface could name the gap five times
    // over in the coverage pane and offer nothing that closed it.
    const fileTargets: FileTarget[] = group.label === null
      ? (() => {
        const labelled = groups
          .filter((g) => g.label !== null)
          .map((g): FileTarget => ({
            key: g.key, label: g.label as string, date: g.firstDate,
          }));
        return labelled.length > 0 ? labelled : [{
          key: '__first',
          label: getDefaultTimepoint(0),
          // A visit that does not exist yet lends no day: the image keeps its own.
          date: null,
          isNew: true,
        }];
      })()
      : [];
    return (
      <div
        key={record.imageId}
        className={cx(classes.card, {
          [classes.card__active]: record.isActive,
        })}
      >
        <div className={classes.card_row}>
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
            {/* …and only on a record a scale means something on. A mm/px
                calibration is a claim about a radiograph, made by the tracing
                editor; a photograph re-filed out of that editor keeps the number
                it was given there, and printed here it read "Scale 0.104 mm/px ·
                film 83 × 100 mm" on a card that says the image is not analysable
                and calls a portrait a film. Nothing measures it, so nothing
                states its scale. */}
            {record.isTraceable ? (
              <FactRow
                label="Scale"
                value={record.scaleFactor !== null
                  ? formatScale(record.scaleFactor) : null}
                note={filmSize !== null ? `film ${filmSize.label}` : undefined}
                isNoteWarn={isScaleSuspect}
              />
            ) : null}
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
        {/* One chip per visit already on file: pressing it writes that visit's
            label and its earliest capture date onto this image — the slots' own
            data path (`handleFileAt`), applied to a record that already exists.
            Offered on the untimepointed group only, where it is the gap. */}
        {fileTargets.length > 0 ? (
          <div className={classes.file_at}>
            <span className={classes.slots_label}>File this at</span>
            <span className={classes.slots_list}>
              {fileTargets.map((target) => {
                const token = getTimepointToken(target.label);
                const label = token !== null ? token : target.label;
                return (
                  <button
                    key={target.key}
                    type="button"
                    className={classes.slot}
                    title={`File ${identity} at ${target.label}` +
                      (target.date !== null
                        ? ` · ${target.date} (this visit's day is written ` +
                          'onto the image)'
                        : (target.isNew === true
                          ? " — the record's first visit (the image keeps its " +
                            'own capture date)'
                          : ' (this visit carries no capture date, so the ' +
                            "image keeps its own)"))}
                    aria-label={`File this image at ${target.label}`}
                    onClick={this.handleFileAt(record, target)}
                  >
                    <span className={classes.slot_label}>{label}</span>
                    {target.date !== null ? (
                      <span className={classes.file_at_date}>
                        {target.date}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </span>
          </div>
        ) : null}
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
          // The film itself: on a record holding two identically named lateral
          // cephs the file name was the whole of the evidence.
          thumbnail={removing !== undefined ? removing.thumbnail : null}
          otherRecordCount={Math.max(records.length - 1, 0)}
          landmarksPlaced={removing !== undefined ? removing.landmarksPlaced : 0}
          onConfirm={this.handleConfirmRemove}
          onCancel={this.closeRemove}
        />
      </div>
    );
  };

  private handleOpen = (record: PatientRecord) => () =>
    this.props.onOpenRecord(record);

  // Undirected: the page bar's and the empty state's "Add image", and the row
  // that closes the list. Passing no intent also clears a slot chosen earlier.
  private handleAddImage = () => this.props.onAddImage(this.props.emptyWorkspaceId);

  /**
   * Fill one empty slot of one visit: the upload screen opens with the record
   * details already stating this type, this timepoint and this visit's day, so
   * the three fields the clinician just chose by clicking are not asked for a
   * second time. All three remain editable there — the slot proposes the filing,
   * it does not commit it.
   *
   * The day is the visit's *earliest* recorded capture date, and only when it has
   * one: a group whose images carry no date cannot lend one, and the form falls
   * back to today (which the clinician then corrects) rather than inventing the
   * visit's date.
   */
  private handleFillSlot = (
    group: TimepointGroup<PatientRecord>, type: ImageType,
  ) => () => this.props.onAddImage(this.props.emptyWorkspaceId, {
    type,
    timepoint: group.label,
    captureDate: group.firstDate,
  });

  /**
   * The same, for a record with nothing on file yet: the first visit's label
   * (T1) and the chosen type, with no capture date — the visit has no day yet, so
   * none is claimed and the upload form falls back to today for the clinician to
   * correct.
   */
  private handleFillFirstSlot = (type: ImageType) => () =>
    this.props.onAddImage(this.props.emptyWorkspaceId, {
      type,
      timepoint: getDefaultTimepoint(0),
      captureDate: null,
    });

  /**
   * File an untimepointed image onto an existing visit: it takes that visit's
   * label and, where the visit has one, its earliest capture date — the very data
   * path the empty slots use (`handleFillSlot`), applied to an image that is
   * already on file instead of one about to be added.
   *
   * Without it, the one thing this surface knows about T1 (its day) had to be
   * re-typed by hand in Edit details to file an image at T1, one row under the
   * slots that offer exactly the inverse. A visit with no capture date lends
   * none — and neither does a visit that does not exist yet (`isNew`, the T1 a
   * record with no labelled visit starts from): the image keeps whatever date it
   * already carries.
   */
  private handleFileAt = (
    record: PatientRecord, target: FileTarget,
  ) => () => this.props.onSaveRecordMeta(record, {
    type: record.type,
    timepoint: target.label,
    captureDate: target.date !== null ? target.date : record.captureDate,
  });

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
