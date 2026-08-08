export interface StateProps {
  supportedImageTypes?: string[];
  allowsMultipleFiles?: boolean;
  isOffline: boolean;
}

export interface DispatchProps {

}

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  /**
   * Timepoint label the form starts on — `T1` for the first image of a record,
   * `T2` for the next, and so on (see utils/records#getDefaultTimepoint).
   */
  defaultTimepoint: string;
  onDemoButtonClick(meta: ImageRecordMeta): any;
  onFilesDrop(files: File[], meta: ImageRecordMeta): any;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
