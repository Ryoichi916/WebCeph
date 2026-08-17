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
   * The type as it is named on an empty slot — the middle length, between the
   * rail's abbreviation and the full clinical name, and lower-case because it is
   * always read after a verb ("Add profile photo"). A row of six slots set in
   * full clinical names does not fit a visit's panel; set in rail
   * abbreviations ("Lat ceph", "Pano") it reads as jargon on the one surface a
   * clinician scans for what a case is missing.
   */
  slotLabel: string;
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
 * The record's image types, in the order a clinic usually collects them:
 * the two cephalograms, the panoramic, then the extraoral photographs and the
 * intraoral series. This order is the order the timepoint slots are offered in
 * and the order the type select lists, so a clinician meets the record's
 * vocabulary in the same sequence everywhere.
 */
export const IMAGE_TYPE_OPTIONS: ImageTypeOption[] = [
  {
    id: 'ceph_lateral',
    label: 'Lateral cephalogram',
    shortLabel: 'Lat ceph',
    slotLabel: 'lateral ceph',
    isTraceable: true,
  },
  {
    id: 'ceph_pa',
    label: 'Frontal (PA) cephalogram',
    shortLabel: 'PA ceph',
    // Not "PA ceph": that is the *rail's* abbreviation, and a slot set in it
    // reads as jargon on the one surface a clinician scans for what a case is
    // missing (the rule this field's own doc comment states).
    slotLabel: 'frontal ceph',
    isTraceable: false,
  },
  {
    id: 'panoramic',
    label: 'Panoramic radiograph',
    shortLabel: 'Pano',
    // A noun, like every one of its siblings: "Add panoramic" named no thing.
    slotLabel: 'panoramic film',
    isTraceable: false,
  },
  {
    id: 'photo_lateral',
    label: 'Profile photograph',
    shortLabel: 'Profile',
    slotLabel: 'profile photo',
    isTraceable: false,
  },
  {
    // Extraoral, i.e. the face: this used to be "Frontal / intraoral
    // photograph", one option covering two records that are not alike in any
    // clinical sense — a full-face photograph is read for facial symmetry and
    // proportion, an intraoral series for the occlusion — and a clinic filing
    // both had no way to tell them apart afterwards on the card, in the rail or
    // on the printed chart. They are two types now (see `photo_intraoral`).
    id: 'photo_frontal',
    label: 'Frontal photograph',
    shortLabel: 'Frontal',
    slotLabel: 'frontal photo',
    isTraceable: false,
  },
  {
    id: 'photo_intraoral',
    label: 'Intraoral photograph',
    shortLabel: 'Intraoral',
    slotLabel: 'intraoral photo',
    isTraceable: false,
  },
];

/** The type a fresh record defaults to — the film this app actually traces. */
export const DEFAULT_IMAGE_TYPE: ImageType = 'ceph_lateral';

// ---- The photographic series ------------------------------------------------

/**
 * One position of the standard orthodontic photographic series (@see PhotoView),
 * with everything the record surfaces need to name it and to lay it out.
 */
export interface PhotoViewOption {
  id: PhotoView;
  /** Full clinical name of the frame, e.g. "Frontal at rest". */
  label: string;
  /** Cell-sized name, e.g. "Frontal rest" (must fit a ~130px caption). */
  shortLabel: string;
  /**
   * The image type a photograph in this frame **is**. One position belongs to
   * exactly one type, which is what keeps the two facts of a photograph from
   * contradicting each other: setting the position sets the type with it, and a
   * position that does not belong to the stored type is dropped rather than
   * shown (see `reconcilePhotoView`).
   */
  imageType: ImageType;
  /**
   * How the frame is shot, which is the aspect the grid gives its cell.
   *
   * The facial frames are portrait: a full face and a profile are framed head-and-
   * neck, tall. The intraoral frames are landscape: an arch, a buccal segment and
   * an occlusal view are all wider than they are tall. Laid out as one square grid
   * both were cropped to something no clinic shoots, which is exactly what makes a
   * photograph un-assessable — so the cell is shaped like the photograph, and the
   * photograph is *contained* in it, never cropped to fit.
   */
  frame: 'portrait' | 'landscape';
}

/**
 * The series' positions in the order the composite is read: the four extraoral
 * (facial) frames, then the three intraoral frames a clinician reads the occlusion
 * across, then the two occlusal views.
 */
export const PHOTO_VIEW_OPTIONS: PhotoViewOption[] = [
  {
    id: 'face_frontal_rest',
    label: 'Frontal at rest',
    shortLabel: 'Frontal rest',
    imageType: 'photo_frontal',
    frame: 'portrait',
  },
  {
    id: 'face_frontal_smiling',
    label: 'Frontal smiling',
    shortLabel: 'Smiling',
    imageType: 'photo_frontal',
    frame: 'portrait',
  },
  {
    id: 'face_three_quarter',
    label: 'Three-quarter (oblique)',
    shortLabel: 'Three-quarter',
    // Not a profile: the oblique frame is a full-face photograph taken at an
    // angle, and `photo_lateral` is this app's *profile* photograph (its label
    // says so, and the soft-tissue profile analysis is declared on it).
    imageType: 'photo_frontal',
    frame: 'portrait',
  },
  {
    id: 'face_profile',
    label: 'Profile',
    shortLabel: 'Profile',
    imageType: 'photo_lateral',
    frame: 'portrait',
  },
  {
    id: 'intraoral_right_buccal',
    label: 'Right buccal',
    shortLabel: 'Right buccal',
    imageType: 'photo_intraoral',
    frame: 'landscape',
  },
  {
    id: 'intraoral_frontal',
    label: 'Intraoral frontal (centre)',
    shortLabel: 'Frontal (centre)',
    imageType: 'photo_intraoral',
    frame: 'landscape',
  },
  {
    id: 'intraoral_left_buccal',
    label: 'Left buccal',
    shortLabel: 'Left buccal',
    imageType: 'photo_intraoral',
    frame: 'landscape',
  },
  {
    id: 'intraoral_upper_occlusal',
    label: 'Upper occlusal',
    shortLabel: 'Upper occlusal',
    imageType: 'photo_intraoral',
    frame: 'landscape',
  },
  {
    id: 'intraoral_lower_occlusal',
    label: 'Lower occlusal',
    shortLabel: 'Lower occlusal',
    imageType: 'photo_intraoral',
    frame: 'landscape',
  },
];

/**
 * One band of the composite tile: the positions that are read together, in the
 * order they are read.
 *
 * Three bands and not one flat row of nine, because that is how the series is
 * shot and how it is read: the face, then the occlusion from the right through
 * the centre to the left, then the two arches from above and below. The buccal
 * band deliberately runs right → centre → left, which is the patient's right on
 * the *left* of the sheet — the convention every clinical photograph set and every
 * radiograph in this app already follows.
 */
export interface PhotoSeriesRow {
  key: string;
  /** The band's micro-label above the cells. */
  label: string;
  views: PhotoView[];
}

export const PHOTO_SERIES_ROWS: PhotoSeriesRow[] = [
  {
    key: 'extraoral',
    label: 'Extraoral',
    views: [
      'face_frontal_rest',
      'face_frontal_smiling',
      'face_three_quarter',
      'face_profile',
    ],
  },
  {
    key: 'intraoral',
    label: 'Intraoral',
    views: [
      'intraoral_right_buccal',
      'intraoral_frontal',
      'intraoral_left_buccal',
    ],
  },
  {
    key: 'occlusal',
    label: 'Occlusal',
    views: [
      'intraoral_upper_occlusal',
      'intraoral_lower_occlusal',
    ],
  },
];

/** The image types that are photographs — the ones that hold a series position. */
const PHOTO_TYPES: ImageType[] = [
  'photo_frontal', 'photo_lateral', 'photo_intraoral',
];

/**
 * Whether this kind of image is a photograph, i.e. part of the photographic
 * series rather than of the radiographic record.
 *
 * An image with no type at all is **not** treated as one: every image that
 * predates the records layer was loaded through the lateral-ceph tracing flow (the
 * same assumption `isTraceableImageType` makes), and putting one in a photograph
 * grid would put a cephalogram in a facial series.
 */
export const isPhotographType = (
  type: ImageType | null | undefined,
): boolean =>
  type !== null && type !== undefined && PHOTO_TYPES.indexOf(type) >= 0;

/** The position of a given id, or undefined — never a guessed position. */
export const findPhotoView = (
  id: PhotoView | null | undefined,
): PhotoViewOption | undefined => (
  id === null || id === undefined
    ? undefined
    : PHOTO_VIEW_OPTIONS.filter((v) => v.id === id)[0]
);

/** Full name of a position, or a neutral phrase when none is recorded. */
export const getPhotoViewLabel = (id: PhotoView | null | undefined): string => {
  const view = findPhotoView(id);
  return view !== undefined ? view.label : 'Position not recorded';
};

/** Caption-sized name of a position (see `PhotoViewOption#shortLabel`). */
export const getPhotoViewShortLabel = (
  id: PhotoView | null | undefined,
): string => {
  const view = findPhotoView(id);
  return view !== undefined ? view.shortLabel : 'No position';
};

/**
 * The position in the middle of a sentence, e.g. "the upper occlusal photograph".
 * Only the first letter is lowered, so "Three-quarter (oblique)" keeps its
 * parenthesis and "Right buccal" its meaning.
 */
export const getPhotoViewLabelInSentence = (
  id: PhotoView | null | undefined,
): string => {
  const label = getPhotoViewLabel(id);
  return label.charAt(0).toLowerCase() + label.slice(1);
};

/** The positions a photograph of this type can hold (empty for a radiograph). */
export const getPhotoViewsForType = (
  type: ImageType | null | undefined,
): PhotoViewOption[] =>
  type === null || type === undefined
    ? []
    : PHOTO_VIEW_OPTIONS.filter((v) => v.imageType === type);

/**
 * The position a fresh photograph of this type is filed at unless the clinician
 * says otherwise — the first position of that type in the series' own order.
 *
 * Null for anything that is not a photograph. This is a *proposal*, and it is
 * only ever used where it is on screen and editable before the record is written
 * (the upload form's Position field, which the grid's own cells prefill exactly),
 * so nothing is stamped on a record unseen. A photograph already on file is never
 * given one behind the clinician's back: an intraoral photograph whose position
 * was never recorded stays "not recorded" and the grid says so, because
 * "Intraoral photograph" is five different photographs and the record does not
 * state which.
 */
export const getDefaultPhotoView = (
  type: ImageType | null | undefined,
): PhotoView | null => {
  // Named per type rather than "the first frame of that type": the profile
  // photograph *is* the profile frame, the frontal photograph is read at rest,
  // and the one intraoral photograph a clinic files on its own is the centre
  // (the anterior occlusion) — not the right buccal, which is merely the first
  // intraoral frame in reading order.
  switch (type) {
    case 'photo_frontal': return 'face_frontal_rest';
    case 'photo_lateral': return 'face_profile';
    case 'photo_intraoral': return 'intraoral_frontal';
    default: return null;
  }
};

/**
 * The position a record may honestly carry given its type: the stored one where
 * it belongs to that type, and null otherwise.
 *
 * The safety net under the one rule of this pair of fields — a position belongs to
 * exactly one image type — for the paths that write a type without writing a
 * position (a legacy project, an older import, a surface that only edits the
 * type). It drops a contradicting position rather than translating it: nothing
 * knows which of the five intraoral frames a photograph re-filed from "Frontal
 * photograph" is, so nothing claims one.
 */
export const reconcilePhotoView = (
  type: ImageType | null | undefined,
  photoView: PhotoView | null | undefined,
): PhotoView | null => {
  const view = findPhotoView(photoView);
  if (view === undefined) {
    return null;
  }
  return view.imageType === type ? view.id : null;
};

/**
 * The minimum a record has to state to be placed in the series grid. Declared
 * structurally for the same reason `TimepointGroupable` is: `PatientRecord` lives
 * in the workspace reducer, which imports this module.
 */
export interface PhotoPlaceable {
  type: ImageType | null;
  photoView: PhotoView | null;
}

/** One cell of the composite: a position, and what is filed at it. */
export interface PhotoSeriesCell<T extends PhotoPlaceable> {
  view: PhotoViewOption;
  /** The photograph shown in this cell, or null when the position is empty. */
  record: T | null;
  /**
   * Further photographs filed at the *same* position — a re-shoot, or a second
   * frame the clinic files there. The cell shows the first and says how many more
   * there are; they are all reachable, and none of them is silently dropped.
   */
  extras: T[];
}

/** The composite series of one visit, laid out by band. */
export interface PhotoSeriesLayout<T extends PhotoPlaceable> {
  rows: Array<{ row: PhotoSeriesRow; cells: Array<PhotoSeriesCell<T>> }>;
  /** How many of the nine positions hold a photograph. */
  filled: number;
  /** Every photograph handed in, however it is placed. */
  total: number;
  /**
   * The photographs that carry no position — a photograph filed before this field
   * existed, or one whose position was cleared by a type correction. Listed under
   * the grid rather than guessed into a cell.
   */
  unplaced: T[];
}

/**
 * Lays a visit's photographs out as the composite series a clinician reads.
 *
 * Placement is by the position **recorded on the photograph** and by nothing else.
 * A photograph whose position is not recorded is returned in `unplaced`: the type
 * alone does not say which frame an intraoral photograph is, and a grid that puts
 * it in the centre cell would be the app filing a photograph the clinic did not
 * file.
 *
 * Non-photographs are ignored outright, so the same visit's cephalograms can be
 * handed in without being filtered by every caller.
 */
export const buildPhotoSeries = <T extends PhotoPlaceable>(
  records: T[],
): PhotoSeriesLayout<T> => {
  const photos = records.filter(({ type }) => isPhotographType(type));
  const byView: { [view: string]: T[] } = {};
  const unplaced: T[] = [];
  photos.forEach((record) => {
    const view = reconcilePhotoView(record.type, record.photoView);
    if (view === null) {
      unplaced.push(record);
      return;
    }
    if (byView[view] === undefined) {
      byView[view] = [];
    }
    byView[view].push(record);
  });
  let filled = 0;
  const rows = PHOTO_SERIES_ROWS.map((row) => ({
    row,
    cells: row.views.map((id): PhotoSeriesCell<T> => {
      const view = findPhotoView(id) as PhotoViewOption;
      const held = byView[id] !== undefined ? byView[id] : [];
      if (held.length > 0) {
        filled += 1;
      }
      return {
        view,
        record: held.length > 0 ? held[0] : null,
        extras: held.slice(1),
      };
    }),
  }));
  return { rows, filled, total: photos.length, unplaced };
};

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
 * The type as an empty slot names it, e.g. `"Add profile photo"` — the *visible*
 * label of the control, at the middle length a row of six pills can hold.
 *
 * Its tooltip and its accessible name are deliberately longer and are built by
 * the call sites from `getImageTypeLabelInSentence` plus the visit being filed
 * into ("Add a frontal (PA) cephalogram to T2 · 2026-01-12"): a screen reader
 * announcing the short label alone would not say *which visit* the press files
 * at, which is the whole of what distinguishes one slot row from the next.
 * So: one wording for the label, a fuller one for the tooltip and the accessible
 * name — and those two always agree with each other.
 */
export const getAddSlotLabel = (type: ImageType): string => {
  const option = findOption(type);
  return `Add ${option !== undefined ? option.slotLabel : 'image'}`;
};

/**
 * The image types a set of records does *not* hold, in the catalogue's own
 * order — what the timepoint's empty slots offer, and the one reading of "what
 * is missing here" the dashboard has.
 *
 * An image filed before the records layer existed carries no type at all
 * (`type === null`); it cannot fill a slot, because nothing states which slot it
 * would fill, so it is simply not counted as one.
 */
export const getMissingImageTypes = (
  records: Array<{ type: ImageType | null }>,
): ImageTypeOption[] => {
  const held: { [type: string]: true } = {};
  records.forEach(({ type }) => {
    if (type !== null) {
      held[type] = true;
    }
  });
  return IMAGE_TYPE_OPTIONS.filter(({ id }) => held[id] !== true);
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
 * The n-th timepoint label of a series (0-based): T1, T2, T3… — the convention
 * used in growth and treatment series.
 *
 * **This counts visits, not images.** Handed a count of *images* it mis-files
 * every case that photographs a visit as well as radiographing it: with a lateral
 * ceph and a profile photograph both filed at T1, "the third image" proposed T3
 * for the second visit, the prefill was accepted (it is there to be), and the
 * record carried a permanent T2-shaped hole. What a fresh upload should propose
 * is `getNextTimepointLabel`, which reads the labels actually in use.
 */
export const getDefaultTimepoint = (existingTimepointCount: number): string =>
  `T${existingTimepointCount + 1}`;

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
 * The same, with its article: `"a panoramic radiograph"`, `"an intraoral
 * photograph"`. The article is chosen from the label, not written into the copy
 * that uses it — the upload screen greeted a clinician with "Add a intraoral
 * photograph to this patient's record" the moment the catalogue gained a type
 * beginning with a vowel.
 */
export const getImageTypeLabelWithArticle = (
  type: ImageType | null | undefined,
): string => {
  const label = getImageTypeLabelInSentence(type);
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
};

// ---- The timepoint vocabulary ----------------------------------------------

/**
 * One stage of treatment a visit can be filed at — the controlled half of a
 * timepoint label.
 *
 * A timepoint label is stored as free text and always will be (every project
 * ever saved by this app holds one, and rewriting a clinician's own words is not
 * this app's business). What was missing is a *vocabulary*: with nothing but a
 * text field, "T1" meant whatever the person typing felt like, and one practice's
 * record read "T2 post-tx", "T2 post-treatment", "T2 debond" and "T2 finish" for
 * the same visit — labels no surface can group, sort or compare.
 *
 * So the label is composed of three parts (see `composeTimepointLabel`): the
 * series token the whole app already reads a label through
 * (`getTimepointToken`), one of these stages, and whatever else the clinician
 * wants to say. Nothing is *required*: a record can carry a series alone, a stage
 * alone, or neither, and a label typed before this vocabulary existed parses back
 * into its parts unchanged (`parseTimepointLabel`).
 */
export interface TimepointStage {
  /** Stable id, stored nowhere — the label carries the word, not the id. */
  id: string;
  /** The word written into the label, and shown in the picker. */
  label: string;
  /** What the stage means clinically — the picker's secondary line. */
  hint: string;
}

/**
 * The stages themselves, in treatment order.
 *
 * Deliberately five and deliberately generic: these are the record stages an
 * orthodontic case is filed under whatever the appliance or the technique, which
 * is what makes them a vocabulary rather than one clinic's house style.
 */
export const TIMEPOINT_STAGES: TimepointStage[] = [
  {
    id: 'initial',
    label: 'Initial',
    hint: 'diagnostic records, before treatment starts',
  },
  {
    id: 'progress',
    label: 'Progress',
    hint: 'taken during active treatment',
  },
  {
    id: 'debond',
    label: 'Debond',
    hint: 'at appliance removal — the treatment result',
  },
  {
    id: 'retention',
    label: 'Retention',
    hint: 'taken in retention, after debond',
  },
  {
    id: 'post-surgical',
    label: 'Post-surgical',
    hint: 'after orthognathic surgery',
  },
];

/** The stage of a given id, or undefined — never a guessed stage. */
export const findTimepointStage = (
  id: string | null | undefined,
): TimepointStage | undefined => (
  id === null || id === undefined || id === ''
    ? undefined
    : TIMEPOINT_STAGES.filter((s) => s.id === id)[0]
);

/** A timepoint label taken apart into the three parts it is composed of. */
export interface TimepointParts {
  /** The series token — `"T1"`, `"T2"` — or `''` when the label carries none. */
  series: string;
  /** Id of the stage the label names, or `''` when it names none. */
  stage: string;
  /** Whatever the label says beyond its series and its stage. */
  note: string;
}

/** A series token as this app writes one: T1 … T9999. */
const SERIES_TOKEN = /^T\s?(\d{1,4})$/i;

/**
 * The words that make the token after a stage word a *continuation of the same
 * sentence* rather than a clause of its own.
 *
 * This is what decides whether a stage word is being used as a stage. "Debond"
 * and "Debond retainer fitted" file a visit at the debond; "Debond and bonded
 * retainer fitted" is one sentence a clinician wrote about a visit, and lifting
 * its first word out as the controlled stage left the record's own words reading
 * "Debond · and bonded retainer fitted" on the case timeline — a mid-dot between
 * a sentence and its own conjunction. Round-tripping was lossless either way;
 * the display was not.
 */
const STAGE_CONTINUATION = /^(and|with|plus|&|\+|then)$/i;

/**
 * A bare visit number as the Visit field normalises it: `"2"` → `"T2"`, `"t 3"`
 * → `"T3"`.
 *
 * The field is free text and stays so — but a record filed as "2" is a record no
 * surface of this app can read as a visit: `getTimepointToken` hands the rail a
 * pill reading "2", `getNextTimepointLabel` counts no number from it, and the
 * series it belongs to is broken from that visit on. Normalised on blur (never
 * mid-keystroke, which would fight the person typing "T2"), so what the record
 * stores is the convention the whole app reads.
 */
export const normalizeSeriesToken = (value: string): string => {
  const text = value.trim();
  const match = /^[Tt]?\s?(\d{1,4})$/.exec(text);
  return match !== null ? `T${parseInt(match[1], 10)}` : text;
};

/**
 * A stored timepoint label, read back as the parts the record form edits.
 *
 * **This is the migration, and it is lossless in both directions.** Nothing
 * stored is rewritten: a label that predates the vocabulary opens with whatever
 * of it the vocabulary recognises (its `T<n>` series, and a stage where the label
 * happens to name one) and the remainder intact in `note`, so re-composing it
 * yields the label the project already holds — `"T2 post-treatment"` round-trips
 * as series `T2` + note `post-treatment`, `"Pre-treatment records"` as note
 * alone. A clinician who never touches the new controls sees their own words.
 */
export const parseTimepointLabel = (
  timepoint: string | null | undefined,
): TimepointParts => {
  const label = (timepoint || '').trim();
  if (label === '') {
    return { series: '', stage: '', note: '' };
  }
  const tokens = label.split(/\s+/).filter((t) => t !== '');
  const rest = tokens.slice();
  let series = '';
  if (rest.length > 0 && SERIES_TOKEN.test(rest[0])) {
    series = rest[0].toUpperCase().replace(/\s+/g, '');
    rest.shift();
  }
  let stage = '';
  if (rest.length > 0) {
    // Punctuation a clinician may have separated the parts with ("T2 · Progress")
    // is not part of the word being matched, and must not be left in the note.
    const word = rest[0].toLowerCase().replace(/^[·,\-–—]+|[·,]+$/g, '');
    const match = TIMEPOINT_STAGES.filter(
      (s) => s.label.toLowerCase() === word,
    )[0];
    // …and it is only *lifted* where it is being used as a stage: standing alone,
    // or heading a phrase that reads as its own clause. A stage word followed by a
    // continuation is part of the clinician's sentence, and the surfaces that set
    // the stage and the note as two facts would print half a sentence in each (see
    // `STAGE_CONTINUATION`).
    const continues = rest.length > 1 && STAGE_CONTINUATION.test(rest[1]);
    if (match !== undefined && !continues) {
      stage = match.id;
      rest.shift();
    }
  }
  return { series, stage, note: rest.join(' ') };
};

/**
 * The three parts written back as the one string the record stores — the form the
 * whole app already reads (`getTimepointToken` takes the series off the front).
 *
 * Empty parts contribute nothing, so no label is ever padded with a stray space
 * or composed out of a stage the clinician cleared.
 */
export const composeTimepointLabel = (parts: TimepointParts): string => {
  const stage = findTimepointStage(parts.stage);
  return [
    parts.series.trim(),
    stage !== undefined ? stage.label : '',
    parts.note.trim(),
  ].filter((part) => part !== '').join(' ');
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
 * How a visit is named in a **pill** — the badge the timeline's stops and the
 * imaging-records stamps both carry — and whether that name is a fallback.
 *
 * Read through the timepoint vocabulary and not off the raw string: the pill's job
 * is the visit's *handle*, which is its series token ("T2" out of "T2 Progress
 * mid-treatment") or, for a visit filed at a stage without a number, the stage
 * word. Taken as the label's first whitespace token, a visit stored as "Debond and
 * bonded retainer fitted" put "Debond" in the pill and "Debond · and bonded
 * retainer fitted" on the line 15px under it — one word twice, and half a sentence
 * beside the other half.
 *
 * Where the label carries neither a series nor a stage, `isUnset` is true and the
 * pill says so rather than promoting the first word of a sentence to a visit
 * number: what the label *does* say is written out in full beside it
 * (`getVisitRest`), and the pill's `title` carries the whole of it.
 */
export const getVisitPill = (
  timepoint: string | null | undefined,
): { token: string; isUnset: boolean } => {
  const parts = parseTimepointLabel(timepoint);
  if (parts.series !== '') {
    return { token: parts.series, isUnset: false };
  }
  const stage = findTimepointStage(parts.stage);
  if (stage !== undefined) {
    return { token: stage.label, isUnset: false };
  }
  return { token: 'No timepoint', isUnset: true };
};

/**
 * …and everything the label says that the pill is not already showing: the stage
 * word where the pill carries a series instead, then the clinician's own note.
 *
 * Joined by a space where the note continues the stage's sentence ("Progress
 * mid-treatment") and by the app's mid-dot where it is a fact of its own
 * ("Progress · Second opinion"). `leadsWithStage` says which of the two the line
 * opens with, so a surface can set a controlled stage word and a free-text remark
 * in their own registers.
 */
export const getVisitRest = (
  timepoint: string | null | undefined,
): { text: string; leadsWithStage: boolean } => {
  const parts = parseTimepointLabel(timepoint);
  const pill = getVisitPill(timepoint);
  const stage = findTimepointStage(parts.stage);
  const stageWord = stage !== undefined && stage.label !== pill.token
    ? stage.label : '';
  const note = parts.note.trim();
  if (stageWord === '') {
    return { text: note, leadsWithStage: false };
  }
  if (note === '') {
    return { text: stageWord, leadsWithStage: true };
  }
  return {
    text: /^[a-z&+]/.test(note)
      ? `${stageWord} ${note}` : `${stageWord} · ${note}`,
    leadsWithStage: true,
  };
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

/**
 * The timepoint label a fresh upload should propose for a patient's record: the
 * next unused `T<n>` after the labels the record already carries.
 *
 * Counted off the record's own **distinct timepoint labels**, never off the number
 * of images: a visit that is radiographed and photographed holds two images and
 * is still one visit, so an image count proposed T3 for the second visit of a
 * two-image T1 — and, because the proposal is prefilled and therefore accepted,
 * the record was left with a T2 nobody had skipped on purpose.
 *
 * Free-text labels are read through their first token, exactly as every other
 * surface reads them ("T3 pre-treatment" is T3). A record labelled only in words
 * ("Pre-treatment") contributes no number, so the next visit is offered T1 — the
 * first label of the series this app names, and one the clinician can overwrite.
 */
export const getNextTimepointLabel = (records: TimepointGroupable[]): string => {
  const used: { [token: string]: true } = {};
  let highest = 0;
  groupRecordsByTimepoint(records).forEach(({ label }) => {
    const token = getTimepointToken(label);
    if (token === null) {
      return;
    }
    used[token.toUpperCase()] = true;
    const match = /^T(\d{1,4})$/i.exec(token);
    if (match !== null) {
      const n = parseInt(match[1], 10);
      if (n > highest) {
        highest = n;
      }
    }
  });
  let next = highest + 1;
  // A label may be in use without being a number we counted ("t2" written in
  // lower case, say): never propose a label the record already holds.
  while (used[`T${next}`] === true) {
    next += 1;
  }
  return getDefaultTimepoint(next - 1);
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
 * Months are `mo`, never a bare `m`: this string is printed on surfaces whose
 * every other number is a millimetre — "+1.7 mm", a 10 mm scale bar,
 * 0.104 mm/px — and "5 m apart" beside them read as five metres. The ages
 * (`utils/patient#formatAgeFull`) now write `mo` for the same reason, so an age
 * and an interval standing side by side — which is exactly what a stop and its
 * rail on the case timeline are — cannot spell one unit two ways.
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

// ---- Carrying one calibration to the films it is also true of ---------------

/**
 * The minimum a record has to state before a scale can be carried to it. Declared
 * structurally for the same reason `TimepointGroupable` is: `PatientRecord` lives
 * in the workspace reducer, which imports this module.
 */
export interface CalibratableRecord {
  imageId: string;
  type: ImageType | null;
  width: number | null;
  height: number | null;
  scaleFactor: number | null;
  isTraceable: boolean;
}

/**
 * The other films of a patient's record that a given film's calibration is
 * **also** a claim about: same image type, same pixel dimensions, and carrying no
 * scale of their own yet.
 *
 * Why those three and nothing looser. A mm/px scale is a property of the machine
 * and the export, not of the patient: three lateral cephalograms exported from
 * one cephalostat at one resolution have one scale, and calibrating each of them
 * against the same ruler by hand is three chances to mis-mark it (the case that
 * produced "3 scales need checking" three times over). But a film of a different
 * type came off a different geometry, and a film of a different pixel size was
 * exported or cropped differently — for either, this film's factor is a guess,
 * and the app must not make it.
 *
 * A film that already carries a scale is never a target: an existing calibration
 * is a measurement someone made, and overwriting it silently — or at all, from a
 * control offered about a *different* film — would be the app quietly changing
 * every millimetre already reported from it. Re-calibrating one is its own act,
 * in its own dialog, on its own film.
 *
 * The caller decides what to do with the list; nothing here writes anything. See
 * `RecordsDashboard#renderCardCalibration`, which offers it as an explicit,
 * reviewable action naming every film it would change.
 */
export const getScalePropagationTargets = <T extends CalibratableRecord>(
  records: T[], source: T,
): T[] => {
  const { scaleFactor, type, width, height } = source;
  if (
    scaleFactor === null || !isFinite(scaleFactor) || scaleFactor <= 0 ||
    width === null || height === null || !source.isTraceable
  ) {
    return [];
  }
  return records.filter((record) => (
    record.imageId !== source.imageId &&
    record.isTraceable &&
    record.scaleFactor === null &&
    record.type === type &&
    record.width === width &&
    record.height === height
  ));
};
