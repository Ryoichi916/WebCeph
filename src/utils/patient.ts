/**
 * Patient demographics helpers shared by the patient picker, the workspace
 * top bar and the clinical report — one source of truth for how age and sex
 * are computed and written, so the three surfaces never disagree.
 */

export interface AgeParts {
  years: number;
  months: number;
}

/**
 * Parses an ISO `YYYY-MM-DD` date-of-birth string into a local Date.
 * Returns null for absent/invalid values and dates in the future
 * (a future birth date can only be a typo).
 */
export const parseDateOfBirth = (
  dateOfBirth: string | undefined,
): Date | null => {
  if (dateOfBirth === undefined) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim());
  if (match === null) {
    return null;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  // Construct in local time (not Date.parse, which treats the string as UTC
  // and can shift the day across midnight for negative-offset timezones).
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null; // e.g. 2020-02-31
  }
  return date.getTime() > Date.now() ? null : date;
};

/**
 * Chronological age at `at` (default: now) in whole years + remaining months,
 * or null when the date of birth is absent or invalid.
 */
export const getAgeParts = (
  dateOfBirth: string | undefined,
  at: Date = new Date(),
): AgeParts | null => {
  const dob = parseDateOfBirth(dateOfBirth);
  if (dob === null || at.getTime() < dob.getTime()) {
    return null;
  }
  let months =
    (at.getFullYear() - dob.getFullYear()) * 12 +
    (at.getMonth() - dob.getMonth());
  if (at.getDate() < dob.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    months = 0;
  }
  return { years: Math.floor(months / 12), months: months % 12 };
};

/** Compact age for list rows and the top bar, e.g. `28 y`. */
export const formatAgeShort = (
  dateOfBirth: string | undefined,
  at: Date = new Date(),
): string | null => {
  const parts = getAgeParts(dateOfBirth, at);
  return parts !== null ? `${parts.years} y` : null;
};

/**
 * Clinical age with months, e.g. `28 y 4 m` — months matter when assessing
 * growth, which is exactly when a cephalometric report is drawn up.
 */
export const formatAgeFull = (
  dateOfBirth: string | undefined,
  at: Date = new Date(),
): string | null => {
  const parts = getAgeParts(dateOfBirth, at);
  if (parts === null) {
    return null;
  }
  return parts.months > 0
    ? `${parts.years} y ${parts.months} m`
    : `${parts.years} y`;
};

/**
 * Chronological age in (fractional) years at `at`, or null when the date of
 * birth is absent or invalid. Months are carried as twelfths: an age indexed
 * norm moves by a fraction of a degree a year, so rounding to whole years
 * before applying it would throw away most of the correction on a growing
 * patient.
 */
export const getAgeInYears = (
  dateOfBirth: string | undefined,
  at: Date = new Date(),
): number | null => {
  const parts = getAgeParts(dateOfBirth, at);
  return parts !== null ? parts.years + parts.months / 12 : null;
};

/**
 * What the analyses need to know about the patient in order to apply their
 * authors' own age and sex indexing of the norms (see `AnalysisContext`).
 *
 * `at` is the day the radiograph was taken when the record states one — a
 * cephalometric norm is read against the age on the film, not against the age
 * on the day the report is printed. Nothing is invented: a patient with no date
 * of birth yields a context with no age, and every analysis falls back to the
 * published figure and says so.
 */
export const getAnalysisContext = (
  patient: { dateOfBirth?: string; sex?: PatientSex } | null,
  at: Date | null = null,
): AnalysisContext => {
  if (patient === null) {
    return {};
  }
  const ageInYears = getAgeInYears(
    patient.dateOfBirth, at === null ? new Date() : at,
  );
  const context: AnalysisContext = {};
  if (ageInYears !== null) {
    context.ageInYears = ageInYears;
  }
  if (patient.sex === 'male' || patient.sex === 'female') {
    context.sex = patient.sex;
  }
  return context;
};

/** Single-letter sex for compact metadata lines: F / M. */
export const formatSexShort = (
  sex: PatientSex | undefined,
): string | null => {
  return sex === 'female' ? 'F' : sex === 'male' ? 'M' : null;
};

/** Full sex label for the report header. */
export const formatSexFull = (
  sex: PatientSex | undefined,
): string | null => {
  return sex === 'female' ? 'Female' : sex === 'male' ? 'Male' : null;
};
