export interface StateProps {
  src: string;
  canvasSize: {
    height: number;
    width: number;
  };
  imageHeight: number;
  imageWidth: number;
  scale: number;
  landmarks: ReadonlyArray<{
    label: string;
    symbol: string;
    value: GeoObject;
  }>;
  getPropsForLandmark: (symbol: string) => { [prop: string]: any };
  /** Whether the landmark was placed manually and can be dragged to adjust. */
  isDraggableLandmark: (symbol: string) => boolean;
  /** Profilogram line segments (image coords); empty when the overlay is off. */
  profilogram: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }>;
  isHighlightMode: boolean;
  highlightedLandmarks: {
    [symbol: string]: boolean;
  };
  activeTool: EditorTool;
};

export interface DispatchProps {
  dispatch: GenericDispatch;
  /** Commits a dragged manual landmark to its new position (image coords). */
  onLandmarkMoved: (symbol: string, x: number, y: number) => any;
  /**
   * Live, non-undoable position update fired on every frame of an in-progress
   * drag (mouse still down) — @see MOVE_MANUAL_LANDMARK_LIVE in webceph.d.ts.
   * Lets every selector already reading `manualLandmarks` live (the analysis
   * planes/vectors/angles, the stepper's computed measurements, the
   * profilogram) track the point as it moves instead of only snapping into
   * place once `onLandmarkMoved` commits on drop.
   */
  onLandmarkDragged: (symbol: string, x: number, y: number) => any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
