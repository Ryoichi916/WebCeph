/**
 * Patient-records helpers: the catalogue of image types a record can hold,
 * their clinical labels, which of them are cephalometrically traceable, and
 * the timepoint/date conventions shared by the upload form, the image rail,
 * the records dashboard and the read-only record viewer.
 *
 * One source of truth so those four surfaces can never disagree about what an
 * image is or about whether it can honestly be analysed.
 */

export interface ImageTypeOption {
  id: ImageType;
  /** Full clinical name, e.g. "Lateral cephalogram". */
  label: string;
  /** Rail-sized abbreviation, e.g. "Lat ceph" (must fit a 56px rail). */
  shortLabel: string;
  /**
   * Whether this kind of image supports cephalometric tracing in this app.
   * Only the lateral cephalogram does: every implemented analysis
   * (Downs, Steiner, Tweed, Ricketts, Björk, dental, soft tissues, Jarabak,
   * Wits) is defined on lateral-ceph landmarks. The other types are stored and
   * displayed as part of the record, never presented as analysable.
   */
  isTraceable: boolean;
}

/**
 * The record's image types, in the order a clinic usually collects them.
 * `id` values are the existing `ImageType` keys — no new taxonomy.
 */
export const IMAGE_TYPE_OPTIONS: ImageTypeOption[] = [
  {
    id: 'ceph_lateral',
    label: 'Lateral cephalogram',
    shortLabel: 'Lat ceph',
    isTraceable: true,
  },
  {
    id: 'ceph_pa',
    label: 'Frontal (PA) cephalogram',
    shortLabel: 'PA ceph',
    isTraceable: false,
  },
  {
    id: 'panoramic',
    label: 'Panoramic radiograph',
    shortLabel: 'Pano',
    isTraceable: false,
  },
  {
    id: 'photo_lateral',
    label: 'Profile photograph',
    shortLabel: 'Profile',
    isTraceable: false,
  },
  {
    id: 'photo_frontal',
    label: 'Frontal / intraoral photograph',
    shortLabel: 'Photo',
    isTraceable: false,
  },
];

/** The type a fresh record defaults to — the film this app actually traces. */
export const DEFAULT_IMAGE_TYPE: ImageType = 'ceph_lateral';

const findOption = (type: ImageType | null | undefined) =>
  type === null || type === undefined
    ? undefined
    : IMAGE_TYPE_OPTIONS.filter((o) => o.id === type)[0];

/** Full label for an image type, or a neutral placeholder when unrecorded. */
export const getImageTypeLabel = (type: ImageType | null | undefined): string => {
  const option = findOption(type);
  return option !== undefined ? option.label : 'Unspecified image';
};

/** Rail/caption-sized label for an image type. */
export const getImageTypeShortLabel = (
  type: ImageType | null | undefined,
): string => {
  const option = findOption(type);
  return option !== undefined ? option.shortLabel : 'Image';
};

/**
 * Whether an image of this type can be traced and analysed here.
 * Unknown/unset types are treated as traceable: every image that predates the
 * records layer was loaded through the lateral-ceph tracing flow, so calling
 * those un-analysable would break existing projects.
 */
export const isTraceableImageType = (
  type: ImageType | null | undefined,
): boolean => {
  if (type === null || type === undefined) {
    return true;
  }
  const option = findOption(type);
  return option !== undefined ? option.isTraceable : false;
};

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Today as an ISO `YYYY-MM-DD` string in the user's local timezone. */
export const getTodayISO = (at: Date = new Date()): string =>
  `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;

/**
 * The default timepoint label for the n-th image of a record (0-based):
 * T1, T2, T3… — the convention used in growth and treatment series.
 */
export const getDefaultTimepoint = (existingImageCount: number): string =>
  `T${existingImageCount + 1}`;

/**
 * A date for display, or null when it is missing or malformed — never a guessed
 * or silently substituted date.
 *
 * **One format everywhere: ISO `YYYY-MM-DD`.** This is the format the report
 * already printed the date of birth in, it is the format the value is stored in,
 * and it is the only one that cannot be read as either 08/04 or 04/08 by a
 * clinician reading a chart in a country other than the one the film was taken
 * in. The dashboard, the report header, the film-date chips and the record
 * details all read from here, so the same day can never appear as `1998/04/12`
 * on one surface and `1998-04-12` on the next.
 *
 * (The native date *input* still renders in the browser's own locale — that is
 * the platform's control, not ours; the echo underneath it is what states the
 * date unambiguously.)
 */
export const formatCaptureDate = (
  captureDate: string | null | undefined,
): string | null => {
  if (captureDate === null || captureDate === undefined) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(captureDate.trim());
  if (match === null) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

/**
 * @see formatCaptureDate — the same formatter, named for the dates that are not
 * capture dates (a patient's date of birth). One function, so no surface can
 * drift into a second date format.
 */
export const formatDisplayDate = formatCaptureDate;

/**
 * A capture date as a local `Date`, or null when missing or malformed.
 * Used to date-stamp a report against the film it was traced from and to work
 * out the patient's age at the radiograph (which is not their age today).
 */
export const parseCaptureDate = (
  captureDate: string | null | undefined,
): Date | null => {
  if (captureDate === null || captureDate === undefined) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(captureDate.trim());
  if (match === null) {
    return null;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  // Local time, mirroring utils/patient#parseDateOfBirth: Date.parse would
  // read the string as UTC and shift the day in negative-offset timezones.
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * The image type in the middle of a sentence, e.g. "a panoramic radiograph".
 * Only the first letter is lowered, so "Frontal (PA) cephalogram" keeps its
 * abbreviation intact.
 */
export const getImageTypeLabelInSentence = (
  type: ImageType | null | undefined,
): string => {
  const label = getImageTypeLabel(type);
  return label.charAt(0).toLowerCase() + label.slice(1);
};

/**
 * The rail-sized form of a free-text timepoint: its first whitespace-separated
 * token, so "T3 pre-treatment" reads as "T3" in a 64px rail instead of
 * ellipsizing to "T3 pr…". The full label stays in the tile's tooltip.
 */
export const getTimepointToken = (
  timepoint: string | null | undefined,
): string | null => {
  if (timepoint === null || timepoint === undefined) {
    return null;
  }
  const tokens = timepoint.trim().split(/\s+/).filter((t) => t.length > 0);
  return tokens.length > 0 ? tokens[0] : null;
};

/**
 * Sort key for a record card: the capture date when known, otherwise a value
 * that sorts after every real date so undated images collect at the end
 * instead of pretending to be the oldest.
 */
export const getCaptureDateSortKey = (
  captureDate: string | null | undefined,
): string =>
  formatCaptureDate(captureDate) !== null ? captureDate!.trim() : '9999-99-99';

// ---- Timepoint grouping ----------------------------------------------------

/**
 * The minimum a record has to state to be grouped into a timepoint: its label
 * and the day it was captured. Declared structurally rather than importing
 * `PatientRecord` — that type lives in the workspace reducer, which imports
 * *this* module, so a nominal dependency here would be a cycle.
 */
export interface TimepointGroupable {
  timepoint: string | null;
  captureDate: string | null;
}

/**
 * One timepoint of a patient's imaging record: the films and photographs taken
 * at the same visit, with the span they actually cover.
 *
 * Every field is counted off the records themselves. A group whose members
 * carry no capture date has `firstDate === null` — it does not borrow a date
 * from its neighbours, and `undatedCount` says how many images in the group are
 * undated so a surface can state that instead of implying a date it does not
 * have.
 */
export interface TimepointGroup<T extends TimepointGroupable> {
  /** Stable key: the trimmed label, or `''` for the untimepointed group. */
  key: string;
  /** The timepoint as recorded, or null when these images carry no label. */
  label: string | null;
  /** The group's records, in the order they were handed in (date order). */
  records: T[];
  /** Earliest recorded capture date in the group (ISO), or null when none is. */
  firstDate: string | null;
  /** Latest recorded capture date in the group (ISO), or null when none is. */
  lastDate: string | null;
  /** How many of the group's images carry no capture date at all. */
  undatedCount: number;
}

/**
 * Groups a patient's records by timepoint label and orders the groups the way a
 * chart reads: chronologically by the earliest capture date in each group,
 * groups with no date at all after the dated ones, and the images that carry no
 * timepoint label last of all — never folded into T1 and never sorted among the
 * labelled visits, because "unlabelled" is not a point in time.
 *
 * Records inside a group keep the order they arrive in (the store hands them
 * over sorted by capture date, see `getPatientRecords`).
 */
export const groupRecordsByTimepoint = <T extends TimepointGroupable>(
  records: T[],
): TimepointGroup<T>[] => {
  const order: string[] = [];
  const byKey: { [key: string]: T[] } = {};
  records.forEach((record) => {
    const key = record.timepoint === null ? '' : record.timepoint.trim();
    if (byKey[key] === undefined) {
      byKey[key] = [];
      order.push(key);
    }
    byKey[key].push(record);
  });
  const groups = order.map((key): TimepointGroup<T> => {
    const members = byKey[key];
    const dates = members
      .map(({ captureDate }) => formatCaptureDate(captureDate))
      .filter((d): d is string => d !== null)
      .sort();
    return {
      key,
      label: key === '' ? null : key,
      records: members,
      firstDate: dates.length > 0 ? dates[0] : null,
      lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
      undatedCount: members.length - dates.length,
    };
  });
  return groups.sort((a, b) => {
    // The untimepointed group is last whatever it is dated.
    if ((a.key === '') !== (b.key === '')) {
      return a.key === '' ? 1 : -1;
    }
    const aDate = a.firstDate !== null ? a.firstDate : '9999-99-99';
    const bDate = b.firstDate !== null ? b.firstDate : '9999-99-99';
    if (aDate !== bDate) {
      return aDate < bDate ? -1 : 1;
    }
    // Same day (or both undated): fall back to the label, so T1/T2 taken on one
    // day keep their stated order instead of an accidental one.
    return a.key === b.key ? 0 : (a.key < b.key ? -1 : 1);
  });
};

// ---- Elapsed interval -------------------------------------------------------

/**
 * The interval between two dates, in whole years and months (e.g. `"1 y 4 mo"`,
 * `"7 mo"`, `"12 days"`), or null when either date is unknown.
 *
 * **The app's one duration formatter.** The records dashboard's record span and
 * the superimposition's "… apart" are the same fact — elapsed time between two
 * films — and they printed it two ways ("1 y 4 m" here, "5 mo apart" there) for
 * the same pair of dates. It lives beside the capture-date helpers because that
 * is what it measures; `analyses/superimposition` re-exports it so its own
 * importers keep working.
 *
 * Months are `mo`, never the bare `m` the age chips use: this string is printed
 * on surfaces whose every other number is a millimetre — "+1.7 mm", a 10 mm
 * scale bar, 0.104 mm/px — and "5 m apart" beside them read as five metres. The
 * age chips keep `y / m` (see `utils/patient`), where nothing is measured in
 * millimetres and the ambiguity cannot arise.
 */
export const formatInterval = (
  from: Date | null, to: Date | null,
): string | null => {
  if (from === null || to === null) {
    return null;
  }
  const earlier = from.getTime() <= to.getTime() ? from : to;
  const later = from.getTime() <= to.getTime() ? to : from;
  let months =
    (later.getFullYear() - earlier.getFullYear()) * 12 +
    (later.getMonth() - earlier.getMonth());
  if (later.getDate() < earlier.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    months = 0;
  }
  if (months === 0) {
    const days = Math.round(
      (later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000),
    );
    return days === 1 ? '1 day' : `${days} days`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) {
    return `${rest} mo`;
  }
  return rest > 0 ? `${years} y ${rest} mo` : `${years} y`;
};

// ---- Implied film size ------------------------------------------------------

/**
 * The physical size a calibration claims the image is, and whether that claim is
 * plausible for a radiograph.
 */
export interface ImpliedFilmSize {
  widthMm: number;
  heightMm: number;
  /** `"83 × 100 mm"` — the size, as it is shown beside the scale. */
  label: string;
  /**
   * False when the implied film falls outside `FILM_SIZE_BAND` — the calibration
   * is almost certainly wrong (a 10 mm ruler marked over 96 px instead of 9.6,
   * say), and every millimetre measured from it is wrong by the same factor.
   */
  isPlausible: boolean;
}

/**
 * The band a real cephalogram's shorter and longer sides fall in.
 *
 * A lateral ceph is exposed on an 8 × 10 in cassette (203 × 254 mm) or a digital
 * sensor of much the same size; a tightly cropped export can be smaller, and a
 * large-format or padded export bigger. 100–500 mm per side is generous on both
 * ends: it passes every plate a clinic actually produces and still catches a
 * calibration out by a factor of two or more, which is the error this band
 * exists for.
 */
export const FILM_SIZE_BAND = { minMm: 100, maxMm: 500 };

/**
 * What a mm/px scale says the image measures in life, or null when the pixel
 * size or the scale is not recorded.
 *
 * This is the one reading of a calibration a clinician can sanity-check without
 * the ruler in front of them: `0.104 mm/px` means nothing on its own, while
 * "this 800 × 960 film is 83 × 100 mm" is immediately either right or absurd.
 */
export const getImpliedFilmSize = (
  width: number | null,
  height: number | null,
  scaleFactor: number | null,
): ImpliedFilmSize | null => {
  if (
    width === null || height === null || scaleFactor === null ||
    !isFinite(width) || !isFinite(height) || !isFinite(scaleFactor) ||
    width <= 0 || height <= 0 || scaleFactor <= 0
  ) {
    return null;
  }
  const widthMm = width * scaleFactor;
  const heightMm = height * scaleFactor;
  const { minMm, maxMm } = FILM_SIZE_BAND;
  const isPlausible =
    widthMm >= minMm && widthMm <= maxMm &&
    heightMm >= minMm && heightMm <= maxMm;
  return {
    widthMm,
    heightMm,
    label: `${Math.round(widthMm)} × ${Math.round(heightMm)} mm`,
    isPlausible,
  };
};
