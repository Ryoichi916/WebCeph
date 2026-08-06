/** The record caption shown under a rail tile. */
export interface TabCaption {
  /** Timepoint label (`T1`, `T2`, …), or null when not recorded. */
  timepoint: string | null;
  /** Rail-sized image type label, e.g. `Lat ceph`. */
  typeLabel: string;
  /** Full sentence used as the tile's tooltip / accessible name. */
  fullLabel: string;
}

export interface OwnProps {
  className?: string;
}

export interface StateProps {
  tabs: string[];
  activeTabId: string | null;
  canAddWorkspace: boolean;
  /** Data URL of each workspace's radiograph, keyed by workspace id. */
  thumbnails: { [workspaceId: string]: string | undefined };
  /**
   * Record caption (timepoint + image type) for each workspace's image, so a
   * tile says what it is instead of only how many tiles precede it.
   */
  captions: { [workspaceId: string]: TabCaption | undefined };
}


export interface DispatchProps {
  onTabChanged: (id: string) => any;
  onAddNewTab: () => any;
}

export interface MergeProps {
}

export type ConnectableProps = StateProps & DispatchProps & MergeProps;

export type Props = OwnProps & StateProps & DispatchProps & MergeProps;

export default Props;
