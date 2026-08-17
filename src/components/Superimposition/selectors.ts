import { createSelector } from 'reselect';

import { getPatientRecords } from 'store/reducers/workspace';
import { getManualLandmarks } from 'store/reducers/workspace/image';

import {
  availableBases,
  REGISTRATION_BASES,
  RegistrationBasisId,
  basisSymbols,
} from 'analyses/superimposition';

import { TimepointRecord } from './props';

/**
 * The patient's images that can take part in a superimposition: traceable films
 * whose tracing carries at least one complete registration basis (see
 * `analyses/superimposition#REGISTRATION_BASES`). Ordered oldest capture date
 * first, exactly as the records dashboard orders them, so "earliest" and
 * "latest" mean the same thing everywhere in the app.
 *
 * Built on `getPatientRecords` rather than beside it — one source of truth for
 * what an image of the record *is*; this only adds the landmark geometry the
 * superimposition needs.
 */
export const getSuperimpositionTimepoints = createSelector(
  getPatientRecords,
  getManualLandmarks,
  (records, getLandmarks): TimepointRecord[] => {
    const timepoints: TimepointRecord[] = [];
    records.forEach((record) => {
      if (!record.isTraceable) {
        return;
      }
      const landmarks = getLandmarks(record.imageId);
      const bases = availableBases(landmarks);
      if (bases.length === 0) {
        return;
      }
      timepoints.push({
        imageId: record.imageId,
        timepoint: record.timepoint,
        type: record.type,
        captureDate: record.captureDate,
        name: record.name,
        src: record.thumbnail,
        width: record.width,
        height: record.height,
        scaleFactor: record.scaleFactor,
        landmarks,
        availableBasisIds: bases.map((b) => b.id),
      });
    });
    return timepoints;
  },
);

/**
 * Whether the "Superimpose" action is available, and — when it is not — the
 * sentence that says why. A disabled control that cannot explain itself is
 * worse than no control, so the reason names what is missing and what to do.
 */
export interface SuperimpositionAvailability {
  canSuperimpose: boolean;
  /** Tooltip text: the invitation when enabled, the reason when not. */
  reason: string;
}

/**
 * What a tracing has to carry before it can be registered at all, named as
 * prose: `"Cranial base (S, N), or Maxilla (PNS, ANS), or …"`.
 *
 * Exported because two surfaces have to say the same thing about the same rule:
 * this module's own record-level reason ("2 of 3 lateral cephalograms carry a
 * tracing that can be registered…") and the records dashboard's timeline, whose
 * per-pair Superimpose control has to explain, on the visit it is pointing at,
 * what is missing from it. Written twice they drifted the moment a basis was
 * added.
 */
export const registrationRequirement = (): string => {
  const names = REGISTRATION_BASES.map(
    (b) => `${b.label} (${basisSymbols(b).join(', ')})`,
  );
  return names.join(', or ');
};

export const getSuperimpositionAvailability = createSelector(
  getPatientRecords,
  getSuperimpositionTimepoints,
  (records, timepoints): SuperimpositionAvailability => {
    if (timepoints.length >= 2) {
      // A pair can still fail to share a basis; that is reported inside the
      // view, against the two films actually chosen, not guessed at here.
      return {
        canSuperimpose: true,
        reason:
          'Superimpose two timepoints of this patient and read off the change',
      };
    }
    const traceable = records.filter((r) => r.isTraceable);
    if (traceable.length < 2) {
      return {
        canSuperimpose: false,
        reason:
          'Superimposition compares two timepoints. This patient has ' +
          `${traceable.length === 1
            ? 'only one lateral cephalogram'
            : 'no lateral cephalogram'} on file — ` +
          'add another film from Records to compare.',
      };
    }
    return {
      canSuperimpose: false,
      reason:
        `${timepoints.length} of ${traceable.length} lateral cephalograms ` +
        'carry a tracing that can be registered. Superimposition needs two. ' +
        `Plot a registration basis on another timepoint — ${registrationRequirement()}.`,
    };
  },
);

/** Registration bases both timepoints can supply, in the canonical order. */
export const sharedBasisIds = (
  a: RegistrationBasisId[], b: RegistrationBasisId[],
): RegistrationBasisId[] =>
  REGISTRATION_BASES
    .map((basis) => basis.id)
    .filter((id) => a.indexOf(id) !== -1 && b.indexOf(id) !== -1);
