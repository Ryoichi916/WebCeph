export interface StateProps {
  imageId: string | null;
  imageSrc?: string;
  isDemoImageLoading?: boolean;
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
