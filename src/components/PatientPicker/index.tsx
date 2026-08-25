import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import IconButton from 'material-ui/IconButton';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconSearch from 'material-ui/svg-icons/action/search';
import IconLock from 'material-ui/svg-icons/action/lock-outline';
import IconPersonOutline from 'material-ui/svg-icons/social/person-outline';
import IconArrow from 'material-ui/svg-icons/hardware/keyboard-arrow-right';
import IconChevronLeft from 'material-ui/svg-icons/hardware/keyboard-arrow-left';
import IconChevronRight from 'material-ui/svg-icons/hardware/keyboard-arrow-right';

import Props from './props';

// Restoring a case from the one file it leaves this device in — the other way
// onto this screen, and the only way in on a machine that has never seen the
// case. @see ./RestoreFromCaseFile
import RestoreFromCaseFile from './RestoreFromCaseFile';
import { PatientDetails } from 'components/PatientFields';

// The registration fields live with the edit-patient form so both surfaces ask
// for demographics in exactly one way — see components/PatientFields.
import {
  PatientTextField,
  DateOfBirthField,
  SexField,
  FieldLabelSpacer,
  validatePatientDetails,
  PatientDetailsError,
} from 'components/PatientFields';

import {
  formatAgeShort, formatSexShort, formatSexFull, getAgeInYears,
} from 'utils/patient';
// The app's one date formatter (ISO `YYYY-MM-DD`), so a date is echoed in exactly
// the form every other screen — and the printed report — states it in.
import {
  formatDisplayDate, formatInterval, getImageTypeLabel, getTodayISO,
  parseCaptureDate,
} from 'utils/records';
// How a saved case is read: its tracing state, how long ago the last visit was,
// and the words for both. Shared with the records dashboard's vocabulary.
import {
  CaseTracingStatus,
  VisitRecency,
  RECENCY_MONTHS,
  getCaseTracingStatus,
  compareCaseTracing,
  getCaseTracingLabel,
  getCaseTracingTitle,
  getVisitRecency,
  formatVisitAge,
} from 'utils/caseSummary';

// The printed page's own plumbing, from the view that established it: the same
// font stack in the `@page` margin boxes, the same string escaping, and the date
// form a *document* of this app states as its own — so a case list and a case
// sheet filed in the same chart cannot date and number their sheets two ways.
// @see RecordsDashboard#renderPrintPageStyle, which this mirrors.
import { PRINT_FONT, cssString, documentDate } from 'components/ClinicalReport';

const classes = require('./style.scss');

/**
 * The patient picker is the practice's **case list**.
 *
 * A clinic that has been using this app for a year has hundreds of cases, and the
 * question it opens the app with is never "which of these two patients is it" —
 * it is "which cases are still untraced", "who was in this quarter", "where is
 * chart C-0412". So the list is a table: sortable on every column it shows,
 * filterable on sex, tracing state and last-visit recency, searchable by name and
 * chart ID, and paged so a thousand cases cost the same to render as ten.
 *
 * What each row can show beyond the demographics — images on file, visits, the
 * last visit, how far the tracing has got, a thumbnail of the newest film — is
 * read from the case index (@see PatientCaseSummary), which is counted off each
 * patient's project when it is saved or opened. A patient whose project has never
 * been written has no summary, and their row says "Not opened yet" rather than
 * "No images on file" — which is what a saved project holding nothing says.
 *
 * Registration stays on this screen rather than moving into a dialog, but it is
 * folded behind one button once there are cases: the height an open form costs is
 * height the rows are asking for. On a fresh install it stands open, because then
 * it is the only thing the screen is for. @see toggleRegister
 */

// ---- Sorting, filtering, paging ---------------------------------------------

type SortKey =
  'name' | 'chartId' | 'age' | 'sex' | 'records' | 'lastVisit' | 'tracing';

type SortDir = 'asc' | 'desc';

type SexFilter = 'all' | 'female' | 'male' | 'unknown';

/** The tracing states a case can be filtered down to. */
type TracingFilter =
  'all' | 'traced' | 'untraced' | 'no_ceph' | 'no_records' | 'no_project';

type RecencyFilter = 'all' | VisitRecency;

const PAGE_SIZES = [25, 50, 100];

/**
 * The list's own state — what is searched, ordered, filtered and paged — kept in
 * `sessionStorage` rather than only in this component.
 *
 * The picker unmounts the moment a case is opened, and a practice works a queue
 * one case at a time: filter to "Ceph, not traced", open the third row, trace it,
 * come back. Resetting to page 1 of every case on the way back is not a fresh
 * start, it is losing the user's place in their own work. Session storage rather
 * than the persisted store, because this is where the user *is* in the list, not
 * a clinical fact about the practice: a new tab starts on the default view.
 */
const VIEW_KEY = 'webceph.caseList.view';

interface Column {
  /** The column's sort key, or null when the column is not sortable. */
  key: SortKey | null;
  label: string;
  /** Layout class — the grid cell this column's content sits in. */
  cell: string;
  /** Longer label for the header's tooltip, where the micro label is terse. */
  title?: string;
}

/**
 * The table's columns, in order. The header and every row are laid out from the
 * same grid template (see `style.scss`), so the two can never drift apart.
 */
const COLUMNS: Column[] = [
  { key: null, label: '', cell: 'cell_film' },
  {
    key: 'name', label: 'Patient', cell: 'cell_name',
    title: 'Ordered by the reading (かな) where one is on file, else by the name',
  },
  { key: 'chartId', label: 'Chart ID', cell: 'cell_chart' },
  {
    key: 'age', label: 'Age', cell: 'cell_age',
    title: 'Age today, with the date of birth on file',
  },
  { key: 'sex', label: 'Sex', cell: 'cell_sex' },
  {
    key: 'records', label: 'Records', cell: 'cell_records',
    title: 'Images on file, and the number of visits they belong to',
  },
  {
    key: 'lastVisit', label: 'Last visit', cell: 'cell_visit',
    title: 'The most recent capture date on file',
  },
  {
    key: 'tracing', label: 'Tracing', cell: 'cell_status',
    title: 'How far the lateral cephalograms of this case have been traced',
  },
  { key: null, label: '', cell: 'cell_actions' },
];

/** Which way a column sorts when it is first pressed. */
const DEFAULT_DIR: { [K in SortKey]: SortDir } = {
  name: 'asc',
  chartId: 'asc',
  age: 'asc',
  sex: 'asc',
  // The three that a practice reads as "most, latest, furthest along first".
  records: 'desc',
  lastVisit: 'desc',
  tracing: 'desc',
};

const SEX_FILTER_LABELS: Array<{ id: SexFilter; label: string }> = [
  { id: 'all', label: 'All sexes' },
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'unknown', label: 'Sex not recorded' },
];

/**
 * The tracing buckets, in the words the chips use.
 *
 * "Every ceph traced" is the finished work and "Ceph, not traced" the
 * outstanding work, and between them they account for every case that has a film
 * — a case with one film of three traced is outstanding work, not finished work.
 *
 * The three empty states are separate buckets because they are separate facts: a
 * patient never opened, a project holding no image, and a record with images but
 * no film to analyse. @see CaseTracingStatus
 */
const TRACING_FILTER_LABELS: Array<{ id: TracingFilter; label: string }> = [
  { id: 'all', label: 'Any tracing state' },
  { id: 'traced', label: 'Every ceph traced' },
  { id: 'untraced', label: 'Ceph, not traced' },
  { id: 'no_ceph', label: 'No ceph on file' },
  { id: 'no_records', label: 'No images on file' },
  { id: 'no_project', label: 'Not opened yet' },
];

const RECENCY_FILTER_LABELS: Array<{ id: RecencyFilter; label: string }> = [
  { id: 'all', label: 'Any last visit' },
  { id: 'recent', label: `Seen in ${RECENCY_MONTHS.recent} months` },
  { id: 'year', label: `Seen in ${RECENCY_MONTHS.year} months` },
  { id: 'older', label: 'Over a year ago' },
  { id: 'none', label: 'No dated visit' },
];

/** The chip class each tracing state is printed in — the dashboard's palette. */
const STATUS_CHIP_CLASS: { [K in CaseTracingStatus]: string } = {
  traced: 'chip__ok',
  // Amber while any film of the case is still untraced — including a case with
  // one of three done, which reads "Traced · 1 of 3" and is outstanding work.
  partial: 'chip__partial',
  untraced: 'chip__todo',
  no_ceph: 'chip__muted',
  no_records: 'chip__muted',
  no_project: 'chip__muted',
};

/** How a column is named where the order has to be stated in words (print). */
const SORT_LABELS: { [K in SortKey]: string } = {
  name: 'Patient',
  chartId: 'Chart ID',
  age: 'Age',
  sex: 'Sex',
  records: 'Records',
  lastVisit: 'Last visit',
  tracing: 'Tracing',
};

/** Everything about *which* cases are listed, and in what order. */
interface ListView {
  query: string;
  sortKey: SortKey;
  sortDir: SortDir;
  filterSex: SexFilter;
  filterTracing: TracingFilter;
  filterRecency: RecencyFilter;
  /** 1-based page number; clamped to the filtered result on render. */
  page: number;
  pageSize: number;
}

const DEFAULT_VIEW: ListView = {
  query: '',
  // A practice list opens on the cases it saw last, which is the order the day
  // is worked in. Cases with nothing dated on file sort after them, never as
  // the oldest.
  sortKey: 'lastVisit',
  sortDir: 'desc',
  filterSex: 'all',
  filterTracing: 'all',
  filterRecency: 'all',
  page: 1,
  pageSize: PAGE_SIZES[0],
};

const oneOf = <T extends string>(
  value: any, options: T[], fallback: T,
): T => (
  typeof value === 'string' && options.indexOf(value as T) !== -1
    ? value as T : fallback
);

/**
 * The stored view, field by field. Every value is checked against the options
 * that actually exist: a stale blob from an older build (or a hand-edited one)
 * must not be able to put the list in a state no control can undo.
 */
const readView = (): ListView => {
  try {
    const raw = window.sessionStorage.getItem(VIEW_KEY);
    if (raw === null) {
      return DEFAULT_VIEW;
    }
    const stored = JSON.parse(raw);
    if (stored === null || typeof stored !== 'object') {
      return DEFAULT_VIEW;
    }
    const page = parseInt(stored.page, 10);
    return {
      query: typeof stored.query === 'string' ? stored.query : '',
      sortKey: oneOf<SortKey>(
        stored.sortKey,
        ['name', 'chartId', 'age', 'sex', 'records', 'lastVisit', 'tracing'],
        DEFAULT_VIEW.sortKey,
      ),
      sortDir: oneOf<SortDir>(stored.sortDir, ['asc', 'desc'], 'desc'),
      filterSex: oneOf<SexFilter>(
        stored.filterSex, SEX_FILTER_LABELS.map(({ id }) => id), 'all',
      ),
      filterTracing: oneOf<TracingFilter>(
        stored.filterTracing, TRACING_FILTER_LABELS.map(({ id }) => id), 'all',
      ),
      filterRecency: oneOf<RecencyFilter>(
        stored.filterRecency, RECENCY_FILTER_LABELS.map(({ id }) => id), 'all',
      ),
      page: isNaN(page) || page < 1 ? 1 : page,
      pageSize: PAGE_SIZES.indexOf(stored.pageSize) !== -1
        ? stored.pageSize : DEFAULT_VIEW.pageSize,
    };
  } catch (e) {
    // Private-mode Safari throws on sessionStorage; a list that cannot remember
    // where it was is not a reason to fail to render one.
    return DEFAULT_VIEW;
  }
};

const writeView = (view: ListView) => {
  try {
    window.sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch (e) {
    return;
  }
};

const viewOf = (state: State): ListView => ({
  query: state.query,
  sortKey: state.sortKey,
  sortDir: state.sortDir,
  filterSex: state.filterSex,
  filterTracing: state.filterTracing,
  filterRecency: state.filterRecency,
  page: state.page,
  pageSize: state.pageSize,
});

interface State extends ListView {
  name: string;
  chartId: string;
  dateOfBirth: string;
  sex: PatientSex;
  /** Reading of the name being registered (かな), or empty. */
  reading: string;
  error: PatientDetailsError | null;
  pendingRemoval: Patient | null;
  /**
   * Whether the registration well is open. A practice with cases on file gets it
   * folded behind one button, because the height it costs is height the list's
   * rows are asking for; a fresh install has it open, where it is the invitation.
   */
  registerOpen: boolean;
  /**
   * Whether the "Open a case file" dialog is up.
   *
   * It is a peer of registration, not a step inside it: a case file names its own
   * patient, so restoring one *is* how that chart gets registered here.
   * @see ./RestoreFromCaseFile
   */
  restoreOpen: boolean;
  /**
   * Whether the browser is laying this screen out for paper. Set from
   * `beforeprint` (and from the `print` media query, which is what Safari and a
   * headless print pass raise), and it is what makes the sheet carry the whole
   * filtered list instead of only the page on screen.
   */
  printing: boolean;
  /**
   * What this browser profile's own storage looks like right now — bytes this
   * origin is actually using, and the quota the browser is willing to grow it
   * to — or null where the browser will not say. Every case here lives only in
   * this profile's IndexedDB (@see store/middleware/project), so "how much
   * room is left" is a real clinical question with a real answer this API
   * gives, not a guess this screen is entitled to make up. @see refreshStorage
   */
  storage: { usageBytes: number; quotaBytes: number | null } | null;
  /**
   * Whether the storage estimate has resolved once (successfully or not), so
   * the strip can stay blank on the very first paint instead of flashing
   * "not available" for the one tick before the promise settles.
   */
  storageChecked: boolean;
  /**
   * Whether this origin's storage has been granted "persistent" treatment —
   * true, false, or null where the browser exposes no such API and the
   * question cannot be answered either way. A clinic keeping a growing chart
   * only on this device is exactly who needs to be told the browser may still
   * clear it under storage pressure if this reads false.
   */
  persisted: boolean | null;
}

/** One row of the case list: the patient, their summary, and what sorts them. */
interface CaseRow {
  patient: Patient;
  summary: PatientCaseSummary | undefined;
  /** The name as the row prints it, or the fallback when there is none. */
  displayName: string;
  /** Whether a name is actually on file — an unnamed case says so in words. */
  hasName: boolean;
  /** What the Patient column is ordered by: the reading, else the name. */
  sortName: string;
  /** Name + reading + chart ID, folded, which is what the search matches on. */
  haystack: string;
  ageInYears: number | null;
  status: CaseTracingStatus;
  recency: VisitRecency;
}

const registerLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 600,
};

const cancelButtonStyle: React.CSSProperties = {
  height: 36,
  lineHeight: '36px',
  minWidth: 88,
  border: '1px solid #C3CCD6',
  borderRadius: 6,
};

const cancelLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 500,
  fontSize: 14,
  color: '#1F2933',
};

const removeButtonStyle: React.CSSProperties = {
  marginLeft: 12,
};

const removeLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 600,
  fontSize: 14,
};

const transparentOverlay: React.CSSProperties = {
  backgroundColor: 'transparent',
};

const dialogTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: '#1F2933',
  padding: '24px 24px 8px',
};

const dialogBodyStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#52616F',
  padding: '0 24px 8px',
};

const dialogActionsStyle: React.CSSProperties = {
  padding: '12px 24px 20px',
};

const dialogPaperStyle: React.CSSProperties = {
  borderRadius: 8,
  boxShadow: '0 12px 32px rgba(16, 30, 50, .28)',
};

const deleteButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 6,
  borderRadius: 999,
};

const deleteIconStyle: React.CSSProperties = {
  width: 20,
  height: 20,
};

const pagerIconStyle: React.CSSProperties = {
  width: 22,
  height: 22,
};

/**
 * Initials for the patient avatar: first character for CJK names (e.g.
 * 山田 太郎 → 山), first letter of the first two words otherwise.
 */
const getInitials = (text: string): string => {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return '?';
  }
  if (/[　-〿぀-ヿ㐀-鿿豈-﫿]/.test(tokens[0])) {
    return tokens[0].charAt(0);
  }
  return tokens.slice(0, 2).map((t) => t.charAt(0).toUpperCase()).join('');
};

/**
 * A stored error, reduced to the sentence it holds — the reader gets the
 * reason, never an empty box where one should be.
 */
const readErrorMessage = (error: GenericError): string => {
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  return message !== ''
    ? message
    : 'The file could not be read as a WebCeph case file.';
};

/** What a case is called on screen. A record with neither says so in words. */
const patientDisplayName = (patient: Patient): string =>
  patient.name || patient.chartId || '(unnamed patient)';

/**
 * A Japanese name list is read in あいうえお order, and kanji carry no reading a
 * collator can find — hence the patient's optional reading field, which is what
 * the Patient column is ordered by when it is on file.
 */
const nameCollator: { compare(a: string, b: string): number } | null = (() => {
  try {
    return new Intl.Collator('ja', { usage: 'sort' });
  } catch (e) {
    return null;
  }
})();

/** Compares two strings for the list's own order, case- and locale-folded. */
const compareText = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  // A name list a clinic reads has 山田 in it as often as Yamada; a ja collator
  // is what puts both in an order a human recognises (and falls back to
  // localeCompare where Intl is not available).
  return nameCollator !== null ? nameCollator.compare(a, b) : a.localeCompare(b);
};

/**
 * Katakana folded to hiragana, after `NFKC` folds half-width katakana (the
 * IME-adjacent "ﾔﾏﾀﾞ" shape) to full-width. The sort above already treats
 * hiragana, katakana and half-width katakana as equivalent — `Intl.Collator`
 * does that natively — but a plain substring search does not, so a reading
 * on file in one script silently failed to match a query typed in another.
 * Hiragana and (full-width) katakana share one code plane 0x60 apart for
 * every character that has both forms, so the fold is a single offset
 * subtraction; katakana-only characters (the prolonged sound mark ー, ヶ used
 * as a counter) have no hiragana form and simply pass through unchanged.
 */
const toHiragana = (text: string): string => text
  .normalize('NFKC')
  .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/**
 * Folds a name or a query into the form the search matches on: case-folded,
 * kana-folded (`toHiragana`), with the punctuation a clinician does not
 * type — the comma of "Alvarez, Greta", the hyphen of
 * "Vandenberghe-Kowalczyk", the dot of an initial, the 、and ・of a Japanese
 * record — flattened to spaces.
 */
const foldForSearch = (text: string): string => toHiragana(text)
  .toLowerCase()
  .replace(
    /[,、，.。．・･:;_/\\|()\[\]'"‘’“”]+/g,
    ' ',
  )
  .replace(/[-‐‑‒–—―－ー]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The query as the terms it holds. Every term has to be found, in any order:
 * "Maximilian Vandenberghe" is how a clinician asks for
 * "Vandenberghe-Kowalczyk, Maximilian Aleksander", and one raw substring never
 * finds it.
 */
const searchTerms = (query: string): string[] =>
  foldForSearch(query).split(' ').filter((term) => term !== '');

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Bytes as a clinician reads them — one or two significant figures past the
 * point, the unit that keeps the number between 1 and 1024, and never more
 * precision than the browser's own estimate carries (the spec allows it to
 * pad the true figure for privacy, so a strip reading "41.29 MB" would be
 * false precision over a number that was never exact to begin with).
 */
const formatBytes = (bytes: number): string => {
  if (!isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
};

/** "3 images in 3 visits" — what the Records column says, spelled out. */
const describeRecords = (summary: PatientCaseSummary | undefined): string => {
  if (summary === undefined) {
    return 'No project saved for this case yet';
  }
  if (summary.recordCount === 0) {
    return 'No images on file';
  }
  return `${plural(summary.recordCount, 'image', 'images')} in ` +
    `${plural(summary.timepointCount, 'visit', 'visits')}`;
};

/**
 * How long this case has been under records — the one thing the summary counts
 * (`firstVisitDate`) that the row itself has no column for, read where the row
 * states the *last* visit.
 */
const describeVisitSpan = (
  summary: PatientCaseSummary | undefined,
): string | undefined => {
  if (summary === undefined) {
    return 'No project has been saved for this case yet';
  }
  const first = formatDisplayDate(summary.firstVisitDate);
  const last = formatDisplayDate(summary.lastVisitDate);
  if (first === null || last === null) {
    return 'No image on file carries a capture date';
  }
  if (first === last) {
    return `One dated visit on file · ${first}`;
  }
  const span = formatInterval(parseCaptureDate(first), parseCaptureDate(last));
  return `Records span ${first} → ${last}` +
    (span !== null ? ` · ${span} under records` : '');
};

/**
 * What removing a case actually destroys, in the figures the index already
 * holds. A confirmation that does not say how much is being deleted is asking
 * the practice to guess.
 */
const describeRecordLoss = (
  summary: PatientCaseSummary | undefined,
): string | null => {
  if (summary === undefined || summary.recordCount === 0) {
    return null;
  }
  const images = `${plural(summary.recordCount, 'image', 'images')} across ` +
    `${plural(summary.timepointCount, 'visit', 'visits')}`;
  if (summary.cephCount === 0) {
    return images;
  }
  const films = plural(
    summary.cephCount, 'lateral cephalogram', 'lateral cephalograms',
  );
  // Every film traced, or the count of the ones that are: a tracing is the work
  // the practice would be throwing away, so it is named either way.
  if (summary.tracedCount === summary.cephCount) {
    return `${images}, including ${summary.cephCount} traced ` +
      (summary.cephCount === 1 ? 'lateral cephalogram' : 'lateral cephalograms');
  }
  return `${images}, including ${films}` +
    (summary.tracedCount > 0 ? `, ${summary.tracedCount} of them traced` : '');
};

/** Numbers and dates sort with the unknowns last, whichever way the column runs. */
const compareWithNullsLast = <T extends number | string>(
  a: T | null, b: T | null, dir: SortDir,
): number => {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  const order = a === b ? 0 : (a < b ? -1 : 1);
  return dir === 'asc' ? order : -order;
};

/** Inline brand mark: a cephalometric profile with S–N line and landmarks. */
const BrandMark = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
    <circle
      cx="28" cy="28" r="26"
      fill="rgba(255,255,255,.07)"
      stroke="rgba(255,255,255,.38)"
      strokeWidth="1.5"
    />
    <path
      d={
        'M24 10.5 C29 10.5 33.5 13 35 17 C36 19.8 35.2 21.6 36.6 23.8 ' +
        'L39.4 27.9 L36.4 28.9 C36.6 30.3 37.2 31.5 36.2 32.5 ' +
        'C35.3 33.4 33.8 32.9 33.4 34.3 C32.9 36.1 33.6 37.7 31 38.9 ' +
        'C28.4 40 24.8 39.5 22 37.9'
      }
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="21" y1="21.5" x2="35" y2="17.5"
      stroke="#7CD1FF"
      strokeWidth="1.2"
      opacity=".9"
    />
    <circle cx="21" cy="21.5" r="2.1" fill="#FFC400" stroke="#0C3B66" />
    <circle cx="35" cy="17.5" r="2.1" fill="#FFC400" stroke="#0C3B66" />
    <circle cx="31" cy="38.9" r="2.1" fill="#FFC400" stroke="#0C3B66" />
  </svg>
);

/**
 * Faint landmark-constellation artwork for the brand panel: classic lateral
 * ceph landmarks (S, N, Or, Po, A, B, Pog, Me, Go, Ar) joined by the familiar
 * reference lines (S–N, N–A, N–B, Frankfort, mandibular plane).
 */
const lineProps = {
  stroke: 'rgba(255,255,255,.16)',
  strokeWidth: 1,
};

const dashedLineProps = {
  stroke: 'rgba(255,255,255,.12)',
  strokeWidth: 1,
  strokeDasharray: '3 4',
};

const dotProps = {
  r: 2.4,
  fill: 'rgba(255,255,255,.34)',
};

const labelProps: React.SVGProps<SVGTextElement> = {
  fontSize: 9,
  fontWeight: 600,
  fill: 'rgba(255,255,255,.34)',
  fontFamily: 'inherit',
};

const BrandConstellation = () => (
  <svg
    viewBox="0 0 224 300"
    preserveAspectRatio="xMidYMid meet"
    className={classes.brand_art_svg}
    aria-hidden="true"
  >
    {/* Reference lines */}
    <line x1="84" y1="62" x2="176" y2="74" {...lineProps} />          {/* S–N */}
    <line x1="176" y1="74" x2="178" y2="172" {...lineProps} />        {/* N–A */}
    <line x1="176" y1="74" x2="168" y2="214" {...dashedLineProps} />  {/* N–B */}
    <line x1="48" y1="96" x2="162" y2="112" {...lineProps} />         {/* Po–Or */}
    <line x1="72" y1="222" x2="150" y2="254" {...lineProps} />        {/* Go–Me */}
    <line x1="58" y1="138" x2="72" y2="222" {...dashedLineProps} />   {/* Ar–Go */}
    <line x1="84" y1="62" x2="58" y2="138" {...dashedLineProps} />    {/* S–Ar */}
    <line x1="176" y1="74" x2="166" y2="240" {...dashedLineProps} />  {/* N–Pog */}
    {/* Landmarks */}
    <circle cx="84" cy="62" {...dotProps} fill="rgba(255,196,0,.6)" />
    <circle cx="176" cy="74" {...dotProps} fill="rgba(255,196,0,.6)" />
    <circle cx="48" cy="96" {...dotProps} />
    <circle cx="162" cy="112" {...dotProps} />
    <circle cx="58" cy="138" {...dotProps} />
    <circle cx="184" cy="150" {...dotProps} />
    <circle cx="178" cy="172" {...dotProps} fill="rgba(124,209,255,.55)" />
    <circle cx="168" cy="214" {...dotProps} fill="rgba(124,209,255,.55)" />
    <circle cx="166" cy="240" {...dotProps} />
    <circle cx="150" cy="254" {...dotProps} />
    <circle cx="72" cy="222" {...dotProps} />
    {/* Labels for the best-known landmarks */}
    <text x="76" y="52" {...labelProps}>S</text>
    <text x="184" y="68" {...labelProps}>N</text>
    <text x="188" y="176" {...labelProps}>A</text>
    <text x="178" y="220" {...labelProps}>B</text>
    <text x="56" y="234" {...labelProps}>Go</text>
    <text x="148" y="268" {...labelProps}>Me</text>
  </svg>
);

export default class PatientPicker extends React.PureComponent<Props, State> {
  state: State = {
    name: '',
    chartId: '',
    dateOfBirth: '',
    sex: '',
    reading: '',
    error: null,
    pendingRemoval: null,
    // Open only where there is nothing else to do — see `registerOpen`.
    registerOpen: this.props.patients.length === 0,
    restoreOpen: false,
    printing: false,
    storage: null,
    storageChecked: false,
    persisted: null,
    // Where the user left the list — see `readView`.
    ...readView(),
  };

  /** The scrolling table, whose visible height is quantised to whole rows. */
  private table: HTMLTableElement | null = null;

  /**
   * The rows as they were last built, with the two props they are built from.
   *
   * Every keystroke in the search box and every sort click re-renders the list,
   * and folding a few hundred names for the search on each of those is work the
   * practice pays for a second time for no answer it did not already have. The
   * rows depend on `patients` and `caseIndex` alone, and both are replaced
   * wholesale by their reducers, so identity is a sound cache key.
   */
  private rowCache: {
    patients: Patient[];
    caseIndex: { [id: string]: PatientCaseSummary };
    rows: CaseRow[];
  } | null = null;

  /** Each patient's folded search haystack, keyed by the text it was folded from. */
  private foldCache: { [id: string]: { source: string; folded: string } } = {};

  /** The `print` media query, watched so the sheet can carry the whole list. */
  private printQuery: MediaQueryList | null = null;

  /**
   * Whether this component is still mounted — the picker unmounts the moment a
   * case is opened (@see class doc), and `navigator.storage.estimate()` is a
   * promise that can easily resolve after that. Checked before every setState
   * the estimate schedules.
   */
  private isMounted_ = false;

  componentDidMount() {
    this.isMounted_ = true;
    window.addEventListener('resize', this.syncTableHeight);
    // Chrome and Firefox raise these around the print dialog; Safari does not,
    // and neither does a headless print pass — hence the media query below as
    // well. Both simply set the same flag.
    window.addEventListener('beforeprint', this.enterPrint);
    window.addEventListener('afterprint', this.exitPrint);
    try {
      const query = window.matchMedia('print');
      this.printQuery = query;
      query.addListener(this.handlePrintQuery);
    } catch (e) {
      this.printQuery = null;
    }
    this.syncTableHeight();
    // A clinic works this screen across a whole day with the tab left open, and
    // storage this app's own autosave has written since the last measurement is
    // exactly what makes the strip stale — refreshed on mount and whenever the
    // tab is looked at again, never polled while it is not.
    this.refreshStorage();
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  componentDidUpdate(_: Props, prevState: State) {
    const view = viewOf(this.state);
    if (JSON.stringify(view) !== JSON.stringify(viewOf(prevState))) {
      writeView(view);
    }
    this.syncTableHeight();
  }

  componentWillUnmount() {
    this.isMounted_ = false;
    window.removeEventListener('resize', this.syncTableHeight);
    window.removeEventListener('beforeprint', this.enterPrint);
    window.removeEventListener('afterprint', this.exitPrint);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.printQuery !== null) {
      this.printQuery.removeListener(this.handlePrintQuery);
    }
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.refreshStorage();
    }
  };

  /**
   * Measures this origin's own storage — never a figure derived from the case
   * index. The case index counts *records*, not the bytes a saved project
   * actually occupies on disk (compression, IndexedDB overhead and the
   * autosave debounce all put daylight between the two), so the only honest
   * source for "how full is this browser" is the browser's own accounting.
   * Where it declines to give one (Safari < 15.2, a `file://` origin, a
   * disabled Storage API) the strip says so instead of estimating — a wrong
   * number here is worse than none, on a screen a practice reads before
   * deciding whether to keep filing films into this browser.
   */
  private refreshStorage = () => {
    const storageManager = navigator.storage;
    if (
      storageManager === undefined ||
      typeof storageManager.estimate !== 'function'
    ) {
      this.setState({ storageChecked: true, storage: null, persisted: null });
      return;
    }
    storageManager.estimate()
      .then((estimate) => {
        if (!this.isMounted_) {
          return;
        }
        if (typeof estimate.usage !== 'number') {
          this.setState({ storageChecked: true, storage: null });
          return;
        }
        this.setState({
          storageChecked: true,
          storage: {
            usageBytes: estimate.usage,
            quotaBytes: typeof estimate.quota === 'number'
              ? estimate.quota : null,
          },
        });
      })
      .catch(() => {
        if (this.isMounted_) {
          this.setState({ storageChecked: true, storage: null });
        }
      });
    if (typeof storageManager.persisted === 'function') {
      storageManager.persisted()
        .then((persisted) => {
          if (this.isMounted_) {
            this.setState({ persisted });
          }
        })
        .catch(() => {
          if (this.isMounted_) {
            this.setState({ persisted: null });
          }
        });
    }
  };

  private enterPrint = () => {
    this.setState({ printing: true });
  };

  private exitPrint = () => {
    this.setState({ printing: false });
  };

  // Typed structurally: the argument is a `MediaQueryListEvent` in a current
  // browser and the `MediaQueryList` itself in an older one, and all this needs
  // of either is whether the query now matches.
  private handlePrintQuery = (e: { matches: boolean }) => {
    this.setState({ printing: e.matches });
  };

  private setTable = (el: HTMLTableElement | null) => {
    this.table = el;
    this.syncTableHeight();
  };

  /**
   * Clips the table to whole rows.
   *
   * The card is sized to the window, so the height left for the list is whatever
   * the window happens to be — and a table that simply fills it ends in a row
   * sliced through its own thumbnail, which reads as a rendering fault rather
   * than as "there is more below". The pitch is measured from the rows
   * themselves (a row carries the divider above it) rather than assumed, so this
   * holds whatever the row ends up costing.
   */
  private syncTableHeight = () => {
    const el = this.table;
    if (el === null) {
      return;
    }
    // Measure the height the layout wants first: the clamp from the last pass
    // would otherwise cap it and the table could never grow again.
    el.style.maxHeight = '';
    // The row list only — never the empty-state's own `<tbody>` (@see render),
    // which holds one filler row and would otherwise be read as a one-row table
    // and clamped to it.
    const list = el.querySelector(`.${classes.list}`);
    const head = el.firstElementChild as HTMLElement | null;
    if (list === null || head === null || list.children.length === 0) {
      return;
    }
    const available = el.clientHeight - head.offsetHeight;
    const first = (list.children[0] as HTMLElement).offsetHeight;
    // Every row but the first carries the 1px divider above it.
    const pitch = list.children.length > 1
      ? (list.children[1] as HTMLElement).offsetHeight : first;
    if (available <= 0 || pitch <= 0 || list.scrollHeight <= available + 1) {
      return;
    }
    const rows = Math.max(1, Math.floor((available - first) / pitch) + 1);
    el.style.maxHeight = `${head.offsetHeight + first + pitch * (rows - 1)}px`;
  };

  private register = () => {
    const name = this.state.name.trim();
    const chartId = this.state.chartId.trim();
    const reading = this.state.reading.trim();
    // One rule set, shared with "Edit patient details" on the records
    // dashboard — see components/PatientFields.
    const error = validatePatientDetails(
      { name, chartId, dateOfBirth: '', sex: '', reading },
      this.props.patients.map((p) => p.chartId),
      'register',
    );
    if (error !== null) {
      this.setState({ error });
      return;
    }
    this.props.onRegister(
      name, chartId, this.state.dateOfBirth, this.state.sex, reading,
    );
    this.setState({
      name: '',
      chartId: '',
      dateOfBirth: '',
      sex: '',
      reading: '',
      query: '',
      error: null,
      registerOpen: false,
    });
  };

  /**
   * Opens the registration well, or closes it and drops what was typed into it.
   *
   * The well is folded away while the practice has cases, because the ~105px it
   * costs (and the ~190px it costs once it wraps on a narrower window) is height
   * the list's rows are asking for: at 1440×720 it was the difference between six
   * rows and nine. On a fresh install it stays open — there is nothing else to do
   * on the screen, and the empty state's three steps begin with it.
   */
  private toggleRegister = () => {
    if (!this.state.registerOpen) {
      this.setState({ registerOpen: true });
      return;
    }
    this.setState({
      registerOpen: false,
      name: '',
      chartId: '',
      dateOfBirth: '',
      sex: '',
      reading: '',
      error: null,
    });
  };

  private openRestore = () => this.setState({ restoreOpen: true });

  private closeRestore = () => this.setState({ restoreOpen: false });

  /**
   * Register the chart the file names and read the case into it.
   *
   * One press, two acts, in that order and no other: the patient has to exist
   * before there is a project to read a case into. The file travels *with* the
   * open (see store/middleware/project) so the import cannot race the project
   * slices being replaced.
   */
  private handleRestore = (
    details: PatientDetails, file: File, trendPlot: string[] | null,
  ) => {
    this.setState({ restoreOpen: false, query: '' });
    this.props.onRestoreFromCaseFile(details, file, trendPlot);
  };

  private handleKeyDown = (e: React.KeyboardEvent<{}>) => {
    if (e.key === 'Enter') {
      this.register();
      return;
    }
    // Escape abandons the registration, as it closes every other transient
    // surface in the app — but never on a fresh install, where the well is the
    // screen's one purpose and there is no list to go back to.
    if (e.key === 'Escape' && this.props.patients.length > 0) {
      this.toggleRegister();
    }
  };

  private handleNameChange = (name: string) => {
    this.setState({ name, error: null });
  };

  private handleChartIdChange = (chartId: string) => {
    this.setState({ chartId, error: null });
  };

  private handleReadingChange = (reading: string) => {
    this.setState({ reading });
  };

  private handleDateOfBirthChange = (dateOfBirth: string) => {
    this.setState({ dateOfBirth });
  };

  private handleSexChange = (sex: PatientSex) => {
    this.setState({ sex });
  };

  // Every control that changes *which* cases are listed puts the list back on its
  // first page: page 7 of a 12-page list is nothing at all once a filter cuts the
  // list to two pages, and a blank table is not an answer to a search.
  private handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: e.currentTarget.value, page: 1 });
  };

  private handleSexFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ filterSex: e.currentTarget.value as SexFilter, page: 1 });
  };

  private handleTracingFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({
      filterTracing: e.currentTarget.value as TracingFilter, page: 1,
    });
  };

  private handleRecencyFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({
      filterRecency: e.currentTarget.value as RecencyFilter, page: 1,
    });
  };

  private handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ pageSize: parseInt(e.currentTarget.value, 10), page: 1 });
  };

  private clearFilters = () => {
    this.setState({
      query: '',
      filterSex: 'all',
      filterTracing: 'all',
      filterRecency: 'all',
      page: 1,
    });
  };

  private sortBy(key: SortKey) {
    const { sortKey, sortDir } = this.state;
    if (sortKey === key) {
      this.setState({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
      return;
    }
    this.setState({ sortKey: key, sortDir: DEFAULT_DIR[key], page: 1 });
  }

  private goToPage(page: number) {
    this.setState({ page });
  }

  /**
   * A page step, which drops the keyboard focus the click gave the chevron. The
   * pointer has moved the list on; a focus ring (and mui's focus-triggered
   * tooltip) left parked on the button says otherwise.
   */
  private stepPage(e: React.MouseEvent<{}>, page: number) {
    (e.currentTarget as HTMLElement).blur();
    this.goToPage(page);
  }

  private requestRemoval(patient: Patient) {
    this.setState({ pendingRemoval: patient });
  }

  private cancelRemoval = () => {
    this.setState({ pendingRemoval: null });
  };

  private confirmRemoval = () => {
    const { pendingRemoval } = this.state;
    if (pendingRemoval !== null) {
      this.props.onRemove(pendingRemoval.id);
      // The deletion itself is an async IndexedDB write; a measurement taken
      // in the same tick would still be reading the space it used to occupy.
      // Best-effort only — nothing on this screen depends on the timing.
      window.setTimeout(this.refreshStorage, 1200);
    }
    this.setState({ pendingRemoval: null });
  };

  /** Whether anything is narrowing the list — what "Clear" has to undo. */
  private isFiltered(): boolean {
    const { query, filterSex, filterTracing, filterRecency } = this.state;
    return query.trim() !== '' || filterSex !== 'all' ||
      filterTracing !== 'all' || filterRecency !== 'all';
  }

  /**
   * A patient's folded search haystack, from the cache when the three fields it
   * is folded from have not changed. The fold itself is four regex passes over
   * name + reading + chart ID; at a few hundred cases per keystroke it is the
   * most expensive thing this list does.
   */
  private haystackOf(patient: Patient, reading: string): string {
    const source = `${patient.name} ${reading} ${patient.chartId}`;
    const cached = this.foldCache[patient.id];
    if (cached !== undefined && cached.source === source) {
      return cached.folded;
    }
    const folded = foldForSearch(
      `${patient.name} ${reading} ${patient.chartId}`,
    );
    this.foldCache[patient.id] = { source, folded };
    return folded;
  }

  /**
   * The patients as case rows: their summary, and the derived values the table
   * sorts, filters and searches on, counted once per change of the practice's
   * records rather than once per render. @see rowCache
   */
  private buildRows(): CaseRow[] {
    const { patients, caseIndex } = this.props;
    const cache = this.rowCache;
    if (
      cache !== null &&
      cache.patients === patients && cache.caseIndex === caseIndex
    ) {
      return cache.rows;
    }
    const now = new Date();
    const rows = patients.map((patient): CaseRow => {
      const summary = caseIndex[patient.id];
      const reading = (patient.reading || '').trim();
      const displayName = patientDisplayName(patient);
      return {
        patient,
        summary,
        displayName,
        hasName: patient.name.trim() !== '',
        // The reading is what a Japanese list is ordered by; where none is on
        // file the name itself is all there is to order on.
        sortName: reading !== '' ? reading : displayName,
        haystack: this.haystackOf(patient, reading),
        ageInYears: getAgeInYears(patient.dateOfBirth, now),
        status: getCaseTracingStatus(summary),
        recency: getVisitRecency(
          summary !== undefined ? summary.lastVisitDate : null, now,
        ),
      };
    });
    this.rowCache = { patients, caseIndex, rows };
    return rows;
  }

  private matchesFilters = (row: CaseRow, terms: string[]): boolean => {
    const { filterSex, filterTracing, filterRecency } = this.state;
    // Every term, in any order: a clinician types the given name after the
    // family name as often as the record files it the other way round.
    if (terms.some((term) => row.haystack.indexOf(term) === -1)) {
      return false;
    }
    if (filterSex !== 'all') {
      const sex = row.patient.sex;
      if (filterSex === 'unknown') {
        if (sex === 'male' || sex === 'female') {
          return false;
        }
      } else if (sex !== filterSex) {
        return false;
      }
    }
    if (filterTracing !== 'all') {
      // "Ceph, not traced" is the work queue: a film on file with nothing placed
      // on it *and* one that is half done are both outstanding work.
      const wanted = filterTracing === 'untraced'
        ? (row.status === 'untraced' || row.status === 'partial')
        : row.status === filterTracing;
      if (!wanted) {
        return false;
      }
    }
    if (filterRecency !== 'all') {
      // The two "seen within" buckets nest: a case seen last month is also a case
      // seen within the year, and a filter that said otherwise would hide it.
      const wanted = filterRecency === 'year'
        ? (row.recency === 'recent' || row.recency === 'year')
        : row.recency === filterRecency;
      if (!wanted) {
        return false;
      }
    }
    return true;
  };

  private compareRows = (a: CaseRow, b: CaseRow): number => {
    const { sortKey, sortDir } = this.state;
    const dir = sortDir === 'asc' ? 1 : -1;
    const aSummary = a.summary;
    const bSummary = b.summary;
    let order = 0;
    switch (sortKey) {
      case 'name':
        // Ordered on the reading where one is on file (see `sortName`), so a
        // Japanese list runs あいうえお rather than by codepoint.
        order = dir * compareText(a.sortName, b.sortName);
        break;
      case 'chartId':
        // A chart ID is an identifier, and an unfiled one is not the first chart
        // of the practice: it sorts with the other unknowns, at the end.
        order = compareWithNullsLast(
          a.patient.chartId || null, b.patient.chartId || null, sortDir,
        );
        break;
      case 'age':
        order = compareWithNullsLast(a.ageInYears, b.ageInYears, sortDir);
        break;
      case 'sex':
        order = compareWithNullsLast(
          formatSexFull(a.patient.sex), formatSexFull(b.patient.sex), sortDir,
        );
        break;
      case 'records':
        order = compareWithNullsLast(
          aSummary !== undefined ? aSummary.recordCount : null,
          bSummary !== undefined ? bSummary.recordCount : null,
          sortDir,
        );
        break;
      case 'lastVisit':
        order = compareWithNullsLast(
          aSummary !== undefined ? aSummary.lastVisitDate : null,
          bSummary !== undefined ? bSummary.lastVisitDate : null,
          sortDir,
        );
        break;
      default:
        // Progress, not just state: within one state the case with the larger
        // share of its films traced sorts ahead. @see compareCaseTracing
        order = dir * compareCaseTracing(aSummary, bSummary);
        break;
    }
    // One stable tie-break for every column, so two cases that are equal on the
    // sorted column never swap places between renders — on the reading, like the
    // Patient column itself, so a Japanese list ties in あいうえお order too.
    return order !== 0 ? order : compareText(a.sortName, b.sortName);
  };

  // ---- Rendering ------------------------------------------------------------

  private renderSortIndicator(key: SortKey) {
    const { sortKey, sortDir } = this.state;
    if (sortKey !== key) {
      return <span className={classes.sort_hint} aria-hidden="true">↕</span>;
    }
    return (
      <span className={classes.sort_on} aria-hidden="true">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    );
  }

  /**
   * The column heads, as a real `<thead>` — the one construction a browser
   * repeats *and* reserves the space for across printed pages. A `position:
   * fixed` div repeats but the flow then runs underneath it from sheet 2 on, and
   * a div with `display: table-header-group` does not repeat at all (both
   * probed in Chromium and Firefox, at up to 199 rows over 8 sheets): only a
   * real `<table><thead>` does. @see RecordsDashboard's own case sheet, which
   * this mirrors — one `<th>` wide enough to hold the whole header, so the grid
   * of sortable columns inside it stays exactly the layout it always was.
   *
   * Each label prints twice: the on-screen sort `<button>` and a plain,
   * non-interactive `<span>` twin next to it (`.th_label_print`) — because a
   * `<button>` inside a `<thead>` turned out not to be the whole answer either.
   *
   * Neither the `<th>` nor its grid `<div>` carries its own row/columnheader
   * role: a `<th colSpan={COLUMNS.length}>` is natively one columnheader cell
   * covering all nine columns, and giving its inner div `role="row"` (an
   * earlier version of this did) nests a synthetic row *inside* that cell --
   * which nests a row inside a columnheader, and, once the `<th>`'s own
   * `display: contents` (`.thead_cell`) flattens it out of the render tree,
   * nests that synthetic row directly inside the real `<tr>`'s native row
   * role too. Both a row-in-a-columnheader and a row-in-a-row are invalid
   * ARIA table structure, and assistive tech's behavior on either is
   * undefined rather than merely imperfect. `role="presentation"` on both
   * the `<th>` and the div removes them from the accessibility tree the same
   * way `display: contents` already removes them from the box tree, so the
   * nine `role="columnheader"` spans below attach directly to the real
   * `<tr>` -- one real header row, nine real column headers, matching what a
   * plain `<table>` with nine `<th>`s would have produced natively, which is
   * what this construction stands in for.
   */
  private renderHead() {
    const { sortKey, sortDir } = this.state;
    return (
      <thead className={classes.thead}>
        <tr>
          <th className={classes.thead_cell} role="presentation" colSpan={COLUMNS.length}>
            <div className={classes.thead_grid} role="presentation">
              {COLUMNS.map((column, index) => {
                const isSorted = column.key !== null && column.key === sortKey;
                const cellClass = cx(classes.th, classes[column.cell], {
                  [classes.th__sorted]: isSorted,
                });
                if (column.key === null) {
                  return (
                    <span
                      key={`spacer-${index}`}
                      className={cellClass}
                      role="columnheader"
                    />
                  );
                }
                const key = column.key;
                return (
                  <span
                    key={key}
                    className={cellClass}
                    role="columnheader"
                    aria-colindex={index + 1}
                    aria-sort={
                      isSorted
                        ? (sortDir === 'asc' ? 'ascending' : 'descending')
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className={classes.th_btn}
                      title={column.title}
                      onClick={() => this.sortBy(key)}
                    >
                      {column.label}
                      {this.renderSortIndicator(key)}
                    </button>
                    {/* Paper's own twin of the same label and arrow — never
                        shown on screen (`.th_label_print` is print-only, @see
                        style.scss) and never interactive, because a `<button>`
                        inside a `<thead>` does not repaint on the REPEATED
                        copies of a printed table's running head: verified in
                        this Chromium build (`page.pdf()`) — the button prints
                        on sheet 1, where the head is part of normal flow, and
                        is blank on every sheet after, where it is not. A plain
                        `<span>` carrying the same words has no such fault. */}
                    <span className={classes.th_label_print} aria-hidden="true">
                      {column.label}
                      {this.renderSortIndicator(key)}
                    </span>
                  </span>
                );
              })}
            </div>
          </th>
        </tr>
      </thead>
    );
  }

  /**
   * The row's film tile: the newest film on file, or the patient's initials when
   * the case has no image yet. Never a stand-in picture of a film — an empty case
   * has to look empty.
   */
  private renderFilm(row: CaseRow) {
    const { summary, patient, displayName } = row;
    if (summary !== undefined && summary.thumbnail !== null) {
      const typeLabel = summary.thumbnailType !== null
        ? getImageTypeLabel(summary.thumbnailType)
        : 'Image';
      const dated = formatDisplayDate(summary.lastVisitDate);
      return (
        <span className={classes.film}>
          <img
            className={classes.film_img}
            src={summary.thumbnail}
            alt={`${typeLabel} of ${displayName}`}
            title={dated !== null ? `${typeLabel} · ${dated}` : typeLabel}
          />
        </span>
      );
    }
    return (
      <span className={classes.avatar} aria-hidden="true">
        {getInitials(patient.name || patient.chartId || '')}
      </span>
    );
  }

  private renderRow(row: CaseRow, rowIndex: number) {
    const { onOpen } = this.props;
    const { patient, summary, hasName } = row;
    const age = formatAgeShort(patient.dateOfBirth);
    const dob = formatDisplayDate(patient.dateOfBirth);
    const sex = formatSexShort(patient.sex);
    const lastVisit = summary !== undefined
      ? formatDisplayDate(summary.lastVisitDate) : null;
    const visitAge = summary !== undefined
      ? formatVisitAge(summary.lastVisitDate) : null;
    const status = row.status;
    const reading = (patient.reading || '').trim();
    return (
      // A real `<tr>`, so the header 190 rows up is a real `<thead>` a printed
      // page can repeat (@see renderHead) -- one `<td>` wide, because the row
      // beneath it is one button that opens the case and a table row only to a
      // screen reader (see below), and a `<tr>` may not hold a `<button>`
      // directly. Both the `<tr>` and this `<td>` carry `role="presentation"`
      // for the same reason `renderHead`'s `<th>` does: the button below
      // already supplies its own `role="row"`, and leaving the real `<tr>`
      // (native row) wrapping it would nest a synthetic row inside a real
      // one -- invalid ARIA table structure. Presentational here removes
      // both the `<tr>` and `<td>` from the accessibility tree, so the
      // button's row attaches directly to the real `<tbody>` (a valid
      // rowgroup context) instead.
      <tr key={patient.id} className={classes.row_item} role="presentation">
        <td className={classes.row_cell} colSpan={COLUMNS.length} role="presentation">
          {/* The row is one button that opens the case, and a table row to a
              screen reader: its cells are announced as the columns they are
              under instead of as one run-on string. Native activation is
              unaffected by the role. */}
          <button
            type="button"
            className={classes.row}
            role="row"
            aria-rowindex={rowIndex}
            onClick={() => onOpen(patient.id)}
          >
            <span className={classes.cell_film} role="cell">
              {this.renderFilm(row)}
            </span>
            <span className={cx(classes.cell_name, classes.cell)} role="cell">
              {hasName ? (
                // The full name where the column has to ellipsise it: two
                // siblings must never be indistinguishable from the list.
                <span
                  className={classes.row_name}
                  title={reading !== '' ? `${patient.name} (${reading})` : patient.name}
                >
                  {patient.name}
                </span>
              ) : (
                // A record filed under a chart ID alone. Printing that identifier
                // here as well would say the same datum twice in one row.
                <span className={classes.row_unnamed}>(unnamed patient)</span>
              )}
              {/* The reading, on the qualifier line every other column uses for
                  one. It is what this column is ORDERED by (kanji carry no
                  reading a collator can find), and a list ordered on a key it
                  never shows is an order the user cannot account for. */}
              {reading !== '' ? (
                <span className={classes.cell_sub} title={reading}>
                  {reading}
                </span>
              ) : null}
            </span>
            <span
              className={cx(classes.cell_chart, classes.cell)}
              role="cell"
              aria-label={
                patient.chartId !== ''
                  ? `Chart ID ${patient.chartId}` : 'No chart ID on file'
              }
            >
              {patient.chartId !== '' ? (
                <span className={classes.chip_id} title={patient.chartId}>
                  {patient.chartId}
                </span>
              ) : (
                <span className={classes.unset}>—</span>
              )}
            </span>
            <span
              className={cx(classes.cell_age, classes.cell)}
              role="cell"
              aria-label={
                age !== null && dob !== null
                  ? `Age ${age}, born ${dob}`
                  : 'Age not known — no date of birth on file'
              }
            >
              {age !== null ? (
                <span className={classes.cell_value}>{age}</span>
              ) : (
                <span className={classes.unset}>—</span>
              )}
              {dob !== null ? (
                <span className={classes.cell_sub}>{dob}</span>
              ) : (
                <span className={classes.cell_sub}>no date of birth</span>
              )}
            </span>
            <span
              className={cx(classes.cell_sex, classes.cell)}
              role="cell"
              aria-label={formatSexFull(patient.sex) || 'Sex not recorded'}
            >
              {sex !== null ? (
                <span className={classes.cell_value}>{sex}</span>
              ) : (
                <span className={classes.unset}>—</span>
              )}
            </span>
            <span
              className={cx(classes.cell_records, classes.cell)}
              role="cell"
              aria-label={describeRecords(summary)}
              // Where the figure comes from, which is the answer to the one
              // question this column can raise: the row is counted off the
              // project as it was last written, not off unsaved work.
              title={
                summary !== undefined
                  ? `Counted from the project saved on ` +
                    `${getTodayISO(new Date(summary.savedAt))}`
                  : 'No project has been saved for this case yet'
              }
            >
              {summary !== undefined && summary.recordCount > 0 ? (
                <span className={classes.cell_value}>{summary.recordCount}</span>
              ) : (
                <span className={classes.unset}>—</span>
              )}
              {summary !== undefined && summary.timepointCount > 0 ? (
                <span className={classes.cell_sub}>
                  {summary.timepointCount === 1
                    ? '1 visit' : `${summary.timepointCount} visits`}
                </span>
              ) : null}
            </span>
            <span
              className={cx(classes.cell_visit, classes.cell)}
              role="cell"
              // How long the case has been under records, which is the one figure
              // the index counts that the row has no column for.
              title={describeVisitSpan(summary)}
              aria-label={
                lastVisit !== null
                  ? `Last visit ${lastVisit}${visitAge !== null ? `, ${visitAge}` : ''}`
                  : 'No dated visit on file'
              }
            >
              {lastVisit !== null ? (
                <span className={classes.cell_value}>{lastVisit}</span>
              ) : (
                <span className={classes.unset}>—</span>
              )}
              {visitAge !== null ? (
                <span className={classes.cell_sub}>{visitAge}</span>
              ) : null}
            </span>
            <span className={cx(classes.cell_status, classes.cell)} role="cell">
              <span
                className={cx(classes.chip, classes[STATUS_CHIP_CLASS[status]])}
                title={getCaseTracingTitle(summary)}
              >
                {getCaseTracingLabel(summary)}
              </span>
            </span>
            <span
              className={classes.cell_actions}
              role="cell"
              aria-label="Open case"
            />
          </button>
          <span className={classes.row_delete}>
            <IconButton
              tooltip="Remove patient"
              // Above the icon, never below it: a tooltip painted downwards sat
              // over the *next* patient's row, so on a long list you were
              // pointing at one name and reading another.
              tooltipPosition="top-left"
              style={deleteButtonStyle}
              iconStyle={deleteIconStyle}
              onClick={() => this.requestRemoval(patient)}
            >
              <IconDelete color="#7B8794" hoverColor="#C62828" />
            </IconButton>
          </span>
          <span className={classes.row_chevron} aria-hidden="true">
            <IconArrow color="#A9B4BE" />
          </span>
        </td>
      </tr>
    );
  }

  /**
   * The list's own toolbar: search, then the three filters, then the tally.
   *
   * `hasEmptyState` says the table below is showing "no cases match", which
   * carries a Clear filters button of its own; one action gets one control, so
   * this one stands down rather than putting two identical buttons 240px apart.
   */
  private renderToolbar(shown: number, total: number, hasEmptyState: boolean) {
    const { query, filterSex, filterTracing, filterRecency } = this.state;
    const isFiltered = this.isFiltered();
    return (
      <div className={classes.toolbar}>
        <div className={classes.search_row}>
          <span className={classes.search_icon}>
            <IconSearch color="#7B8794" style={{ width: 18, height: 18 }} />
          </span>
          <input
            type="search"
            className={classes.search_input}
            placeholder="Search name or chart ID"
            aria-label="Search patients by name or chart ID"
            value={query}
            onChange={this.handleQueryChange}
          />
        </div>
        <select
          className={classes.filter_select}
          aria-label="Filter by sex"
          value={filterSex}
          onChange={this.handleSexFilterChange}
        >
          {SEX_FILTER_LABELS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select
          className={cx(classes.filter_select, classes.filter_select__wide)}
          aria-label="Filter by tracing state"
          value={filterTracing}
          onChange={this.handleTracingFilterChange}
        >
          {TRACING_FILTER_LABELS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select
          className={cx(classes.filter_select, classes.filter_select__wide)}
          aria-label="Filter by last visit"
          value={filterRecency}
          onChange={this.handleRecencyFilterChange}
        >
          {RECENCY_FILTER_LABELS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <span className={classes.toolbar_spacer} />
        {isFiltered && !hasEmptyState ? (
          <button
            type="button"
            className={classes.clear_btn}
            onClick={this.clearFilters}
          >
            Clear filters
          </button>
        ) : null}
        <span className={classes.tally}>
          {isFiltered ? (
            <span>
              <strong>{shown}</strong> of {total}
            </span>
          ) : (
            <span>
              <strong>{total}</strong> {total === 1 ? 'case' : 'cases'}
            </span>
          )}
        </span>
      </div>
    );
  }

  /**
   * Which slice of the filtered list is on screen, and the way to the rest.
   * Only rendered when there is something to page through (see `render`).
   */
  private renderPager(shown: number, page: number, pageCount: number) {
    const { pageSize } = this.state;
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(shown, page * pageSize);
    return (
      <div className={classes.pager}>
        <span className={classes.pager_range}>
          {`Showing ${first}–${last} of ${shown}`}
        </span>
        <span className={classes.pager_spacer} />
        <label className={classes.pager_size}>
          Rows
          <select
            className={classes.filter_select}
            aria-label="Cases per page"
            value={pageSize}
            onChange={this.handlePageSizeChange}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        {/* The two page steps carry their names as `title`/`aria-label` rather
            than as mui tooltips: mui 0.20 shows a tooltip on *focus* and paints
            it below the button, so after a click a black "Next page" label sat
            on the app background under the card — including while the button
            was disabled. The click also gives the focus back to the list. */}
        <span className={classes.pager_nav}>
          <IconButton
            title="Previous page"
            aria-label="Previous page"
            style={deleteButtonStyle}
            iconStyle={pagerIconStyle}
            disabled={page <= 1}
            onClick={(e) => this.stepPage(e, page - 1)}
          >
            <IconChevronLeft color={page <= 1 ? '#C3CCD6' : '#52616F'} />
          </IconButton>
          <span className={classes.pager_page}>
            Page {page} of {pageCount}
          </span>
          <IconButton
            title="Next page"
            aria-label="Next page"
            style={deleteButtonStyle}
            iconStyle={pagerIconStyle}
            disabled={page >= pageCount}
            onClick={(e) => this.stepPage(e, page + 1)}
          >
            <IconChevronRight color={page >= pageCount ? '#C3CCD6' : '#52616F'} />
          </IconButton>
        </span>
      </div>
    );
  }

  /**
   * The printed sheet's own paper geometry and its running foot — the same
   * construction the records dashboard's own case sheet uses
   * (`RecordsDashboard#renderPrintPageStyle`, whose margin boxes and type this
   * matches exactly), because a chart holding a printed case list alongside a
   * case sheet or a report cannot date and number its sheets two ways.
   *
   * Declared here rather than in the stylesheet for the same two reasons that
   * component gives: the foot's date is generated at render time, and a static
   * `@page` in *this* stylesheet would be document-wide the moment this bundle
   * sits alongside the report's or the superimposition's, which set their own
   * page box (see the print block at the foot of style.scss, which explains why
   * it deliberately declares none). Rendered only while this screen is mounted
   * at all — the app shows the case list or an open case, never both (see
   * `components/App`) — so the page box this injects is always this surface's
   * own.
   *
   * The header repeats without any of this (a real `<thead>`, @see renderHead)
   * — this is only what numbers the sheets and dates the print run, which the
   * header cannot carry since it is the same on every page.
   */
  private renderPrintPageStyle = () => {
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
   * The caption the printed sheet carries instead of the toolbar.
   *
   * A work queue is something a practice prints and carries, and on paper the
   * search box and the three selects are gone — so the sheet has to say which
   * cases these are: what was searched, what was filtered, what the order is,
   * and how many rows it holds. Screen-only chrome would be the wrong way round:
   * this is screen-*hidden* (see `style.scss`).
   *
   * The printed sheet carries the WHOLE filtered list (@see `render`), so the
   * caption states its size rather than a page of it; the pager comes off the
   * paper, because the range would then be the same datum stated twice.
   */
  private renderPrintCaption(shown: number) {
    const {
      query, sortKey, sortDir, filterSex, filterTracing, filterRecency,
    } = this.state;
    const trimmed = query.trim();
    const parts: string[] = [];
    if (trimmed !== '') {
      parts.push(`Search “${trimmed}”`);
    }
    // The filters are named in the words their own controls use.
    const labelOf = <T extends string>(
      options: Array<{ id: T; label: string }>, id: T,
    ): string => {
      const found = options.filter((option) => option.id === id)[0];
      return found !== undefined ? found.label : '';
    };
    if (filterSex !== 'all') {
      parts.push(labelOf(SEX_FILTER_LABELS, filterSex));
    }
    if (filterTracing !== 'all') {
      parts.push(labelOf(TRACING_FILTER_LABELS, filterTracing));
    }
    if (filterRecency !== 'all') {
      parts.push(labelOf(RECENCY_FILTER_LABELS, filterRecency));
    }
    return (
      <div className={classes.print_caption} aria-hidden="true">
        <span className={classes.print_caption_title}>Case list</span>
        <span className={classes.print_caption_meta}>
          {parts.length > 0 ? `${parts.join(' · ')} · ` : 'All cases · '}
          {`Ordered by ${SORT_LABELS[sortKey]} ` +
            `(${sortDir === 'asc' ? 'ascending' : 'descending'}) · `}
          {shown > 0
            ? `${shown} ${shown === 1 ? 'case' : 'cases'}`
            : 'No cases match'}
          {` · Printed ${getTodayISO(new Date())}`}
        </span>
      </div>
    );
  }

  /**
   * The first-run state. It is the only screen a new install has, so it says what
   * this app does with a patient once one exists rather than only that there are
   * none.
   */
  private renderFirstRun() {
    return (
      <div className={classes.empty}>
        <span className={classes.empty_icon}>
          <IconPersonOutline
            color="#7B8794"
            style={{ width: 28, height: 28 }}
          />
        </span>
        <span className={classes.empty_title}>No patients yet</span>
        <span className={classes.empty_hint}>
          Register the first patient above — a name and a chart ID are all it
          takes. Their films and photographs are filed after that.
        </span>
        {/* The other way in, and the one that matters on a machine that has
            never seen the case: a .wceph names its own patient. The control for
            it is the header's "Open a case file" button, and this points at it
            rather than repeating it 370px lower — the same rule `registerOpen`
            applies to registration, which likewise has one control at a time. */}
        <span className={classes.empty_hint}>
          Restoring a case you already have as a file? Use <strong>Open a case
          file</strong> at the top right — it registers the chart the file names
          and files everything in it.
        </span>
        <ol className={classes.empty_steps}>
          <li>
            <span className={classes.empty_step_no}>1</span>
            Register the patient
          </li>
          <li>
            <span className={classes.empty_step_no}>2</span>
            File their cephalogram
          </li>
          <li>
            <span className={classes.empty_step_no}>3</span>
            Trace, analyse and report
          </li>
        </ol>
      </div>
    );
  }

  private renderNoMatches() {
    const { query } = this.state;
    const trimmed = query.trim();
    return (
      <div className={classes.empty}>
        <span className={classes.empty_icon}>
          <IconSearch color="#7B8794" style={{ width: 26, height: 26 }} />
        </span>
        <span className={classes.empty_title}>
          {trimmed !== ''
            ? `No cases match “${trimmed}”`
            : 'No cases match these filters'}
        </span>
        <span className={classes.empty_hint}>
          {trimmed !== ''
            ? 'Search matches the patient name, its reading and the chart ID — ' +
              'every word you type has to appear, in any order.'
            : 'Every case is filtered out by the current selection.'}
        </span>
        <button
          type="button"
          className={classes.empty_action}
          onClick={this.clearFilters}
        >
          Clear filters
        </button>
      </div>
    );
  }

  /**
   * The strip that answers "how full is this browser" — honestly: only what
   * `navigator.storage.estimate()` actually reports, never a figure derived
   * from the case index (@see refreshStorage). Screen-only, like the toolbar
   * above it; a printed work queue has no use for a live storage reading.
   */
  private renderStorageStrip() {
    const { storage, storageChecked, persisted } = this.state;
    if (!storageChecked) {
      // Nothing yet, rather than a state that is about to be wrong for one
      // tick — the estimate is normally back within a frame or two.
      return null;
    }
    if (storage === null) {
      return (
        <div className={classes.storage_strip}>
          <span className={classes.storage_text}>
            Storage usage isn't reported by this browser.
          </span>
        </div>
      );
    }
    const { usageBytes, quotaBytes } = storage;
    const fraction = quotaBytes !== null && quotaBytes > 0
      ? Math.min(1, usageBytes / quotaBytes) : null;
    // Amber past 70%, red past 90% — a practice needs the warning while there
    // is still headroom to act on it (export cases, free space), not at 100%
    // when the next save is the one that fails.
    const tone = fraction === null ? 'ok' : (
      fraction >= 0.9 ? 'critical' : (fraction >= 0.7 ? 'warn' : 'ok')
    );
    const persistedNote = persisted === false
      ? ' Not marked for persistent storage — the browser may clear this ' +
        'origin’s data under storage pressure, on its own schedule.'
      : '';
    const title =
      `Reported by this browser for this origin only, not audited against ` +
      `what WebCeph itself has written; the browser's estimate may be ` +
      `rounded for privacy.${persistedNote}`;
    return (
      <div className={classes.storage_strip} title={title}>
        <span className={classes.storage_text}>
          {quotaBytes !== null ? (
            <span>
              <strong>{formatBytes(usageBytes)}</strong> used of about{' '}
              {formatBytes(quotaBytes)} available in this browser
            </span>
          ) : (
            <span>
              <strong>{formatBytes(usageBytes)}</strong> used in this browser —
              this browser does not report a quota
            </span>
          )}
          {persisted === false ? (
            <span className={classes.storage_warn_text}>
              {' '}· may be cleared under storage pressure
            </span>
          ) : null}
        </span>
        {fraction !== null ? (
          <span
            className={classes.storage_bar}
            role="progressbar"
            aria-label="Browser storage used"
            aria-valuenow={Math.round(fraction * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className={cx(classes.storage_bar_fill, {
                [classes.storage_bar_fill__warn]: tone === 'warn',
                [classes.storage_bar_fill__critical]: tone === 'critical',
              })}
              style={{ width: `${Math.max(2, fraction * 100)}%` }}
            />
          </span>
        ) : null}
      </div>
    );
  }

  render() {
    const { patients } = this.props;
    const {
      name, chartId, dateOfBirth, sex, reading, error, pendingRemoval, pageSize,
      printing,
    } = this.state;
    // A fresh install has the well open as its invitation; a practice with cases
    // opens it from the header button. @see toggleRegister
    const isFirstRun = patients.length === 0;
    const registerOpen = isFirstRun || this.state.registerOpen;

    const nameHasError =
      error !== null && (error.field === 'name' || error.field === 'both');
    const chartIdHasError =
      error !== null && (error.field === 'chartId' || error.field === 'both');
    // The message is anchored under the field it concerns; the "both" case
    // reads under the first (name) field while both inputs are outlined.
    const nameMessage =
      error !== null && (error.field === 'name' || error.field === 'both')
        ? error.message : null;
    const chartIdMessage =
      error !== null && error.field === 'chartId' ? error.message : null;

    const terms = searchTerms(this.state.query);
    const rows = this.buildRows();
    const matching = rows.filter((row) => this.matchesFilters(row, terms));
    const sorted = matching.sort(this.compareRows);
    const pageCount = Math.ceil(sorted.length / pageSize);
    // The page the state remembers may not exist any more (a filter has just cut
    // the list): clamp rather than showing an empty table under a page number.
    const page = Math.min(Math.max(1, this.state.page), Math.max(1, pageCount));
    // On paper the whole filtered list is printed, not the page in hand: a
    // 337-case queue was 14 separate print actions, which is not a queue a
    // practice can carry. @see printing
    const pageRows = printing
      ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);

    const dialogActions = [
      (
        <FlatButton
          key="cancel"
          label="Cancel"
          style={cancelButtonStyle}
          labelStyle={cancelLabelStyle}
          onClick={this.cancelRemoval}
        />
      ),
      (
        <RaisedButton
          key="remove"
          label="Remove patient"
          backgroundColor="#C62828"
          labelColor="#FFFFFF"
          className={classes.danger_btn}
          style={removeButtonStyle}
          labelStyle={removeLabelStyle}
          overlayStyle={transparentOverlay}
          onClick={this.confirmRemoval}
        />
      ),
    ];

    return (
      <div className={classes.screen}>
        {/* Paper only: the sheet's own page box and the running foot that dates
            and numbers it. @see renderPrintPageStyle */}
        {this.renderPrintPageStyle()}
        <RestoreFromCaseFile
          open={this.state.restoreOpen}
          existingChartIds={patients.map((p) => p.chartId)}
          onCancel={this.closeRestore}
          onRestore={this.handleRestore}
        />
        <div
          className={cx(classes.card, {
            [classes.card__empty]: isFirstRun,
          })}
        >
          <aside className={classes.brand}>
            <div className={classes.brand_top}>
              <BrandMark />
              <div>
                <h1 className={classes.brand_name}>WebCeph</h1>
                <p className={classes.brand_tagline}>
                  Cephalometric tracing &amp; analysis
                </p>
              </div>
            </div>
            <div className={classes.brand_art}>
              <BrandConstellation />
            </div>
            <ul className={classes.brand_points}>
              <li>Automatic landmark plotting</li>
              <li>Steiner, Downs, Dental and more</li>
              <li>Projects saved privately on this device</li>
            </ul>
          </aside>

          <div className={classes.main}>
            <div className={classes.header}>
              <div className={classes.header_text}>
                {/* The count is not stated here: the toolbar's tally ("523
                    cases") and the pager's range ("Showing 1–25 of 523") already
                    say it, and together they say more than a badge can. */}
                <h2 className={classes.header_title}>Patients</h2>
                <p className={classes.header_sub}>
                  {isFirstRun
                    ? 'Register the first patient to start a case.'
                    : 'Open a case to work on it, or register a new patient.'}
                </p>
              </div>
              {/* Registration, folded into one button while there is a list to
                  give the height to. It is the only creation action on the
                  screen, and while the well is open the well's own Register is
                  the primary — so this button is not on screen at the same
                  time. @see toggleRegister */}
              {/* Two ways a case gets onto this device, side by side: a chart
                  registered here, or a chart restored from the one file a case
                  leaves this device in. The second is not a lesser path — on a
                  new machine it is the only one, and the case list offering
                  registration alone made a clinician invent a patient from
                  memory before the app would read the file that names them.
                  @see ./RestoreFromCaseFile */}
              <div className={classes.header_actions}>
                <button
                  type="button"
                  className={classes.open_btn}
                  onClick={this.openRestore}
                >
                  Open a case file
                </button>
                {!isFirstRun && !registerOpen ? (
                  <button
                    type="button"
                    className={classes.new_btn}
                    onClick={this.toggleRegister}
                  >
                    <span className={classes.new_btn_plus} aria-hidden="true">
                      +
                    </span>
                    Register patient
                  </button>
                ) : null}
              </div>
            </div>

            {/* A restore that did not land — said here because this is where it
                leaves the clinician: the chart the file named was registered,
                the file could not be read into it, and the chart has been taken
                off this list again. Silence here was a clinician holding what
                may be their only copy of a case with no idea why it was
                refused. @see StoreState['patients.restoreError'] */}
            {this.props.restoreError !== null ? (
              <div className={classes.restore_failed} role="alert">
                <span className={classes.restore_failed_title}>
                  That case file was not read in, and no chart was created
                </span>
                <span className={classes.restore_failed_text}>
                  {`${readErrorMessage(this.props.restoreError)} `}
                  The chart the file names was registered and has been removed
                  again, so nothing of the case is on this device. No other case
                  on this device was touched, and the file itself is unchanged.
                </span>
                <button
                  type="button"
                  className={classes.restore_failed_action}
                  onClick={this.openRestore}
                >
                  Open a case file again
                </button>
              </div>
            ) : null}

            {registerOpen ? (
            <div className={classes.form}>
              <div className={classes.form_head}>
                <span className={classes.form_label}>New patient</span>
                {!isFirstRun ? (
                  <button
                    type="button"
                    className={classes.form_close}
                    // No aria-label: the visible word is the whole label, and an
                    // aria-label that does not contain it would leave a speech
                    // user unable to ask for the button they can see.
                    title="Cancel registering a patient (Esc)"
                    onClick={this.toggleRegister}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <div className={classes.form_row}>
                <PatientTextField
                  label="Patient name"
                  placeholder="e.g. 山田 太郎"
                  className={classes.field_name}
                  // Opened from the header button, the caret belongs in the
                  // field the user opened it to type in. Never on first run,
                  // where nothing has been asked for yet.
                  autoFocus={this.state.registerOpen && !isFirstRun}
                  value={name}
                  invalid={nameHasError}
                  message={nameMessage}
                  onChange={this.handleNameChange}
                  onKeyDown={this.handleKeyDown}
                />
                <PatientTextField
                  label="Chart ID"
                  placeholder="e.g. C-0001"
                  className={classes.field_chart}
                  value={chartId}
                  invalid={chartIdHasError}
                  message={chartIdMessage}
                  onChange={this.handleChartIdChange}
                  onKeyDown={this.handleKeyDown}
                />
                {/* The reading of the name: what a Japanese case list is
                    ordered by, since kanji carry no reading a collator can
                    find. Optional, like the date of birth and the sex. */}
                <PatientTextField
                  label="Reading (かな)"
                  placeholder="e.g. やまだ たろう"
                  optional
                  className={classes.field_reading}
                  value={reading}
                  onChange={this.handleReadingChange}
                  onKeyDown={this.handleKeyDown}
                />
                <DateOfBirthField
                  className={classes.field_dob}
                  value={dateOfBirth}
                  onChange={this.handleDateOfBirthChange}
                  onKeyDown={this.handleKeyDown}
                />
                <SexField value={sex} onChange={this.handleSexChange} />
                <div className={classes.form_action}>
                  {/* Keeps the button on the inputs' own baseline — the blank is
                      exactly one field label tall. @see FieldLabelSpacer */}
                  <FieldLabelSpacer />
                  <RaisedButton
                    primary
                    label="Register"
                    className={classes.register_btn}
                    labelStyle={registerLabelStyle}
                    overlayStyle={transparentOverlay}
                    onClick={this.register}
                  />
                </div>
              </div>
            </div>
            ) : null}

            {isFirstRun ? (
              this.renderFirstRun()
            ) : (
              <div className={classes.list_block}>
                {this.renderToolbar(
                  sorted.length, patients.length, sorted.length === 0,
                )}
                {/* Paper carries no controls, so the sheet states what the
                    controls were set to — see `renderPrintCaption`. */}
                {this.renderPrintCaption(sorted.length)}
                {/* A real `<table>`, so its `<thead>` is one a printed page
                    repeats — @see renderHead, and the print block at the foot of
                    style.scss for why the div this replaces never could. On
                    screen `.table`/`.thead`/`.list` keep the exact flex/grid
                    layout they always had (see style.scss): the tag changed,
                    the box model did not. */}
                <table
                  className={cx(classes.table, {
                    // An empty state is centred in the space the table occupies,
                    // rather than pinned to the top of it.
                    [classes.table__empty]: pageRows.length === 0,
                  })}
                  aria-label="Case list"
                  aria-colcount={COLUMNS.length}
                  aria-rowcount={sorted.length + 1}
                  ref={this.setTable}
                >
                  {this.renderHead()}
                  {pageRows.length === 0 ? (
                    // No `.list` class on this one (@see syncTableHeight): it
                    // holds one filler row, never the rows that method quantises
                    // the table's height to.
                    <tbody>
                      <tr>
                        <td colSpan={COLUMNS.length}>
                          {this.renderNoMatches()}
                        </td>
                      </tr>
                    </tbody>
                  ) : (
                    <tbody className={classes.list}>
                      {pageRows.map((row, index) => this.renderRow(
                        // aria row indices count the header as row 1 and run
                        // over the whole filtered list, not this page.
                        row,
                        (printing ? 0 : (page - 1) * pageSize) + index + 2,
                      ))}
                    </tbody>
                  )}
                </table>
                {/* A pager over a table with nothing in it would read "Page 0 of
                    0" under an empty state that has already said why. */}
                {sorted.length > 0
                  ? this.renderPager(sorted.length, page, pageCount)
                  : null}
              </div>
            )}

            <div className={classes.footnote}>
              <IconLock color="#A9B4BE" style={{ width: 14, height: 14 }} />
              Patient data stays in this browser — nothing is uploaded.
            </div>
            {this.renderStorageStrip()}
          </div>
        </div>

        <Dialog
          open={pendingRemoval !== null}
          title="Remove patient?"
          titleStyle={dialogTitleStyle}
          bodyStyle={dialogBodyStyle}
          contentStyle={{ width: 440, maxWidth: '90vw' }}
          actionsContainerStyle={dialogActionsStyle}
          paperProps={{
            role: 'dialog',
            'aria-modal': 'true',
            // A plain string `title` is rendered by Dialog's own internal
            // markup, so there is no heading element here to point
            // aria-labelledby at — aria-label says the same thing directly.
            'aria-label': 'Remove patient?',
            style: dialogPaperStyle,
          }}
          actions={dialogActions}
          onRequestClose={this.cancelRemoval}
        >
          {pendingRemoval !== null ? (
            <span>
              This removes <strong>{patientDisplayName(pendingRemoval)}</strong>
              {pendingRemoval.name !== '' && pendingRemoval.chartId !== ''
                ? ` (${pendingRemoval.chartId})`
                : ''}
              {' '}and their saved project from this browser. This cannot be undone.
              {/* What is actually being destroyed, in the figures the case index
                  already holds — a confirmation that does not say how much it
                  deletes is asking the practice to guess. */}
              {(() => {
                const loss = describeRecordLoss(
                  this.props.caseIndex[pendingRemoval.id],
                );
                return loss !== null ? (
                  <span className={classes.dialog_loss}>
                    Deleted with the case: <strong>{loss}</strong>.
                  </span>
                ) : (
                  <span className={classes.dialog_loss}>
                    No images have been saved for this case.
                  </span>
                );
              })()}
            </span>
          ) : null}
        </Dialog>
      </div>
    );
  }
}
