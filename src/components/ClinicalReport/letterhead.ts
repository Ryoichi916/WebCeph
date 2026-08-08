/**
 * The practice identity that heads every printed sheet this app produces.
 *
 * This is presentation identity (letterhead), not patient data, so device-local
 * storage is the honest scope: it prints on every document generated from this
 * machine. It is typed once — in the clinical report's masthead and
 * certification block — and read back by every other printable view, so two
 * sheets from the same app can never be signed to two different standards.
 */

export const STORAGE_KEY_CLINIC = 'webceph-report-clinic-name';
export const STORAGE_KEY_CLINICIAN = 'webceph-report-clinician-name';
export const STORAGE_KEY_LICENSE = 'webceph-report-clinician-license';

export const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

export const writeStored = (key: string, value: string) => {
  try {
    if (value === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage unavailable (private mode) — the field still edits on screen.
  }
};

export interface Letterhead {
  /** Practice name — the masthead. Empty when never entered. */
  clinic: string;
  /** Clinician who signs the sheet. Empty when never entered. */
  clinician: string;
  /** License number, printed beside the clinician. Empty when never entered. */
  license: string;
}

/** The stored letterhead, as the printed views read it. */
export const readLetterhead = (): Letterhead => ({
  clinic: readStored(STORAGE_KEY_CLINIC),
  clinician: readStored(STORAGE_KEY_CLINICIAN),
  license: readStored(STORAGE_KEY_LICENSE),
});

/** `"Dr Sato · License no. 12345"`, or empty when neither is recorded. */
export const formatClinicianLine = (letterhead: Letterhead): string => {
  const parts: string[] = [];
  if (letterhead.clinician !== '') {
    parts.push(letterhead.clinician);
  }
  if (letterhead.license !== '') {
    parts.push(`License no. ${letterhead.license}`);
  }
  return parts.join(' · ');
};
