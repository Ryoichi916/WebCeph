import {
  WCephJSON,
  JSON_FILE_NAME,
} from './format';

import JSZip from 'jszip';

import filter from 'lodash/filter';
import map from 'lodash/map';
import negate from 'lodash/negate';
import isUndefined from 'lodash/isUndefined';
import isPlainObject from 'lodash/isPlainObject';
import each from 'lodash/each';
import every from 'lodash/every';
import has from 'lodash/has';
import keys from 'lodash/keys';
import values from 'lodash/values';
import isBoolean from 'lodash/isBoolean';
import isNumber from 'lodash/isNumber';
import isString from 'lodash/isString';

// The catalogue of photographic-series frames, so a file cannot import a position
// this app has no cell, label or comparison for.
import { findPhotoView } from 'utils/records';

export function isV1GeometricalPoint(object: any) {
  return has(object, 'x') && has(object, 'y');
};

export function isV1GeometricalVector(object: any) {
  return has(object, 'x2') && has(object, 'y1') && has(object, 'x2') && has(object, 'y2');
};

export function isV1GeometricalAngle(object: any) {
  return has(object, 'vectors') && object.vectors.length === 2 && each(object.vectors, isV1GeometricalVector);
};

function isV1GeometricalObject(object: any) {
  return isV1GeometricalPoint(object) || isV1GeometricalVector(object) || isV1GeometricalAngle(object);
};

const isTrue = (value: any) => value === true;
const isDefined = negate(isUndefined);

/**
 * One entry of `data`, safe to read fields off.
 *
 * Every rule below reads an image's fields, and a hand-edited (or foreign) file
 * can hold a `null` where an image should be. Destructuring that threw a
 * TypeError out of `validateIndexJSON` — and a validator that throws reports no
 * errors at all, so the caller was left holding "this file is fine" about a file
 * it could not read. An entry that is not an object simply has no fields: the
 * rules then report it as invalid image data, which is what it is.
 */
const imageFields = (image: any): any => (isPlainObject(image) ? image : {});

type Rule<T> = (data: T) => true | false;
type ErrorMaker<T> = (data: T) => ValidationError;
type Fixer<T> = (data: T, error: ValidationError) => T;

export enum ValidationErrorType {
  UNSPECIFIED_FILE_VERSION,
  NO_REFS,
  MISSING_REFS,
  MISSING_DATA,
  INCOMPATIBLE_IMAGE_TYPE,
  INCOMPATIBLE_BRIGHTNESS_VALUE,
  INCOMPATIBLE_CONTRAST_VALUE,
  INVALID_IMAGE_DATA,
  INVALID_TRACING_DATA,
  INVALID_ANALYSIS_ID,
  INVALID_TRACING_MODE,
  INVALID_MANUAL_LANDMARKS,
  INVALID_SKIPPED_STEPS,
  INVALID_IMAGE_NAME,
  INVALID_RECORD_METADATA,
  INVALID_VISIT_NOTES,
  INVALID_PATIENT_DETAILS,
  INVALID_PHOTO_REGISTRATIONS,
  /**
   * The file states a format version and it is not the one this app reads.
   *
   * Split off `UNSPECIFIED_FILE_VERSION`, which both version rules used to
   * point at: a file that plainly said `"version": 2` was reported to the
   * clinician as "Unspecified file version", which is not true and is the
   * opposite of the useful thing to say — that the file is newer than this app.
   */
  WRONG_FILE_VERSION,
  /** A `refs.images` path the zip does not actually contain. */
  MISSING_IMAGE_FILE,
}

/**
 * Whether an error means "this is not a WebCeph case file at all".
 *
 * A renamed zip with somebody else's `index.json` trips every structural rule at
 * once, and listing them is a list of this app's own identifiers. One sentence
 * is the whole of what a reader can act on. @see summarizeValidationErrors
 */
const isStructuralError = (type: ValidationErrorType): boolean => (
  type === ValidationErrorType.NO_REFS ||
  type === ValidationErrorType.MISSING_REFS ||
  type === ValidationErrorType.MISSING_DATA ||
  type === ValidationErrorType.UNSPECIFIED_FILE_VERSION
);

/**
 * What each failure means, **in a sentence a clinician can act on**.
 *
 * Every one of them, because the fallback was `ValidationErrorType[type]` — the
 * enum's own identifier — and a foreign zip therefore reported itself as
 * "(Unspecified file version, Unspecified file version, NO_REFS, MISSING_DATA,
 * Invalid file format)": the same phrase twice and three developer names, in
 * front of somebody deciding whether to trust a file with a patient's record.
 *
 * Each sentence says what is wrong with the *file*, never what the code checked.
 */
const getMessageForError = (type: ValidationErrorType, data?: any): string => {
  switch (type) {
    case ValidationErrorType.UNSPECIFIED_FILE_VERSION:
      return 'the file does not state which case file format it was written in';
    case ValidationErrorType.WRONG_FILE_VERSION: {
      const version = data !== undefined && data !== null &&
        (typeof data.version === 'number' || typeof data.version === 'string')
        ? String(data.version) : null;
      return version !== null
        ? `it was written for case file format version ${version}, and this ` +
          'app reads version 1 — it was probably written by a newer version of ' +
          'WebCeph'
        : 'it was written for a case file format version this app does not read';
    }
    case ValidationErrorType.NO_REFS:
      return 'the file has no list of the images it carries';
    case ValidationErrorType.MISSING_REFS:
      return 'the file describes an image it does not list';
    case ValidationErrorType.MISSING_IMAGE_FILE:
      return 'an image the file lists is not inside it';
    case ValidationErrorType.MISSING_DATA:
      return 'the file carries no case records at all';
    case ValidationErrorType.INCOMPATIBLE_IMAGE_TYPE:
      return 'an image is filed as a record type this app does not have';
    case ValidationErrorType.INCOMPATIBLE_BRIGHTNESS_VALUE:
      return 'an image carries a brightness outside the range this app uses';
    case ValidationErrorType.INCOMPATIBLE_CONTRAST_VALUE:
      return 'an image carries a contrast outside the range this app uses';
    case ValidationErrorType.INVALID_IMAGE_DATA:
      return 'an image\'s display settings are not in the form this app stores';
    case ValidationErrorType.INVALID_TRACING_DATA:
      return 'a tracing\'s mm/px scale is not a number';
    case ValidationErrorType.INVALID_ANALYSIS_ID:
      return 'an image names an analysis in a form this app cannot read';
    case ValidationErrorType.INVALID_TRACING_MODE:
      return 'a tracing states a tracing mode this app does not have';
    case ValidationErrorType.INVALID_MANUAL_LANDMARKS:
      return 'a tracing\'s plotted landmarks are not points, lines or angles';
    case ValidationErrorType.INVALID_SKIPPED_STEPS:
      return 'a tracing\'s list of skipped steps is not in the form this app stores';
    case ValidationErrorType.INVALID_IMAGE_NAME:
      return 'an image\'s file name is not text';
    case ValidationErrorType.INVALID_RECORD_METADATA:
      return 'an image\'s visit label, capture date or series position is not ' +
        'in the form this app records';
    case ValidationErrorType.INVALID_VISIT_NOTES:
      return 'a clinical entry is not in the form this app stores — its ' +
        'versions, their timestamps or their text';
    case ValidationErrorType.INVALID_PHOTO_REGISTRATIONS:
      return 'a photograph\'s ceph-overlay registration is not in the form ' +
        'this app stores — which ceph it reads from, its clicked points\' ' +
        'coordinates, or which way the photograph faces';
    case ValidationErrorType.INVALID_PATIENT_DETAILS:
      return 'the patient details are not in the form this app records — a ' +
        'date of birth must be a YYYY-MM-DD day and a sex must be male or female';
    default:
      return 'the file does not match the case file format this app writes';
  }
};

/**
 * The one sentence a clinician is given about a file this app will not read.
 *
 * De-duplicated, and collapsed to "this is not one of ours" the moment the
 * failures are structural — which is what a renamed zip, a PDF or a truncated
 * download actually is. Anything else reads as a list of what is wrong with a
 * file that *is* one of ours, which is the case where the detail helps.
 */
export const summarizeValidationErrors = (
  errors: ValidationError[],
): string => {
  const seen: { [message: string]: true } = {};
  const reasons: string[] = [];
  let structural = false;
  errors.forEach((error) => {
    if (isStructuralError(error.type)) {
      structural = true;
    }
    if (seen[error.message] === true) {
      return;
    }
    seen[error.message] = true;
    reasons.push(error.message);
  });
  if (structural || reasons.length === 0) {
    return 'This is not a WebCeph case file.';
  }
  if (reasons.length === 1) {
    return `This case file could not be read: ${reasons[0]}.`;
  }
  return 'This case file could not be read: ' +
    reasons.slice(0, -1).join('; ') + '; and ' +
    reasons[reasons.length - 1] + '.';
};

function createErrorMaker<T>(type: ValidationErrorType): ErrorMaker<T> {
  return (data: T) => ({
    type,
    message: getMessageForError(type, data),
    data,
  });
};

// @TODO: validate json structure
const rules: Array<[
  Rule<WCephJSON>,
  ErrorMaker<WCephJSON>,
  Fixer<WCephJSON> | undefined
]> = [
  [
    ({ version }) => isDefined(version),
    createErrorMaker(ValidationErrorType.UNSPECIFIED_FILE_VERSION),
    undefined,
  ],
  [
    // A version that is *stated* and is not 1 is a different failure from a
    // version that is not stated, and the reader needs the difference: one is
    // "this is not one of ours", the other is "this is newer than this app".
    ({ version }) => isUndefined(version) || version === 1,
    createErrorMaker(ValidationErrorType.WRONG_FILE_VERSION),
    undefined,
  ],
  [
    ({ refs }) => (
      isPlainObject(refs) &&
      isPlainObject(refs.images) &&
      isPlainObject(refs.thumbs)
    ),
    createErrorMaker(ValidationErrorType.NO_REFS),
    undefined,
  ],
  [
    ({ data }) => isDefined(data) && isPlainObject(data),
    createErrorMaker(ValidationErrorType.MISSING_DATA),
    undefined,
  ],
  [
    // Guarded on `refs` itself, not just on `refs.images`: this validator is the
    // first thing a *foreign* file meets — a zip somebody renamed to `.wceph`,
    // with an index.json of its own — and reaching into an absent `refs` threw a
    // TypeError out of validation instead of returning "this is not one of ours".
    // A validator that crashes on invalid input is not validating.
    ({ data, refs }) => {
      return isPlainObject(refs) && isPlainObject(refs.images) &&
        every(keys(data), key => has(refs.images, key));
    },
    createErrorMaker(ValidationErrorType.MISSING_REFS),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const image = imageFields(entry);
        return (
          isPlainObject(entry) &&
          isBoolean(image.flipX) &&
          isBoolean(image.flipY) &&
          isBoolean(image.invertColors) &&
          isNumber(image.brightness) &&
          isNumber(image.contrast)
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_IMAGE_DATA),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const { name } = imageFields(entry);
        return (
          isString(name) || name === null
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_IMAGE_NAME),
    undefined,
  ],
  [
    // Records metadata (timepoint + capture date + photographic series position).
    // All three are optional so files written before the records layer — and before
    // the series — keep importing; when present, a timepoint must be text, a
    // capture date must be an ISO `YYYY-MM-DD`, and a position must be one of the
    // nine frames this app names (an unknown one is a file claiming a frame no
    // surface here can place or label).
    ({ data }) => {
      return every(values(data), (entry) => {
        const { timepoint, captureDate, photoView } = imageFields(entry);
        const isValidTimepoint = (
          isUndefined(timepoint) || timepoint === null || isString(timepoint)
        );
        const isValidCaptureDate = (
          isUndefined(captureDate) || captureDate === null || (
            isString(captureDate) && /^\d{4}-\d{2}-\d{2}$/.test(captureDate)
          )
        );
        const isValidPhotoView = (
          isUndefined(photoView) || photoView === null ||
          findPhotoView(photoView) !== undefined
        );
        return isValidTimepoint && isValidCaptureDate && isValidPhotoView;
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_RECORD_METADATA),
    undefined,
  ],
  [
    // The clinical notes of the visits (@see WCephJSON#visitNotes). Optional, so
    // every file written before the record had a written half keeps importing;
    // when present, each note must hold at least one version, each version must
    // carry a numeric timestamp, and each of the five fields must be a string.
    //
    // Text is validated as text and never inspected further: what a clinician
    // wrote is not this validator's business, and a note is not rejected for
    // saying something an app did not expect.
    ({ visitNotes }) => {
      if (isUndefined(visitNotes)) {
        return true;
      }
      if (!isPlainObject(visitNotes)) {
        return false;
      }
      return every(values(visitNotes), (note: any) => (
        isPlainObject(note) &&
        Array.isArray(note.entries) &&
        note.entries.length > 0 &&
        // Both optional, and both older files simply lack: an entry's author, and
        // the record of the note having been re-filed from another visit. Checked
        // for *type* only where present, on the same terms as the text — a name is
        // a name, not something this validator has an opinion about.
        (isUndefined(note.refiledFrom) || isString(note.refiledFrom)) &&
        (isUndefined(note.refiledAt) || isNumber(note.refiledAt)) &&
        every(note.entries, (entry: any) => (
          isPlainObject(entry) &&
          isNumber(entry.savedAt) &&
          (isUndefined(entry.author) || isString(entry.author)) &&
          isPlainObject(entry.fields) &&
          every(
            ['chiefComplaint', 'diagnosis', 'plan', 'appliance', 'note'],
            (field) => isString(entry.fields[field]),
          )
        ))
      ));
    },
    createErrorMaker(ValidationErrorType.INVALID_VISIT_NOTES),
    undefined,
  ],
  [
    // The patient the case belongs to (@see WCephJSON#patient). Optional — a
    // file written before it existed, or by a device with nobody registered,
    // carries none. Present, each field is checked for *type* only, plus the one
    // thing a reader has to be able to trust: a date of birth is either an ISO
    // day or it is absent. A malformed one would silently produce a wrong age on
    // every age-indexed norm in the receiving chart.
    ({ patient }) => {
      if (isUndefined(patient) || patient === null) {
        return true;
      }
      if (!isPlainObject(patient)) {
        return false;
      }
      const isTextOrAbsent = (value: any) =>
        isUndefined(value) || value === null || isString(value);
      const { dateOfBirth, sex, trendPlot } = patient;
      return (
        isTextOrAbsent(patient.name) &&
        isTextOrAbsent(patient.chartId) &&
        isTextOrAbsent(patient.reading) &&
        // The measurements the patient's trend board plots, where the file
        // states a board: a list of measurement symbols and nothing else.
        // @see WCephJSON#patient.trendPlot
        (
          isUndefined(trendPlot) || trendPlot === null || (
            Array.isArray(trendPlot) && every(trendPlot, isString)
          )
        ) &&
        (
          isUndefined(dateOfBirth) || dateOfBirth === null ||
          dateOfBirth === '' || (
            isString(dateOfBirth) && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
          )
        ) &&
        (
          isUndefined(sex) || sex === null ||
          sex === '' || sex === 'male' || sex === 'female'
        )
      );
    },
    createErrorMaker(ValidationErrorType.INVALID_PATIENT_DETAILS),
    undefined,
  ],
  [
    // The photo-overlay registrations (@see WCephJSON#photoRegistrations).
    // Optional, so every file written before the overlay existed keeps
    // importing; when present, each entry must name its ceph as text, place
    // each clicked point at finite numeric coordinates, and state which way
    // the photograph faces as a boolean. Which images the ids resolve to is
    // import's business, not this validator's — an unresolvable id is dropped
    // there, not rejected here.
    ({ photoRegistrations }) => {
      if (isUndefined(photoRegistrations)) {
        return true;
      }
      if (!isPlainObject(photoRegistrations)) {
        return false;
      }
      return every(values(photoRegistrations), (entry: any) => (
        isPlainObject(entry) &&
        isString(entry.cephImageId) &&
        isBoolean(entry.isFlipped) &&
        isPlainObject(entry.points) &&
        every(values(entry.points), (point: any) => (
          isPlainObject(point) &&
          isNumber(point.x) && isFinite(point.x) &&
          isNumber(point.y) && isFinite(point.y)
        ))
      ));
    },
    createErrorMaker(ValidationErrorType.INVALID_PHOTO_REGISTRATIONS),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const { tracing } = imageFields(entry);
        return (
          isPlainObject(tracing) &&
          (
            isNumber(tracing.scaleFactor) ||
            tracing.scaleFactor === null
          )
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_TRACING_DATA),
    undefined,
  ],

  [
    // The tracing mode, where the file states one. Optional since this app
    // stopped tracking it (@see WCephJSON#data.tracing.mode) — required, it made
    // every export this app could produce invalid, because the store it was read
    // from has held no mode for years. A file that states one must still state a
    // mode this app knows.
    //
    // The tracing itself is read before the mode is, and never destructured:
    // `({ tracing: { mode } })` threw `Cannot read properties of undefined` on
    // an image that carries no tracing at all, which took the whole validator
    // down — and a validator that throws returns no errors, so the file that
    // could not be validated was presented as a file with nothing wrong with
    // it. The rule above already reports the absent tracing
    // (INVALID_TRACING_DATA); this one simply has nothing to say about it.
    ({ data }) => {
      return every(values(data), (image) => {
        const tracing = image !== null && image !== undefined
          ? image.tracing : undefined;
        if (tracing === undefined || tracing === null) {
          return true;
        }
        const mode = tracing.mode;
        return (
          isUndefined(mode) ||
          mode === null ||
          mode === 'auto' ||
          mode === 'assisted' ||
          mode === 'manual'
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_TRACING_MODE),
    undefined,
  ],
  [
    // Read through the tracing rather than destructured, for the same reason as
    // the mode above: an image with no tracing is a file this validator has to
    // be able to *report*, not one it may crash on.
    ({ data }) => {
      return every(values(data), (image) => {
        const tracing = image !== null && image !== undefined
          ? image.tracing : undefined;
        if (tracing === undefined || tracing === null) {
          return true;
        }
        const manualLandmarks = tracing.manualLandmarks;
        return (
          isPlainObject(manualLandmarks) &&
          every(values(manualLandmarks), isV1GeometricalObject)
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_MANUAL_LANDMARKS),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (image) => {
        const tracing = image !== null && image !== undefined
          ? image.tracing : undefined;
        if (tracing === undefined || tracing === null) {
          return true;
        }
        const skippedSteps = tracing.skippedSteps;
        return (
          isPlainObject(skippedSteps) &&
          every(values(skippedSteps), isTrue)
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_SKIPPED_STEPS),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const { type } = imageFields(entry);
        return (
          type === null ||
          type === 'ceph_lateral' ||
          type === 'ceph_pa' ||
          type === 'photo_lateral' ||
          type === 'photo_frontal' ||
          type === 'photo_intraoral' ||
          type === 'panoramic'
        );
      });
    },
    createErrorMaker(ValidationErrorType.INCOMPATIBLE_IMAGE_TYPE),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const { brightness } = imageFields(entry);
        return brightness >= 0 && brightness <= 1;
      });
    },
    createErrorMaker(ValidationErrorType.INCOMPATIBLE_BRIGHTNESS_VALUE),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const { contrast } = imageFields(entry);
        return contrast >= 0 && contrast <= 1;
      });
    },
    createErrorMaker(ValidationErrorType.INCOMPATIBLE_CONTRAST_VALUE),
    undefined,
  ],
  [
    ({ data }) => {
      return every(values(data), (entry) => {
        const { analysis } = imageFields(entry);
        return (
          isPlainObject(analysis) &&
          (isString(analysis.activeId) || analysis.activeId === null)
        );
      });
    },
    createErrorMaker(ValidationErrorType.INVALID_ANALYSIS_ID),
    undefined,
  ],
];

export const validateIndexJSON = (json: WCephJSON): ValidationError[] => {
  return map(
    filter(
      map(rules, rule => {
        const validator = rule[0];
        const errorMaker = rule[1];
        if (validator(json) === true) {
          return true;
        }
        return errorMaker;
      }),
      result => result !== true,
    ),
    (makeError: ErrorMaker<WCephJSON>) => makeError(json),
  );
};

const validateFile: Validator = async (fileToValidate, options) => {
  const {

  } = options;
  const zip = new JSZip();
  await zip.loadAsync(fileToValidate);
  const json: WCephJSON = JSON.parse(
    await zip.file(JSON_FILE_NAME).async('string')
  );
  return [
    // @TODO: add unzip errors
    ...validateIndexJSON(json),
  ];
};

export default validateFile;
