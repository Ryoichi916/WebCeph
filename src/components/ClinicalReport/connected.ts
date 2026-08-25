import { connect } from 'react-redux';

import ClinicalReport from './index';
import { StateProps, DispatchProps, OwnProps } from './props';

import { autoPlotLandmarks } from 'actions/workspace';

import {
  getCategorizedAnalysisResults,
  getActiveAnalysis,
  hasUnreportableLinearMeasurements,
} from 'store/reducers/workspace/analyses';
import {
  getAnalysisId,
  getImageProps,
  getManualLandmarks,
  getScaleFactor,
  getScaleSourceId,
  getImageTimepoint,
  getImageCaptureDate,
} from 'store/reducers/workspace/image';
import { getActivePatient } from 'store/reducers/patients';
// The visit's own clinical note — the practice's words, printed in the notes area
// of the sheet rather than left as blank rules (see `props#visitNote`).
import { getVisitNotes } from 'store/reducers/workspace/records';
import { getCurrentVisitNote } from 'utils/visitNotes';
// Same identity the records dashboard's own card states when a film's scale was
// copied rather than measured (see `props#scaleCopiedFrom`).
import { getImageTypeShortLabel, getTimepointToken } from 'utils/records';

import map from 'lodash/map';
import keyBy from 'lodash/keyBy';

const EMPTY_LANDMARKS: StateProps['landmarksBySymbol'] = { };
const EMPTY_MANUAL: StateProps['manualLandmarks'] = { };

/**
 * Where this film's scale came from, when it was copied from another film of
 * the record rather than measured on this one — the same fact and the same
 * identity the records dashboard's own card states (see
 * `RecordsDashboard#scaleCopiedFrom`), read fresh from the store rather than
 * carried in this component's own state so a report opened long after the copy
 * still states it correctly.
 *
 * Null once the source has since been recalibrated to a different factor: the
 * two numbers are no longer one claim, and naming a source beside a figure it no
 * longer matches would invite the reading that they agree.
 */
const getScaleCopiedFrom = (
  state: StoreState, imageId: string,
): StateProps['scaleCopiedFrom'] => {
  const scaleFactor = getScaleFactor(state)(imageId);
  const sourceId = getScaleSourceId(state)(imageId);
  if (scaleFactor === null || sourceId === null) {
    return null;
  }
  const source = getImageProps(state)(sourceId);
  if (source === undefined || getScaleFactor(state)(sourceId) !== scaleFactor) {
    return null;
  }
  const label = getTimepointToken(getImageTimepoint(state)(sourceId)) ||
    getImageTypeShortLabel(source.type || null);
  return { label, captureDate: getImageCaptureDate(state)(sourceId) };
};

const mapStateToProps =
  (state: StoreState, { imageId }: OwnProps): StateProps => {
    if (imageId === null) {
      return {
        patient: getActivePatient(state),
        results: [],
        analysisId: null,
        landmarksBySymbol: EMPTY_LANDMARKS,
        imageSrc: null,
        imageWidth: null,
        imageHeight: null,
        imageType: null,
        timepoint: null,
        captureDate: null,
        visitNote: null,
        manualLandmarks: EMPTY_MANUAL,
        scaleFactor: null,
        scaleCopiedFrom: null,
        needsScaleForLinear: false,
      };
    }
    const analysis = getActiveAnalysis(state)(imageId);
    const image = getImageProps(state)(imageId);
    return {
      patient: getActivePatient(state),
      results: getCategorizedAnalysisResults(state)(imageId),
      analysisId: getAnalysisId(state)(imageId),
      landmarksBySymbol: analysis !== null
        ? keyBy(map(analysis.components, c => c.landmark), l => l.symbol)
        : EMPTY_LANDMARKS,
      imageSrc: (image && image.data) || null,
      imageWidth: (image && image.width) || null,
      imageHeight: (image && image.height) || null,
      imageType: (image && image.type) || null,
      timepoint: getImageTimepoint(state)(imageId),
      captureDate: getImageCaptureDate(state)(imageId),
      // The note of the *visit* this film belongs to, keyed by its timepoint
      // label — so every film of one visit reports the one entry.
      visitNote: getCurrentVisitNote(
        getVisitNotes(state), getImageTimepoint(state)(imageId),
      ),
      manualLandmarks: getManualLandmarks(state)(imageId),
      scaleFactor: getScaleFactor(state)(imageId),
      scaleCopiedFrom: getScaleCopiedFrom(state, imageId),
      needsScaleForLinear: hasUnreportableLinearMeasurements(state)(imageId),
    };
  };

/**
 * The report's one dispatch: complete the tracing for the analyses it is about
 * to print.
 *
 * The combined printout evaluates all nine lateral analyses from the placed
 * landmarks, but only the *active* analysis' landmarks are ever plotted — the
 * analysis-switch middleware fills in what a newly selected analysis needs, and
 * nothing filled in what an analysis the user never opened needs. So the same
 * tracing produced a different document depending on which analysis happened to
 * be open when the report was opened: with Wits active, the Soft Tissue section
 * printed "4 of 7 measured" and concluded "Skeletal profile — Normal"; after a
 * visit to the Soft Tissue analysis it printed 7 of 7 and concluded "Concave",
 * with an entire finding — "Chin prominence — Recessive", two of its three
 * measurements over two standard deviations out — that the first document
 * silently omitted. A clinician signs the certification block under that.
 *
 * This runs the identical completion pass (the same `autoPlotLandmarks`
 * dispatch, the same predictor, the same single undoable batch, and the same
 * refusal to overwrite anything already placed) for the union of every
 * analysis' landmarks instead of for one analysis' — see
 * `index.tsx#componentDidMount`.
 */
const mapDispatchToProps = (
  dispatch: GenericDispatch, { imageId }: OwnProps,
): DispatchProps => ({
  onPlotMissingLandmarks: (symbols: string[]) => {
    if (imageId === null || symbols.length === 0) {
      return;
    }
    dispatch(autoPlotLandmarks({ imageId, symbols }));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(ClinicalReport);
