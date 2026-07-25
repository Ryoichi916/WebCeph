export interface StateProps {
  src: string;
  brightness?: number;
  contrast?: number;
  isInverted?: boolean;
  isFlippedX?: boolean;
  isFlippedY?: boolean;
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
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
