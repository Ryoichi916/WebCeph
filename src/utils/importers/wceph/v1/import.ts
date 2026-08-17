import {
  WCephJSON,
  JSON_FILE_NAME,
} from './format';

import JSZip from 'jszip';

import map from 'lodash/map';

import {
  setImageProps,
  setWorkspaceMode,
  setActiveImageId,
  setSuperimpositionMode,
  superimposeImages,
  loadVisitNotes,
  addNewWorkspace,
} from 'actions/workspace';

import importImage from 'utils/importers/image/import';

import { validateIndexJSON, summarizeValidationErrors } from './validate';

import { mintImageId, mintWorkspaceId } from 'utils/ids';

const importFile: Importer = async (fileToImport, options) => {
  const {
    loadWorkspaceSettings = true,
    loadSuperimpositionState = true,
    workspaceId,
  } = options;
  const actions: GenericAction[] = [];
  const zip = new JSZip();
  await zip.loadAsync(fileToImport);
  const json: WCephJSON = JSON.parse(
    await zip.file(JSON_FILE_NAME).async('string'),
  );

  // A validator that cannot finish has said nothing about the file, so the file
  // is refused rather than let through as "no errors found". @see ./manifest
  let errors: ValidationError[];
  try {
    errors = validateIndexJSON(json);
  } catch (e) {
    throw new TypeError(
      'This case file could not be read: it is not in the shape a case file is ' +
      'written in. Nothing has been read into this chart.',
    );
  }
  if (errors.length > 0) {
    if (__DEBUG__) {
      console.warn(
        '[BUG] Failed to import file. ' +
        'Trying to import an invalid WCeph format. ' + (
          json.debug ? (
            'Looks like the file has been exported ' +
            'while in development.'
          ) : (
            'This might be a bug in validation or import. '
          )
        ),
        map(errors, e => e.message),
      );
    }
    throw new TypeError(
      `${summarizeValidationErrors(errors)} Nothing has been read into this chart.`,
    );
  }

  /**
   * Every image the index names has to be **in** the file before anything is
   * dispatched.
   *
   * Not a redundant check of the dialog's: an import can be reached without the
   * dialog having read this particular file, and the failure it prevents is the
   * worst kind — `zip.file(path)` returns null, `.async` throws halfway through
   * the loop, and the chart is left holding whichever images happened to be
   * dispatched before the throw. Refused whole, here, so an import is all or
   * nothing. @see utils/importers/wceph/v1/manifest#readManifestFromFile
   */
  const missing = Object.keys(json.refs.images).filter(
    (id) => zip.file(json.refs.images[id]) === null,
  );
  if (missing.length > 0) {
    throw new TypeError(
      'This case file does not contain the images it lists — ' +
      `${missing.length} of ${Object.keys(json.refs.images).length} are not ` +
      'inside it. Nothing has been read into this chart.',
    );
  }

  /**
   * The file's own image ids, and the ids they are given **here**.
   *
   * Import re-mints every id, which is what makes two copies of one case file
   * importable side by side — and it is also what every id *inside* the file
   * then refers to nothing: the superimposition's list, the workspace's active
   * image and a film's `scaleSourceId` are all written in the file's ids. They
   * used to be dispatched through untranslated, so the workspace was told to
   * make `img_1` — an id no reducer had ever heard of — its active image, and
   * the first selector to ask that image whether it had finished loading read
   * `undefined.isLoading` and took the app down with it.
   *
   * So one map, built before anything is dispatched, and nothing leaves this
   * function in the file's own ids.
   */
  const originalIds = Object.keys(json.refs.images);
  const idMap: { [originalId: string]: string } = {};
  originalIds.forEach((originalId) => {
    idMap[originalId] = mintImageId();
  });
  /** Which rail tile each imported image was filed onto. */
  const workspaceOf: { [imageId: string]: string } = {};

  /**
   * One image per rail tile, which is the shape every other filed record in this
   * app has (see `RecordsDashboard/connected#onAddPhotographs`). Loading a whole
   * case into the single tile it was dropped on left a three-film chart with one
   * tile that could only ever show one of them.
   *
   * The tile the import was aimed at takes the first image, so a case dropped
   * onto an empty tile does not strand it; every other image gets its own,
   * created before the image is loaded into it because the settings reducer
   * appends to a workspace that has to already exist.
   *
   * Sequential rather than `Promise.all`, so the dispatch order is the file's
   * order and not whichever blob decompressed first — the actions are dispatched
   * in exactly the order this array holds them.
   */
  for (let index = 0; index < originalIds.length; index++) {
    const originalId = originalIds[index];
    const id = idMap[originalId];
    const targetWorkspaceId = index === 0
      ? workspaceId : mintWorkspaceId();
    if (targetWorkspaceId !== workspaceId) {
      actions.push(addNewWorkspace({ id: targetWorkspaceId }));
    }
    workspaceOf[id] = targetWorkspaceId;
    const path = json.refs.images[originalId];
    const blob = await zip.file(path).async('blob');
    const stored = json.data[originalId];
    const name = stored.name;
    const imageFile = new File([blob], name || originalId);
    /**
     * A file that carries an image the browser cannot decode.
     *
     * The decoder's own failure — `Cannot destructure property 'height' of
     * '(intermediate value)' as it is undefined` — was going straight through to
     * the import dialog's error block, which is a stack trace standing where a
     * clinician's answer should be. What they need is which image of how many,
     * and that their chart was not touched.
     */
    let imageActions: GenericAction[];
    try {
      imageActions = await importImage(
        imageFile, { workspaceId: targetWorkspaceId, ids: [id] },
      );
    } catch (e) {
      throw new TypeError(
        `Image ${index + 1} of ${originalIds.length} in this case file ` +
        `(${name || originalId}) could not be read — the picture itself is ` +
        'damaged or is not in a format this browser can open. Nothing has been ' +
        'read into this chart.',
      );
    }
    actions.push(...imageActions);
    actions.push(setImageProps({
      id,
      // Not `name`: it is not part of the image's record props but of the loaded
      // blob, and it has already arrived — the file's stored name is what the
      // `File` above was constructed with, so `LOAD_IMAGE_SUCCEEDED` carried it.
      type: stored.type,
      // The three record fields are optional in the format — a file written
      // before the records layer carries none — and `SET_IMAGE_PROPS` spreads
      // its payload, so writing an explicit `undefined` would overwrite the
      // reducer's own default with nothing. Only what the file states is set.
      ...(stored.timepoint !== undefined ? { timepoint: stored.timepoint } : {}),
      ...(stored.captureDate !== undefined
        ? { captureDate: stored.captureDate } : {}),
      ...(stored.photoView !== undefined
        ? { photoView: stored.photoView } : {}),
      // The mm/px calibration, which the format carries inside the tracing.
      scaleFactor: stored.tracing !== undefined ? stored.tracing.scaleFactor : null,
      /**
       * Which film this one's scale was **copied from**, translated into this
       * import's ids — and dropped where the file names a film it does not
       * itself carry. A provenance that cannot be resolved is not claimed: the
       * dashboard would otherwise print "copied from" beside a scale and be
       * unable to say from what. @see WCephJSON#data.scaleSourceId
       */
      scaleSourceId: typeof stored.scaleSourceId === 'string' &&
        idMap[stored.scaleSourceId] !== undefined
        ? idMap[stored.scaleSourceId] : null,
      flipX: stored.flipX,
      flipY: stored.flipY,
      invertColors: stored.invertColors,
      brightness: stored.brightness,
      contrast: stored.contrast,
      analysis: {
        activeId: stored.analysis !== undefined
          ? stored.analysis.activeId as AnalysisId<ImageType> | null : null,
      },
      // The tracing itself: the landmarks a clinician plotted and the steps they
      // skipped. Passed through as stored — the mode is optional and normally
      // absent (@see WCephJSON#data.tracing.mode), and the tracing reducer
      // spreads what it is given onto the image's entry.
      tracing: {
        manualLandmarks: stored.tracing !== undefined
          ? stored.tracing.manualLandmarks : {},
        skippedSteps: stored.tracing !== undefined
          ? stored.tracing.skippedSteps : {},
        ...(stored.tracing !== undefined && stored.tracing.mode !== undefined &&
          stored.tracing.mode !== null
          ? { mode: stored.tracing.mode } : {}),
      } as CephImageTracingData,
    }));
  }

  /**
   * The file's clinical notes, filed onto the visits their timepoint labels name
   * (the labels travel with the images above, so a note lands on the visit it was
   * written about or on none at all).
   *
   * A note already on file for that visit is never replaced — see
   * `Events['LOAD_VISIT_NOTES']`. Files written before the record had a written
   * half carry no `visitNotes` at all, and nothing is dispatched for them.
   */
  if (json.visitNotes !== undefined) {
    actions.push(loadVisitNotes({ notes: json.visitNotes }));
  }

  // Only where the file states one: this app no longer writes a superimposition
  // block (it is a view of the films and tracings the file carries, and what was
  // written there was never a superimposition), and every file that does carry
  // one still reads in. @see WCephJSON#superimposition
  if (loadSuperimpositionState && json.superimposition !== undefined &&
    json.superimposition !== null) {
    let { mode, imageIds } = json.superimposition;
    if (mode === 'assisted') {
      mode = 'auto';
    }
    actions.push(setSuperimpositionMode({ workspaceId, mode }));
    // Translated, and any id the file names but does not carry is dropped rather
    // than superimposed as a phantom.
    actions.push(superimposeImages({
      workspaceId,
      order: (imageIds || [])
        .map((originalId) => idMap[originalId])
        .filter((id) => id !== undefined),
    }));
  }

  if (loadWorkspaceSettings) {
    const { mode, activeImageId } = json.workspace;
    const requested = activeImageId !== null && activeImageId !== undefined
      ? idMap[activeImageId] : undefined;
    const landOn = requested !== undefined
      ? requested
      : (originalIds.length > 0 ? idMap[originalIds[0]] : undefined);
    if (landOn !== undefined) {
      // …into the tile that actually holds it. Sending the id to the tile the
      // import was aimed at pointed a workspace at an image that is not in it.
      actions.push(setActiveImageId({
        workspaceId: workspaceOf[landOn],
        imageId: landOn,
      }));
    }
    actions.push(setWorkspaceMode({ workspaceId, mode: mode || 'tracing' }));
  }

  return actions;
};

export default importFile;
