export interface StateProps {
  imageId: string | null;
  /**
   * Whether a file just dropped or chosen for this workspace (including the
   * bundled demo) is still being read and decoded — there is no `imageId` yet
   * to switch the editor onto, so without this the dropzone would otherwise
   * sit showing nothing happening for however long a large hi-res scan takes
   * to decode. @see store/reducers/workspace#shouldShowLoadingFileIndicator
   */
  isLoadingFile: boolean;
  /**
   * Why the last file dropped or chosen for this workspace failed to import,
   * or null when nothing has failed (or a later attempt has since cleared
   * it — see IMPORT_FILE_REQUESTED/SUCCEEDED in the settings reducer). The
   * dropzone was the one place this reached no rendered surface at all: a
   * corrupt or unsupported file just sat there looking like nothing had
   * happened, no different from never having picked a file.
   * @see store/reducers/workspace/settings#getImportError
   */
  importError: GenericError | null;
  /** Whether the analysis results summary dialog is open. */
  isSummaryShown: boolean;
  /**
   * Whether the open image can be traced and analysed here — false for the
   * record's non-cephalometric images (frontal ceph, panoramic, photographs),
   * which open in a read-only record view instead of a stepper.
   */
  isImageTraceable: boolean;
  /**
   * Timepoint label the upload form should start on (`T1`, `T2`, …) — the next
   * unused label after the ones the record already carries, never the image
   * count (see utils/records#getNextTimepointLabel).
   */
  defaultTimepoint: string;
  /**
   * True once the demo/placeholder predictor (see `predictors/demo.ts`) has
   * plotted a landmark on this image and it is not the bundled sample
   * cephalogram that predictor's template is calibrated against — i.e. some
   * of what is on screen is a fabricated position, not a real detection.
   * @see store/reducers/workspace/predictorWarnings
   */
  isPlaceholderAutoPlot: boolean;
};

export interface DispatchProps {
  onFilesDrop: (files: File[], meta: ImageRecordMeta) => any;
  onDemoButtonClick: (meta: ImageRecordMeta) => any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  workspaceId: string;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
