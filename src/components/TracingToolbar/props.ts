export interface StateProps {
  canAutoPlot: boolean;
  isAutoPlotting: boolean;
  /** Whether both reference points (Sella and Nasion) are placed. */
  canPlotFromReferences: boolean;
  /** Whether the profilogram overlay is currently shown. */
  isProfilogramShown: boolean;
  /** The id of the analysis active for the current image. */
  activeAnalysisId: string | null;
  /** Whether the analysis summary dialog can be shown for the current image. */
  canShowSummary: boolean;
  /**
   * How many of the active analysis' manual landmarks are still unplaced.
   * Used to explain a disabled Summary button instead of graying out silently.
   */
  missingLandmarkCount: number;
  /** The user zoom factor (1 = fit to screen). */
  zoom: number;
  /** Whether there is a landmark edit that can be undone. */
  canUndo: boolean;
  /** Whether there is an undone landmark edit that can be reapplied. */
  canRedo: boolean;
  /**
   * The mm-per-pixel calibration of the current image, or null when the image
   * has not been calibrated yet.
   */
  scaleFactor: number | null;
  /**
   * Whether two of the patient's images carry tracings that can be registered
   * against each other (see components/Superimposition/selectors).
   */
  canSuperimpose: boolean;
  /**
   * The Superimpose button's tooltip: the invitation when it is available, and
   * precisely what is missing when it is not.
   */
  superimposeReason: string;
  /**
   * Whether this image's tracing carries enough geometry for at least one
   * treatment movement to be simulated (see analyses/simulation).
   */
  canSimulate: boolean;
  /**
   * The Simulate button's tooltip: the invitation when it is available, and
   * precisely what is missing when it is not.
   */
  simulateReason: string;
};

export interface DispatchProps {
  onAutoPlotClick(): any;
  onPlotFromReferencesClick(): any;
  onToggleProfilogramClick(): any;
  onSelectAnalysis(analysisId: string): any;
  onExportImage(format: 'png' | 'jpeg'): any;
  onShowSummaryClick(): any;
  onZoomChange(zoom: number): any;
  onUndoClick(): any;
  onRedoClick(): any;
  /** Store the mm-per-pixel calibration for the current image. */
  onSetScaleFactor(value: number): any;
  /** Clear the calibration for the current image. */
  onUnsetScaleFactor(): any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string | null;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
