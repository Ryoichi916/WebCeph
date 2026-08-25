import { createActionCreator } from 'utils/store';

export const setActiveTool = createActionCreator('SET_ACTIVE_TOOL_REQUESTED');

export const ignoreWorkspaceError = createActionCreator('IGNORE_WORKSPACE_ERROR_REQUESTED');

export const addManualLandmark = createActionCreator('ADD_MANUAL_LANDMARK_REQUESTED');
// Transient, non-undoable position update for a landmark still being dragged
// (mouse still down) — @see MOVE_MANUAL_LANDMARK_LIVE in webceph.d.ts for why
// this is a separate action type from addManualLandmark above.
export const moveManualLandmarkLive = createActionCreator('MOVE_MANUAL_LANDMARK_LIVE');
export const addUnnamedManualLandmark = createActionCreator('ADD_UNKOWN_MANUAL_LANDMARK_REQUESTED');
export const removeManualLandmark = createActionCreator('REMOVE_MANUAL_LANDMARK_REQUESTED');
export const addManualLandmarks = createActionCreator('ADD_MANUAL_LANDMARKS_BATCH_REQUESTED');

export const autoPlotLandmarks = createActionCreator('AUTO_PLOT_LANDMARKS_REQUESTED');
export const autoPlotSucceeded = createActionCreator('AUTO_PLOT_LANDMARKS_SUCCEEDED');
export const autoPlotFailed = createActionCreator('AUTO_PLOT_LANDMARKS_FAILED');
// The demo/placeholder predictor fabricated a landmark for an image it was
// never calibrated against — @see store/reducers/workspace/predictorWarnings.
export const placeholderLandmarksPlotted = createActionCreator('PLACEHOLDER_LANDMARKS_PLOTTED');

// Scaffold the remaining landmarks from the placed Sella and Nasion at their
// SN-relative population-mean positions (see analyses/referenceTemplate).
export const plotFromReferencePoints = createActionCreator('PLOT_FROM_REFERENCE_POINTS_REQUESTED');

// Toggle the profilogram overlay (profile lines through the placed landmarks).
export const toggleProfilogram = createActionCreator('TOGGLE_PROFILOGRAM_REQUESTED');

// Set the active analysis for a specific image (drives the stepper + values).
export const setActiveAnalysis = createActionCreator('SET_ACTIVE_ANALYSIS_REQUESTED');

// Image calibration: mm-per-pixel scale of the radiograph. Linear (mm)
// measurements are converted with this factor; angular ones are unaffected.
export const setScaleFactor = createActionCreator('SET_SCALE_FACTOR_REQUESTED');
export const unsetScaleFactor = createActionCreator('UNSET_SCALE_FACTOR_REQUESTED');

// Export the current tracing (image + profilogram + points) as a raster image.
export const exportImage = createActionCreator('EXPORT_IMAGE_REQUESTED');

// Patient records dashboard (the timeline of every image on file).
export const setRecordsDashboardShown = createActionCreator('SET_RECORDS_DASHBOARD_SHOWN');

// Direct the next upload at one record slot (type + timepoint + day), so an
// empty slot on the dashboard opens an upload form that is already filled in.
export const setRecordFilingIntent = createActionCreator('SET_RECORD_FILING_INTENT');

// A visit's clinical note — what the patient came for, the diagnosis, the plan
// and what is in the mouth, in the clinician's own words. Saving is an append:
// the note keeps every version it has ever held, so an amended entry says so and
// can be read as it stood. @see VisitNote
export const saveVisitNote = createActionCreator('SAVE_VISIT_NOTE');
// Move a note to the visit it belongs to, with its trail — for an entry left
// pointing at a timepoint label no image carries any more.
export const refileVisitNote = createActionCreator('REFILE_VISIT_NOTE');
// Notes arriving with an imported project file (never overwriting one on file).
export const loadVisitNotes = createActionCreator('LOAD_VISIT_NOTES');

// Patient records (name + chart id + demographics).
export const addPatient = createActionCreator('ADD_PATIENT_REQUESTED');
export const updatePatient = createActionCreator('UPDATE_PATIENT_REQUESTED');
export const removePatient = createActionCreator('REMOVE_PATIENT_REQUESTED');
export const setActivePatient = createActionCreator('SET_ACTIVE_PATIENT_REQUESTED');
// Which measurements this patient's trend board is followed on — persisted with
// the patient, because a board that resets every time the case is reopened makes
// the reader re-tick it every morning.
export const setPatientTrendPlot = createActionCreator(
  'SET_PATIENT_TREND_PLOT_REQUESTED',
);
// A restore from a case file that did not land — the chart it registered is
// taken off the list again and the case list says why.
// @see StoreState['patients.restoreError']
export const restoreFromCaseFileFailed = createActionCreator(
  'RESTORE_FROM_CASE_FILE_FAILED',
);
// What a patient's saved project holds — counted off the project when it is
// written or opened, so the case list can be sorted and filtered on a case
// without reading megabytes of film for every row. @see PatientCaseSummary
export const setPatientCaseSummary = createActionCreator(
  'SET_PATIENT_CASE_SUMMARY',
);

// Project lifecycle (a project is a patient's images + tracings + analyses).
export const openPatient = createActionCreator('OPEN_PATIENT_REQUESTED');
export const saveProject = createActionCreator('SAVE_PROJECT_REQUESTED');
export const loadProjectSucceeded = createActionCreator('LOAD_PROJECT_SUCCEEDED');

export const setScale = createActionCreator('SET_SCALE_REQUESTED');

export const importFileRequested = createActionCreator('IMPORT_FILE_REQUESTED');
export const importFileSucceeded = createActionCreator('IMPORT_FILE_SUCCEEDED');
export const importFileFailed = createActionCreator('IMPORT_FILE_FAILED');

export const loadImageStarted = createActionCreator('LOAD_IMAGE_STARTED');
export const loadImageSucceeded = createActionCreator('LOAD_IMAGE_SUCCEEDED');
export const loadImageFailed = createActionCreator('LOAD_IMAGE_FAILED');

export const loadImageFromURL = createActionCreator('LOAD_IMAGE_FROM_URL_REQUESTED');

export const exportFile = createActionCreator('EXPORT_FILE_REQUESTED');
export const exportFileSucceeded = createActionCreator('EXPORT_FILE_SUCCEEDED');
export const exportFileFailed = createActionCreator('EXPORT_FILE_FAILED');
export const setExportProgress = createActionCreator('EXPORT_PROGRESS_CHANGED');

export const resetWorkspace = createActionCreator('RESET_WORKSPACE_REQUESTED');
export const canvasResized = createActionCreator('CANVAS_RESIZED');
export const setMousePosition = createActionCreator('MOUSE_POSITION_CHANGED');

export const setImageProps = createActionCreator('SET_IMAGE_PROPS');

export const setAnalysis = createActionCreator('SET_ANALYSIS_REQUESTED');
export const toggleAnalysisResults = createActionCreator('TOGGLE_ANALYSIS_RESULTS_REQUESTED');

export const highlightStep = createActionCreator('HIGHLIGHT_STEP_ON_CANVAS_REQUESTED');
export const unhighlightStep = createActionCreator('UNHIGHLIGHT_STEP_ON_CANVAS_REQUESTED');

export const redo = createActionCreator('REDO_REQUESTED');
export const undo = createActionCreator('UNDO_REQUESTED');

export const addWorker = createActionCreator('WORKER_CREATED');
export const updateWorker = createActionCreator('WORKER_STATUS_CHANGED');
export const removeWorker = createActionCreator('WORKER_TERMINATED');

export const fetchAnalysisSucceeded = createActionCreator('FETCH_ANALYSIS_SUCCEEDED');
export const fetchAnalysisFailed = createActionCreator('FETCH_ANALYSIS_FAILED');

export const setWorkspaceMode = createActionCreator('SET_WORKSPACE_MODE_REQUESTED');
export const setActiveImageId = createActionCreator('SET_ACTIVE_IMAGE_ID');

export const setSuperimpositionMode = createActionCreator('SET_SUPERIMPOSITION_MODE_REQUESTED');
export const superimposeImages = createActionCreator('SUPERIMPOSE_IMAGES_REQUESTED');

export const setActiveWorkspace = createActionCreator('SET_ACTIVE_WORKSPACE');
export const addNewWorkspace = createActionCreator('ADD_NEW_WORKSPACE');
export const removeWorkspace = createActionCreator('REMOVE_WORKSPACE');
/**
 * Drops an image from the record: removes its props, load status and tracing,
 * and detaches it from the workspace that held it. Dispatched by the records
 * dashboard's and record viewer's "Remove from record" action.
 */
export const closeImage = createActionCreator('CLOSE_IMAGE_REQUESTED');

export const traceImage = createActionCreator('TRACE_IMAGE_REQUESTED');
