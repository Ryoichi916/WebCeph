/**
 * What a case file **holds** — counted, never guessed — and what it does not.
 *
 * One module because two surfaces have to state the same thing about the same
 * artefact and must not be able to disagree: the export dialog says what is about
 * to be written out of this chart, and the import dialog says what a file on disk
 * actually carries *before* a single action is dispatched into a patient's record.
 * Both read this. @see components/CaseFile
 *
 * Nothing here composes clinical content and nothing here estimates. Every number
 * is a count of records that exist; every field of the patient block is the text
 * that is stored, or the empty string, and an empty one is reported as "not
 * recorded" rather than filled in from somewhere else.
 */

import JSZip from 'jszip';

import { WCephJSON, JSON_FILE_NAME } from './format';
// The very importer a case file is read in by, used here to read one *through*
// without dispatching anything. @see readWholeCaseFile
import importWCeph from './import';
import {
  validateIndexJSON,
  summarizeValidationErrors,
  ValidationErrorType,
} from './validate';

import {
  getAllImages,
  getAllImagesStatus,
  getManualLandmarks,
} from 'store/reducers/workspace/image';
import { getVisitNotes } from 'store/reducers/workspace/records';
import { getActivePatient } from 'store/reducers/patients';

import { readVisitNote, getVisitNoteKey } from 'utils/visitNotes';
import {
  formatCaptureDate,
  getImageTypeLabel,
  groupRecordsByTimepoint,
  isPhotographType,
  TimepointGroupable,
} from 'utils/records';

/** The patient a case file names, as stored — empty where nothing is on file. */
export interface CaseFilePatient {
  name: string;
  chartId: string;
  /** ISO `YYYY-MM-DD`, or `''` when the case carries no date of birth. */
  dateOfBirth: string;
  sex: PatientSex;
  reading: string;
  /**
   * The measurements this patient's trend board plots, or null where the case is
   * on the chart's default board. A clinical setting rather than a view — this
   * case is followed on these three or four values — so it travels with the
   * case. @see Patient#trendPlot
   */
  trendPlot: string[] | null;
}

/** One visit of the case, as the file states it. */
export interface CaseFileVisit {
  /** The timepoint label. Never null: a group with no label is not a visit. */
  label: string;
  /** Earliest capture date in the visit (ISO), or null when none is recorded. */
  date: string | null;
  imageCount: number;
  /** Whether a clinical entry is filed at this visit. */
  hasNote: boolean;
}

/** Everything a case file is counted to hold. */
export interface CaseFileManifest {
  /**
   * Who the case is, or null when the file carries no patient block at all —
   * which is what every file written before the block existed carries, and the
   * one thing the import dialog has to say out loud rather than leave the
   * receiving chart to discover it has no date of birth.
   */
  patient: CaseFilePatient | null;
  imageCount: number;
  /**
   * The visits those images belong to — **label-bearing groups only**.
   *
   * A pile of films carrying no timepoint is not a visit, and counting the
   * no-label group as one made a chart of three visits plus two loose films read
   * as "4 visits" here while the records dashboard, reading the same records,
   * said "TIMEPOINTS 3". The loose films are counted below instead, and named
   * for what they are. @see components/RecordsDashboard#getRecordFacts
   */
  visits: CaseFileVisit[];
  /** Images carrying no timepoint label at all — filed at no visit. */
  unfiledImageCount: number;
  /** Images grouped by record type, in the order the types are catalogued. */
  types: Array<{ label: string; count: number }>;
  /** Images carrying at least one plotted landmark. */
  tracedCount: number;
  /** Landmarks plotted across every image of the case. */
  landmarkCount: number;
  /** Images carrying a mm/px calibration. */
  calibratedCount: number;
  /** Photographs on file, and how many of those are placed at a series frame. */
  photoCount: number;
  placedPhotoCount: number;
  /** Clinical entries holding text, wherever they are filed, and their versions. */
  noteCount: number;
  noteVersionCount: number;
  /**
   * Of those, how many are filed **at a visit this case has an image of** — the
   * one reading of "this record is written up".
   *
   * Counted apart from the rest because `records.notes` also holds entries that
   * are filed at no visit by design: the `… · from an imported case file` keys a
   * merge leaves behind, and any entry whose visit was relabelled. Counting
   * those as "visits written up" made a chart of three written-up visits report
   * four. @see utils/visitNotes#getImportedVisitNoteKey
   */
  notedVisitCount: number;
  /** …and how many are filed at no visit of this case. */
  unfiledNoteCount: number;
  /**
   * The visit keys those entries are filed under — the timepoint labels, exactly
   * as stored (@see utils/visitNotes#getVisitNoteKey).
   *
   * Counted so the import dialog can say the one thing about the notes it could
   * not say before: how many of the file's entries land on a visit of *this*
   * chart that already holds one. Nothing is overwritten either way — the
   * collision is filed unmatched, where it can be read and re-filed — but the
   * clinician is told the number before they press Import.
   */
  noteKeys: string[];
  /** Earliest and latest capture date on file (ISO), or null when undated. */
  firstDate: string | null;
  lastDate: string | null;
}

/**
 * What a `.wceph` never carries — stated as facts about the format, so neither
 * dialog can imply the file is a backup of anything wider than one case.
 *
 * The measurements deserve their own line: 91 of them are reported on a traced
 * lateral film, none of them are in this file, and none of them need to be —
 * they are computed from the landmarks and the scale that *are*. A reader who
 * assumed otherwise would think a file with no tracing still held its numbers.
 */
export const CASE_FILE_EXCLUSIONS: string[] = [
  'Measurements and analysis results — they are recomputed from the tracings ' +
  'and the mm/px scale in the file, not stored in it.',
  'Anything about any other patient on this device: one file is one case.',
  'This device\'s own settings — the printed letterhead and the locale.',
  // Stated because the file used to *assert* a superimposition it did not have:
  // it wrote the active rail tile's image list under `superimposition.imageIds`,
  // so a file exported while an intraoral photograph happened to be open said
  // that photograph was superimposed. A superimposition is built on screen from
  // the films and tracings the file carries; it is not a record, so it is not
  // written. @see WCephJSON#superimposition
  'Which films were superimposed on screen — a superimposition is a view of ' +
  'the films and tracings in the file, rebuilt from them, not a record.',
];

const emptyManifest = (): CaseFileManifest => ({
  patient: null,
  imageCount: 0,
  visits: [],
  unfiledImageCount: 0,
  types: [],
  tracedCount: 0,
  landmarkCount: 0,
  calibratedCount: 0,
  photoCount: 0,
  placedPhotoCount: 0,
  noteCount: 0,
  noteVersionCount: 0,
  notedVisitCount: 0,
  unfiledNoteCount: 0,
  noteKeys: [],
  firstDate: null,
  lastDate: null,
});

const text = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * The trend board a patient (or a file) states, or null.
 *
 * Read as a list of measurement symbols and nothing else: an empty board is a
 * board of no measurements, which is not a board — it reads as "on the default".
 */
const readTrendPlot = (value: any): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const symbols = value.filter(
    (symbol): symbol is string => typeof symbol === 'string' && symbol !== '');
  return symbols.length > 0 ? symbols : null;
};

/** One image, reduced to the facts the manifest counts. */
interface ManifestImage extends TimepointGroupable {
  type: ImageType | null;
  photoView: PhotoView | null;
  landmarkCount: number;
  isCalibrated: boolean;
}

const buildManifest = (
  patient: CaseFilePatient | null,
  images: ManifestImage[],
  notes: { [key: string]: VisitNote },
): CaseFileManifest => {
  const manifest = emptyManifest();
  manifest.patient = patient;
  manifest.imageCount = images.length;

  const typeCounts: { [label: string]: number } = {};
  const typeOrder: string[] = [];
  images.forEach((image) => {
    const label = getImageTypeLabel(image.type);
    if (typeCounts[label] === undefined) {
      typeCounts[label] = 0;
      typeOrder.push(label);
    }
    typeCounts[label] += 1;
    if (image.landmarkCount > 0) {
      manifest.tracedCount += 1;
      manifest.landmarkCount += image.landmarkCount;
    }
    if (image.isCalibrated) {
      manifest.calibratedCount += 1;
    }
    if (isPhotographType(image.type)) {
      manifest.photoCount += 1;
      if (image.photoView !== null) {
        manifest.placedPhotoCount += 1;
      }
    }
  });
  manifest.types = typeOrder.map((label) => ({ label, count: typeCounts[label] }));

  /**
   * The visits, read exactly the way the records dashboard reads them, so the
   * file's own account of a case matches the screen it was exported from: a
   * group is a visit when it carries a timepoint label, and the films that carry
   * none are counted as what they are — films filed at no visit.
   * @see components/RecordsDashboard#getRecordFacts
   */
  const groups = groupRecordsByTimepoint(images);
  manifest.visits = groups
    .filter((group): group is typeof group & { label: string } =>
      group.label !== null)
    .map((group) => ({
      label: group.label,
      date: group.firstDate,
      imageCount: group.records.length,
      hasNote: readVisitNote(notes[getVisitNoteKey(group.label)]) !== null,
    }));
  manifest.unfiledImageCount = groups
    .filter(({ label }) => label === null)
    .reduce((total, group) => total + group.records.length, 0);

  const dates = images
    .map(({ captureDate }) => formatCaptureDate(captureDate))
    .filter((date): date is string => date !== null)
    .sort();
  manifest.firstDate = dates.length > 0 ? dates[0] : null;
  manifest.lastDate = dates.length > 0 ? dates[dates.length - 1] : null;

  // Which keys name a visit of *this* case, so an entry filed at one is counted
  // apart from one filed nowhere. @see CaseFileManifest#notedVisitCount
  const visitKeys: { [key: string]: true } = {};
  manifest.visits.forEach(({ label }) => {
    visitKeys[getVisitNoteKey(label)] = true;
  });
  Object.keys(notes).forEach((key) => {
    const reading = readVisitNote(notes[key]);
    if (reading !== null) {
      manifest.noteCount += 1;
      manifest.noteVersionCount += reading.versionCount;
      manifest.noteKeys.push(key);
      if (visitKeys[key] === true) {
        manifest.notedVisitCount += 1;
      } else {
        manifest.unfiledNoteCount += 1;
      }
    }
  });
  manifest.noteKeys.sort();

  return manifest;
};

/** What exporting this chart right now would write. */
export const readManifestFromState = (state: StoreState): CaseFileManifest => {
  const allImages = getAllImages(state) || {};
  const allStatus = getAllImagesStatus(state) || {};
  const getManual = getManualLandmarks(state);
  const images: ManifestImage[] = Object.keys(allImages)
    .filter((imageId) => {
      const status = allStatus[imageId];
      return status === undefined ||
        (status.isLoading === false && status.error === null);
    })
    .map((imageId): ManifestImage => {
      const props = allImages[imageId];
      return {
        type: props.type,
        timepoint: props.timepoint,
        captureDate: props.captureDate,
        photoView: props.photoView,
        landmarkCount: Object.keys(getManual(imageId)).length,
        isCalibrated: typeof props.scaleFactor === 'number',
      };
    });
  const patient = getActivePatient(state);
  return buildManifest(
    patient !== null ? {
      name: text(patient.name),
      chartId: text(patient.chartId),
      dateOfBirth: text(patient.dateOfBirth),
      sex: (patient.sex || '') as PatientSex,
      reading: text(patient.reading),
      trendPlot: readTrendPlot(patient.trendPlot),
    } : null,
    images,
    getVisitNotes(state),
  );
};

/** What a case file on disk carries — read from the file, not from the store. */
export const readManifestFromJSON = (json: WCephJSON): CaseFileManifest => {
  const data = json.data || {};
  const refs = json.refs !== undefined && json.refs !== null ? json.refs : null;
  const images: ManifestImage[] = Object.keys(
    (refs !== null && refs.images) || {})
    .filter((id) => data[id] !== undefined)
    .map((id): ManifestImage => {
      const stored = data[id];
      const tracing = stored.tracing;
      return {
        type: stored.type,
        timepoint: stored.timepoint !== undefined ? stored.timepoint : null,
        captureDate: stored.captureDate !== undefined ? stored.captureDate : null,
        photoView: stored.photoView !== undefined && stored.photoView !== null
          ? stored.photoView : null,
        landmarkCount: tracing !== undefined && tracing.manualLandmarks !== undefined
          ? Object.keys(tracing.manualLandmarks).length : 0,
        isCalibrated: tracing !== undefined &&
          typeof tracing.scaleFactor === 'number',
      };
    });
  const stored = json.patient;
  const notes: { [key: string]: VisitNote } = {};
  const fileNotes = json.visitNotes;
  if (fileNotes !== undefined) {
    Object.keys(fileNotes).forEach((key) => {
      notes[key] = fileNotes[key] as VisitNote;
    });
  }
  return buildManifest(
    stored !== undefined && stored !== null ? {
      name: text(stored.name),
      chartId: text(stored.chartId),
      dateOfBirth: text(stored.dateOfBirth),
      sex: (stored.sex || '') as PatientSex,
      reading: text(stored.reading),
      trendPlot: readTrendPlot(stored.trendPlot),
    } : null,
    images,
    notes,
  );
};

/**
 * Reads a `.wceph` off disk and reports what is in it — **without importing it**.
 *
 * This is the whole point of the import dialog: a clinician is about to merge a
 * file into a patient's record, and the only honest way to offer that is to open
 * the file, validate it and say what it holds first. A file this app cannot read
 * is reported as unreadable here rather than half-dispatched into a chart.
 */
export const readManifestFromFile = async (
  file: File,
): Promise<CaseFileManifest> => {
  const zip = new JSZip();
  /**
   * Everything down to the parsed index is one failure with one sentence.
   *
   * The library's own words were being put in front of a clinician verbatim —
   * "Can't find end of central directory : is this a zip file ? If it is, see
   * http://stuk.github.io/jszip/documentation/…" — which is a stack trace wearing
   * a dialog. What a reader needs to know is that this file is not a case file
   * and their record was not touched.
   */
  let json: WCephJSON;
  try {
    await zip.loadAsync(file);
    const entry = zip.file(JSON_FILE_NAME);
    if (entry === null) {
      throw new Error('no index');
    }
    json = JSON.parse(await entry.async('string'));
  } catch (e) {
    throw new TypeError(
      'This is not a WebCeph case file — it could not be opened as one. ' +
      'Nothing has been read into this chart. A case file is the .wceph written ' +
      'by Export case file; a PDF, an image or a renamed file will not open here.',
    );
  }
  /**
   * The validator's own failure is a **refusal**, never an all-clear.
   *
   * A renamed zip carrying somebody else's index.json is exactly the input a
   * clinician will hand this, and it must come back as one sentence. This used
   * to swallow the throw into `errors = []` — which is the sentence "there is
   * nothing wrong with this file". A file whose validation crashed was therefore
   * shown as a complete case, under a live "Import 6 images" button, and
   * pressing it printed the raw JS message into the error block. A validator
   * that could not finish has said nothing about the file, so the file is
   * refused here.
   */
  let errors: ValidationError[];
  try {
    errors = validateIndexJSON(json);
  } catch (e) {
    errors = [{
      type: ValidationErrorType.INVALID_IMAGE_DATA,
      message: 'this app could not check it against the case file format — it ' +
        'is not in the shape a case file is written in',
      data: e,
    }];
  }
  /**
   * …and then the images themselves have to *be there*.
   *
   * `validateIndexJSON` reads `index.json` and nothing else, so a file whose
   * `images/` folder had been emptied passed it completely and was presented to
   * the clinician as "12 images across 3 visits · 48 landmarks" under a live
   * "Import 12 images" button. Pressing it reached `zip.file(path).async` on a
   * null entry and threw `Cannot read properties of null` halfway through — the
   * chart unchanged, no message anywhere, and a clinician who had just been told
   * their case was in the file.
   *
   * So every path the index names is resolved here, before a number is put on
   * screen. A file that does not carry what it says it carries is refused at the
   * same place a foreign zip is.
   */
  const refs = json.refs !== undefined && json.refs !== null ? json.refs : null;
  const images = refs !== null && refs.images ? refs.images : {};
  const missing = Object.keys(images).filter(
    (id) => zip.file(images[id]) === null,
  );
  if (missing.length > 0) {
    errors = errors.concat([{
      type: ValidationErrorType.MISSING_IMAGE_FILE,
      message: missing.length === 1
        ? 'one of the images it lists is not inside it'
        : `${missing.length} of the images it lists are not inside it`,
      data: missing,
    }]);
  }
  if (errors.length > 0) {
    // One sentence, de-duplicated, and collapsed to "this is not one of ours"
    // where that is what the failures amount to. @see summarizeValidationErrors
    throw new TypeError(
      `${summarizeValidationErrors(errors)} Nothing has been read into this chart.`,
    );
  }
  return readManifestFromJSON(json);
};

/**
 * Reads the file **whole** — every image in it, decoded — and throws the
 * importer's own sentence if any of it cannot be read. Nothing is dispatched.
 *
 * The manifest above reads `index.json` and checks that each image it lists is
 * inside the zip; it does not open the pictures. That leaves one failure the
 * dialogs could not see coming: a film in the archive that this browser cannot
 * decode, which the importer only meets halfway through the job.
 *
 * That is survivable where there is a chart to report it into — the case file
 * dialog stays open and says so. It is not survivable on the restore path,
 * where the same failure would come *after* a chart had been registered from the
 * file. So the restore reads the whole file first, through the very importer
 * that will read it for real, and creates nothing until that has come back
 * clean. @see components/PatientPicker/RestoreFromCaseFile
 */
export const readWholeCaseFile = async (file: File): Promise<void> => {
  // The actions it builds are dropped: this is the read, not the import. The
  // importer dispatches nothing itself and touches no store.
  await importWCeph(file, { workspaceId: 'case_file_read_through' });
};
