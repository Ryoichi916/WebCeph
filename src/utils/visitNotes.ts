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
  /**
   * Rows the editor's textarea opens at — its **minimum** height, never its
   * maximum: the editor grows every field to the text in it as it is typed and
   * caps that growth at `VISIT_NOTE_FIELD_MAX_ROWS`
   * (@see components/RecordsDashboard/VisitNoteDialog#grow). This used to say
   * "the field grows past it as needed" while the stylesheet only set
   * `resize: vertical`, so a five-line plan was written through a three-line
   * window and the clinician had to hand-drag the box to read their own first
   * line.
   */
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

/**
 * How tall the editor lets a field grow before it starts scrolling inside itself.
 *
 * A treatment plan is routinely five or six lines and has to be readable whole
 * while it is being typed; a pasted page is not, and a field that grew to it
 * would push the dialog's Save button off a 720px screen. Fourteen rows is the
 * point where the dialog still paginates rather than the field.
 */
export const VISIT_NOTE_FIELD_MAX_ROWS = 14;

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
 * What the record says about an entry whose every field has been cleared.
 *
 * One sentence, in one place, because three surfaces have to say it and none of
 * them may say it differently: the dashboard's note block, the printed case sheet
 * and the clinical report's "Clinical notes & plan" area. A retraction is a
 * clinical act — the entry still exists, it is still dated, and what it used to
 * say is still in the record — and a surface that renders it as *nothing* prints
 * an entry that says it was amended and then says nothing at all.
 */
export const VISIT_NOTE_RETRACTED_STATEMENT =
  'Every field of this entry has been cleared. The versions it held before ' +
  'remain in the patient\'s record.';

/**
 * The name of the visit a note is filed at, as every surface that has to name it
 * in a sentence names it — the trimmed timepoint label, or one phrase for the
 * images that carry no label at all.
 *
 * One helper because the tooltip on the note's own button ("Write the clinical
 * note for …"), the editor's caption and the re-filing pills all name the same
 * visit, and they used to name the unlabelled one three different ways: "No
 * timepoint label", "images with no timepoint label", "the images with no
 * timepoint label". Two names for one visit on one page is a records defect,
 * not a wording preference.
 *
 * Not to be confused with the visit's *printed heading* (`getVisitPill` and the
 * sheet's own label), which is a heading and not part of a sentence.
 */
export const UNLABELLED_VISIT_NAME = 'the images with no timepoint label';

export const getVisitNoteVisitName = (
  label: string | null | undefined,
): string => (
  label === null || label === undefined || label.trim() === ''
    ? UNLABELLED_VISIT_NAME : label.trim()
);

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
   * How many versions the note holds in all, current one included — the
   * denominator of "Version 2 of 3", which is what makes the trail readable in
   * order when two amendments fall in the same minute.
   */
  versionCount: number;
  /**
   * Who wrote the **first** version, as it was stamped when it was written, or
   * null when nothing was stored to attribute it to. Never re-read from the
   * letterhead: an entry's author is part of what was written.
   */
  recordedBy: string | null;
  /** Who wrote the version that stands, on the same terms. */
  author: string | null;
  /**
   * Where this note was written, when it has since been re-filed at another
   * visit — the timepoint key it was written under — with the day it was moved.
   * Null on a note that has always been filed where it sits.
   * @see Events['REFILE_VISIT_NOTE']
   */
  refiledFrom: string | null;
  refiledAt: number | null;
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
    /** Its place in the note's own sequence, 1-based: "Version 2 of 3". */
    version: number;
    /** Who wrote this version, as stamped then, or null when unattributed. */
    author: string | null;
    /** The fields the amendment that replaced it changed. */
    changed: VisitNoteFieldOption[];
  }>;
}

/** An entry's stored author, normalised to null when there is none. */
const authorOf = (entry: VisitNoteEntry): string | null => {
  const author = entry.author;
  return author === undefined || author === null || author.trim() === ''
    ? null : author.trim();
};

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
    version: i + 1,
    author: authorOf(entry),
    changed: changedVisitNoteFields(entry.fields, entries[i + 1].fields),
  })).reverse();
  const refiledFrom = note.refiledFrom;
  const refiledAt = note.refiledAt;
  return {
    current: last.fields,
    recordedAt: entries[0].savedAt,
    updatedAt: last.savedAt,
    amendmentCount: entries.length - 1,
    versionCount: entries.length,
    recordedBy: authorOf(entries[0]),
    author: authorOf(last),
    refiledFrom: refiledFrom === undefined ? null : refiledFrom,
    refiledAt: refiledAt === undefined || refiledAt === null ? null : refiledAt,
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
 * local clock time **to the second**, e.g. `2026-03-04 15:12:41`.
 *
 * The date half is the app's one date format (see
 * `utils/records#formatCaptureDate`) for the same reason it exists there: a
 * clinical record cannot afford a day that reads as either 08/04 or 04/08. The
 * time is part of it because two amendments on one day are two different entries,
 * and a trail that dates both "2026-03-04" cannot be read in order.
 *
 * The seconds are there for exactly the same reason one step down: an entry
 * corrected twice while the clinician was still looking at it printed "written
 * 03:46, replaced 03:46" on both earlier versions, which reads as a printing
 * fault rather than as a trail. Two entries can still share a second — nothing in
 * a clock rules that out — so the ordinal on each version
 * (@see formatVisitNoteVersionLabel) is what actually orders the trail, and
 * `appendVisitNoteEntry` keeps the stamps themselves strictly increasing.
 */
export const formatVisitNoteStamp = (at: number): string => {
  const d = new Date(at);
  if (isNaN(d.getTime())) {
    return 'date not recorded';
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

/**
 * A version's place in the note's own sequence: `"Version 2 of 3"`.
 *
 * The trail is read in order off *this*, not off the clock: it is the one label
 * that stays unambiguous when two versions share a second, and it names the
 * current entry too (the one that is `versionCount` of `versionCount`).
 */
export const formatVisitNoteVersionLabel = (
  version: number, versionCount: number,
): string => `Version ${version} of ${versionCount}`;

/** The day alone, for the surfaces that have room for a date and not a clock. */
export const formatVisitNoteDay = (at: number): string => {
  const d = new Date(at);
  if (isNaN(d.getTime())) {
    return 'date not recorded';
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * The note's own provenance in one line: when it was written, **who by**, and —
 * only when it has been — when and how often it was amended, and who by.
 *
 * `"Recorded 2026-01-12 14:32:07 by Dr Sato"`, or
 * `"Recorded 2026-01-12 14:32:07 by Dr Sato · amended twice, last 2026-03-04
 * 15:12:44"`. The word "amended" is used plainly and the count is exact: an
 * amended clinical entry says so on every surface that shows it, including on
 * paper.
 *
 * The author is whatever was stamped into the entry when it was written (the
 * letterhead's clinician; @see components/ClinicalReport/letterhead), never
 * re-read afterwards — editing the letterhead names the person signing the *next*
 * sheet and must not be able to rewrite who wrote an entry last year. Where
 * nothing was stored to attribute an entry to, the line says so in the app's own
 * idiom for a value that is not on file ("author not recorded"): a printed entry
 * that cannot say who made it is half a trail, and the half that is missing is
 * named rather than left to be assumed.
 */
export const formatVisitNoteProvenance = (
  reading: VisitNoteReading,
  /**
   * Whether an entry with no stored author says so **here**.
   *
   * On screen it must: the phrase is the app's own idiom for a value that is not
   * on file, and the amendment dialog offers the field that closes the gap right
   * beside it. On paper it must not, once per entry: a case sheet carrying three
   * clinical entries printed "author not recorded" three times under a running head
   * naming the practice, the clinician and their license number — one document
   * giving two answers to "who wrote this". The sheet states it **once**, in its
   * closing notes, for however many of its entries are unattributed (see
   * `RecordsDashboard#renderRecordsNotes`), and the signature block at the tail is
   * what carries the name of whoever compiled the copy.
   */
  statesMissingAuthor: boolean = true,
): string => {
  const by = (who: string | null) =>
    (who !== null
      ? ` by ${who}`
      : (statesMissingAuthor ? ' · author not recorded' : ''));
  const written =
    `Recorded ${formatVisitNoteStamp(reading.recordedAt)}${by(reading.recordedBy)}`;
  if (reading.amendmentCount === 0) {
    return written;
  }
  const times = reading.amendmentCount === 1
    ? 'amended once'
    : (reading.amendmentCount === 2
      ? 'amended twice'
      : `amended ${reading.amendmentCount} times`);
  // The amendment's own author only where it differs from the entry's — an entry
  // amended by the person who wrote it does not need saying twice, and the line
  // already carries a date, a count and a name.
  const last = reading.author !== reading.recordedBy
    ? by(reading.author) : '';
  return `${written} · ${times}, ` +
    `last ${formatVisitNoteStamp(reading.updatedAt)}${last}`;
};

/**
 * The one line a re-filed note owes its reader: which visit it is filed at now,
 * when it was moved there, and which visit it was **written for**.
 *
 * Without it, moving an entry from T3 to T2 (@see Events['REFILE_VISIT_NOTE'])
 * left "Debond planned at the next visit" sitting under another visit's date as
 * though it had been written there — a silent change of what the record says
 * about when a decision was taken. Re-filing is not an amendment of the entry's
 * text, so it is not in the trail; it is a fact about the entry's filing, and it
 * prints with it.
 *
 * Null for the ordinary case: a note that has always been where it sits.
 */
export const formatVisitNoteRefiling = (
  reading: VisitNoteReading,
  /** The visit it sits at now, named as `getVisitNoteVisitName` names it. */
  visitName: string,
): string | null => {
  if (reading.refiledFrom === null) {
    return null;
  }
  const when = reading.refiledAt !== null
    ? ` on ${formatVisitNoteDay(reading.refiledAt)}` : '';
  return `Filed at ${visitName}${when} · written for ` +
    `${getVisitNoteVisitName(reading.refiledFrom)}`;
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
  /**
   * Who is writing it — the letterhead's clinician, read by the surface that
   * saves and stamped into this version for good. Null/empty when the device has
   * no clinician on file, and the surfaces then say the author is not recorded
   * rather than guessing one.
   */
  author?: string | null,
): VisitNote | undefined => {
  const next = trimVisitNoteFields(fields);
  const by = author === undefined || author === null || author.trim() === ''
    ? undefined : author.trim();
  const previous = note !== undefined ? note.entries : [];
  if (previous.length === 0) {
    // Nothing on file and nothing written: there is no note here, and an empty
    // one would put "Recorded 14:32" on a visit nobody has written about.
    return isVisitNoteEmpty(next)
      ? undefined
      : { ...note, entries: [{ savedAt, fields: next, author: by }] };
  }
  const current = previous[previous.length - 1].fields;
  if (sameVisitNoteFields(current, next)) {
    return note;
  }
  // A version never carries a stamp at or before the one it supersedes. The clock
  // is the machine's, and a machine's clock can be corrected backwards (or by a
  // sync, or across a DST boundary): without this, an amendment could be dated
  // *before* the entry it replaces, and the trail — which is read in order —
  // would state an impossibility about a clinical record. One second, so the
  // stamps stay distinct at the resolution they are printed at.
  const at = Math.max(savedAt, previous[previous.length - 1].savedAt + 1000);
  return {
    ...note,
    entries: [...previous, { savedAt: at, fields: next, author: by }],
  };
};

/**
 * Records that a note has been moved to another visit, keeping what it says and
 * its whole trail — and keeping the visit it was **written for**.
 *
 * The one place a stored note's filing is changed, so the fact of the move cannot
 * be lost on the way: the entries are copied through untouched (re-filing is not
 * an amendment of the text), and `refiledFrom` keeps the *original* key through a
 * second move — a note written for T3, filed at T2 and later moved to T4 was
 * still written for T3, and that is what its line says. @see formatVisitNoteRefiling
 */
export const refileVisitNoteEntry = (
  note: VisitNote,
  from: string,
  refiledAt: number,
): VisitNote => ({
  ...note,
  refiledFrom: note.refiledFrom !== undefined ? note.refiledFrom : from,
  refiledAt,
});

/**
 * How a note that **arrived with a case file** is labelled when the visit it
 * names already holds an entry of this chart's own.
 *
 * The rule that nothing on file is overwritten is right and stays. What was
 * wrong was the other half: the incoming entry — its text, its versions, its
 * authors and its timestamps — was simply dropped, appeared on no surface, and
 * the clinician who had just been told "3 visits written up · 4 versions in all,
 * every amendment kept" had no way to know one of them was gone.
 *
 * So it is filed under a key of its own, which no image on file carries, and it
 * therefore lands in the panel this app already has for exactly this — the
 * unfiled notes list, where it is read in full and can be re-filed.
 * @see getUnmatchedVisitNoteKeys, components/RecordsDashboard/VisitNote#UnmatchedVisitNotes
 */
export const IMPORTED_NOTE_SUFFIX = 'from an imported case file';

export const getImportedVisitNoteKey = (
  key: string,
  taken: { [key: string]: any },
): string => {
  const base = `${getVisitNoteVisitName(key)} · ${IMPORTED_NOTE_SUFFIX}`;
  if (taken[base] === undefined) {
    return base;
  }
  // A chart that has taken two case files naming the same visit keeps both.
  let n = 2;
  while (taken[`${base} (${n})`] !== undefined) {
    n += 1;
  }
  return `${base} (${n})`;
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
 * How many of a chart's visits are **written up** — the identity band's count and
 * the printed running head's, and the honest denominator for "is this a patient
 * record or a pile of films".
 *
 * A visit counts when the entry that *stands* there holds text. It deliberately
 * does not count a visit whose only entry has been retracted (every field
 * cleared): that entry is still in the record, still dated and still readable as
 * an earlier version — nothing is deleted here — but the visit has no written-up
 * content, and "CLINICAL NOTES 2 of 3 visits" counting it said the opposite in the
 * one place a clinician reads the number as an answer to "what still needs
 * writing up".
 */
export const countVisitsWithWrittenNotes = (
  notes: { [key: string]: VisitNote },
  visitKeys: string[],
): number =>
  visitKeys.filter((key) => {
    const reading = readVisitNote(notes[key]);
    return reading !== null && !isVisitNoteEmpty(reading.current);
  }).length;
