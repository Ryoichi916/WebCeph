/**
 * The clinical note of a visit: its field catalogue, the key a note is filed
 * under, and the readings of its amendment trail every surface states.
 *
 * The imaging half of a patient record is described by `utils/records`; this is
 * the written half — what the patient came for, what was found, what was
 * decided, and what is in the mouth. One module so the dashboard's note block,
 * its editor, the printed case sheet and the clinical report's "Clinical notes &
 * plan" area cannot disagree about what a note holds, what it is called, or when
 * it was written.
 *
 * **Nothing here composes clinical content.** There is no template, no default
 * text, no phrase derived from a measurement: every string in a stored note was
 * typed by a clinician, and a field nobody typed into is empty and is shown as
 * empty. The only text this module owns is field labels and the wording of the
 * record's own facts (when an entry was written, when it was amended).
 */

/** One field of a visit note, as every surface names and orders it. */
export interface VisitNoteFieldOption {
  key: keyof VisitNoteFields;
  /** Full clinical name, e.g. "Chief complaint" — the editor's field label. */
  label: string;
  /**
   * The name in a compact display: the dashboard's note block and the printed
   * sheet set it in small caps beside the clinician's text, where "Chief
   * complaint" and "Treatment plan" would take more room than the entry they
   * label.
   */
  shortLabel: string;
  /**
   * What belongs in the field, shown in the editor under its label — a
   * description of the field, deliberately **not** an example of clinical text.
   * A greyed-out "e.g. Class II division 1, mild lower crowding" is a diagnosis
   * this app made up standing in a diagnosis field, one keystroke away from
   * being read as the record's own.
   */
  hint: string;
  /** Rows the editor's textarea opens at; the field grows past it as needed. */
  rows: number;
}

/**
 * The fields, in the order a visit entry is written and read.
 *
 * Chief complaint, diagnosis, plan and appliance are the four an orthodontic
 * visit entry is expected to state — and the four the record had nowhere to put:
 * a case could hold nine films, ninety-one measurements and no statement of what
 * anybody had decided. The free-text note last, for everything an entry says
 * that is none of those four.
 */
export const VISIT_NOTE_FIELDS: VisitNoteFieldOption[] = [
  {
    key: 'chiefComplaint',
    label: 'Chief complaint',
    shortLabel: 'Complaint',
    hint: 'why the patient attended, as they described it',
    rows: 2,
  },
  {
    key: 'diagnosis',
    label: 'Diagnosis',
    shortLabel: 'Diagnosis',
    hint: 'the diagnosis recorded at this visit',
    rows: 3,
  },
  {
    key: 'plan',
    label: 'Treatment plan',
    shortLabel: 'Plan',
    hint: 'what was decided, and what happens next',
    rows: 3,
  },
  {
    key: 'appliance',
    // "Appliance", not "Appliance / in the mouth": the hint under it says what
    // belongs there, and the two-word label is the one the printed report can set
    // in its label column without wrapping (a wrapped label in a two-column entry
    // reads as a squeezed table on a signed document).
    label: 'Appliance',
    shortLabel: 'Appliance',
    hint: 'what is fitted now, and what was placed or removed today',
    rows: 2,
  },
  {
    key: 'note',
    label: 'Note',
    shortLabel: 'Note',
    hint: 'anything else about the visit',
    rows: 4,
  },
];

/** A note with nothing written in it — what a fresh editor opens on. */
export const emptyVisitNoteFields = (): VisitNoteFields => ({
  chiefComplaint: '',
  diagnosis: '',
  plan: '',
  appliance: '',
  note: '',
});

/**
 * The key a visit's note is filed under: its timepoint label, trimmed, and `''`
 * for the images that carry no label at all.
 *
 * Deliberately the same key `utils/records#groupRecordsByTimepoint` groups the
 * imaging records on, so a note and the visit it describes are looked up by one
 * value and cannot drift apart.
 */
export const getVisitNoteKey = (
  timepoint: string | null | undefined,
): string => (timepoint === null || timepoint === undefined ? '' : timepoint.trim());

/** Every field trimmed, which is the form a note is stored and compared in. */
export const trimVisitNoteFields = (fields: VisitNoteFields): VisitNoteFields => ({
  chiefComplaint: fields.chiefComplaint.trim(),
  diagnosis: fields.diagnosis.trim(),
  plan: fields.plan.trim(),
  appliance: fields.appliance.trim(),
  note: fields.note.trim(),
});

/** True when no field holds anything — nothing to store, nothing to show. */
export const isVisitNoteEmpty = (fields: VisitNoteFields): boolean =>
  VISIT_NOTE_FIELDS.every(({ key }) => fields[key].trim() === '');

/**
 * Whether two versions say the same thing — so an "amendment" that changed
 * nothing is not written into the trail.
 */
export const sameVisitNoteFields = (
  a: VisitNoteFields, b: VisitNoteFields,
): boolean =>
  VISIT_NOTE_FIELDS.every(({ key }) => a[key].trim() === b[key].trim());

/**
 * The fields that differ between two versions, in the catalogue's order — what
 * the amendment trail names as having changed.
 */
export const changedVisitNoteFields = (
  from: VisitNoteFields, to: VisitNoteFields,
): VisitNoteFieldOption[] =>
  VISIT_NOTE_FIELDS.filter(
    ({ key }) => from[key].trim() !== to[key].trim(),
  );

/** The fields a version actually holds text in, in the catalogue's order. */
export const filledVisitNoteFields = (
  fields: VisitNoteFields,
): Array<{ option: VisitNoteFieldOption; value: string }> =>
  VISIT_NOTE_FIELDS
    .filter(({ key }) => fields[key].trim() !== '')
    .map((option) => ({ option, value: fields[option.key].trim() }));

/**
 * A stored note read back as one version per entry, oldest first — or null when
 * the note holds no entry at all (a key that somehow exists with nothing in it).
 * Every reading below goes through this, so no surface indexes `entries`
 * directly and none of them can disagree about which entry is current.
 */
export interface VisitNoteReading {
  /** The note as it stands: the newest version's fields. */
  current: VisitNoteFields;
  /** Epoch ms the note was first written. */
  recordedAt: number;
  /** Epoch ms the note was last written — equal to `recordedAt` when never amended. */
  updatedAt: number;
  /** How many times it has been amended since it was first written. */
  amendmentCount: number;
  /**
   * The versions it said before the current one, **newest superseded first**,
   * each with the moment it stopped being current and the fields that changed
   * when it did. What the dashboard's "earlier versions" list is built from.
   */
  superseded: Array<{
    fields: VisitNoteFields;
    /** Epoch ms this version was written. */
    savedAt: number;
    /** Epoch ms it was replaced (the next version's `savedAt`). */
    supersededAt: number;
    /** The fields the amendment that replaced it changed. */
    changed: VisitNoteFieldOption[];
  }>;
}

export const readVisitNote = (
  note: VisitNote | undefined | null,
): VisitNoteReading | null => {
  if (note === undefined || note === null || note.entries.length === 0) {
    return null;
  }
  const entries = note.entries;
  const last = entries[entries.length - 1];
  const superseded = entries.slice(0, entries.length - 1).map((entry, i) => ({
    fields: entry.fields,
    savedAt: entry.savedAt,
    supersededAt: entries[i + 1].savedAt,
    changed: changedVisitNoteFields(entry.fields, entries[i + 1].fields),
  })).reverse();
  return {
    current: last.fields,
    recordedAt: entries[0].savedAt,
    updatedAt: last.savedAt,
    amendmentCount: entries.length - 1,
    superseded,
  };
};

/**
 * The note of a visit as it stands, or null when the visit has none — the one
 * lookup every read-only surface (the report, the printed sheet) uses.
 */
export const getCurrentVisitNote = (
  notes: { [key: string]: VisitNote } | undefined,
  timepoint: string | null | undefined,
): VisitNoteReading | null => {
  if (notes === undefined) {
    return null;
  }
  return readVisitNote(notes[getVisitNoteKey(timepoint)]);
};

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * When an entry was written, as the record states it: ISO `YYYY-MM-DD` and the
 * local clock time, e.g. `2026-03-04 15:12`.
 *
 * The date half is the app's one date format (see
 * `utils/records#formatCaptureDate`) for the same reason it exists there: a
 * clinical record cannot afford a day that reads as either 08/04 or 04/08. The
 * time is part of it because two amendments on one day are two different entries,
 * and a trail that dates both "2026-03-04" cannot be read in order.
 */
export const formatVisitNoteStamp = (at: number): string => {
  const d = new Date(at);
  if (isNaN(d.getTime())) {
    return 'date not recorded';
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** The day alone, for the surfaces that have room for a date and not a clock. */
export const formatVisitNoteDay = (at: number): string => {
  const d = new Date(at);
  if (isNaN(d.getTime())) {
    return 'date not recorded';
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * The note's own provenance in one line: when it was written, and — only when it
 * has been — when and how often it was amended.
 *
 * `"Recorded 2026-01-12 14:32"`, or
 * `"Recorded 2026-01-12 14:32 · amended twice, last 2026-03-04 15:12"`. The word
 * "amended" is used plainly and the count is exact: an amended clinical entry
 * says so on every surface that shows it, including on paper.
 */
export const formatVisitNoteProvenance = (
  reading: VisitNoteReading,
): string => {
  const written = `Recorded ${formatVisitNoteStamp(reading.recordedAt)}`;
  if (reading.amendmentCount === 0) {
    return written;
  }
  const times = reading.amendmentCount === 1
    ? 'amended once'
    : (reading.amendmentCount === 2
      ? 'amended twice'
      : `amended ${reading.amendmentCount} times`);
  return `${written} · ${times}, last ${formatVisitNoteStamp(reading.updatedAt)}`;
};

/**
 * Appends a version to a note — the one place a stored note is ever built.
 *
 * Append-only by construction: the previous entries are copied through
 * untouched, so no code path can rewrite what an entry said. A save that changes
 * nothing is dropped rather than written as an amendment of itself, and a save
 * that empties every field of a note that has content **is** written (that is a
 * clinician retracting an entry, and the trail keeps what it used to say).
 */
export const appendVisitNoteEntry = (
  note: VisitNote | undefined,
  fields: VisitNoteFields,
  savedAt: number,
): VisitNote | undefined => {
  const next = trimVisitNoteFields(fields);
  const previous = note !== undefined ? note.entries : [];
  if (previous.length === 0) {
    // Nothing on file and nothing written: there is no note here, and an empty
    // one would put "Recorded 14:32" on a visit nobody has written about.
    return isVisitNoteEmpty(next)
      ? undefined
      : { entries: [{ savedAt, fields: next }] };
  }
  const current = previous[previous.length - 1].fields;
  if (sameVisitNoteFields(current, next)) {
    return note;
  }
  return { entries: [...previous, { savedAt, fields: next }] };
};

/**
 * The note keys of a chart that no visit on file carries — a note whose visit
 * was relabelled or whose images were all removed after it was written.
 *
 * Nothing is deleted for it: the dashboard lists these plainly and offers to
 * re-file them (@see Events['REFILE_VISIT_NOTE']), because an app that drops a
 * clinician's diagnosis because a label was corrected from "T2" to "T2 Progress"
 * is not keeping a record.
 */
export const getUnmatchedVisitNoteKeys = (
  notes: { [key: string]: VisitNote },
  visitKeys: string[],
): string[] => {
  const known: { [key: string]: true } = {};
  visitKeys.forEach((key) => { known[key] = true; });
  return Object.keys(notes)
    .filter((key) => known[key] !== true)
    .filter((key) => readVisitNote(notes[key]) !== null)
    .sort();
};

/**
 * How many of a chart's visits have a note on file — the identity band's count,
 * and the honest denominator for "is this a patient record or a pile of films".
 */
export const countVisitsWithNotes = (
  notes: { [key: string]: VisitNote },
  visitKeys: string[],
): number =>
  visitKeys.filter((key) => readVisitNote(notes[key]) !== null).length;
