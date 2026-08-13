import * as React from 'react';

import * as cx from 'classnames';

import { Helmet } from 'react-helmet';

import RaisedButton from 'material-ui/RaisedButton';
import IconPrint from 'material-ui/svg-icons/action/print';
import IconChevron from 'material-ui/svg-icons/navigation/chevron-right';
import IconPrev from 'material-ui/svg-icons/navigation/chevron-left';
import IconBack from 'material-ui/svg-icons/navigation/arrow-back';
import IconEdit from 'material-ui/svg-icons/image/edit';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconAdd from 'material-ui/svg-icons/content/add';
// The three launch icons are the editor toolbar's own, so the same action wears
// the same mark on both surfaces.
import IconTrace from 'material-ui/svg-icons/image/crop-original';
import IconReport from 'material-ui/svg-icons/action/description';
import IconSuperimpose from 'material-ui/svg-icons/maps/layers';
import IconSimulate from 'material-ui/svg-icons/image/tune';
// The ruler: the mark the app already associates with a mm/px scale.
import IconScale from 'material-ui/svg-icons/image/straighten';

import Props from './props';

import { PatientRecord } from 'store/reducers/workspace';

import EditRecordDialog from 'components/RecordMetaFields/EditRecordDialog';
import RemoveRecordDialog from 'components/RecordMetaFields/RemoveRecordDialog';
import EditPatientDialog, { PatientEditField } from './EditPatientDialog';
import ApplyScaleDialog from './ApplyScaleDialog';
// The photographs' own two surfaces: a visit's composite series, and the viewer
// that enlarges one photograph or compares them across visits.
import PhotoSeries from './PhotoSeries';
import PhotoViewer, { PhotoViewerTarget } from './PhotoViewer';
// …and the path that files a whole sitting's photographs into one visit at once.
import AddPhotoSeries from './AddPhotoSeries';
import AnalysisFindings, { FilmFindings } from './AnalysisFindings';
import TrendChart from './TrendChart';

// The three views this surface launches. Each is the connected component the
// editor's toolbar opens, opened here with the record the dashboard is pointing
// at — nothing is reimplemented, and the superimposition is handed the pair to
// start on rather than being given a picker of its own.
import ClinicalReport from 'components/ClinicalReport/connected';
import Superimposition from 'components/Superimposition/connected';
import TreatmentSimulation from 'components/TreatmentSimulation/connected';

// What a tracing must carry before it can be registered — the superimposition's
// own sentence, so the timeline's tooltip cannot drift from the view's.
import { registrationRequirement } from 'components/Superimposition/selectors';

import { PatientDetails } from 'components/PatientFields';

import { formatScale } from 'components/TracingToolbar/CalibrationDialog';

// The practice identity every printable view of this app reads back (see
// `letterhead.ts`): the records sheet was the one printed surface that did not.
import {
  readLetterhead,
  formatClinicianLine,
} from 'components/ClinicalReport/letterhead';

// …and the printed page's own plumbing, from the view that established it: the
// same font stack in the `@page` margin boxes, the same string escaping, and the
// date form a *document* of this app states as its own — the very form the
// report's masthead prints, so two sheets filed in one chart cannot date
// themselves two ways. (The record's own dates — capture days — stay ISO on both
// sheets: those are facts about the films, printed as the record stores them.)
import {
  PRINT_FONT,
  cssString,
  documentDate,
} from 'components/ClinicalReport';

import {
  formatAgeFull,
  formatSexFull,
} from 'utils/patient';

// What a "Save as PDF" of this sheet is called. Every other printable view of
// this app declares its own document title for as long as it is mounted, because
// the app titles the tab from the active workspace — the operator's scan file —
// and Chrome names the PDF after `document.title`. Without this the case sheet
// saved as `test-ceph.jpg - WebCeph.pdf`: a chart document named after neither
// the patient nor the document.
import { printDocumentTitle } from 'utils/printTitle';

import {
  getImageTypeLabel,
  getImageTypeShortLabel,
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
  getScalePropagationTargets,
  FILM_SIZE_BAND,
  getTimepointToken,
  // The controlled half of the timepoint vocabulary, read back through its own
  // parser — the case timeline names a visit's stage with the word the record
  // stores, never with one this surface infers (see `bandStageOf`).
  groupRecordsByTimepoint,
  getVisitPill,
  getVisitRest,
  TimepointGroup,
  // The photographic series (see `utils/records#PHOTO_VIEW_OPTIONS`): which
  // records are photographs, the frame each one is, and the frame an empty cell
  // of a visit's series files an upload at.
  isPhotographType,
  getDefaultPhotoView,
  findPhotoView,
  buildPhotoSeries,
  PHOTO_VIEW_OPTIONS,
  PhotoSeriesLayout,
  PhotoViewOption,
} from 'utils/records';

import { getNameForAnalysis } from 'components/AnalysisSelector/strings';

const classes = require('./style.scss');

const actionIconStyle: React.CSSProperties = { width: 18, height: 18 };

/** The launch controls' mark — sized to a 26px pill, like the slots' plus. */
const launchIconStyle: React.CSSProperties = { width: 15, height: 15 };

/** The case timeline's scroll chevrons — the record viewer's own 26px button. */
const navIconStyle: React.CSSProperties = { width: 18, height: 18 };

/**
 * A mui `SvgIcon` puts `color: <theme svgIcon colour>` on the `<svg>` itself and
 * only then fills with `currentColor`, so `currentColor` resolves against the
 * *theme's* colour and never against the button's — the trap `SlotPlus` above was
 * authored to get out of. So each launch mark is handed the colour of the state
 * its control is in: a greyed-out "Simulation" carried a full-strength #1F2933
 * icon in an otherwise disabled-grey pill without this.
 */
const LAUNCH_ICON = '#1F2933';      // $text-primary — matches the pill's label
const LAUNCH_ICON_OFF = '#A9B4BE';  // $text-disabled
const SUPERIMPOSE_ICON = '#1565C0'; // $primary-600 — matches its blue label
const NAV_ICON = '#52616F';         // $text-secondary — the chevrons' own colour

/**
 * The standing every "not on file" statement on this surface is made under —
 * printed once on paper, and once on screen at the foot of the coverage pane.
 *
 * It is what makes the omissions fair: a chart that lists five uppercase rows of
 * types a visit does not hold, with nothing anywhere saying those types were
 * never required, reads as a record of what the practice failed to take. The
 * coverage pane the sentence lives in on screen is screen-only (a wide-window
 * reading of what each visit prints for itself), so the sheet carried the
 * omissions and not the qualifier.
 */
const COVERAGE_QUALIFIER =
  'What is on file, not a requirement — a case is complete without a ' +
  'panoramic or a photographic series.';

/**
 * How far a film's tracing has got, as one of the four readings the card chips
 * already carry — done (green), under way (amber), outstanding (amber hairline),
 * or never applicable to this kind of image (grey) — with the phrase that states
 * it in a tooltip.
 *
 * Shared by the timeline band's chips and nothing else *by design*: `StatusChip`
 * keeps its own, fuller wording, because it has a whole card row to say it in and
 * has to name the analysis the count belongs to. This is the same three-way
 * reading compressed to a tint and a clause, so a band chip and the card 200px
 * below it can never contradict each other about which films still need work.
 */
type TracingTone = 'ok' | 'partial' | 'todo' | 'muted';

const getTracingTone = (
  record: PatientRecord,
): { tone: TracingTone; phrase: string } => {
  if (!record.isTraceable) {
    return { tone: 'muted', phrase: 'view only, not analysable' };
  }
  const { landmarksPlaced, landmarksRequired } = record;
  if (landmarksRequired === 0) {
    return { tone: 'muted', phrase: 'no analysis set' };
  }
  const count = `${landmarksPlaced} of ${landmarksRequired} landmarks`;
  if (landmarksPlaced === 0) {
    return { tone: 'todo', phrase: `not traced · ${count}` };
  }
  if (landmarksPlaced >= landmarksRequired) {
    return { tone: 'ok', phrase: `traced · ${count}` };
  }
  return { tone: 'partial', phrase: `partly traced · ${count}` };
};

/**
 * How the timeline band names a visit in prose — its label's token ("T2" out of
 * "T2 mid-treatment"), or a phrase for the images that carry no label at all,
 * which is not a point in time and must never be printed as though it were one.
 */
const bandName = (group: TimepointGroup<PatientRecord>): string => {
  const token = getTimepointToken(group.label);
  return token !== null ? token : 'the unlabelled images';
};

/*
 * (The stage a visit is filed at, and the rest of what its label says, are read
 * through `utils/records#getVisitPill` / `#getVisitRest` — one reading shared by
 * the case timeline's stops and the imaging-records stamps below them, so one visit
 * cannot be named two ways 300px apart. The rail is the one surface whose whole job
 * is the chronology, and the stage used to be the one fact it did not carry: the
 * records below it stamp "T1 / Initial", the printed sheet prints "T1 Initial", the
 * report heads its page "TIMEPOINT T1 Initial" and the superimposition's pickers
 * name "T3 Debond" — while the stop above them all read "T1 / 2025-04-14 / AGE 14 y
 * 1 mo".)
 */

/**
 * One launch control: an action that leaves this surface for a view of one film.
 *
 * The tooltip is always on the enabled wrapper rather than on the button, because
 * a browser fires no hover on a disabled control and its `title` is therefore
 * never read — which would make a greyed-out "Simulation" a dead end. The button
 * itself stays focusable and states its condition through `aria-disabled`, so the
 * reason is reachable by pointer and by keyboard alike. (The superimposition
 * view's registration segments are built the same way.)
 */
const LaunchAction = (
  { label, icon, title, isEnabled, onClick }: {
    label: string;
    icon: JSX.Element;
    title: string;
    isEnabled: boolean;
    onClick: () => any;
  },
) => (
  <span className={classes.launch_slot} title={title}>
    <button
      type="button"
      className={cx(classes.launch_btn, {
        [classes.launch_btn__off]: !isEnabled,
      })}
      aria-disabled={!isEnabled}
      aria-label={isEnabled ? label : `${label} — unavailable`}
      onClick={isEnabled ? onClick : undefined}
    >
      {icon}
      <span className={classes.launch_btn_label}>{label}</span>
    </button>
  </span>
);

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
/**
 * The image types whose card thumbnail is *normalised* for viewing (see
 * `.thumb_img__film`): the radiographs. A photograph arrives exposed for the eye
 * already; a cephalogram exported for tracing does not, and shrunk to a card it
 * was a near-black rectangle nobody could assess a film from.
 *
 * An image filed before the records layer existed carries no type at all and was
 * loaded through the lateral-ceph flow (`utils/records#isTraceableImageType`
 * keeps the same assumption), so it is treated as the radiograph it is.
 */
const RADIOGRAPH_TYPES: ImageType[] = ['ceph_lateral', 'ceph_pa', 'panoramic'];

const isRadiograph = (type: ImageType | null): boolean =>
  type === null || RADIOGRAPH_TYPES.indexOf(type) >= 0;

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
          className={cx(classes.thumb_img, {
            // Display normalisation, on the radiographs only and on this card
            // only: the tracing canvas, the printed report and every measurement
            // read the stored pixels untouched (see `.thumb_img__film`).
            [classes.thumb_img__film]: isRadiograph(record.type),
          })}
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
  /**
   * The calibrated film whose scale is being carried to the record's other films,
   * or null. Held as an image id for the same reason the launched views are: the
   * offer is about *that* film's calibration, and this surface lists every film of
   * the case (see `ApplyScaleDialog`).
   */
  applyScaleImageId: string | null;
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
  /**
   * Whether the case timeline's rail has visits scrolled off its left / right
   * edge. A horizontal band that is wider than its window has to say so, or a
   * six-visit case reads as a four-visit case with a cut-off label at the end.
   */
  hasBandStart: boolean;
  hasBandEnd: boolean;
  /**
   * How far the whole-case bracket is held in from the rail's own two edges, in
   * pixels — so its end ticks fall *on* the first and the last stop of the rail
   * instead of on the panel's inner edges.
   *
   * Measured off the track's own cells rather than assumed (see
   * `updateBandScrollState`): a stop is sized to its content, and the widest stop
   * of a case whose labels are "T1" and "T3 post-surgical bimaxillary" differs
   * from its neighbour by 90px. Null until the rail has been measured once, which
   * is the one state in which the bracket keeps its old full-width geometry.
   */
  bandSpanInset: { start: number; end: number } | null;
  /*
   * (There is no `appliedScale` here any more, and that is the point. The batched
   * calibration this surface writes is remembered **on the record** — each copy
   * carries the film it came from (`PatientRecord#scaleSourceId`) — because held in
   * component state the reversal died on the first navigation: after applying, the
   * card offered "remove … from 2 films", and one trip into the tracing editor and
   * back left neither the control nor the CALIBRATION row, while the dialog's own
   * effect line promises the reversal unconditionally. The only route back was then
   * N trips into N tracing toolbars — exactly the work the feature removes.)
   */
  /**
   * The film whose batched calibration is being taken back off the record's other
   * films, or null — the mirror of `applyScaleImageId`, reviewed through the same
   * dialog in its removal mode.
   */
  removeScaleImageId: string | null;
  /**
   * The film whose printable clinical report is open, or null. Held as an image
   * id rather than a boolean because the report is *of a film*, and this surface
   * lists every film of the case: opening it from T2's card must report T2 even
   * though the editor behind the dashboard still holds T1.
   */
  reportImageId: string | null;
  /** The film whose treatment simulation is open, or null. Same reasoning. */
  simulationImageId: string | null;
  /**
   * The two films a superimposition was started on, or null. These seed the
   * superimposition view's own T1/T2 selection (`Superimposition#initialT1Id`);
   * the pickers in its chrome own the choice from there, so the dashboard adds a
   * starting point and not a second picker.
   */
  superimposePair: { t1Id: string; t2Id: string } | null;
  /**
   * What the photograph viewer is open on, or null — one photograph enlarged, one
   * series position across the visits, or two visits' whole series (see
   * `PhotoViewer`).
   *
   * Held as the *target* that was pressed rather than as the viewer's own reading:
   * the reading is the viewer's to change (a clinician enlarges a frame, then walks
   * it along the case), and this surface only says what was pressed.
   */
  photoViewer: PhotoViewerTarget | null;
  /**
   * The visit a photographic series is being filed into, or null (see
   * `AddPhotoSeries`). Carries the visit's label and day — the two facts the batch
   * is stamped with — plus the files of the drop that opened it, where it was
   * opened by a drop on a visit's series tile.
   */
  photoBatch: {
    timepoint: string | null;
    captureDate: string | null;
    groupKey: string | null;
    files: File[] | null;
  } | null;
  /**
   * The photographs of a reviewed batch still to be filed, in order — see
   * `handleFilePhotoBatch` for why a batch is a queue rather than one dispatch.
   */
  photoQueue: Array<{ file: File; meta: ImageRecordMeta }>;
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
    applyScaleImageId: null,
    isEditingPatient: false,
    patientFocusField: null,
    isHeadFloating: false,
    isFootFloating: false,
    hasBandStart: false,
    hasBandEnd: false,
    bandSpanInset: null,
    removeScaleImageId: null,
    reportImageId: null,
    simulationImageId: null,
    superimposePair: null,
    photoViewer: null,
    photoBatch: null,
    photoQueue: [],
  };

  private root: HTMLElement | null = null;
  /** This surface's scrollport — wound back to the top before printing. */
  private scrollRef: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private head: HTMLElement | null = null;
  private foot: HTMLElement | null = null;
  /** The case timeline's scrolling rail (see `hasBandStart` / `hasBandEnd`). */
  private bandTrack: HTMLElement | null = null;
  /**
   * The shape of the case the rail has already been wound to its latest visit
   * for — the number of cells on the track (see `parkBandAtLatestVisit`).
   */
  private bandParkedFor: string | null = null;
  /**
   * The safety net under the batch queue: a photograph whose import fails never
   * arrives as a record, and the rest of the sitting must not be stranded behind
   * it (see `pumpPhotoQueue`).
   */
  private photoQueueTimer: number | null = null;

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

  componentDidUpdate(prev: Props) {
    this.updateStickyState();
    // One photograph of a batch has landed: file the next (see `photoQueue`).
    if (this.state.photoQueue.length > 0
      && prev.records.length !== this.props.records.length) {
      this.pumpPhotoQueue();
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleDocumentKeyDown);
    window.removeEventListener('resize', this.updateStickyState);
    document.body.classList.remove(BODY_OPEN_CLASS);
    if (this.photoQueueTimer !== null) {
      window.clearTimeout(this.photoQueueTimer);
    }
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
        {/* The sheet's own paper: A4, its margins, and the running foot that
            dates and numbers it (see `renderPrintPageStyle`) — and the name the
            printed document files itself under. */}
        {this.renderDocumentTitle()}
        {this.renderPrintPageStyle()}
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
            {/* The way this sheet gets onto paper. It is built to be printed —
                A4 portrait, a running head repeated on every sheet, a page
                counter in the foot, print-only type labels in the slots — and it
                was the one printable view of this app with no control to print
                it, so all of that was reachable only through the browser's own
                Ctrl+P. Secondary, not primary: filing an image is what this
                screen is for. Same mark and same wording as the report, the
                simulation and the superimposition, because it is the same act.
                Offered once there is a record to print. */}
            {records.length > 0 ? (
              <button
                type="button"
                className={classes.print_action}
                title="Print this patient's imaging records, or save them as a PDF"
                onClick={this.handlePrint}
              >
                <IconPrint color="currentColor" style={actionIconStyle} />
                <span>Print / Save as PDF</span>
              </button>
            ) : null}
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
          onScroll={this.updateStickyState}
          ref={this.setScroll}
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
            {/* …then the case as one horizontal line of time: every visit as a
                stop on a rail, the elapsed interval written on the rail between
                consecutive stops, and the cross-timepoint action that lives in
                exactly that gap. Screen only — see `renderCaseBand`. */}
            {this.renderCaseBand(groups)}
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
                    {/* Screen only: "add a lateral cephalogram" is an
                        instruction nobody can carry out on a sheet of paper, and
                        the headline above it — "No images on file yet" — is the
                        whole of what the sheet has to say. Same swap the slots
                        and the identity band's gaps already make on paper. */}
                    <p className={cx(classes.empty_hint, classes.empty_hint__offer)}>
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
                          // The three photograph types are one slot here — the
                          // series itself. A type pill cannot name a *frame*, so
                          // "Add intraoral photo" proposed the centre frame for
                          // what may well be a buccal segment, and the nine-frame
                          // vocabulary this module invented was missing at the one
                          // place a series is started.
                          .filter(({ id }) => !isPhotographType(id))
                          .map(({ id }) => (
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
                              <span className={classes.slot_print}>{getImageTypeLabel(id)}</span>
                            </button>
                          ))}
                        {this.renderSeriesSlot(getDefaultTimepoint(0), null, null)}
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
        {this.renderLaunchedViews()}
      </section>
    );
  }

  private setRoot = (el: HTMLElement | null) => { this.root = el; };
  private setScroll = (el: HTMLElement | null) => { this.scrollRef = el; };
  private setBandTrack = (el: HTMLElement | null) => {
    this.bandTrack = el;
    // A track that has gone away takes its parked position with it: the next one
    // mounted (the band returns as soon as a second visit is filed) is wound to
    // its own latest visit rather than inheriting a stale key.
    if (el === null) {
      this.bandParkedFor = null;
    }
    this.updateStickyState();
  };
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
    this.updateBandScrollState();
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
   * Whether the case timeline's rail has case scrolled off either edge — read
   * off the track's own scroll geometry, on mount, on every update, on resize
   * and on the track's own scroll. The two flags switch on the fades that are the
   * only thing telling a reader a seventh visit exists to the right.
   *
   * A 1px tolerance, because a scrollport that is *not* scrollable reports
   * `scrollWidth` a fraction over `clientWidth` at some zoom levels, and a
   * permanent fade over a band with nothing behind it is a lie in the other
   * direction.
   */
  private updateBandScrollState = () => {
    const track = this.bandTrack;
    this.parkBandAtLatestVisit();
    const hasBandStart = track !== null && track.scrollLeft > 1;
    const hasBandEnd = track !== null &&
      track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
    const bandSpanInset = this.measureBandSpanInset(track);
    const previous = this.state.bandSpanInset;
    const insetChanged = (previous === null) !== (bandSpanInset === null) ||
      (previous !== null && bandSpanInset !== null &&
        (previous.start !== bandSpanInset.start ||
          previous.end !== bandSpanInset.end));
    if (
      hasBandStart !== this.state.hasBandStart ||
      hasBandEnd !== this.state.hasBandEnd ||
      insetChanged
    ) {
      this.setState({ hasBandStart, hasBandEnd, bandSpanInset });
    }
  };

  /**
   * Where the whole-case bracket's two end ticks belong: under the **centre of the
   * two stops the bracket actually names**, which is where those visits are drawn.
   *
   * Not the rail's outermost stops. The bracket compares the first *traced* visit
   * with the latest, and on a case whose newest visit is not yet traced it says so —
   * "WIDEST ON FILE · T1 → T4" on a five-visit rail. Measured from the track's first
   * and last children, its right tick then landed under T5, 340px past the visit its
   * own label names: the geometry claimed a span the label denied, which is the exact
   * failure this measurement was introduced to prevent, arriving from the other side.
   *
   * It has to be measured. A stop is sized to its own content between a 116px
   * floor and a 240px cap, so the half-width the bracket must be held in by is a
   * property of this case's labels and nothing a stylesheet can know: left at the
   * section's inner edges the start tick sat 103px left of T1's node and the end
   * tick 58px right of T3's, and a bracket whose ticks land in empty space reads
   * as a rule under the whole panel rather than as a span of T1 → T3.
   *
   * Read in the track's *layout* coordinates and then shifted by its scroll
   * offset, so the ticks stay on their stops while the rail is scrolled; both
   * insets are clamped so a stop scrolled out of the port leaves the tick at the
   * rail's edge rather than outside it, and rounded, because a sub-pixel
   * re-measure on every scroll event is a `setState` loop.
   */
  private measureBandSpanInset = (
    track: HTMLElement | null,
  ): State['bandSpanInset'] => {
    if (track === null) {
      return null;
    }
    // The track interleaves stops and intervals; only the stops are visits.
    const stops: HTMLElement[] = [];
    for (let i = 0; i < track.children.length; i += 1) {
      const cell = track.children[i] as HTMLElement;
      if (cell.classList.contains(classes.stop)) {
        stops.push(cell);
      }
    }
    if (stops.length < 2) {
      return null;
    }
    // Which two visits the bracket names — resolved by the same helper the bracket
    // itself is rendered from, so the ticks and the label can never disagree.
    const groups = groupRecordsByTimepoint(this.props.records);
    const ends = this.bandSpanEnds(groups);
    const clampIndex = (index: number) =>
      Math.max(0, Math.min(stops.length - 1, index));
    const first = stops[clampIndex(
      ends !== null ? groups.indexOf(ends.first) : 0,
    )];
    const last = stops[clampIndex(
      ends !== null ? groups.indexOf(ends.last) : stops.length - 1,
    )];
    const width = track.clientWidth;
    if (width <= 0 || first.offsetWidth <= 0) {
      return null;
    }
    // Half the widest a tick may be held in by: the arms must still be drawn, and
    // the label group between them is what the surface is for.
    const cap = Math.max(0, width / 2 - 48);
    const start = first.offsetLeft + first.offsetWidth / 2 - track.scrollLeft;
    const end = width -
      (last.offsetLeft + last.offsetWidth / 2 - track.scrollLeft);
    return {
      start: Math.round(Math.max(0, Math.min(cap, start))),
      end: Math.round(Math.max(0, Math.min(cap, end))),
    };
  };

  /**
   * The rail opens on the *latest* visit, not the earliest.
   *
   * A seven-visit case is 1533px of rail in a 1266px window, and opened at
   * `scrollLeft: 0` the one stop under the fade was T7 — the visit a clinician
   * looks at first, and the one whose interval carries the superimposition they
   * are most likely to want. The case still reads left to right; it is simply
   * wound to its end, the way a chart is opened at its last page.
   *
   * Parked once per shape of the case *at a given width*: the key is the number
   * of cells on the track and the width of the port they are read through, so a
   * newly filed visit winds the rail on to it and a window narrowed to 1024 —
   * where a stop that was on screen no longer is — is wound on again, while a
   * reader who has scrolled back to T1 is never yanked forward by a hover, a
   * dialog closing or any other re-render.
   */
  private parkBandAtLatestVisit = () => {
    const track = this.bandTrack;
    if (track === null) {
      return;
    }
    const key = `${track.children.length}@${track.clientWidth}`;
    if (this.bandParkedFor === key) {
      return;
    }
    this.bandParkedFor = key;
    track.scrollLeft = track.scrollWidth;
  };

  /**
   * Scroll the rail one window-full towards the earlier (-1) or later (+1)
   * visits. Two thirds of the port rather than all of it, so the stop that was
   * at the edge stays on screen and the reader keeps their place in the case.
   */
  private scrollBand = (direction: 1 | -1) => () => {
    const track = this.bandTrack;
    if (track === null) {
      return;
    }
    const step = Math.max(Math.round(track.clientWidth * 0.66), 180);
    const left = Math.max(
      0,
      Math.min(track.scrollWidth, track.scrollLeft + direction * step),
    );
    // `scrollTo` with a behaviour where the browser has it (every browser this
    // app supports), so the case slides and the reader sees which way it moved;
    // the assignment is the same scroll without the animation.
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: 'smooth' });
    } else {
      track.scrollLeft = left;
    }
    this.updateBandScrollState();
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
    const {
      editingImageId, removingImageId, isEditingPatient, applyScaleImageId,
      reportImageId, simulationImageId, superimposePair, photoViewer,
    } = this.state;
    if (
      editingImageId !== null || removingImageId !== null || isEditingPatient ||
      applyScaleImageId !== null ||
      // …including the photograph viewer, which closes on Escape itself: without
      // it in this list one Escape shut the viewer *and* left the records surface,
      // landing the clinician on whichever photograph happened to be open in the
      // read-only viewer behind it — exactly the fault the guard below documents
      // for the three launched views.
      photoViewer !== null
    ) {
      return;
    }
    // …nor while one of the views this surface launches is over it. Each of the
    // three closes on Escape itself, and both handlers are on `document`: without
    // this guard, one Escape closed the report *and* left the dashboard, so the
    // clinician landed in the tracing editor having asked for neither.
    if (
      reportImageId !== null || simulationImageId !== null ||
      superimposePair !== null
    ) {
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
    // Whose practice holds the record. Read from the one letterhead this app
    // stores — the same practice, clinician and license the clinical report's
    // masthead and the superimposition's signature block print — so a records
    // sheet, a report and a superimposition filed together in one chart cannot
    // be signed to two different standards. Never invented: with nothing stored
    // the line is simply not there, and the printed-on date in the running foot
    // still says which copy this is.
    const letterhead = readLetterhead();
    const clinicianLine = formatClinicianLine(letterhead);
    // …and the practice is the first thing on that line, at a weight a chart
    // reader can see it at. Set as one run of 8.5pt tertiary grey with the
    // clinician's name and license, the practice that holds the record was the
    // third, smallest, greyest line of the sheet — while the report's first sheet
    // gives the same practice a masthead. Whose record this is is not a footnote.
    const clinic = letterhead.clinic !== '' ? letterhead.clinic : null;
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
              {clinic !== null || clinicianLine !== '' ? (
                <span className={classes.print_head_clinic}>
                  {clinic !== null ? (
                    <span className={classes.print_head_practice}>{clinic}</span>
                  ) : null}
                  {clinicianLine !== '' ? (
                    <span className={classes.print_head_clinician}>
                      {clinicianLine}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </th>
        </tr>
      </thead>
    );
  };

  /**
   * The printed sheet's own paper geometry and its running foot.
   *
   * Declared here rather than in the stylesheet for two reasons. The record's
   * paper size and margins used to be inherited from a global `@page` declared in
   * *another component's* stylesheet (the clinical report's) that merely happened
   * to share the bundle — code-splitting the report would silently have dropped
   * this chart to the browser's default margins. And the foot carries a date,
   * which is data: it is generated at render time, exactly as the report's own
   * running head is (see `ClinicalReport#renderRunningPageStyle`, whose margin
   * boxes and type this matches).
   *
   * The foot is what makes a printed chart filable: three loose sheets with no
   * date and no page numbers cannot be put in order, and a chart re-printed after
   * the next visit cannot be told from the one it supersedes. The identity is not
   * repeated here — the running head above carries it on every sheet.
   *
   * Rendered only while this surface is the one that prints: the superimposition,
   * the simulation and the report each declare their own page geometry, and while
   * one of them is open over the dashboard it is theirs that must win.
   */
  /** Whether one of the launched views is open over this surface. */
  private isLaunchedViewOpen = () => {
    const { reportImageId, simulationImageId, superimposePair } = this.state;
    return reportImageId !== null || simulationImageId !== null ||
      superimposePair !== null;
  };

  /**
   * What a print of this sheet is called — the same construction every other
   * printable view of this app uses (`utils/printTitle`), and gated the same way
   * `renderPrintPageStyle` is: while the report, the simulation or the
   * superimposition is open over the dashboard, the document is theirs and so is
   * its name.
   *
   * The subject is the span the sheet actually covers, taken from the records
   * rather than composed: a chart with one visit says so, and a patient with no
   * films yields no parenthesis at all instead of an invented date range.
   */
  private renderDocumentTitle = () => {
    const { patient, records } = this.props;
    if (this.isLaunchedViewOpen()) {
      return null;
    }
    const dates = records
      .map((r) => r.captureDate)
      .filter((d): d is string => !!d && d.trim() !== '')
      .sort();
    const span = dates.length === 0
      ? null
      : (dates[0] === dates[dates.length - 1]
        ? dates[0] : `${dates[0]} – ${dates[dates.length - 1]}`);
    return (
      <Helmet
        title={printDocumentTitle(patient, 'Imaging records', [span])}
      />
    );
  };

  private renderPrintPageStyle = () => {
    if (this.isLaunchedViewOpen()) {
      return null;
    }
    const printed = `Printed ${documentDate(new Date())} · WebCeph`;
    const box = (align: string) => (
      `font: 8pt ${PRINT_FONT}; color: #7B8794; text-align: ${align};` +
      ' vertical-align: top; padding-top: 3mm;'
    );
    const css = [
      '@page {',
      '  size: A4 portrait;',
      '  margin: 12mm 12mm 14mm;',
      '  @bottom-left {',
      `    content: ${cssString(printed)};`,
      `    ${box('left')}`,
      '  }',
      '  @bottom-right {',
      '    content: "Page " counter(page) " of " counter(pages);',
      `    ${box('right')} color: #52616F; font-weight: 600;`,
      '  }',
      '}',
    ].join('\n');
    return <style type="text/css" dangerouslySetInnerHTML={{ __html: css }} />;
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
              then restated the day itself a third time.

              The endpoints only. The elapsed figure that used to stand beside
              them ("3 y 11 mo") was the *total* of a chain the case timeline
              writes out interval by interval 60px below — and a chain of whole
              months cannot sum to a total of whole months (six intervals each
              losing up to 30 days lost two months of a 47-month record), so the
              two figures disagreed on the same screen by arithmetic alone. The
              timeline owns the chronology: it states each interval, and each
              multi-day visit's own span, so the chain is complete and there is
              nothing left for a total to add. On paper, where the band is not
              printed, the running head still carries the span *and* its elapsed
              time (see `renderPrintHead`) — there is no chain there to contradict
              it. */}
          {span !== null ? (
            <IdentityFact label="Record span" value={span.dates} />
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

  /**
   * How much of the record is ready to report on, counted once — the figures both
   * the sticky screen bar and the printed tally are set from, so the two readings
   * of one record cannot drift.
   */
  private getRecordsTally = () => {
    const { records } = this.props;
    const traceable = records.filter((r) => r.isTraceable);
    return {
      total: traceable.length,
      traced: traceable.filter(
        (r) => r.landmarksRequired > 0 &&
          r.landmarksPlaced >= r.landmarksRequired,
      ).length,
      calibrated: traceable.filter((r) => r.isCalibrated).length,
      // A calibration whose implied film size is outside the band a cephalogram
      // measures is counted separately: a bare "3 of 3 calibrated" under three
      // cards that each read "Calibrated · check scale" is the panel's summary
      // line contradicting every card it summarises.
      suspect: traceable.filter((r) => {
        const size = getImpliedFilmSize(r.width, r.height, r.scaleFactor);
        return r.isCalibrated && size !== null && !size.isPlausible;
      }).length,
      // …and how many of those calibrations were *copied* from another film of the
      // record rather than measured on their own. "3 of 3 lateral cephs calibrated"
      // counted a film measured against a ruler and two films carrying a copy of
      // that measurement as the same thing, which on a chart a practice keeps for
      // years is the difference between three calibrations and one.
      // Counted through `scaleCopiedFrom`, so the figure only ever counts films
      // whose source is a film of *this* record: a provenance whose id no longer
      // resolves (a project imported from a .wceph, whose image ids are re-minted)
      // names nothing on any card, and a tally is not the place to assert what no
      // card can show.
      copied: traceable.filter(
        (r) => r.isCalibrated && this.scaleCopiedFrom(r) !== null,
      ).length,
      // Traceability is a property of the *type*, and an image filed before the
      // records layer existed carries no type at all — those are traceable too,
      // so the tally cannot call them lateral cephalograms.
      noun: traceable.filter((r) => r.type !== 'ceph_lateral').length === 0
        ? 'lateral cephs' : 'traceable images',
    };
  };

  /** The tallies themselves, in the one wording both media state them in. */
  private renderTallyItems = () => {
    const {
      total, traced, calibrated, suspect, copied, noun,
    } = this.getRecordsTally();
    return [
      /* The base is named. Counted over the traceable films but printed as a
         bare "3 of 3", these two figures read as "the whole record is done"
         on a record where half the images are photographs. */
      <span key="traced" className={classes.records_foot_item}>
        {traced} of {total} {noun} traced
      </span>,
      <span key="calibrated" className={classes.records_foot_item}>
        {calibrated} of {total} {noun} calibrated
        {/* The copies are named on the same line as the count that includes them,
            in the quiet register the cards' own "copied from T1 · 2024-04-10"
            uses: a tally that says three films are calibrated when one scale was
            ever measured is a true count of a fact nobody meant to state. */}
        {copied > 0 ? (
          <span
            className={classes.records_foot_note}
            title={'These films carry a scale copied from another film of this ' +
              'record — same image type, same pixel size — rather than one ' +
              'measured on the film itself. Each card names the film its scale ' +
              'came from.'}
          >
            {copied === 1 ? ' · 1 copied' : ` · ${copied} copied`}
          </span>
        ) : null}
      </span>,
      suspect > 0 ? (
        <span
          key="suspect"
          className={cx(classes.records_foot_item, classes.records_foot_item__warn)}
          title={`The scale on ${suspect === 1 ? 'this film makes it' : 'these films makes them'} ` +
            `smaller or larger than the ${FILM_SIZE_BAND.minMm}–` +
            `${FILM_SIZE_BAND.maxMm} mm a cephalogram measures.`}
        >
          {suspect === 1
            ? '1 scale needs checking' : `${suspect} scales need checking`}
        </span>
      ) : null,
    ];
  };

  private renderRecordsFooter = () => {
    // One traceable film says everything twice: its own two chips are the two
    // tallies. Two or more, and "2 of 3 traced" is a reading of the record that
    // no single card carries.
    if (!this.hasRecordsFooter()) {
      return null;
    }
    const { isFootFloating } = this.state;
    return (
      <div
        ref={this.setFoot}
        className={cx(classes.records_foot, {
          [classes.records_foot__floating]: isFootFloating,
        })}
      >
        {this.renderTallyItems()}
        <span className={classes.records_foot_spacer} />
      </div>
    );
  };

  /**
   * The printed panel's closing block: the same tallies, and the two notes the
   * sheet's own claims are made under — rendered **inside the last visit's group**
   * (see `renderGroup`), not after the list.
   *
   * Because that is the only way it stays with the record it tallies. As a sibling
   * of the list the bar printed *alone* at the top of a sheet — "4 of 5 lateral
   * cephs traced · 4 of 5 calibrated · 4 scales need checking", still wearing the
   * panel's rounded box, torn from the films it counts at the foot of the sheet
   * before — and no break rule can prevent it: Chrome honours `break-inside:
   * avoid` and ignores `break-before: avoid` entirely (measured; see
   * `.fb_core`). A visit's group is already an unbreakable box, so a tally
   * printed inside the last one cannot be separated from it.
   */
  private renderPrintRecordsTail = (
    groups: TimepointGroup<PatientRecord>[],
  ) => (
    <div className={classes.records_tail_print} aria-hidden="true">
      {this.hasRecordsFooter() ? (
        <p className={classes.records_tail_line}>{this.renderTallyItems()}</p>
      ) : null}
      {this.renderRecordsNotes(groups)}
    </div>
  );

  /**
   * The printed sheet's closing notes — paper only, and the two facts the sheet
   * asserted repeatedly and explained nowhere.
   *
   * **What the omissions are.** Each visit prints a row of the types it does not
   * hold. The sentence that gives those rows their standing lives in the coverage
   * pane, and that pane is a screen device (see the print block), so the deep case
   * printed five uppercase rows of omissions with nothing on the sheet saying the
   * types were never required — a filed chart reading as a record of what the
   * practice failed to take. It is stated once, here, for every visit on the
   * sheet.
   *
   * **What "check scale" fails against.** A suspect calibration was marked three
   * times per film — the card's amber chip, the card's amber implied film size and
   * the closing tally — and the reason was in a tooltip, which does not print. The
   * report states it in full on its own paper; this states it once for the panel,
   * and the chip's screen-only "· check scale" comes off (see `.chip_more`) so the
   * sheet marks the film twice instead of three times: the amber chip, and the
   * size that is the evidence.
   *
   * Never invented: each note is rendered only where the sheet actually carries
   * the thing it qualifies.
   */
  private renderRecordsNotes = (
    groups: TimepointGroup<PatientRecord>[],
  ) => {
    const { records } = this.props;
    // Only the visits whose slot rows actually print (the offer rows and the
    // empty state's own row are print-hidden — nothing has been filed at the
    // timepoint they name).
    const hasOmissions = groups.some(
      (group) => group.label !== null &&
        getMissingImageTypes(group.records).length > 0,
    );
    const suspect = records.filter((record) => {
      const size = getImpliedFilmSize(
        record.width, record.height, record.scaleFactor,
      );
      return record.isTraceable && record.isCalibrated &&
        size !== null && !size.isPlausible;
    }).length;
    if (!hasOmissions && suspect === 0) {
      return null;
    }
    return (
      <div className={classes.records_notes}>
        {hasOmissions ? (
          <p className={classes.records_note_line}>
            <span className={classes.records_note_key}>Not filed</span>
            {COVERAGE_QUALIFIER}
          </p>
        ) : null}
        {suspect > 0 ? (
          <p className={classes.records_note_line}>
            <span className={classes.records_note_key}>Check scale</span>
            {`The amber size beside a film's scale is what that scale says the ` +
             `film physically measures. A cephalogram's sides fall between ` +
             `${FILM_SIZE_BAND.minMm} and ${FILM_SIZE_BAND.maxMm} mm; outside ` +
             `that band the calibration is wrong, and every millimetre measured ` +
             `from the film is wrong by the same factor. Angles and ratios are ` +
             `unaffected. Re-calibrate against a known distance on the film.`}
          </p>
        ) : null}
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
          className={cx(classes.slots, classes.slots__offer)}
          title={`Nothing is filed at a timepoint yet — these slots open the ` +
            `upload form filed at ${first}`}
        >
          <span className={classes.slots_label}>Or file at {first}</span>
          <span className={classes.slots_list}>
            {IMAGE_TYPE_OPTIONS
              // …and the photographs are one slot, the series itself (see the
              // empty state's own row).
              .filter(({ id }) => !isPhotographType(id))
              .map(({ id }) => (
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
                  <span className={classes.slot_print}>{getImageTypeLabel(id)}</span>
                </button>
              ))}
            {this.renderSeriesSlot(first, null, null)}
          </span>
        </div>
      );
    }
    // What the visit has not got — never as three photograph *types*. Where the
    // visit already holds a series, its tile's own empty cells are the affordance
    // and they name a *frame* ("Add the left buccal photograph"). Where it holds
    // none, one slot offers the series itself (`renderSeriesSlot`), which opens on
    // the same nine named frames: a type pill cannot say which of the five
    // intraoral frames it means, and "Add intraoral photo" silently proposed the
    // centre for what may well be a buccal segment.
    const hasSeries = group.records.some(({ type }) => isPhotographType(type));
    const missing = getMissingImageTypes(group.records).filter(
      ({ id }) => !isPhotographType(id),
    );
    if (missing.length === 0 && hasSeries) {
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
          {'Not filed at '}
          <span className={classes.slots_at}>
            {token !== null ? token : group.label}
          </span>
          {/* Paper only — and it does not name the visit at all.
              The row is *inside* the visit's own block, under the films the
              stamp above them is the stamp of, so the boundary already says
              which visit. Printing the label here set the visit's name a third
              time and in caps 20mm to the right of the stamp that had just
              said it: "T2 Mid-treatment" above, "NOT FILED AT T2
              MID-TREATMENT" below — and with a free-text label, 60 characters
              of uppercase repeated ("NOT FILED AT PRE-TREATMENT RECORDS,
              ORTHOGNATHIC WORKUP, SECOND OPINION"). */}
          <span className={classes.slots_at_print}>this visit</span>
        </span>
        <span className={classes.slots_list}>
          {missing.map(({ id }) => (
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
              <span className={classes.slot_print}>{getImageTypeLabel(id)}</span>
            </button>
          ))}
          {/* …and, where this visit was not photographed at all, the series: the
              one path that starts a photographic series at a *named frame*. */}
          {hasSeries
            ? null
            : this.renderSeriesSlot(group.label, group.firstDate, group.key)}
        </span>
      </div>
    );
  };

  /**
   * The slot that starts a visit's photographic series — the one photographic
   * affordance on a visit that has not been photographed yet.
   *
   * It opens the series filing dialog (see `AddPhotoSeries`), which is both the
   * batch path a clinic actually needs (a sitting's nine photographs filed in one
   * act, each frame proposed in series order and editable first) and the composite
   * itself, so the *first* photograph of a series is filed at a named frame exactly
   * as the second through the ninth are.
   */
  private renderSeriesSlot = (
    timepoint: string | null, captureDate: string | null, groupKey: string | null,
  ) => {
    const at = timepoint !== null ? timepoint : 'this visit';
    return (
      <button
        key="photo_series"
        type="button"
        className={classes.slot}
        title={`Add this visit's photographic series to ${at}` +
          `${captureDate !== null ? ` · ${captureDate}` : ''} — the nine named ` +
          'frames, filed in one act or one at a time'}
        aria-label={`Add the photographic series to ${at}`}
        onClick={this.handleOpenSeriesDialog(timepoint, captureDate, groupKey, null)}
      >
        <SlotPlus />
        <span className={classes.slot_label}>Add photographs</span>
        <span className={classes.slot_print}>Photographic series</span>
      </button>
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
        // The case timeline above owns each visit's day, the age on it and the
        // interval between visits, so the chart's axis strip does not restate
        // them on screen (it still prints them, where there is no band).
        hasCaseTimeline={groups.length > 0}
        // The board this patient is followed on, off their own record — so it is
        // still that board when the case is reopened tomorrow. Undefined (not
        // null) where there is no patient to file a choice against, which is
        // what tells the chart to keep it in its own state instead.
        plotted={patient !== null
          ? (patient.trendPlot !== undefined ? patient.trendPlot : null)
          : undefined}
        onSetPlotted={patient !== null ? this.handleSetTrendPlot : undefined}
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
      // A lateral cephalogram holds no position in a photographic series.
      photoView: null,
    });

  /**
   * Files the trend board on this patient (see `TrendChart#plotted`). One bound
   * handler rather than one per render, so the chart's own pure comparison still
   * means something.
   */
  private handleSetTrendPlot = (symbols: string[] | null) => {
    const { patient, onSetTrendPlot } = this.props;
    if (patient !== null) {
      onSetTrendPlot(patient.id, symbols);
    }
  };

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
   *
   * **The photographs are one row, in the series' own vocabulary.** They used to be
   * three type rows — "Profile photograph · Frontal photograph · Intraoral
   * photograph" — which counted the very same photographs a second way on the same
   * screen: the tile head, the timeline chip and every reading of the viewer count
   * *positions out of nine*, so a visit holding four facial frames read "Frontal
   * photograph T1" here and "4 of 9 positions" 30cm to the left. One row now, per
   * visit, in positions ("T1 9/9 · T2 5/9"). The radiographs keep their type rows:
   * a film either is or is not on file, which is exactly what a type row says.
   */
  private renderCoverage = (groups: TimepointGroup<PatientRecord>[]) => {
    const held = IMAGE_TYPE_OPTIONS
      .filter(({ id }) => !isPhotographType(id))
      .map((option) => ({
        option,
        // Where it is held, in chronological order — the timeline's own order.
        at: groups
          .filter((group) => group.records.some((r) => r.type === option.id))
          .map((group) => group.label !== null
            ? getTimepointToken(group.label) : 'Unlabelled'),
      }));
    // …and the photographic series, per visit, as the composite itself counts it.
    const series = groups
      .map((group) => ({
        token: group.label !== null
          ? getTimepointToken(group.label) : 'Unlabelled',
        layout: buildPhotoSeries(group.records),
      }))
      .filter(({ layout }) => layout.total > 0);
    const onFile = held.filter(({ at }) => at.length > 0).length
      + (series.length > 0 ? 1 : 0);
    return (
      <aside className={classes.coverage} aria-label="What this case holds">
        <div className={classes.coverage_head}>
          <span className={classes.coverage_title}>Across all visits</span>
          <span className={classes.coverage_count}>
            {onFile} of {held.length + 1} on file
          </span>
        </div>
        <dl className={classes.coverage_list}>
          {held.map(({ option, at }) => {
            // Past four visits the tokens stop being a list and start being a
            // block: in a 244px pane, seven of them crushed "Lateral
            // cephalogram" to "Lɑ" with the T1 chip drawn over the glyph and the
            // word "cephalogram" wrapped underneath the chips. Four fit; beyond
            // that the run is stated as its ends and its count — the reading a
            // clinician actually wants from this pane ("at every visit from T1 to
            // T7") — with every visit named in the tooltip and, of course, on the
            // timeline itself.
            const isRun = at.length > 4;
            const shown = isRun
              ? [at[0], '…', at[at.length - 1]] : at;
            return (
              <div key={option.id} className={classes.coverage_row}>
                <dt className={classes.coverage_type}>{option.label}</dt>
                <dd
                  className={classes.coverage_at}
                  title={at.length > 0
                    ? `${option.label} on file at ${at.join(', ')}`
                    : undefined}
                >
                  {at.length > 0 ? shown.map((token, i) => (
                    token === '…' ? (
                      <span key={i} className={classes.coverage_run} aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <span key={i} className={classes.coverage_token}>{token}</span>
                    )
                  )) : (
                    <span className={classes.coverage_none}>Not on file</span>
                  )}
                  {isRun ? (
                    <span className={classes.coverage_count_at}>
                      {at.length} visits
                    </span>
                  ) : null}
                </dd>
              </div>
            );
          })}
          {this.renderCoverageSeries(series)}
        </dl>
        {/* The same standing this surface gives its empty slots: this is what is
            on file, not a checklist a case can fail. (One string, printed at the
            panel's foot on paper — see `COVERAGE_QUALIFIER`.) */}
        <p className={classes.coverage_note}>{COVERAGE_QUALIFIER}</p>
      </aside>
    );
  };

  /**
   * The photographic series' own row of the coverage pane: one row for the whole
   * series, per visit, counted in *positions* — the vocabulary the tile head, the
   * timeline chip and the photograph viewer all use ("T1 9/9 · T2 5/9 · T3 1/9").
   *
   * A visit that holds a photograph carrying no position counts it too, as `+n`:
   * "T2 0/9" beside a visit that plainly holds a photograph would be the pane
   * contradicting the tile, and the photograph is on file whether or not the record
   * says which frame it is.
   */
  private renderCoverageSeries = (
    series: Array<{ token: string | null; layout: PhotoSeriesLayout<PatientRecord> }>,
  ) => {
    const full = series.map(({ token, layout }) =>
      `${token !== null ? token : 'Unlabelled'} ${layout.filled} of 9 positions` +
      (layout.unplaced.length > 0
        ? ` and ${layout.unplaced.length} with no position recorded` : ''));
    // Past three visits the entries stop fitting a 244px pane as a list, so the run
    // is stated as its first three and its own count, with every visit named in the
    // tooltip (the rule the type rows above follow at four).
    const isRun = series.length > 3;
    const shown = isRun ? series.slice(0, 3) : series;
    return (
      <div key="photo_series" className={classes.coverage_row}>
        <dt className={classes.coverage_type}>Photographic series</dt>
        <dd
          className={classes.coverage_at}
          title={series.length > 0
            ? `Photographic series on file at ${full.join(', ')}`
            : undefined}
        >
          {series.length > 0 ? shown.map(({ token, layout }, i) => (
            <span key={i} className={classes.coverage_series}>
              <span className={classes.coverage_token}>
                {token !== null ? token : 'Unlabelled'}
              </span>
              <span className={classes.coverage_series_n}>
                {layout.filled}/9
                {layout.unplaced.length > 0 ? (
                  <span className={classes.coverage_series_extra}>
                    {`+${layout.unplaced.length}`}
                  </span>
                ) : null}
              </span>
            </span>
          )) : (
            <span className={classes.coverage_none}>Not on file</span>
          )}
          {isRun ? (
            <span className={classes.coverage_count_at}>
              {series.length} visits
            </span>
          ) : null}
        </dd>
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

  // ---- The case as one line of time ----------------------------------------

  /**
   * The treatment timeline: the whole case on one horizontal rail, above the
   * records panel that lists it.
   *
   * The vertical list below is the *record* — every file, its type, its scale,
   * its tracing, the actions that correct it. This band is the *chronology*, and
   * a chronology is read across: each visit is a stop carrying its timepoint, the
   * day it was captured, the patient's age on that day and its images as chips,
   * and the elapsed time between consecutive visits is written on the rail
   * between them. Six visits are then one glance instead of six rows.
   *
   * It is also where the one action that belongs to *two* timepoints lives.
   * "Superimpose" is not a property of a film, it is a property of an interval —
   * so the control sits on the interval, and it opens the superimposition view on
   * exactly the pair it is standing between (see `handleSuperimpose`). Where a
   * pair cannot be registered the control says which visit is short of a tracing
   * and what a registration needs, in the superimposition's own words.
   *
   * Degrades by construction: one visit drops the rail metaphor altogether and is
   * one compact line (there is no elapsed time to state and nothing to scroll);
   * two draw one interval; seven draw six, and the track scrolls sideways —
   * chevrons in its head, opened at the latest visit — rather than crushing the
   * stops.
   *
   * Screen only. On paper each visit prints its own stamp — label, day, age — in
   * the list below, and the running head carries the record's span, so a printed
   * band would restate every fact on the sheet and none of its controls could be
   * pressed.
   */
  private renderCaseBand = (groups: TimepointGroup<PatientRecord>[]) => {
    if (groups.length === 0) {
      return null;
    }
    // One visit is not a chronology, and a rail with one stop on it is not a
    // timeline: at 1440px the track was 1266px wide with a 116px stop hard left
    // in it and its explanatory sentence beneath, which reads as a rail that
    // failed to render rather than as a case with one visit on file. So the rail
    // metaphor is dropped entirely below two visits — the visit's own stamp on
    // one line, and the sentence that says what a second one would add beside
    // it — and the section is sized to that line instead of to a full-width
    // track. (The caption drops its second clause with the rail: the surface
    // must not instruct a reader to superimpose two visits directly above a
    // sentence saying a superimposition needs a second visit.)
    if (groups.length < 2) {
      return (
        <section
          className={cx(classes.band, classes.band__solo)}
          aria-label="Case timeline"
        >
          <div className={classes.band_head}>
            <h3 className={classes.band_title}>Case timeline</h3>
            <span className={classes.band_caption}>
              Every visit in order. Open a record from its chip.
            </span>
          </div>
          <div className={classes.band_solo}>
            {this.renderBandStop(groups[0], 0, 1)}
            <p className={classes.band_note}>
              One visit on file. An elapsed interval and a superimposition both
              need a second timepoint — file the next visit and they appear here.
            </p>
          </div>
        </section>
      );
    }
    // Whether *any* visit of this case covers more than one day. A stop states
    // its own span on a line of its own, and a line only some stops carry knocks
    // every row below it out of true: in a seven-visit case the one multi-day
    // visit pushed its age and its chips 16px below its neighbours', so the band
    // could no longer be read across as "the age at each visit" and "the films at
    // each visit". Where one stop carries the line they all reserve it (see
    // `.stop_span__ghost`), and where none does the row is not there at all.
    const hasAnySpan = groups.some(
      (g) => g.lastDate !== null && g.lastDate !== g.firstDate,
    );
    // …and the same rule for the stage line: where any visit of the case is filed
    // at a stage, every stop reserves the line it is written on (see
    // `renderBandStop`), so a case whose T2 is the only labelled visit does not
    // step its own dates, ages and chip rows out of true.
    const hasAnyStage = groups.some((g) => getVisitRest(g.label).text !== '');
    // Stops and intervals, interleaved: stop, gap, stop, gap, … stop. The first
    // and last child are always stops, which is what lets the rail stop at the
    // outermost nodes instead of running off both ends of the band.
    const cells: JSX.Element[] = [];
    groups.forEach((group, index) => {
      if (index > 0) {
        cells.push(this.renderBandGap(groups[index - 1], group));
      }
      cells.push(this.renderBandStop(
        group, index, groups.length, hasAnySpan, hasAnyStage,
      ));
    });
    const { hasBandStart, hasBandEnd } = this.state;
    const scrolls = hasBandStart || hasBandEnd;
    // The bracket is resolved before the caption is written, because the caption
    // names it: it stands down where the widest traced pair is one of the rail's
    // own intervals (see `renderBandSpan`), and a caption offering "the whole case
    // from the bracket below" over a rail with no bracket on it is the one false
    // sentence on the band.
    const span = this.renderBandSpan(groups);
    return (
      <section className={classes.band} aria-label="Case timeline">
        <div className={classes.band_head}>
          <h3 className={classes.band_title}>Case timeline</h3>
          <span className={classes.band_caption}>
            Every visit in order. Open a record from its chip; superimpose two
            visits from the interval between them
            {span !== null
              ? ', or the whole case from the bracket below.'
              : '.'}
          </span>
          {/* The rail is scrolled by a control, not only by a gesture. A styled
              `::-webkit-scrollbar` reserves no layout space and this browser
              does not paint it at all, so a seven-visit case offered the reader
              a 32px edge fade and shift+wheel — no target for a pointer and
              nothing at all on a touch screen. These are the record viewer's own
              prev/next chevrons, in its own idiom, and they are rendered only
              while there is case off one of the edges. */}
          {scrolls ? (
            <span className={classes.band_nav}>
              <button
                type="button"
                className={classes.band_nav_button}
                disabled={!hasBandStart}
                title={hasBandStart
                  ? 'Scroll back to the earlier visits'
                  : 'The first visit is already on screen'}
                aria-label="Scroll to earlier visits"
                onClick={this.scrollBand(-1)}
              >
                {/* The colour is handed over per state, never `currentColor`: a
                    mui SvgIcon resolves `currentColor` against its own theme
                    colour and not against the button, so a spent chevron kept a
                    full-strength mark in a disabled-grey button. */}
                <IconPrev
                  color={hasBandStart ? NAV_ICON : LAUNCH_ICON_OFF}
                  style={navIconStyle}
                />
              </button>
              <button
                type="button"
                className={classes.band_nav_button}
                disabled={!hasBandEnd}
                title={hasBandEnd
                  ? 'Scroll on to the later visits'
                  : 'The latest visit is already on screen'}
                aria-label="Scroll to later visits"
                onClick={this.scrollBand(1)}
              >
                <IconChevron
                  color={hasBandEnd ? NAV_ICON : LAUNCH_ICON_OFF}
                  style={navIconStyle}
                />
              </button>
            </span>
          ) : null}
        </div>
        {/* A six-visit case does not fit 1300px with its dates, its ages and a
            control on every interval, and shrinking the type until it does is
            not an answer on a clinical surface — so the rail scrolls sideways
            and *says* it does: a fade at whichever edge still has case behind
            it, measured off the track itself (see `updateStickyState`), and the
            chevrons above. Without it, T6 was simply cut mid-word with nothing to
            say a sixth visit existed. */}
        <div
          className={cx(classes.band_scroller, {
            [classes.band_scroller__more_start]: hasBandStart,
            [classes.band_scroller__more_end]: hasBandEnd,
          })}
        >
          <div
            className={classes.band_track}
            ref={this.setBandTrack}
            onScroll={this.updateStickyState}
          >
            {cells}
          </div>
        </div>
        {/* …and the comparison that belongs to the whole rail rather than to one
            of its intervals (see `renderBandSpan`). */}
        {span}
      </section>
    );
  };

  /** The films of a visit whose tracing can be registered, in the record's order. */
  private registrableIn = (
    group: TimepointGroup<PatientRecord>,
  ): PatientRecord[] => {
    const { launch } = this.props;
    return group.records.filter((record) => {
      const entry = launch[record.imageId];
      return entry !== undefined && entry.isRegistrable;
    });
  };

  /**
   * The whole case as one comparison: a bracket under the rail, spanning it end to
   * end, carrying the superimposition of the **first traced visit against the
   * latest**.
   *
   * This is the comparison a course of treatment is judged on — start against
   * finish — and until now it was the one comparison the timeline did not offer:
   * every control sat on an *adjacent* interval, so getting T1 → T3 meant opening
   * T1 → T2 and then changing a dropdown inside the superimposition view. The pair
   * is preselected exactly as an interval's is (`handleSuperimpose`), so the view
   * opens on the two films this bracket names.
   *
   * The pair is the outermost registrable films of the record — the earliest film
   * of the earliest visit that carries a registrable tracing, against the latest
   * film of the latest one — and it is *named*, never implied: where the record's
   * first visit is not yet traced the bracket says "T2 → T4" and its tooltip says
   * which visit was skipped and why, rather than quietly calling the second visit
   * the start of the case.
   *
   * Rendered from three visits on. With two, the single interval control between
   * them already **is** the full range, and a second control repeating it would be
   * two ways to do one thing 40px apart.
   */
  /**
   * The two visits the whole-case bracket names, or null where no bracket is drawn
   * — the first *traced* visit against the latest, falling back to the record's own
   * two ends where there is no traced pair to compare.
   *
   * One helper and not two readings, because the bracket's **label and its geometry
   * are the same claim**: its ticks are measured onto the stops of the visits it
   * names (see `measureBandSpanInset`), and computed separately the two drifted apart
   * — a bracket reading "T1 → T4" with its right tick under T5.
   */
  private bandSpanEnds = (
    groups: TimepointGroup<PatientRecord>[],
  ): {
    first: TimepointGroup<PatientRecord>;
    last: TimepointGroup<PatientRecord>;
    canSuperimpose: boolean;
  } | null => {
    if (groups.length < 3) {
      return null;
    }
    const traced = groups.filter((group) => this.registrableIn(group).length > 0);
    const canSuperimpose = traced.length >= 2;
    const first = canSuperimpose ? traced[0] : groups[0];
    const last = canSuperimpose
      ? traced[traced.length - 1] : groups[groups.length - 1];
    // …and the same suppression, arriving by the other route. The bracket stands
    // down at two visits because the single interval control between them already
    // *is* the full range; on a longer case the widest traced pair can turn out to
    // be adjacent anyway — three visits with T1 untraced leaves T2 → T3, which the
    // interval control 90px above this one opens exactly. Two ways to do one thing,
    // 90px apart, is the defect that rule exists to prevent, and it does not stop
    // being one because the case has a third visit on it.
    if (
      canSuperimpose &&
      groups.indexOf(last) - groups.indexOf(first) === 1
    ) {
      return null;
    }
    return { first, last, canSuperimpose };
  };

  private renderBandSpan = (groups: TimepointGroup<PatientRecord>[]) => {
    const ends = this.bandSpanEnds(groups);
    if (ends === null) {
      return null;
    }
    const { first, last, canSuperimpose } = ends;
    const traced = groups.filter((group) => this.registrableIn(group).length > 0);
    const t1 = canSuperimpose ? this.registrableIn(first)[0] : undefined;
    const lastFilms = canSuperimpose ? this.registrableIn(last) : [];
    const t2 = lastFilms[lastFilms.length - 1];
    // The figure is measured between the very two films the control opens, exactly
    // as an interval's is (see `renderBandGap`) — and, where there is no pair to
    // measure, between the ends of the record itself, which is what the identity
    // band's own span states.
    const fromDay = t1 !== undefined
      ? formatCaptureDate(t1.captureDate) : groups[0].firstDate;
    const toDay = t2 !== undefined
      ? formatCaptureDate(t2.captureDate) : groups[groups.length - 1].lastDate;
    const interval = formatInterval(
      parseCaptureDate(fromDay), parseCaptureDate(toDay),
    );
    const pair = `${bandName(first)} → ${bandName(last)}`;
    // Whether the bracket's pair is in fact the record's own two ends. Where it is
    // not, the reader is told which visits fall outside it rather than being left
    // to notice that the "whole case" control names T2.
    const skipped = canSuperimpose
      ? groups.filter((group) => (
        this.registrableIn(group).length === 0 &&
        (groups.indexOf(group) < groups.indexOf(first) ||
          groups.indexOf(group) > groups.indexOf(last))
      )).map(bandName)
      : [];
    const untracedNote = skipped.length > 0
      ? ` ${skipped.join(' and ')} ${skipped.length === 1 ? 'carries' : 'carry'} ` +
        'no tracing that can be registered, so the widest comparison on file is ' +
        `${pair}.`
      : '';
    const reason = canSuperimpose
      ? `Superimpose ${pair} — the first and the latest traced visit of this ` +
        `record${interval !== null ? `, ${interval} apart` : ''}.` +
        untracedNote +
        ' Opens with these two timepoints already selected; the registration and ' +
        'the pair can be changed there.'
      : `Needs two traced films at two different visits. A registration needs ` +
        `${registrationRequirement()}.`;
    const shortReason = canSuperimpose ? null
      : (traced.length === 1
        ? `only ${bandName(traced[0])} is traced`
        : 'no visit is traced yet');
    // Held in to the rail's own two ends, so the bracket's ticks fall on the stops
    // it brackets rather than on the panel's inner edges (see
    // `measureBandSpanInset`).
    const inset = this.state.bandSpanInset;
    return (
      <div
        className={classes.band_span}
        style={inset !== null
          ? { paddingLeft: inset.start, paddingRight: inset.end }
          : undefined}
      >
        <span
          className={cx(classes.band_span_arm, classes.band_span_arm__start)}
          aria-hidden="true"
        />
        <span className={classes.band_span_body}>
          {/* The label follows the pair, and not the intention: with the record's
              last visit untraced the bracket compares T1 → T2, and heading *that*
              "whole case" would be the one false statement on the rail. */}
          <span className={classes.band_span_label}>
            {skipped.length > 0 ? 'Widest on file' : 'Whole case'}
          </span>
          <span className={classes.band_span_pair}>{pair}</span>
          {interval !== null ? (
            <span
              className={classes.band_span_interval}
              title={`${fromDay} → ${toDay}`}
            >
              {interval}
            </span>
          ) : null}
          <span className={classes.gap_action} title={reason}>
            <button
              type="button"
              className={cx(classes.superimpose, {
                [classes.superimpose__off]: !canSuperimpose,
              })}
              aria-disabled={!canSuperimpose}
              aria-label={canSuperimpose
                ? `Superimpose ${pair} — first to latest`
                : `Superimpose first to latest — ${shortReason}`}
              onClick={canSuperimpose && t1 !== undefined && t2 !== undefined
                ? this.handleSuperimpose(t1.imageId, t2.imageId) : undefined}
            >
              <IconSuperimpose
                color={canSuperimpose ? SUPERIMPOSE_ICON : LAUNCH_ICON_OFF}
                style={launchIconStyle}
              />
              <span>Superimpose first ↔ latest</span>
            </button>
            {!canSuperimpose ? (
              <span className={classes.gap_reason}>{shortReason}</span>
            ) : null}
          </span>
        </span>
        <span
          className={cx(classes.band_span_arm, classes.band_span_arm__end)}
          aria-hidden="true"
        />
      </div>
    );
  };

  /**
   * One stop on the rail: a visit, everything the chronology says about it, and
   * its images as chips that open them.
   *
   * Every fact is the one the vertical timeline stamps for the same visit,
   * computed the same way — the day or the span it covers (never a borrowed
   * date), and the patient's age then, which is the number a norm and a growth
   * increment are read against. A visit whose images straddle a birthday states
   * both readings rather than picking one.
   *
   * A visit whose images span more than one day also states *how long* it spans,
   * and that figure is not decoration: the rail's intervals are measured from
   * the last day of one visit to the first day of the next (see `renderBandGap`),
   * so a multi-day visit's own span is the piece of the record that would
   * otherwise fall between the intervals and be stated nowhere.
   *
   * The band is read across as much as it is read along, so the stops keep their
   * rows in true: where any visit of the case carries a span line, every stop
   * reserves that line (`hasAnySpan`), and the ages and the chip rows stay level
   * across the whole rail.
   *
   * With one visit on file (`total === 1`) the rail metaphor is dropped: no axis,
   * no node, and the stamp is laid out as one line (see `.stop__solo`).
   */
  private renderBandStop = (
    group: TimepointGroup<PatientRecord>, index: number, total: number,
    hasAnySpan: boolean = false, hasAnyStage: boolean = false,
  ) => {
    const hasDate = group.firstDate !== null;
    const spansDays = group.lastDate !== null && group.lastDate !== group.firstDate;
    const ageFirst = this.getAgeOn(group.firstDate);
    const ageLast = this.getAgeOn(group.lastDate);
    const ageLabel = ageFirst === null ? null
      : (ageLast !== null && ageLast !== ageFirst
        ? `${ageFirst} – ${ageLast}` : ageFirst);
    // How much of the record's own span sits inside this one stop.
    const innerSpan = spansDays
      ? formatInterval(
        parseCaptureDate(group.firstDate), parseCaptureDate(group.lastDate),
      )
      : null;
    const label = group.label;
    // The pill carries the visit's *handle* — its series token, or the stage word
    // where the visit is filed at a stage without a number — and the line under it
    // carries everything the label says that the pill is not already showing (see
    // `utils/records#getVisitPill`). Taken as the label's first whitespace token,
    // a visit stored as "Debond and bonded retainer fitted" put "Debond" in the pill
    // and "Debond · and bonded retainer fitted" on the line 15px below it: one word
    // twice, and a mid-dot between a sentence and its own conjunction.
    const pill = getVisitPill(label);
    const rest = getVisitRest(label);
    const stageLine = rest.text;
    const isSolo = total === 1;
    return (
      <div
        key={`stop-${group.key !== '' ? group.key : '__untimepointed'}`}
        className={cx(classes.stop, { [classes.stop__solo]: isSolo })}
      >
        {/* The rail is painted by the axis row of each cell, and stops at the
            outermost nodes: the first stop paints only its right half, the last
            only its left. With a single stop there is no chronology to draw at
            all and the row is not rendered — the same rule the vertical timeline
            follows. */}
        {!isSolo ? (
          <span
            className={cx(classes.stop_axis, {
              [classes.stop_axis__start]: index === 0,
              [classes.stop_axis__end]: index === total - 1,
            })}
          >
            <span
              className={cx(classes.stop_dot, {
                // Filled for a visit whose day is on file, hollow for one that
                // carries no capture date: a label alone cannot be placed in
                // time.
                [classes.stop_dot__dated]: hasDate,
              })}
              aria-hidden="true"
            />
          </span>
        ) : null}
        <span
          className={cx(classes.timepoint, {
            // Muted where the pill is a fallback rather than the visit's own handle:
            // a label that carries neither a series nor a stage is not promoted to a
            // visit number here — what it *does* say is written out in full on the
            // line below, and the whole of it is in this element's tooltip.
            [classes.timepoint__unset]: pill.isUnset,
          })}
          title={label !== null ? label : 'These images carry no timepoint label'}
        >
          <span className={classes.timepoint_label}>{pill.token}</span>
        </span>
        {/* Which visit of the course of treatment this is — the fact the rail
            was missing. Every other surface of the app already carries it; the
            chronology did not. */}
        {stageLine !== '' ? (
          <span
            className={cx(classes.stop_stage, {
              [classes.stop_stage__staged]: rest.leadsWithStage,
            })}
            title={label !== null ? label : undefined}
          >
            {stageLine}
          </span>
        ) : (
          // Held open where a sibling visit is saying it, for the reason the span
          // line is (see `hasAnySpan`): a line only some stops carry knocks every
          // row below it out of true.
          hasAnyStage && !isSolo ? (
            <span
              className={cx(classes.stop_stage, classes.stop_stage__ghost)}
              aria-hidden="true"
            >
              &nbsp;
            </span>
          ) : null
        )}
        <span className={classes.stop_date}>
          {hasDate ? (
            spansDays ? `${group.firstDate} – ${group.lastDate}` : group.firstDate
          ) : (
            <span className={classes.stop_date__unset}>No capture date</span>
          )}
        </span>
        {/* The visit's own span, where it has one — stated as what it is, the
            distance between this visit's own images, and never as another leg of
            the rail: the intervals either side of a stop are measured to and from
            the films they compare, so this figure lies *inside* them and must not
            read as something to add to them. Without it a visit that covers four
            months was two dates and no duration on a band whose every other
            duration is written out. */}
        {innerSpan !== null ? (
          <span
            className={classes.stop_span}
            title={`The first and last image of this visit are ${innerSpan} ` +
              `apart — the label ${!pill.isUnset ? pill.token : 'here'} covers more ` +
              'than one day.'}
          >
            images {innerSpan} apart
          </span>
        ) : (
          // Nothing to say here, but the line is held open where a sibling visit
          // is saying it — otherwise the one multi-day stop steps its age and its
          // chips out of line with every other stop on the rail.
          hasAnySpan ? (
            <span
              className={cx(classes.stop_span, classes.stop_span__ghost)}
              aria-hidden="true"
            >
              &nbsp;
            </span>
          ) : null
        )}
        {ageLabel !== null ? (
          <span className={classes.stop_age}>
            <span className={classes.stop_age_key}>Age</span>
            <span className={classes.stop_age_value}>{ageLabel}</span>
          </span>
        ) : null}
        <span className={classes.stop_chips}>
          {/* One chip per radiograph, and *one* chip for the visit's whole
              photographic series (see `renderPhotosChip`). Named per frame, a
              visit that had its series taken carried a five-row cluster of ten
              chips restating exactly what the composite below the rail already
              states — and a re-shoot printed "Profile" twice with nothing to
              tell the two apart, each opening a different record. */}
          {group.records
            .filter(({ type }) => !isPhotographType(type))
            .map(this.renderBandChip)}
          {this.renderPhotosChip(group)}
        </span>
      </div>
    );
  };

  /**
   * One image of a visit, as a chip on the band: the type in its rail-sized
   * form, tinted by how far its tracing has got — the card chips' own three
   * readings (done, outstanding, never applicable), so the band can be scanned
   * for the film that still needs work.
   *
   * The chip opens the image, in the editor or in the read-only viewer according
   * to what the image is, and its tooltip states the whole of that before the
   * click: the full type, the day, the tracing, and where it will land.
   *
   * The image the surface *behind* this one is holding is marked "shown" — the
   * word, in the record viewer's own badge (`.context_current_tag`), not a blue
   * ring: a ring is what keyboard focus is, and drawn on the chip as well it left
   * a reader tabbing the rail unable to tell which film was on screen from which
   * film their cursor was on. The ring now belongs to `:focus-visible` alone.
   */
  /**
   * A visit's photographs, as one chip on the band: how much of the nine-frame
   * series it holds, opening the series itself in the photograph viewer.
   *
   * **Why one chip and not one per photograph.** The composite for this visit is
   * drawn 300px below the rail, cell by cell and frame by frame. Repeating it on
   * the rail as ten frame-named chips was the same data twice — and because two
   * photographs can honestly share a position (a re-shoot), two of those chips read
   * "Profile" and "Profile" side by side, opened different records, and gave a
   * reader no way to tell which was which. One chip states the count and opens the
   * reading where every one of them is reachable under ‹ ›.
   */
  private renderPhotosChip = (group: TimepointGroup<PatientRecord>) => {
    const photos = group.records.filter(({ type }) => isPhotographType(type));
    if (photos.length === 0) {
      return null;
    }
    const series = buildPhotoSeries(photos);
    const total = PHOTO_VIEW_OPTIONS.length;
    const isActive = photos.some(({ isActive: on }) => on);
    const title = [
      `Photographs · ${series.filled} of the ${total} series positions on file`,
      series.unplaced.length > 0
        ? (series.unplaced.length === 1
          ? '1 with no position recorded'
          : `${series.unplaced.length} with no position recorded`)
        : null,
      'view only, not analysable',
    ].filter((part) => part !== null).join(' · ') + (isActive
      ? ' — one of them is shown on the surface behind this one'
      : ' — open the visit’s photographic series');
    return (
      <button
        key="photos"
        type="button"
        className={cx(classes.bchip, classes.bchip__muted, {
          [classes.bchip__active]: isActive,
        })}
        title={title}
        aria-label={title}
        aria-current={isActive ? 'true' : undefined}
        onClick={this.handleOpenSeriesFromBand(group)}
      >
        {`Photos ${series.filled}/${total}`}
        {isActive ? (
          <span className={classes.bchip_shown}>shown</span>
        ) : null}
      </button>
    );
  };

  private renderBandChip = (record: PatientRecord) => {
    const { tone, phrase } = getTracingTone(record);
    const date = formatCaptureDate(record.captureDate);
    // A photograph is named by its *frame* where the record states one. Named by
    // its type, a visit that had its whole series taken read "Frontal · Frontal ·
    // Frontal · Profile · Intraoral · Intraoral · Intraoral" on the rail — seven
    // chips, three distinct words, and no way to tell which photograph a chip
    // opens. The type is still the first thing the tooltip says.
    const view = findPhotoView(record.photoView);
    const title = [
      getImageTypeLabel(record.type),
      view !== undefined ? view.label : null,
      date !== null ? date : 'no capture date',
      phrase,
    ].filter((part) => part !== null).join(' · ') + (record.isActive
      ? ' — shown on the surface behind this one'
      : (record.isTraceable
        ? ' — open in the tracing editor'
        : ' — open in the record viewer (view only)'));
    return (
      <button
        key={record.imageId}
        type="button"
        className={cx(classes.bchip, {
          [classes.bchip__ok]: tone === 'ok',
          [classes.bchip__partial]: tone === 'partial',
          [classes.bchip__todo]: tone === 'todo',
          [classes.bchip__muted]: tone === 'muted',
          // Marked with a word rather than tinted a fourth colour: the tracing
          // reading must survive.
          [classes.bchip__active]: record.isActive,
        })}
        title={title}
        aria-label={title}
        aria-current={record.isActive ? 'true' : undefined}
        onClick={this.handleOpen(record)}
      >
        {view !== undefined
          ? view.shortLabel : getImageTypeShortLabel(record.type)}
        {record.isActive ? (
          <span className={classes.bchip_shown}>shown</span>
        ) : null}
      </button>
    );
  };

  /**
   * The interval between two consecutive visits: the elapsed time, written on the
   * rail, and the action that belongs to it.
   *
   * **The interval is measured between the very two films the control will
   * open.** The rail used to read from the *first* day of the earlier visit
   * (`before.firstDate`) while the button handed the superimposition the earlier
   * visit's *last* registrable film — so on a visit whose images spanned four
   * months the rail and its tooltip said "4 mo apart" and the view they opened
   * printed "1 mo apart" for the same press. A control cannot state one interval
   * and open another: the pair is resolved first, and the figure is read off it.
   *
   * Where the pair cannot be resolved (nothing traced yet) the figure is the gap
   * between the visits themselves — the earlier visit's last day to the later
   * visit's first — which is the interval a reader can check against the two
   * stops either side of it, and which leaves a multi-day visit's own span to be
   * stated on its stop (see `renderBandStop`) rather than swallowed here.
   *
   * The elapsed figure itself comes from the app's one duration formatter, the
   * same one the superimposition's "… apart" prints, so one pair of dates cannot
   * read two ways on one screen. Where it cannot be measured at all the rail says
   * so in the band's own vocabulary for an absent fact ("interval unknown", the
   * stops' "No capture date"), never by falling silent: a blank rail beside a stop
   * that explicitly states what it is missing reads as a rendering fault.
   *
   * The control opens the superimposition on *these two* timepoints: the earlier
   * visit's latest registrable film against the later visit's earliest, i.e. the
   * two films closest to the interval it is standing on. Disabled, it prints the
   * short form of what is missing under the pill — the gap cell is 150–1000px of
   * empty rail, and a native `title` costs a 600ms hover, never prints and never
   * appears at all on a touch screen — and keeps the whole requirement, in the
   * superimposition's own words, in the tooltip.
   */
  private renderBandGap = (
    before: TimepointGroup<PatientRecord>, after: TimepointGroup<PatientRecord>,
  ) => {
    const earlier = this.registrableIn(before);
    const later = this.registrableIn(after);
    const t1 = earlier[earlier.length - 1];
    const t2 = later[0];
    const canSuperimpose = t1 !== undefined && t2 !== undefined;
    // The two days the figure is measured between, named — so the tooltip can
    // state them and nothing on this rail is a number with no referent.
    const pairFrom = canSuperimpose ? formatCaptureDate(t1.captureDate) : null;
    const pairTo = canSuperimpose ? formatCaptureDate(t2.captureDate) : null;
    const isPairDated = pairFrom !== null && pairTo !== null;
    const fromDay = isPairDated ? pairFrom : before.lastDate;
    const toDay = isPairDated ? pairTo : after.firstDate;
    const interval = formatInterval(
      parseCaptureDate(fromDay), parseCaptureDate(toDay),
    );
    const beforeName = bandName(before);
    const afterName = bandName(after);
    const pair = `${beforeName} → ${afterName}`;
    const missing = [
      t1 === undefined ? beforeName : null,
      t2 === undefined ? afterName : null,
    ].filter((n): n is string => n !== null);
    // "the unlabelled images" is a plural subject; a timepoint token is not.
    const needs = (name: string) => name.indexOf('the ') === 0
      ? `${name} need tracings` : `${name} needs a tracing`;
    // Null where the pair *is* registrable — there is nothing missing to name.
    const shortReason = canSuperimpose ? null
      : (missing.length === 2
        ? `${beforeName} and ${afterName} need tracings` : needs(missing[0]));
    const reason = canSuperimpose
      ? `Superimpose ${pair}` +
        (interval !== null ? ` — ${interval} apart` : '') +
        '. Opens with these two timepoints already selected; the registration ' +
        'and the pair can be changed there.'
      : (missing.length === 2
        ? 'Needs two traced films: neither ' + beforeName + ' nor ' + afterName +
          ' holds a lateral cephalogram whose tracing can be registered. A ' +
          `registration needs ${registrationRequirement()}.`
        : `Trace ${missing[0]} first — no film there carries a tracing that ` +
          `can be registered. A registration needs ${registrationRequirement()}.`);
    // Which visit is short of the day, so the missing interval names its own
    // cause rather than leaving the reader to hunt for it.
    const undatedSide = before.lastDate === null ? beforeName
      : (after.firstDate === null ? afterName : null);
    const intervalTitle = interval !== null
      ? `${fromDay} → ${toDay} — the elapsed time between ` + (isPairDated
        ? 'the two films this superimposition would compare.'
        : 'these two visits.')
      : (undatedSide !== null
        ? `${undatedSide} carries no capture date, so the time between these ` +
          'two visits cannot be measured. Add the day it was taken with Edit ' +
          'details on its card below.'
        : 'The dates on file do not measure the time between these two visits.');
    return (
      <div
        key={`gap-${after.key !== '' ? after.key : '__untimepointed'}`}
        // "interval unknown" is a wider figure than "1 y 4 mo": the cell is given
        // the room for it rather than letting the sentence run over the stop
        // beside it, and only where it is the sentence being written.
        className={cx(classes.gap, {
          [classes.gap__unknown]: interval === null,
        })}
      >
        <span className={classes.gap_axis}>
          <span
            className={cx(classes.gap_interval, {
              [classes.gap_interval__unset]: interval === null,
            })}
            title={intervalTitle}
          >
            {interval !== null ? interval : 'interval unknown'}
          </span>
        </span>
        {/* The tooltip is on the wrapper, not on the button: a browser fires no
            hover on a disabled control, so a `disabled` button's own title is
            never seen — the same construction the superimposition view uses for
            a registration basis its two films cannot supply. */}
        <span className={classes.gap_action} title={reason}>
          <button
            type="button"
            className={cx(classes.superimpose, {
              [classes.superimpose__off]: !canSuperimpose,
            })}
            aria-disabled={!canSuperimpose}
            aria-label={canSuperimpose
              ? `Superimpose ${pair}` : `Superimpose ${pair} — ${shortReason}`}
            onClick={canSuperimpose
              ? this.handleSuperimpose(t1.imageId, t2.imageId) : undefined}
          >
            <IconSuperimpose
              color={canSuperimpose ? SUPERIMPOSE_ICON : LAUNCH_ICON_OFF}
              style={launchIconStyle}
            />
            <span>Superimpose</span>
          </button>
          {/* Off, and why — on the surface, in the empty rail the ghost pill is
              standing in. The whole requirement stays in the tooltip above. */}
          {!canSuperimpose ? (
            <span className={classes.gap_reason}>{shortReason}</span>
          ) : null}
        </span>
      </div>
    );
  };

  // ---- Launching a view off a film -----------------------------------------

  /**
   * The ways out of a film's card: the tracing editor, the printable clinical
   * report, and the treatment simulation. One row per traceable film, in the
   * `.slots` idiom the visit's "Not filed" row already uses, so the surface has
   * one vocabulary for "here is a row of things you can press".
   *
   * Offered on traceable films only. A photograph has no report to print, no
   * tracing to simulate on, and its card opens it in the viewer already — a strip
   * with one live control repeating the card's own click would be filler.
   *
   * Nothing here is enabled on a promise: the report needs a tracing, and the
   * simulation needs an anatomical reference plane and one possible movement.
   * Each control that is off carries the sentence that says which, read from the
   * module that owns the rule (see `selectors#getRecordLaunch`).
   */
  private renderCardLaunch = (record: PatientRecord, identity: string) => {
    const entry = this.props.launch[record.imageId];
    if (!record.isTraceable || entry === undefined) {
      return null;
    }
    return (
      <div className={classes.launch}>
        <span className={classes.slots_label}>Open</span>
        <span className={classes.launch_list}>
          <LaunchAction
            label="Tracing editor"
            icon={<IconTrace color={LAUNCH_ICON} style={launchIconStyle} />}
            title={`Open ${identity} in the tracing editor`}
            isEnabled={true}
            onClick={this.handleOpen(record)}
          />
          <LaunchAction
            label="Clinical report"
            icon={(
              <IconReport
                color={entry.canReport ? LAUNCH_ICON : LAUNCH_ICON_OFF}
                style={launchIconStyle}
              />
            )}
            title={entry.reportReason}
            isEnabled={entry.canReport}
            onClick={this.handleOpenReport(record)}
          />
          <LaunchAction
            label="Simulation"
            icon={(
              <IconSimulate
                color={entry.canSimulate ? LAUNCH_ICON : LAUNCH_ICON_OFF}
                style={launchIconStyle}
              />
            )}
            title={entry.simulateReason}
            isEnabled={entry.canSimulate}
            onClick={this.handleOpenSimulation(record)}
          />
        </span>
      </div>
    );
  };

  /**
   * The offer to carry this film's calibration to the record's other films.
   *
   * Only where there is something to carry and somewhere to carry it: a calibrated
   * film, and at least one *uncalibrated* film of the same type at the same pixel
   * size (`getScalePropagationTargets` owns that rule and states why). So a
   * single-film record, a record already fully calibrated, and a record whose other
   * films came off a different export never see this row at all.
   *
   * It is an offer and nothing more — pressing it opens a dialog that names every
   * film it would change and the exact factor it would write (see
   * `ApplyScaleDialog`). Nothing here writes anything, and no scale is ever copied
   * without a clinician reading that list.
   */
  private renderCardCalibration = (record: PatientRecord) => {
    const targets = getScalePropagationTargets(this.props.records, record);
    // …and the films this card's own press has already written that scale onto,
    // for as long as they still carry it (see `appliedFrom`).
    const applied = this.appliedFrom(record);
    if (targets.length === 0 && applied.length === 0) {
      return null;
    }
    const scale = formatScale(record.scaleFactor as number);
    const count = targets.length === 1
      ? '1 film' : `${targets.length} films`;
    const appliedCount = applied.length === 1
      ? '1 film' : `${applied.length} films`;
    return (
      <div className={classes.propagate}>
        <span className={classes.slots_label}>Calibration</span>
        {targets.length > 0 ? (
          <button
            type="button"
            className={classes.propagate_action}
            title={`Apply ${scale} to the ${count} of this record that carry no ` +
              'scale and were exported at the same pixel size as the same type of ' +
              'image. Opens a list of them first — nothing is changed until you ' +
              'apply it, and a film that is already calibrated is never overwritten.'}
            onClick={this.openApplyScale(record)}
          >
            <IconScale color={SUPERIMPOSE_ICON} style={launchIconStyle} />
            <span>Apply {scale} to {count}</span>
          </button>
        ) : null}
        {/* The mirror of the press above, and the reason it exists: one press
            writes the scale onto N films, and the only way back was N trips into
            N tracing editors to press "Remove calibration" in each. It stands
            here for as long as those films carry this film's scale *as a copy of
            it* — read off the record itself (see `appliedFrom`), so it survives a
            trip into the editor and a reload of the project — and it goes through
            the same reviewable list: a batched write with no batched reversal is a
            one-way door. */}
        {applied.length > 0 ? (
          <button
            type="button"
            className={cx(classes.propagate_action, classes.propagate_action__undo)}
            title={`Take ${scale} back off the ${appliedCount} of this record ` +
              'that carry it as a copy of this film\u2019s calibration, putting ' +
              'each of them back to carrying no scale of its own. Opens the same ' +
              'list first, so a film you want to keep calibrated can be left ' +
              'ticked out of it. This film keeps its own calibration.'}
            onClick={this.openRemoveScale(record)}
          >
            <IconScale color={LAUNCH_ICON_OFF} style={launchIconStyle} />
            <span>Remove {scale} from {appliedCount}</span>
          </button>
        ) : null}
        <span className={classes.propagate_note}>
          {targets.length > 0
            ? 'same type, same pixel size, no scale of their own'
            : `copied from this film — ${appliedCount} still carrying it`}
        </span>
      </div>
    );
  };

  /**
   * The films that carry this film's scale **as a copy of it**, and which still
   * carry exactly that factor.
   *
   * Read off the record, not off this component's memory. Each copy stores the film
   * it came from in the same store entry as the number
   * (`PatientRecord#scaleSourceId`), so the offer to take the batch back is on the
   * card for as long as the copies are on file — through a trip into the tracing
   * editor, a superimposition, a print, a reload of the persisted project — instead
   * of until the next navigation, which is where it used to end while the dialog was
   * promising it unconditionally.
   *
   * Every clause of that sentence is still a guard. It is *this* film's scale (the
   * copies name it), it is that one factor (a film re-calibrated in the editor since
   * carries its own measurement and its provenance is cleared with it, so it drops
   * out of the offer), and the source itself must still hold a scale — take the
   * source's calibration off and there is nothing on this card for the control to
   * name.
   */
  private appliedFrom = (record: PatientRecord): PatientRecord[] => {
    const scale = record.scaleFactor;
    if (scale === null) {
      return [];
    }
    return this.props.records.filter(
      (r) => r.scaleSourceId === record.imageId && r.scaleFactor === scale,
    );
  };

  /**
   * The other way round: the film **this** film's scale was copied from, where it
   * was copied rather than measured — what the card's SCALE row is qualified by.
   *
   * Null where the copy's factor no longer matches the source's, because then the
   * two numbers are no longer one claim: a source re-calibrated since is a
   * measurement of its own film, and naming it beside a different figure here would
   * invite the reading that they agree. The record still holds the provenance; this
   * surface simply stops asserting a link between two numbers that differ.
   */
  private scaleCopiedFrom = (record: PatientRecord): PatientRecord | null => {
    if (record.scaleSourceId === null || record.scaleFactor === null) {
      return null;
    }
    const source = this.props.records.filter(
      (r) => r.imageId === record.scaleSourceId,
    )[0];
    return source !== undefined && source.scaleFactor === record.scaleFactor
      ? source : null;
  };

  private openApplyScale = (record: PatientRecord) => () =>
    this.setState({ applyScaleImageId: record.imageId });

  private closeApplyScale = () => this.setState({ applyScaleImageId: null });

  private openRemoveScale = (record: PatientRecord) => () =>
    this.setState({ removeScaleImageId: record.imageId });

  private closeRemoveScale = () => this.setState({ removeScaleImageId: null });

  /**
   * Write the reviewed scale onto the films that were ticked, then close. The
   * dashboard stays where it is: the cards the scale landed on re-read their own
   * chips from the store, so the change is visible on the surface that asked for
   * it rather than in an editor the clinician has to go and find.
   *
   * What was written is remembered **on each film it was written to** — the source's
   * image id goes into the same store entry as the number — which is what lets the
   * same gesture be taken back from the card that made it for as long as the copies
   * are on file, rather than until the next navigation.
   */
  private handleApplyScale = (
    imageIds: string[], scaleFactor: number, sourceImageId: string,
  ) => {
    this.props.onApplyScale(imageIds, scaleFactor, sourceImageId);
    this.setState({ applyScaleImageId: null });
  };

  /**
   * Take the reviewed scale back off the films that were ticked — the same
   * dispatch the tracing toolbar's own "Remove calibration" makes, once per film,
   * through the list the clinician has just read.
   *
   * Films left unticked keep the scale, so the offer is narrowed to what is still
   * on file rather than dropped: a clinician who takes it off two of three films
   * can still take it off the third.
   */
  private handleRemoveScale = (imageIds: string[]) => {
    this.props.onRemoveScale(imageIds);
    // Nothing to narrow by hand: clearing a film's scale clears its provenance with
    // it, so the offer is re-derived from what is still on file and a clinician who
    // takes the scale off two of three films is still offered the third.
    this.setState({ removeScaleImageId: null });
  };

  /**
   * The three views this surface launches, each opened on the record the
   * dashboard was pointing at rather than on whatever the editor behind it holds
   * — which is the whole reason they are rendered here: opening T2's report from
   * T2's card must report T2.
   *
   * They are the editor toolbar's own connected components, unchanged, and each
   * is a fixed full-screen surface of its own; the dashboard stays mounted behind
   * so closing one lands back on the chart at the same scroll position.
   */
  private renderLaunchedViews = () => {
    const { reportImageId, simulationImageId, superimposePair } = this.state;
    return (
      <div>
        {reportImageId !== null ? (
          <ClinicalReport
            imageId={reportImageId}
            onRequestClose={this.closeReport}
          />
        ) : null}
        {simulationImageId !== null ? (
          <TreatmentSimulation
            imageId={simulationImageId}
            onRequestClose={this.closeSimulation}
          />
        ) : null}
        {superimposePair !== null ? (
          <Superimposition
            initialT1Id={superimposePair.t1Id}
            initialT2Id={superimposePair.t2Id}
            onRequestClose={this.closeSuperimposition}
          />
        ) : null}
      </div>
    );
  };

  private handleOpenReport = (record: PatientRecord) => () =>
    this.setState({ reportImageId: record.imageId });

  private closeReport = () => this.setState({ reportImageId: null });

  private handleOpenSimulation = (record: PatientRecord) => () =>
    this.setState({ simulationImageId: record.imageId });

  private closeSimulation = () => this.setState({ simulationImageId: null });

  /**
   * Start a superimposition on a named pair. The two ids seed the view's own
   * T1/T2 selection and nothing more — its pickers, its registration bases and
   * its export all behave exactly as they do when it is opened from the editor.
   */
  private handleSuperimpose = (t1Id: string, t2Id: string) => () =>
    this.setState({ superimposePair: { t1Id, t2Id } });

  private closeSuperimposition = () => this.setState({ superimposePair: null });

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
    // The pill carries the visit's handle — its series token ("T2" out of "T2
    // mid-treatment"), or the stage word where the visit is filed at a stage
    // without a number — and the rest of the label is written beside it. Read
    // through the same helper the case timeline's stops use
    // (`utils/records#getVisitPill`), so one visit is named one way on both
    // surfaces. Set whole in the pill, a free-text label pushed the timepoint's
    // node off the timeline's rail; ellipsised in the pill, half of what the
    // clinician typed was simply not on the page.
    const pill = getVisitPill(label);
    const rest = getVisitRest(label).text;
    // On paper the visit's name is *one* run of text at one weight. Split into a
    // reversed-out pill and a grey note beside it, a free-text label printed as
    // two severed facts — a blue "Pre-treatment" with "records, orthognathic
    // workup, second opinion" falling out below it in another colour and weight,
    // which reads as a timepoint plus an unrelated remark. The slots row below
    // and the trend's cells then named the same visit two further ways.
    const visitName = label !== null ? label.trim() : 'No timepoint label';
    // How long after the previous visit this one was taken. The elapsed interval
    // between consecutive stops is the case timeline's own figure on screen, and
    // the band is a screen device (see the print block) — so on paper each visit
    // carries its own interval here. On a growth case it is what every change in
    // the chart is read against, and it printed nowhere.
    const previous = index > 0 ? groups[index - 1] : undefined;
    const sinceLabel = previous !== undefined
      ? formatInterval(
        parseCaptureDate(previous.lastDate !== null
          ? previous.lastDate : previous.firstDate),
        parseCaptureDate(group.firstDate),
      )
      : null;
    const sinceFrom = previous !== undefined ? bandName(previous) : null;
    // The visit's photographs are laid out as the composite series a clinic
    // shoots; its films stay cards, because a cephalogram is read one at a time
    // and carries a scale, a tracing and its own launch actions.
    //
    // Only a *labelled* visit gets the tile. An untimepointed photograph's problem
    // is not which frame of the series it is — it is that it belongs to no visit,
    // and the card is what carries the one control that fixes that ("File this
    // at", see `renderRecord`). A composite of images that are not a visit would
    // be a series with no place in the chronology.
    const isSeries = group.label !== null;
    const photos = isSeries
      ? group.records.filter(({ type }) => isPhotographType(type)) : [];
    const cards = isSeries
      ? group.records.filter(({ type }) => !isPhotographType(type))
      : group.records;
    // Something to compare against: another visit of this record with
    // photographs on file. Offered on the tile, never on a case of one visit.
    const canCompare = groups.some(
      (other) => other.key !== group.key &&
        other.records.some(({ type }) => isPhotographType(type)),
    );
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
              [classes.timepoint__unset]: pill.isUnset,
            })}
            title={label !== null ? label : 'These images carry no timepoint label'}
          >
            <span className={classes.timepoint_label}>{pill.token}</span>
          </span>
          {rest !== '' ? (
            <span className={classes.group_note} title={label !== null ? label : undefined}>
              {rest}
            </span>
          ) : null}
          {/* Paper only: the whole label, once, in one run of type (see
              `visitName` above and `.group_visit_print`). */}
          <span className={classes.visit_print}>{visitName}</span>
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
          {/* Paper only: how long after the previous visit this one was taken.
              On screen the rail between two stops carries exactly this figure. */}
          {sinceLabel !== null && sinceFrom !== null ? (
            <span className={classes.group_since}>
              +{sinceLabel} from {sinceFrom}
            </span>
          ) : null}
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
          {cards.map(
            (record) => this.renderRecord(record, group, groups),
          )}
          {/* …the visit's photographs, as the composite series they are shot as
              rather than as one row per file (see `PhotoSeries`). */}
          {photos.length > 0 ? (
            <div className={classes.photos}>
              <PhotoSeries
                group={group}
                records={photos}
                canCompare={canCompare}
                onOpenPhoto={this.handleOpenPhoto(group)}
                onFill={this.handleFillPhotoSlot(group)}
                onCompare={this.handleComparePhotos(group)}
                onEdit={this.handleEditRecord}
                onOpenStack={this.handleOpenPhotoStack(group)}
                onAddBatch={this.handleAddPhotoBatch(group)}
              />
            </div>
          ) : null}
          {/* …and the visit closes with what it has not got. */}
          {this.renderGroupSlots(group, groups)}
        </div>
        {/* Paper only, and only under the record's last visit: the panel's
            tallies and the two notes its claims are made under. They print here
            rather than after the list because a visit's group is an unbreakable
            box on paper and a bar that tallies the films has to stay with them —
            see `renderPrintRecordsTail`. */}
        {index === groups.length - 1
          ? this.renderPrintRecordsTail(groups) : null}
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
    // Whether this film's scale was measured on it or copied from another film of
    // the record, and from which (see `scaleCopiedFrom`).
    const copiedFrom = this.scaleCopiedFrom(record);
    const copiedName = copiedFrom !== null
      ? (getTimepointToken(copiedFrom.timepoint) ||
        getImageTypeShortLabel(copiedFrom.type))
      : null;
    const copiedDay = copiedFrom !== null
      ? formatCaptureDate(copiedFrom.captureDate) : null;
    const copiedLabel = copiedName !== null
      ? `copied from ${copiedName}${copiedDay !== null ? ` · ${copiedDay}` : ''}`
      : undefined;
    const copiedTitle = copiedName !== null
      ? `This film was not calibrated against a distance measured on it: the ` +
        `scale was copied from ${copiedName}` +
        `${copiedDay !== null ? ` (${copiedDay})` : ''}, which was — same image ` +
        'type, same pixel size, so the same millimetres per pixel. Calibrate this ' +
        'film from its own tracing toolbar to measure it independently.'
      : undefined;
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
                  {record.isCalibrated ? 'Calibrated' : 'Not calibrated'}
                  {/* Screen only. On paper the same card already carries the
                      amber "film 83 × 100 mm" that *is* the evidence, and the
                      panel's closing note says once what an implausible scale
                      fails against and what it costs (see
                      `renderRecordsNotes`) — so the sheet stated the caveat
                      three times per film and explained it nowhere. The chip
                      keeps its amber, which is what makes the film findable in
                      a stack of sheets. */}
                  {record.isCalibrated && isScaleSuspect ? (
                    <span className={classes.chip_more}>{'· check scale'}</span>
                  ) : null}
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
            {/* The scale leads this column, and the pixel size follows it quietly.
                Set the other way round and at one weight, the *file's* dimensions
                were the first and boldest thing in the card's right-hand column —
                above the one reading in it that decides whether a millimetre on
                this film is real. A clinician assessing a record does not read
                800 × 960 first. */}
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
            {/* …and where the number came from, where it did not come from this
                film. A calibration marked against a ruler on this radiograph and one
                carried over from a sibling film are not the same claim, and without
                this the record could not tell them apart: after propagating, T2's
                card read "SCALE 0.25 mm/px" exactly as T1's did — the film that was
                actually measured — on screen, in the closing tally and on the
                printed sheet, for the life of the record. It is stated the way
                "film 83 × 100 mm" already qualifies the number: quietly, on the
                SCALE row, in the same words the CALIBRATION row above uses. */}
            {record.isTraceable ? (
              <FactRow
                label="Scale"
                value={record.scaleFactor !== null
                  ? formatScale(record.scaleFactor) : null}
                note={filmSize !== null ? `film ${filmSize.label}` : undefined}
                origin={copiedFrom !== null ? copiedLabel : undefined}
                originTitle={copiedFrom !== null ? copiedTitle : undefined}
                isNoteWarn={isScaleSuspect}
              />
            ) : null}
            <FactRow
              label="Pixels"
              value={record.width !== null && record.height !== null
                ? `${record.width} × ${record.height}`
                : null}
              isQuiet
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
        {/* …and the ways out of this screen for this film: its editor, its
            clinical report, its treatment simulation. Traceable films only, and
            every control that is off explains itself. */}
        {this.renderCardLaunch(record, identity)}
        {/* …and the one act that belongs to this film's *scale* rather than to
            the film: carrying it to the record's other uncalibrated films of the
            same type and pixel size. */}
        {this.renderCardCalibration(record)}
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
      applyScaleImageId, removeScaleImageId, photoViewer, photoBatch,
    } = this.state;
    // The visit the batch is filed into, as the page itself groups it — so the
    // dialog reports what is already on file at that visit off the same reading.
    const batchGroup = photoBatch !== null && photoBatch.groupKey !== null
      ? groupRecordsByTimepoint(records).filter(
        (g) => g.key === photoBatch.groupKey,
      )[0]
      : undefined;
    const editing = records.filter((r) => r.imageId === editingImageId)[0];
    const removing = records.filter((r) => r.imageId === removingImageId)[0];
    const scaleSource = records.filter(
      (r) => r.imageId === applyScaleImageId,
    )[0];
    const unscaleSource = records.filter(
      (r) => r.imageId === removeScaleImageId,
    )[0];
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
            photoView: editing.photoView,
          } : {
            type: null, timepoint: null, captureDate: null, photoView: null,
          }}
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
        {/* Carrying one film's scale to the record's other films — the reviewable
            list of exactly what would change (see `ApplyScaleDialog`). The targets
            are re-derived from the store on every render, so a film calibrated in
            the meantime drops off the list rather than being written over. */}
        <ApplyScaleDialog
          open={scaleSource !== undefined}
          source={scaleSource !== undefined ? scaleSource : null}
          targets={scaleSource !== undefined
            ? getScalePropagationTargets(records, scaleSource) : []}
          onApply={this.handleApplyScale}
          onCancel={this.closeApplyScale}
        />
        {/* …and the mirror of it: the same list, the same review, the reverse
            write. The set is re-derived from the store on every render, so a film
            re-calibrated in the meantime is not offered for clearing. */}
        {/* The photographs' viewer: one photograph enlarged, one position across
            the visits, or two visits' whole series. It is handed the record's
            grouping (the same reading the page itself is drawn from) and this
            surface's own age derivation, so a caption in it and a visit stamp
            behind it cannot state two ages for one day. */}
        <PhotoViewer
          open={photoViewer !== null}
          target={photoViewer}
          groups={groupRecordsByTimepoint(records)}
          getAgeOn={this.getAgeOn}
          onClose={this.closePhotoViewer}
          onOpenRecord={this.handleOpenPhotoRecord}
          onEdit={this.handleEditPhoto}
          onRemove={this.handleRemovePhoto}
        />
        {/* Filing a visit's photographic series — one act for the whole sitting,
            with every frame proposed in series order and editable first. It is
            also the path that *starts* a series, so the first photograph of a
            visit is filed at a named frame like the ninth is. */}
        <AddPhotoSeries
          open={photoBatch !== null}
          timepoint={photoBatch !== null ? photoBatch.timepoint : null}
          captureDate={photoBatch !== null ? photoBatch.captureDate : null}
          age={photoBatch !== null ? this.getAgeOn(photoBatch.captureDate) : null}
          group={batchGroup !== undefined ? batchGroup : null}
          initialFiles={photoBatch !== null ? photoBatch.files : null}
          onClose={this.closeSeriesDialog}
          onFile={this.handleFilePhotoBatch}
          onFillOne={this.handleFillPhotoSlotAt}
          onOpenPhoto={this.handleOpenPhotoFromDialog}
        />
        <ApplyScaleDialog
          mode="remove"
          open={unscaleSource !== undefined}
          source={unscaleSource !== undefined ? unscaleSource : null}
          targets={unscaleSource !== undefined
            ? this.appliedFrom(unscaleSource) : []}
          onApply={this.handleApplyScale}
          onRemove={this.handleRemoveScale}
          onCancel={this.closeRemoveScale}
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
   * Print the sheet. The paper is this surface itself — its `@media print` rules
   * lay the records out on A4 and hide the screen chrome — so there is nothing to
   * open first, exactly as in the report and the superimposition.
   *
   * The scrollport is put back to the top before the dialog opens. The printed
   * flow is the whole list regardless of where the screen was scrolled to, but a
   * browser paints the print preview's first sheet from the live layout, and a
   * sheet whose preview opens mid-list reads as though the top of the chart were
   * missing.
   */
  private handlePrint = () => {
    if (this.scrollRef !== null) {
      this.scrollRef.scrollTop = 0;
    }
    window.print();
  };

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
    // A type slot names a type, so the frame it proposes is that type's usual one
    // (a profile photograph *is* the profile frame); the series tile's cells name
    // the frame itself. Either way it is on screen in the upload form, editable
    // before anything is filed.
    photoView: getDefaultPhotoView(type),
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
      photoView: getDefaultPhotoView(type),
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
    // Filing an image onto a visit changes *when* it was taken, not what it is:
    // its series position is carried over untouched.
    photoView: record.photoView,
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

  // ---- The photographic series ----------------------------------------------

  /**
   * Enlarge one photograph of a visit — in the photograph viewer, which is a way
   * of *looking*: it opens on the frame that was pressed and offers the two
   * comparisons beside it. Nothing about it offers tracing or an analysis; a
   * photograph is not traced by this app, and the viewer says so on every reading.
   */
  private handleOpenPhoto = (group: TimepointGroup<PatientRecord>) =>
    (record: PatientRecord) => this.setState({
      photoViewer: {
        mode: 'single',
        imageId: record.imageId,
        view: record.photoView,
        groupKey: group.key,
      },
    });

  /**
   * File an upload at exactly one position of one visit's series — the empty
   * cell's own act, on the very path the type slots use (`handleFillSlot`): the
   * upload form opens already stating the frame, the type that frame belongs to,
   * the visit and the visit's day, all of them editable before a file is chosen.
   */
  private handleFillPhotoSlot = (group: TimepointGroup<PatientRecord>) =>
    (view: PhotoViewOption) =>
      this.props.onAddImage(this.props.emptyWorkspaceId, {
        type: view.imageType,
        timepoint: group.label,
        captureDate: group.firstDate,
        photoView: view.id,
      });

  /**
   * Compare this visit's photographs with the record's others. `view` is the
   * position to open on, or null for "whichever position this record actually
   * holds" (see `PhotoViewer#seed`) — the tile's own "Compare visits" passes null.
   */
  private handleComparePhotos = (group: TimepointGroup<PatientRecord>) =>
    (view: PhotoView | null) => this.setState({
      photoViewer: {
        mode: 'position',
        imageId: null,
        view,
        groupKey: group.key,
      },
    });

  /**
   * The band's own photographs chip: the visit's series, opened on its first
   * photograph with the walk set to that visit — ‹ › then steps through every one
   * of them, including a re-shoot filed at an occupied position.
   */
  private handleOpenSeriesFromBand = (group: TimepointGroup<PatientRecord>) =>
    () => {
      const photos = group.records.filter(({ type }) => isPhotographType(type));
      const layout = buildPhotoSeries(photos);
      let first: PatientRecord | undefined;
      layout.rows.forEach(({ cells }) => {
        cells.forEach(({ record }) => {
          if (first === undefined && record !== null) {
            first = record;
          }
        });
      });
      const open = first !== undefined ? first : layout.unplaced[0];
      if (open === undefined) {
        return;
      }
      this.setState({
        photoViewer: {
          mode: 'single',
          imageId: open.imageId,
          view: open.photoView,
          groupKey: group.key,
          scope: 'visit',
        },
      });
    };

  /**
   * The several photographs filed at one position of one visit — what a cell's
   * `+N` badge opens. The enlarged reading walks the stack, so the count is a way
   * in rather than a claim that a second photograph exists somewhere unreachable.
   */
  private handleOpenPhotoStack = (group: TimepointGroup<PatientRecord>) =>
    (view: PhotoViewOption, record: PatientRecord) => this.setState({
      photoViewer: {
        mode: 'single',
        imageId: record.imageId,
        view: view.id,
        groupKey: group.key,
        scope: 'stack',
      },
    });

  private closePhotoViewer = () => this.setState({ photoViewer: null });

  // ---- Filing a whole photographic series ------------------------------------

  /**
   * Open the series filing dialog on a visit. `files` are the files of a drop that
   * landed on that visit's series tile, where that is how it was opened.
   */
  private handleOpenSeriesDialog = (
    timepoint: string | null, captureDate: string | null,
    groupKey: string | null, files: File[] | null,
  ) => () => this.setState({
    photoBatch: { timepoint, captureDate, groupKey, files },
  });

  /** The series tile's own "Add photographs", and a drop anywhere on that tile. */
  private handleAddPhotoBatch = (group: TimepointGroup<PatientRecord>) =>
    (files: File[] | null) => this.setState({
      photoBatch: {
        timepoint: group.label,
        captureDate: group.firstDate,
        groupKey: group.key,
        files,
      },
    });

  private closeSeriesDialog = () => this.setState({ photoBatch: null });

  /**
   * File the reviewed batch. Each photograph lands on its own rail tile with the
   * record details the dialog showed — and the dashboard *stays on screen*: a
   * sitting's photographs are filed without once leaving the surface they were
   * filed from, which is the whole reason this path exists.
   *
   * **One at a time, and why.** The rail refuses to create a second empty tile
   * while an empty one exists (`store/middleware/workspaceManager`) — that is what
   * keeps the ghost-tile button from stacking blank tiles. Fired in one tick, the
   * second and later photographs of a batch therefore asked for tiles that were
   * never created and their imports landed on nothing. So the batch is a queue: one
   * photograph is filed, and the next goes as soon as it has arrived as a record
   * (`componentDidUpdate`), which is also when the tile it needs is free to be
   * made.
   */
  private handleFilePhotoBatch = (
    entries: Array<{ file: File; meta: ImageRecordMeta }>,
  ) => {
    if (entries.length === 0) {
      return;
    }
    this.setState({ photoQueue: entries.slice(1) });
    this.props.onAddPhotographs(this.props.emptyWorkspaceId, [entries[0]]);
    this.armPhotoQueue();
  };

  /** The next photograph of the batch. */
  private pumpPhotoQueue = () => {
    const next = this.state.photoQueue[0];
    if (next === undefined) {
      return;
    }
    this.setState((state) => ({ photoQueue: state.photoQueue.slice(1) }));
    this.props.onAddPhotographs(this.props.emptyWorkspaceId, [next]);
    this.armPhotoQueue();
  };

  /**
   * …and the timer that keeps the queue moving when a photograph never arrives (an
   * unreadable file, say): the rest of the sitting is filed rather than silently
   * dropped, and nothing is ever filed twice — the queue is shortened as each
   * photograph is dispatched, not as it arrives.
   */
  private armPhotoQueue = () => {
    if (this.photoQueueTimer !== null) {
      window.clearTimeout(this.photoQueueTimer);
    }
    this.photoQueueTimer = window.setTimeout(() => {
      this.photoQueueTimer = null;
      if (this.state.photoQueue.length > 0) {
        this.pumpPhotoQueue();
      }
    }, 6000);
  };

  /**
   * One named frame the long way, from inside the dialog: the upload form, on the
   * very path the series tile's own empty cells take (`handleFillPhotoSlot`).
   */
  private handleFillPhotoSlotAt = (view: PhotoViewOption) => {
    const { photoBatch } = this.state;
    this.setState({ photoBatch: null });
    this.props.onAddImage(this.props.emptyWorkspaceId, {
      type: view.imageType,
      timepoint: photoBatch !== null ? photoBatch.timepoint : null,
      captureDate: photoBatch !== null ? photoBatch.captureDate : null,
      photoView: view.id,
    });
  };

  /** …and a photograph already on file, enlarged — the dialog closes behind it. */
  private handleOpenPhotoFromDialog = (record: PatientRecord) => {
    const { photoBatch } = this.state;
    this.setState({
      photoBatch: null,
      photoViewer: {
        mode: 'single',
        imageId: record.imageId,
        view: record.photoView,
        groupKey: photoBatch !== null ? photoBatch.groupKey : null,
        scope: 'visit',
      },
    });
  };

  /**
   * Open a photograph in the app's read-only record viewer — the same path a
   * card's own press takes, with the photograph viewer closed behind it so the
   * clinician does not land back inside a dialog on the way out.
   */
  private handleOpenPhotoRecord = (record: PatientRecord) => {
    this.setState({ photoViewer: null });
    this.props.onOpenRecord(record);
  };

  /**
   * Correct / drop a photograph from the viewer: the record's own dialogs, which
   * this surface already owns. The viewer closes first — two stacked modals over a
   * records chart is not a review, it is a pile.
   */
  private handleEditPhoto = (record: PatientRecord) =>
    this.setState({ photoViewer: null, editingImageId: record.imageId });

  private handleRemovePhoto = (record: PatientRecord) =>
    this.setState({ photoViewer: null, removingImageId: record.imageId });

  /** The same dialog a card's pencil opens, taken by record rather than curried. */
  private handleEditRecord = (record: PatientRecord) =>
    this.setState({ editingImageId: record.imageId });

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
  { label, value, note, origin, originTitle, isNoteWarn = false,
    isQuiet = false }: {
    label: string;
    value: string | null;
    note?: string;
    /**
     * Where the value came from, where that is not this film — "copied from T1 ·
     * 2024-04-10" under a scale carried over from another film of the record.
     *
     * Its own line inside the row rather than a third clause on it: the technicals
     * column is one width for the whole page (see `.card_tech`), and a second
     * qualifier on the SCALE line would have widened one card's column and left the
     * panel with a ragged rule down its middle.
     */
    origin?: string;
    originTitle?: string;
    isNoteWarn?: boolean;
    /**
     * Secondary metadata: a fact about the *file* rather than about the film.
     * The pixel size is the only one — it belongs on the card (a 400 × 480 export
     * is worth knowing about) and it is not a clinical reading, so it must not be
     * set at the weight of the mm/px scale beside it, let alone at the weight of
     * the radiograph itself.
     */
    isQuiet?: boolean;
  },
) => {
  if (value === null) {
    return null;
  }
  return (
    <span className={cx(classes.fact, { [classes.fact__quiet]: isQuiet })}>
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
      {origin !== undefined ? (
        <span className={classes.fact_origin} title={originTitle}>
          {origin}
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
