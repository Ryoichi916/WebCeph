/**
 * The case list's reading of a patient's record.
 *
 * The patient picker is the practice's case list: a few hundred rows that have
 * to be sortable, filterable and scannable before anything is opened. What it
 * shows per case — images on file, visits, last visit, how far the tracing has
 * got, a thumbnail of the newest film — is counted off the patient's project
 * when that project is written or opened (see store/middleware/project) and kept
 * beside the patient as a `PatientCaseSummary`.
 *
 * This module holds the two halves of that arrangement that are pure: the
 * counting itself, and the vocabulary the list reads a summary in. The canvas
 * work (the thumbnail) stays in the middleware, so nothing here touches the DOM.
 *
 * Everything is counted off the records. A case whose project has never been
 * saved has no summary at all, and the list says so rather than implying an
 * empty record — the difference between "nothing on file" and "not yet written"
 * is a difference a clinical list must not blur.
 */

import { formatCaptureDate, formatInterval, getCaptureDateSortKey } from 'utils/records';

/**
 * The minimum a record has to state to be counted into a case summary.
 *
 * Declared structurally rather than importing `PatientRecord`: that type lives in
 * the workspace reducer, which imports this module's neighbour `utils/records`,
 * and a nominal dependency here would be a cycle (the same reason
 * `TimepointGroupable` is declared structurally next door).
 */
export interface SummarizableRecord {
  type: ImageType | null;
  timepoint: string | null;
  captureDate: string | null;
  /** Whether this kind of image supports tracing at all (lateral cephs). */
  isTraceable: boolean;
  /** Manual steps of the film's own analysis that carry a landmark. */
  landmarksPlaced: number;
  /** Manual steps that analysis asks for; 0 when no analysis is set. */
  landmarksRequired: number;
  /** Every landmark actually stored for the film. */
  landmarkPoints: GeoPoint[];
  /** The image's data URI, from which the row's thumbnail is rendered. */
  thumbnail: string | null;
}

/** The counted half of a summary — everything except the rendered thumbnail. */
export type CaseSummaryCounts = {
  [K in Exclude<keyof PatientCaseSummary, 'savedAt' | 'thumbnail' | 'thumbnailType'>]:
    PatientCaseSummary[K];
};

/**
 * Which image of a visit the row's tile is taken from, when that visit was
 * radiographed *and* photographed on the same day.
 *
 * The lateral cephalogram first, because it is the film this app exists to read
 * and the one a clinician recognises the case by; then the face, then the other
 * radiographs. An intraoral frame last of all: a 40px tile of a buccal segment
 * identifies nothing at a glance, and it was what a records visit's last-filed
 * image happened to be.
 */
const THUMBNAIL_TYPE_PREFERENCE: ImageType[] = [
  'ceph_lateral',
  'photo_lateral',
  'photo_frontal',
  'panoramic',
  'ceph_pa',
  'photo_intraoral',
];

const getThumbnailTypeRank = (type: ImageType | null): number => {
  if (type === null) {
    return THUMBNAIL_TYPE_PREFERENCE.length;
  }
  const index = THUMBNAIL_TYPE_PREFERENCE.indexOf(type);
  return index === -1 ? THUMBNAIL_TYPE_PREFERENCE.length : index;
};

/**
 * Which film a case's row shows: an image from the newest **dated** visit on
 * file, falling back to the record itself when it carries no dates at all.
 *
 * An undated image is never treated as the most recent one — it has no date to be
 * recent by. Where the newest visit holds several images, the type preference
 * above decides between them; nothing here invents a date or a film.
 */
export const findCaseThumbnailRecord = <T extends SummarizableRecord>(
  records: T[],
): T | null => {
  if (records.length === 0) {
    return null;
  }
  // A row would rather show an older film than no film at all, so records that
  // carry no image data are only considered when nothing else does.
  const withImage = records.filter(({ thumbnail }) => thumbnail !== null);
  const pool = withImage.length > 0 ? withImage : records;
  const dated = pool.filter(
    ({ captureDate }) => formatCaptureDate(captureDate) !== null,
  );
  const candidates = dated.length > 0 ? dated : pool;
  const newest = candidates.reduce(
    (key, record) => {
      const own = getCaptureDateSortKey(record.captureDate);
      return own > key ? own : key;
    },
    '',
  );
  const sameVisit = candidates.filter(
    (record) => getCaptureDateSortKey(record.captureDate) === newest,
  );
  return sameVisit.slice().sort(
    (a, b) => getThumbnailTypeRank(a.type) - getThumbnailTypeRank(b.type),
  )[0];
};

/**
 * Counts a patient's records into the figures the case list is read on.
 *
 * The tracing figures follow the records dashboard's own reading of a film
 * exactly (see `StatusChip` there): a film counts as traced when every manual
 * step of *its own* analysis carries a landmark, and as partly traced when some
 * do. A traceable film with no analysis set (`landmarksRequired === 0`) counts as
 * neither — there is no set of landmarks to be complete against — but it is
 * still counted as a ceph on file, which is what the list needs to tell "no film
 * yet" from "film, nothing done".
 */
export const summarizeCaseRecords = (
  records: SummarizableRecord[],
): CaseSummaryCounts => {
  const dates = records
    .map(({ captureDate }) => formatCaptureDate(captureDate))
    .filter((d): d is string => d !== null)
    .sort();
  const timepoints: { [key: string]: true } = {};
  records.forEach(({ timepoint }) => {
    // The untimepointed images are one group of their own, exactly as the
    // dashboard groups them (`groupRecordsByTimepoint`), never folded into T1.
    timepoints[timepoint === null ? '' : timepoint.trim()] = true;
  });
  const cephs = records.filter(({ isTraceable }) => isTraceable);
  const traced = cephs.filter(
    (r) => r.landmarksRequired > 0 && r.landmarksPlaced >= r.landmarksRequired,
  );
  const partial = cephs.filter(
    (r) => r.landmarksPlaced > 0 && r.landmarksPlaced < r.landmarksRequired,
  );
  return {
    recordCount: records.length,
    timepointCount: Object.keys(timepoints).length,
    firstVisitDate: dates.length > 0 ? dates[0] : null,
    lastVisitDate: dates.length > 0 ? dates[dates.length - 1] : null,
    cephCount: cephs.length,
    tracedCount: traced.length,
    partialCount: partial.length,
  };
};

// ---- Reading a summary ------------------------------------------------------

/**
 * How far a case's tracing has got, as one of six states — the axis the list is
 * filtered and sorted on, and the vocabulary of its status chip.
 *
 * The three "nothing to be behind on" states are kept apart, because they are
 * different facts about a chart and the list has to be able to say each of them:
 * `no_project` is a patient whose project has never been written (registered,
 * never opened), `no_records` a saved project holding no image at all, and
 * `no_ceph` a case with images but no lateral cephalogram — a record with
 * nothing to analyse.
 */
export type CaseTracingStatus =
  'traced' | 'partial' | 'untraced' | 'no_ceph' | 'no_records' | 'no_project';

/** Rank of a tracing state as *progress*, so sorting on it reads as progress. */
const TRACING_RANK: { [K in CaseTracingStatus]: number } = {
  no_project: 0,
  no_records: 1,
  no_ceph: 2,
  untraced: 3,
  partial: 4,
  traced: 5,
};

/**
 * A case counts as traced when **every** lateral cephalogram on file is traced,
 * and as partly traced while any of them is not.
 *
 * One film out of three is not a traced case: it is a case with two films still
 * outstanding, which is precisely what the practice's work queue is asking for.
 * The count is carried in the chip's own label ("Traced · 1 of 3"), so the row
 * still says how far along it is.
 */
export const getCaseTracingStatus = (
  summary: PatientCaseSummary | undefined,
): CaseTracingStatus => {
  if (summary === undefined) {
    return 'no_project';
  }
  if (summary.recordCount === 0) {
    return 'no_records';
  }
  if (summary.cephCount === 0) {
    return 'no_ceph';
  }
  if (summary.tracedCount >= summary.cephCount) {
    return 'traced';
  }
  if (summary.tracedCount > 0 || summary.partialCount > 0) {
    return 'partial';
  }
  return 'untraced';
};

export const getCaseTracingRank = (
  summary: PatientCaseSummary | undefined,
): number => TRACING_RANK[getCaseTracingStatus(summary)];

/** What share of this case's films are traced — 0 when there is no film. */
const getTracedFraction = (summary: PatientCaseSummary | undefined): number => {
  if (summary === undefined || summary.cephCount === 0) {
    return 0;
  }
  return summary.tracedCount / summary.cephCount;
};

/**
 * Orders two cases by tracing **progress**, which is what the Tracing column
 * claims to be sorted on: the state first, then — within one state — the share
 * of the case's films that are traced, then how many films that share is of.
 *
 * Without the fraction, "Traced · 1 of 5" and "Traced · 4 of 5" ranked equal and
 * the column fell back to the patient's name, so a barely-started case stood
 * among finished ones in the very ordering meant to separate them.
 */
export const compareCaseTracing = (
  a: PatientCaseSummary | undefined,
  b: PatientCaseSummary | undefined,
): number => {
  const rank = getCaseTracingRank(a) - getCaseTracingRank(b);
  if (rank !== 0) {
    return rank;
  }
  const fraction = getTracedFraction(a) - getTracedFraction(b);
  if (fraction !== 0) {
    return fraction;
  }
  // Same share of the same state: the case carrying more films is the further
  // along of the two ("2 of 2" after "1 of 1").
  const films = (a !== undefined ? a.cephCount : 0) -
    (b !== undefined ? b.cephCount : 0);
  if (films !== 0) {
    return films;
  }
  // Nothing traced either side: a film with landmarks started is ahead of one
  // with nothing placed on it at all.
  return (a !== undefined ? a.partialCount : 0) -
    (b !== undefined ? b.partialCount : 0);
};

/**
 * The status chip's label. The wording is the records dashboard's, so a case
 * reads the same on the list as it does once it is open: "Traced", "Partly
 * traced", "Not traced".
 *
 * A case with more than one film states the count with it ("Traced · 1 of 3"),
 * because on a multi-film case "Traced" alone would claim the whole record — and
 * the chip that carries it is amber until the last film is done (@see
 * getCaseTracingStatus).
 *
 * "Not opened yet" and "No images on file" are deliberately different sentences:
 * the first is a patient registered but never opened, the second a project that
 * has been written and holds nothing.
 */
export const getCaseTracingLabel = (
  summary: PatientCaseSummary | undefined,
): string => {
  const status = getCaseTracingStatus(summary);
  if (summary === undefined) {
    return 'Not opened yet';
  }
  switch (status) {
    case 'no_project':
      return 'Not opened yet';
    case 'no_records':
      return 'No images on file';
    case 'no_ceph':
      return 'No ceph on file';
    case 'traced':
      return summary.cephCount > 1
        ? `Traced · ${summary.tracedCount} of ${summary.cephCount}`
        : 'Traced';
    case 'partial':
      // Some films done, some not: the count is the whole point of the chip.
      return summary.tracedCount > 0
        ? `Traced · ${summary.tracedCount} of ${summary.cephCount}`
        : 'Partly traced';
    default:
      return 'Not traced';
  }
};

/** The chip's tooltip: the same facts spelled out, films and all. */
export const getCaseTracingTitle = (
  summary: PatientCaseSummary | undefined,
): string | undefined => {
  if (summary === undefined) {
    return 'This case has no saved project yet.';
  }
  if (summary.cephCount === 0) {
    return summary.recordCount === 0
      ? 'Nothing on file for this case.'
      : `${summary.recordCount} image${summary.recordCount === 1 ? '' : 's'} on ` +
        `file, none of them a lateral cephalogram — nothing to analyse yet.`;
  }
  const films = `${summary.cephCount} lateral ceph` +
    (summary.cephCount === 1 ? '' : 's');
  return `${films} on file · ${summary.tracedCount} traced · ` +
    `${summary.partialCount} partly traced`;
};

/**
 * How long ago the last visit on file was — the recency the list filters on.
 * `none` means the case carries no dated image at all, which is not the same as
 * a long time ago.
 */
export type VisitRecency = 'recent' | 'year' | 'older' | 'none';

/** Months the `recent` and `year` buckets cover. */
export const RECENCY_MONTHS = { recent: 3, year: 12 };

const monthsBetween = (from: Date, to: Date): number => {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) {
    months -= 1;
  }
  return months < 0 ? 0 : months;
};

export const getVisitRecency = (
  lastVisitDate: string | null | undefined,
  at: Date = new Date(),
): VisitRecency => {
  const iso = formatCaptureDate(lastVisitDate);
  if (iso === null) {
    return 'none';
  }
  const parts = iso.split('-').map((p) => parseInt(p, 10));
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  // A film dated in the future is a typo, not a visit that has not happened: it
  // is the most recent thing on file either way, so it reads as recent.
  if (date.getTime() > at.getTime()) {
    return 'recent';
  }
  const months = monthsBetween(date, at);
  if (months < RECENCY_MONTHS.recent) {
    return 'recent';
  }
  return months < RECENCY_MONTHS.year ? 'year' : 'older';
};

/**
 * "5 mo ago" / "today" for the last-visit column, or null when the case carries
 * no dated image. Elapsed time is the app's one duration formatter
 * (`utils/records#formatInterval`), so this reads exactly as the records
 * dashboard's own intervals do.
 */
export const formatVisitAge = (
  lastVisitDate: string | null | undefined,
  at: Date = new Date(),
): string | null => {
  const iso = formatCaptureDate(lastVisitDate);
  if (iso === null) {
    return null;
  }
  const parts = iso.split('-').map((p) => parseInt(p, 10));
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  if (date.getTime() === today.getTime()) {
    return 'today';
  }
  if (date.getTime() > today.getTime()) {
    // Dated ahead of today — state the date's own direction rather than
    // printing "in 3 days ago".
    const ahead = formatInterval(today, date);
    return ahead !== null ? `in ${ahead}` : null;
  }
  const elapsed = formatInterval(date, today);
  return elapsed !== null ? `${elapsed} ago` : null;
};
