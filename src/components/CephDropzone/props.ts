export interface StateProps {
  supportedImageTypes?: string[];
  allowsMultipleFiles?: boolean;
  isOffline: boolean;
  /**
   * The record slot this upload was directed at — the type, timepoint and day of
   * the empty slot the clinician clicked on the records dashboard — or null when
   * they simply asked to add an image.
   *
   * When it is set, the form opens on those values instead of on the generic
   * defaults: a clinician who has just pressed "Add profile photo" in T2's panel
   * must not have to state the type and the timepoint a second time.
   * @see StoreEntries['records.filing.intent']
   */
  filingIntent: ImageRecordMeta | null;
}

export interface DispatchProps {

}

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  /**
   * Timepoint label the form starts on — `T1` on a record with no visit on file,
   * `T2` once T1 exists, and so on. It counts the record's own timepoint labels,
   * not its images (see utils/records#getNextTimepointLabel): a visit that was
   * both radiographed and photographed is two images and one visit.
   */
  defaultTimepoint: string;
  onDemoButtonClick(meta: ImageRecordMeta): any;
  onFilesDrop(files: File[], meta: ImageRecordMeta): any;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
