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
  /**
   * The tile a slot-directed upload is waiting on, if any — the empty tile the
   * clinician was sent to by pressing "Add frontal ceph" on the records
   * dashboard.
   *
   * Without it the tile was a filled black square carrying a bare ordinal
   * ("2", "4"): indistinguishable from a loaded film whose thumbnail failed, and
   * silent about the filing that had just been chosen while every filed tile
   * beside it read "T1 / Lat ceph".
   */
  pendingWorkspaceId: string | null;
  /** What that pending tile is filing (from the filing intent, not the form). */
  pendingCaption: TabCaption | null;
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
