import { WCephJSON } from './format';

import { REGISTRATION_SYMBOLS } from 'analyses/photoOverlay';

/**
 * The photo-overlay registration block of a case file, on both sides of the
 * round trip. Pure — no store, no zip — so the selection and translation rules
 * can be exercised by the node test runner, which the export/import specs
 * (browser-only: webpack fixtures, fetch, File) cannot be.
 * @see WCephJSON#photoRegistrations
 */

export type WCephPhotoRegistrations = NonNullable<
  WCephJSON['photoRegistrations']
>;

const isFinitePoint = (point: { x: number; y: number } | undefined): boolean =>
  point !== undefined &&
  typeof point.x === 'number' && isFinite(point.x) &&
  typeof point.y === 'number' && isFinite(point.y);

/**
 * Export side: which of the store's registrations the file carries.
 *
 * Only **complete** entries — a ceph chosen and both registration landmarks
 * clicked, each at finite coordinates — and only where both the photograph and
 * the ceph are among the images being written. A half-finished registration is
 * workflow state (a dialog somebody left mid-click), not record data, so it is
 * omitted rather than exported as a registration that cannot draw an overlay;
 * and an entry naming an image the file does not carry would be born dangling
 * on the far side. @see WCephJSON#photoRegistrations
 */
export const selectExportablePhotoRegistrations = (
  registrations: { [photoImageId: string]: PhotoRegistration },
  imagesToSave: string[],
): WCephPhotoRegistrations => {
  const carried: { [imageId: string]: true } = {};
  imagesToSave.forEach((id) => {
    carried[id] = true;
  });
  const result: WCephPhotoRegistrations = {};
  Object.keys(registrations).forEach((photoImageId) => {
    const entry = registrations[photoImageId];
    if (
      entry === undefined ||
      carried[photoImageId] !== true ||
      typeof entry.cephImageId !== 'string' ||
      entry.cephImageId === '' ||
      carried[entry.cephImageId] !== true ||
      !REGISTRATION_SYMBOLS.every(
        (symbol) => isFinitePoint(entry.points[symbol]),
      )
    ) {
      return;
    }
    const points: WCephPhotoRegistrations[string]['points'] = {};
    Object.keys(entry.points).forEach((symbol) => {
      const point = entry.points[symbol];
      if (isFinitePoint(point)) {
        points[symbol] = { x: point.x, y: point.y };
      }
    });
    result[photoImageId] = {
      cephImageId: entry.cephImageId,
      points,
      isFlipped: entry.isFlipped === true,
    };
  });
  return result;
};

/**
 * Import side: the file's registrations in **this import's** ids.
 *
 * Import re-mints every image id (@see ./import), so both the entry's key (the
 * photograph) and its `cephImageId` are translated through the same map the
 * rest of the import uses. An entry either side of which the map cannot
 * resolve is dropped whole — a dangling reference must never enter the store,
 * where the first overlay to read it would ask a film that does not exist for
 * its tracing.
 */
export const translatePhotoRegistrations = (
  stored: WCephPhotoRegistrations,
  idMap: { [originalId: string]: string },
): WCephPhotoRegistrations => {
  const result: WCephPhotoRegistrations = {};
  Object.keys(stored).forEach((originalPhotoId) => {
    const entry = stored[originalPhotoId];
    if (entry === undefined) {
      return;
    }
    const photoId = idMap[originalPhotoId];
    const cephId = idMap[entry.cephImageId];
    if (photoId === undefined || cephId === undefined) {
      return;
    }
    result[photoId] = {
      cephImageId: cephId,
      points: entry.points,
      isFlipped: entry.isFlipped,
    };
  });
  return result;
};
