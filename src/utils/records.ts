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
