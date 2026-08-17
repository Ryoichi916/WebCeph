/**
 * Ids for the things a chart stores: its films and its rail tiles.
 *
 * lodash's `uniqueId` is a **module counter**. It starts at 1 in every fresh
 * JavaScript context, which means it starts at 1 again on every page load — and
 * the ids it mints are written into a chart that outlives the page. The result
 * was silent destruction of a stored film:
 *
 *   file a lateral cephalogram   → `imported_image_1`, filed at T1, traced
 *   reload the page              → the counter is back at 1
 *   file a profile photograph    → `imported_image_1` again
 *   → `LOAD_IMAGE_SUCCEEDED` spread the photograph over the cephalogram's own
 *     entry: one record where there were two, showing the photograph's pixels
 *     under the cephalogram's type, timepoint and tracing.
 *
 * The same collision reached every surface that files an image (the editor
 * dropzone, the rail's ghost tile, the dashboard's slots, a photographic batch)
 * and the case-file importer, so opening a saved case after a reload could
 * overwrite films already on the chart.
 *
 * So an id is minted from a source that cannot restart: the clock. The seed is
 * read once per page load and every id carries it, which makes the ids
 * monotonic *across* loads — a later load can only ever mint larger ones — while
 * the counter after it keeps a batch filed inside one millisecond unique. It is
 * the same construction the case list already mints patient ids with
 * (`PatientPicker/connected`), applied to the two other kinds of id this app
 * stores.
 *
 * Nothing here parses an id: they are opaque keys, and the suffix is a
 * uniqueness device rather than a number anything reads.
 */

/** Read once, at load. Milliseconds since the epoch — monotonic across loads. */
const seed = Date.now();

let counter = 0;

/** A fresh id under `prefix`, unique in this load and in every later one. */
export const mintId = (prefix: string): string => {
  counter += 1;
  return `${prefix}${seed}_${counter}`;
};

/**
 * A film's id. Keeps the historical `imported_image_` prefix so a chart saved by
 * an older build — whose ids are `imported_image_1`, `imported_image_2` — reads
 * back unchanged; the new ids simply cannot collide with them.
 */
export const mintImageId = (): string => mintId('imported_image_');

/** A rail tile's id. @see `mintImageId` for the prefix's provenance. */
export const mintWorkspaceId = (): string => mintId('workspace_');
