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
