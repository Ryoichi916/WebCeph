import { createSelector } from 'reselect';

import { getPatientRecords } from 'store/reducers/workspace';
import { getManualLandmarks } from 'store/reducers/workspace/image';

import { LandmarkMap } from 'analyses/superimposition';
import { hasRegistrationSources } from 'analyses/photoOverlay';

/**
 * One traced lateral ceph the photo overlay can read from: a traceable film
 * whose tracing carries both registration landmarks (Pn and Pog′ — see
 * `analyses/photoOverlay#REGISTRATION_SYMBOLS`).
 *
 * Built on `getPatientRecords`, exactly as the superimposition's own
 * timepoint list is — one source of truth for what an image of the record is;
 * this only adds the landmark geometry the overlay needs.
 */
export interface EligibleCeph {
  imageId: string;
  timepoint: string | null;
  captureDate: string | null;
  name: string | null;
  /** The tracing itself, in the ceph's own pixel coordinates. */
  landmarks: LandmarkMap;
  /** Natural pixel width of the film — the mirror line for a flipped fit. */
  width: number | null;
}

/**
 * Every ceph of the open patient the overlay could read from, oldest capture
 * date first (the records' own order).
 */
export const getPhotoOverlayCephs = createSelector(
  getPatientRecords,
  getManualLandmarks,
  (records, getLandmarks): EligibleCeph[] => {
    const cephs: EligibleCeph[] = [];
    records.forEach((record) => {
      if (!record.isTraceable) {
        return;
      }
      const landmarks = getLandmarks(record.imageId);
      if (!hasRegistrationSources(landmarks)) {
        return;
      }
      cephs.push({
        imageId: record.imageId,
        timepoint: record.timepoint,
        captureDate: record.captureDate,
        name: record.name,
        landmarks,
        width: record.width,
      });
    });
    return cephs;
  },
);

/**
 * Whether the "Ceph overlay" action is available on this patient's profile
 * photographs, and — when it is not — the sentence that says why. Same shape
 * as the superimposition's availability: a disabled control that cannot
 * explain itself is worse than no control.
 */
export interface PhotoOverlayAvailability {
  canOverlay: boolean;
  /** Tooltip text: the invitation when enabled, the reason when not. */
  reason: string;
}

export const getPhotoOverlayAvailability = createSelector(
  getPhotoOverlayCephs,
  (cephs): PhotoOverlayAvailability => {
    if (cephs.length > 0) {
      return {
        canOverlay: true,
        reason:
          'Lay the ceph tracing’s profile lines (E-line, S-line, ' +
          'soft-tissue profile) over this photograph. Approximate — nothing ' +
          'is measured on the photograph.',
      };
    }
    return {
      canOverlay: false,
      reason:
        'Overlay needs a traced lateral ceph carrying Pn and Pog′ — ' +
        'plot them from the Soft Tissues analysis.',
    };
  },
);
