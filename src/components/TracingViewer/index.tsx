import * as React from 'react';

import BrightnessFilter from './filters/Brightness';
import ContrastFilter from './filters/Contrast';
import DropShadow from './filters/DropShadow';
import InvertFilter from './filters/Invert';
import GlowFilter from './filters/Glow';

import * as cx from 'classnames';

import Props from './props';

import GeoViewer from 'components/GeoViewer';
import { isGeoAngle, isGeoPoint, isGeoVector } from 'utils/math';
import { mapCursor } from 'utils/constants';
import {
  buildOutlines,
  outlineToSvgPath,
  OUTLINE_COLOR,
  OUTLINE_WIDTH,
  OUTLINE_OPACITY,
  LandmarkMap,
} from './outlines';
// The label layer is shared with the rasterised tracing (image export and the
// printed clinical report) so the film on paper carries the same, identically
// laid out, landmark tags the editor draws. See ./labels.
import {
  computeLabelPlacements,
  getShortLabel,
  LabelPlacement,
  LineSegment,
  LABEL_FONT_FAMILY,
  LABEL_FONT_SIZE,
} from './labels';

const classes = require('./style.scss');

// On-screen (device-pixel) sizes of the landmark UI; divided by the current
// scale when rendered so they stay constant regardless of zoom.
const POINT_RADIUS = 4.5;
const POINT_HIT_RADIUS = 13;

function isMouseEvent<T>(e: any): e is React.MouseEvent<T> {
  return e.touches === undefined;
};

/**
 * A wrapper around a canvas element.
 * Provides a declarative API for viewing landmarks on a cephalomertic image
 * and performing common edits like brightness and contrast.
 */
interface State {
  /** Symbol of the manual landmark currently being dragged, if any. */
  draggedSymbol: string | null;
  /** Live drag position in original-image coordinates. */
  dragX: number;
  dragY: number;
  /** Symbol of the draggable landmark currently under the cursor, if any. */
  hoveredSymbol: string | null;
}

export class TracingViewer extends React.PureComponent<Props, State> {
  state: State = {
    draggedSymbol: null,
    dragX: 0,
    dragY: 0,
    hoveredSymbol: null,
  };

  private imageElement: SVGImageElement | null = null;

  render() {
    const {
      className,
      src,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      imageHeight, imageWidth,
      contrast = 50, brightness = 50,
      isHighlightMode,
      getPropsForLandmark,
    } = this.props;
    const minHeight = Math.max(canvasHeight, imageHeight);
    const minWidth = Math.max(canvasWidth, imageWidth);
    return (
      <div className={className} style={{ height: minHeight, width: minWidth }}>
        <svg
          className={cx(classes.canvas, className)}
          viewBox={`0 0 ${minWidth} ${minHeight}`}
          style={this.state.draggedSymbol !== null ? { cursor: 'grabbing' } : undefined}
          onContextMenu={this.handleContextMenu}
          onMouseEnter={this.handleCanvasMouseEnter}
          onMouseLeave={this.handleCanvasMouseLeave}
          onMouseMove={this.handleSvgMouseMove}
          onMouseUp={this.commitDrag}
        >
          <defs>
            <BrightnessFilter id="brightness" value={brightness} />
            <DropShadow id="shadow" />
            <InvertFilter id="invert" />
            <ContrastFilter id="contrast" value={contrast} />
            <GlowFilter id="glow" />
          </defs>
          <g>
            <g filter="">
              <g filter="">
                <image
                  ref={this.setImageRef}
                  className={classes.image}
                  xlinkHref={src}
                  x={0}
                  y={0}
                  width={imageWidth}
                  height={imageHeight}
                  onWheelCapture={this.handleMouseWheel}
                  onMouseDown={this.handleClick}
                  onMouseMove={this.handleCanvasMouseMove}
                  onTouchMove={this.handleCanvasMouseMove}
                  transform={this.getTransformAttribute()}
                  filter={this.getFilterAttribute()}
                  opacity={isHighlightMode ? 0.5 : 1 }
                  style={{ cursor: this.getCanvasCursor() }}
                />
              </g>
            </g>
            <g transform={this.getTransformAttribute()}>
              {this.renderOutlines()}
              <GeoViewer
                top={0}
                left={0}
                width={imageWidth}
                height={imageHeight}
                objects={this.getRenderedLandmarks()}
                getPropsForPoint={this.getPropsForPoint}
                getPropsForVector={getPropsForLandmark}
                getPropsForAngle={getPropsForLandmark}
              />
              {this.renderProfilogram()}
              {this.renderLandmarkDecorations()}
            </g>
          </g>
        </svg>
      </div>
    );
  }

  private convertMousePositionRelativeToOriginalImage = (
    e: React.MouseEvent<SVGElement> | React.TouchEvent<SVGElement>,
  ) => {
    const element = e.currentTarget as Element;
    const rect = element.getBoundingClientRect();
    const { imageHeight, imageWidth } = this.props;
    const scaleX = rect.width / imageWidth;
    const scaleY = rect.height / imageHeight;
    const scrollTop = document.documentElement.scrollTop;
    const scrollLeft = document.documentElement.scrollLeft;
    const elementLeft = (rect.left) + scrollLeft;
    const elementTop = (rect.top) + scrollTop;
    const { pageX, pageY } = isMouseEvent(e) ? e : e.touches.item(0);
    let x = (pageX - elementLeft) / scaleX;
    let y = (pageY - elementTop)  / scaleY;
    if (this.props.isFlippedX) {
      x = imageWidth - x;
    }
    if (this.props.isFlippedY) {
      y = imageHeight - y;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  private getFilterAttribute = () => {
    let f = '';
    if (this.props.isInverted) {
      f += ' url(#invert)';
    }
    return f;
  }

  private getTransformAttribute = () => {
    const {
      scale,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      imageWidth, imageHeight,
    } = this.props;
    let transform = '';
    // Center the (scaled) image inside the drawing surface so the radiograph
    // is the visual hero instead of hugging the top-left corner. Mouse math is
    // unaffected: all conversions use the image element's bounding rect.
    const surfaceWidth = Math.max(canvasWidth, imageWidth);
    const surfaceHeight = Math.max(canvasHeight, imageHeight);
    const translateX = Math.max(0, (surfaceWidth - imageWidth * scale) / 2);
    const translateY = Math.max(0, (surfaceHeight - imageHeight * scale) / 2);
    transform += ` translate(${translateX}, ${translateY}) `;
    transform += ` scale(${scale}, ${scale})`;
    if (this.props.isFlippedX) {
      transform += ` scale(-1, 1) translate(-${this.props.imageWidth}, 0)`;
    }
    if (this.props.isFlippedY) {
      transform += ` scale(1, -1) translate(0, -${this.props.imageHeight})`;
    }
    return transform;
  }

  private handleCanvasMouseEnter = (e: React.MouseEvent<SVGElement>) => {
    const { onCanvasMouseEnter } = this.props.activeTool;
    if (typeof onCanvasMouseEnter === 'function') {
      e.preventDefault();
      const { dispatch } = this.props;
      onCanvasMouseEnter(dispatch);
    }
  };

  private handleCanvasMouseLeave = (e: React.MouseEvent<SVGElement>) => {
    // Leaving the canvas mid-drag commits the landmark at its last position so
    // it is never left visually detached from its stored value.
    this.commitDrag();
    const { onCanvasMouseLeave } = this.props.activeTool;
    if (typeof onCanvasMouseLeave === 'function') {
      e.preventDefault();
      const { dispatch } = this.props;
      onCanvasMouseLeave(dispatch);
    }
  };

  // ---- Manual-landmark dragging (fine-tuning) ------------------------------
  // Placed points get pointer events and a mousedown handler; the drag position
  // is tracked locally so the store (and undo history) only receives a single
  // update on release.

  private setImageRef = (element: SVGImageElement | null) => {
    this.imageElement = element;
  };

  private convertPagePositionToOriginalImage = (pageX: number, pageY: number) => {
    const rect = this.imageElement!.getBoundingClientRect();
    const { imageWidth, imageHeight } = this.props;
    const scaleX = rect.width / imageWidth;
    const scaleY = rect.height / imageHeight;
    const scrollTop = document.documentElement.scrollTop;
    const scrollLeft = document.documentElement.scrollLeft;
    let x = (pageX - (rect.left + scrollLeft)) / scaleX;
    let y = (pageY - (rect.top + scrollTop)) / scaleY;
    if (this.props.isFlippedX) {
      x = imageWidth - x;
    }
    if (this.props.isFlippedY) {
      y = imageHeight - y;
    }
    return {
      x: Math.min(Math.max(x, 0), imageWidth),
      y: Math.min(Math.max(y, 0), imageHeight),
    };
  };

  private getPropsForPoint = (symbol: string) => {
    const base = this.props.getPropsForLandmark(symbol);
    const { draggedSymbol, hoveredSymbol } = this.state;
    const withStates = {
      ...base,
      // Constant on-screen dot size regardless of zoom (the parent group is
      // scaled, so the image-space radius is divided by the current scale).
      r: POINT_RADIUS / this.props.scale,
      className: cx(
        base.className,
        symbol === draggedSymbol && classes.point_dragged,
        draggedSymbol === null && symbol === hoveredSymbol && classes.point_hovered,
      ),
    };
    if (!this.props.isDraggableLandmark(symbol)) {
      return withStates;
    }
    return {
      ...withStates,
      // .point disables pointer events (decorative geometry); re-enable them
      // inline for manually placed points so they can be grabbed. A larger
      // invisible hit target is rendered on top (see renderLandmarkDecorations).
      style: { ...base.style, pointerEvents: 'auto', cursor: 'grab' },
      onMouseDown: (e: React.MouseEvent<SVGCircleElement>) =>
        this.handleLandmarkMouseDown(symbol, e),
    };
  };

  /** The tool-appropriate cursor for the imaging surface. */
  private getCanvasCursor = () => {
    if (this.state.draggedSymbol !== null) {
      return 'grabbing';
    }
    const { getCursorForCanvas } = this.props.activeTool;
    if (typeof getCursorForCanvas === 'function') {
      return mapCursor(getCursorForCanvas());
    }
    return 'auto';
  };

  /**
   * Label layout for the points currently on the canvas, in screen space (the
   * shared layer's offsets then divide by the zoom, so a tag keeps its size).
   * The layout itself lives in ./labels, shared with the printed film.
   */
  private computeLabelPlacements = (
    points: Array<{ symbol: string; x: number; y: number }>,
  ): { [symbol: string]: LabelPlacement } => {
    const { scale } = this.props;
    // Visible tracing lines (S-N, Go-Me, …) in screen space: labels must not
    // sit across them.
    const lines: LineSegment[] = this.getRenderedLandmarks()
      .filter(({ value }) => isGeoVector(value))
      .map(({ value }) => ({
        x1: (value as GeoVector).x1 * scale,
        y1: (value as GeoVector).y1 * scale,
        x2: (value as GeoVector).x2 * scale,
        y2: (value as GeoVector).y2 * scale,
      }));
    return computeLabelPlacements(
      points.map(({ symbol, x, y }) => ({ symbol, x: x * scale, y: y * scale })),
      lines,
    );
  };

  /**
   * Symbol labels (with a dark halo so they read on any radiograph region)
   * plus enlarged invisible hit targets for the draggable points.
   */
  private renderLandmarkDecorations = () => {
    const { scale, isHighlightMode, highlightedLandmarks, isDraggableLandmark } = this.props;
    const { draggedSymbol } = this.state;
    const fontSize = LABEL_FONT_SIZE / scale;
    const points = this.getRenderedLandmarks()
      .filter(({ value }) => isGeoPoint(value))
      .map(({ symbol, value }) => ({
        symbol,
        x: (value as GeoPoint).x,
        y: (value as GeoPoint).y,
      }));
    const placements = this.computeLabelPlacements(points);
    return (
      <g>
        {points.map(({ symbol, ...value }) => {
          const dimmed = isHighlightMode && highlightedLandmarks[symbol] !== true;
          const p = placements[symbol];
          const labelX = value.x + p.dx / scale;
          const labelY = value.y + p.dy / scale;
          return (
            <g key={symbol} opacity={dimmed ? 0.3 : 1}>
              {p.far ? (
                <line
                  x1={value.x + (p.dx > 0 ? 6 : -6) / scale}
                  y1={value.y + (p.dy > 0 ? 5 : -5) / scale}
                  x2={value.x + (p.dx + (p.dx > 0 ? -2 : 2)) / scale}
                  y2={labelY - (p.dy > 0 ? LABEL_FONT_SIZE / 3 : -3) / scale}
                  stroke="#C7D0D9"
                  strokeWidth={1}
                  opacity={0.7}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ) : null}
              <text
                x={labelX}
                y={labelY}
                textAnchor={p.anchor}
                fontSize={fontSize}
                fontWeight={600}
                fontFamily={LABEL_FONT_FAMILY}
                fill="#FFFFFF"
                stroke="rgba(20, 24, 29, 0.85)"
                strokeWidth={4 / scale}
                paintOrder="stroke"
                strokeLinejoin="round"
                pointerEvents="none"
              >
                {getShortLabel(symbol)}
              </text>
              {isDraggableLandmark(symbol) && !dimmed ? (
                <circle
                  cx={value.x}
                  cy={value.y}
                  r={POINT_HIT_RADIUS / scale}
                  fill="transparent"
                  stroke="none"
                  pointerEvents="all"
                  style={{ cursor: draggedSymbol === null ? 'grab' : 'grabbing' }}
                  onMouseEnter={this.handleLandmarkMouseEnter.bind(this, symbol)}
                  onMouseLeave={this.handleLandmarkMouseLeave}
                  onMouseDown={(e: React.MouseEvent<SVGCircleElement>) =>
                    this.handleLandmarkMouseDown(symbol, e)}
                />
              ) : null}
            </g>
          );
        })}
      </g>
    );
  };

  private handleLandmarkMouseEnter = (symbol: string) => {
    this.setState({ hoveredSymbol: symbol });
  };

  private handleLandmarkMouseLeave = () => {
    this.setState({ hoveredSymbol: null });
  };

  private handleLandmarkMouseDown = (symbol: string, e: React.MouseEvent<SVGCircleElement>) => {
    if (e.button !== 0 || this.imageElement === null) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = this.convertPagePositionToOriginalImage(e.pageX, e.pageY);
    this.setState({ draggedSymbol: symbol, dragX: x, dragY: y });
  };

  private handleSvgMouseMove = (e: React.MouseEvent<SVGElement>) => {
    if (this.state.draggedSymbol === null || this.imageElement === null) {
      return;
    }
    const { x, y } = this.convertPagePositionToOriginalImage(e.pageX, e.pageY);
    this.setState({ dragX: x, dragY: y });
  };

  private commitDrag = () => {
    const { draggedSymbol, dragX, dragY } = this.state;
    if (draggedSymbol === null) {
      return;
    }
    this.props.onLandmarkMoved(draggedSymbol, Math.round(dragX), Math.round(dragY));
    this.setState({ draggedSymbol: null });
  };

  /**
   * Anatomical outline tracings (soft-tissue profile, mandible, maxilla, sella,
   * orbital rim, ear-rod) derived from the placed landmarks. Fine curved strokes
   * that read as a hand tracing, distinct from the straighter measurement/plane
   * segments. Purely decorative: pointer-events off so they never interfere with
   * landmark hit-testing or dragging. Follows live drag via getRenderedLandmarks.
   */
  private renderOutlines = () => {
    const { isHighlightMode } = this.props;
    const map: LandmarkMap = {};
    this.getRenderedLandmarks().forEach(({ symbol, value }) => {
      if (isGeoPoint(value)) {
        map[symbol] = value;
      }
    });
    const outlines = buildOutlines(map);
    if (outlines.length === 0) {
      return null;
    }
    return (
      <g opacity={isHighlightMode ? 0.35 : 1} pointerEvents="none">
        {outlines.map((outline) => {
          const d = outlineToSvgPath(outline);
          return (
            <g key={outline.id}>
              {/* Dark casing so the fine light stroke reads on bright bone. */}
              <path
                d={d}
                fill="none"
                stroke="rgba(20, 24, 29, 0.55)"
                strokeWidth={OUTLINE_WIDTH + 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              <path
                d={d}
                fill="none"
                stroke={OUTLINE_COLOR}
                strokeWidth={OUTLINE_WIDTH}
                strokeOpacity={OUTLINE_OPACITY}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            </g>
          );
        })}
      </g>
    );
  };

  /**
   * The profilogram overlay: a stylised skeletal/soft-tissue schematic drawn
   * through the placed landmarks. Most of its segments coincide with lines the
   * analysis already draws, so it must NOT reuse the tracing's cyan solid
   * strokes (that made the toggle look dead). Instead it reads as its own
   * layer: heavier dashed amber strokes over a dark casing — unmistakably
   * different from both the cyan measurement lines and the fine outline
   * tracings, so toggling it produces an obvious change.
   */
  private renderProfilogram = () => {
    const { isHighlightMode } = this.props;
    // Same guard as the tracing's own geometry (see `isDrawable`): a segment
    // computed against an absent image is NaN at both ends and draws nothing.
    const profilogram = this.props.profilogram.filter(
      ({ x1, y1, x2, y2 }) => isFinite(x1) && isFinite(y1) &&
        isFinite(x2) && isFinite(y2),
    );
    if (profilogram.length === 0) {
      return null;
    }
    return (
      <g opacity={isHighlightMode ? 0.35 : 1} pointerEvents="none">
        {profilogram.map((seg, i) => (
          <g key={i}>
            {/* Dark casing so the dashes read on bright bone regions. */}
            <line
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke="rgba(20, 24, 29, 0.75)"
              strokeWidth={4}
              strokeDasharray="7 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <line
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke="#FFC400"
              strokeWidth={2.25}
              strokeDasharray="7 5"
              strokeLinecap="round"
              opacity={0.95}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        ))}
      </g>
    );
  };

  /**
   * Whether a piece of geometry can be drawn at all — every coordinate on it a
   * finite number.
   *
   * A workspace with no image loaded has no width and no height to scale by, so
   * the geometry derived for it comes through as NaN, and React then warns once
   * per attribute per render: "Received NaN for the y2 attribute",
   * "<circle> attribute cx: Expected number", "<polygon> attribute points:
   * Expected number, 482,NaN NaN,NaN". Nothing is drawn either way — a NaN
   * coordinate has no position — so the object is dropped here rather than
   * handed to the DOM to be rejected, which also keeps the console readable for
   * the errors that matter.
   */
  private isDrawable = (value: any): boolean => {
    if (isGeoPoint(value)) {
      return isFinite(value.x) && isFinite(value.y);
    }
    if (isGeoVector(value)) {
      return isFinite(value.x1) && isFinite(value.y1) &&
        isFinite(value.x2) && isFinite(value.y2);
    }
    if (isGeoAngle(value)) {
      return value.vectors.every((vector) => this.isDrawable(vector));
    }
    return false;
  };

  private getRenderedLandmarks = () => {
    const { landmarks } = this.props;
    const { draggedSymbol, dragX, dragY } = this.state;
    // Render every completed geometric object: landmark points always, and the
    // analysis' completed lines as thin subtle strokes so the canvas reads as
    // an actual tracing rather than a floating dot cloud. The line/angle
    // belonging to the stepper row currently hovered is emphasized
    // (highlighted) so the user can see exactly which measurement the row
    // refers to; angle arcs stay hidden unless highlighted.
    const points = draggedSymbol === null
      ? landmarks
      : landmarks.map((landmark) =>
          landmark.symbol === draggedSymbol
            ? { ...landmark, value: { x: dragX, y: dragY } }
            : landmark,
        );
    return this.dedupeCoincidentVectors(
      points.filter(({ value }) => this.isDrawable(value)),
    );
  };

  /**
   * Several analyses define the same physical segment more than once (e.g.
   * Downs' "Pog-N" and its "Facial plane" are both N-Pog). Drawing both
   * stacks two 85%-opacity strokes a hair apart, which reads as a hatched
   * moire band. Keep a single line per unique pair of endpoints, preferring
   * the instance whose stepper row is currently highlighted so hover
   * emphasis still works for every duplicate symbol.
   */
  private dedupeCoincidentVectors = (
    landmarks: Props['landmarks'],
  ): Props['landmarks'] => {
    const { highlightedLandmarks } = this.props;
    const seen: { [key: string]: number } = {};
    const result: Array<Props['landmarks'][number]> = [];
    for (const landmark of landmarks) {
      const { value } = landmark;
      if (!isGeoVector(value)) {
        result.push(landmark);
        continue;
      }
      const { x1, y1, x2, y2 } = value;
      // Direction-insensitive key: A→B and B→A are the same segment.
      const key = (x1 < x2 || (x1 === x2 && y1 <= y2))
        ? `${x1},${y1},${x2},${y2}`
        : `${x2},${y2},${x1},${y1}`;
      const existingIndex = seen[key];
      if (existingIndex === undefined) {
        seen[key] = result.length;
        result.push(landmark);
      } else if (
        highlightedLandmarks[landmark.symbol] === true &&
        highlightedLandmarks[result[existingIndex].symbol] !== true
      ) {
        result[existingIndex] = landmark;
      }
    }
    return result;
  };

  private handleMouseWheel = (e: React.WheelEvent<SVGElement>) => {
    const { onCanvasMouseWheel } = this.props.activeTool;
    if (typeof onCanvasMouseWheel === 'function') {
      e.preventDefault();
      const { x, y } = this.convertMousePositionRelativeToOriginalImage(e);
      onCanvasMouseWheel(this.props.dispatch, x, y, e.deltaY);
    }
  }

  private handleCanvasMouseMove = (e: React.MouseEvent<SVGElement> | React.TouchEvent<SVGElement>) => {
    const { onCanvasMouseMove } = this.props.activeTool;
    if (typeof onCanvasMouseMove === 'function') {
      const { x, y } = this.convertMousePositionRelativeToOriginalImage(e);
      const { dispatch } = this.props;
      onCanvasMouseMove(dispatch, x, y);
    }
  }

  private handleClick = (e: React.MouseEvent<SVGElement>) => {
    const { onCanvasLeftClick, onCanvasRightClick } = this.props.activeTool;
    if (onCanvasLeftClick !== undefined || onCanvasRightClick !== undefined) {
      const { x, y } = this.convertMousePositionRelativeToOriginalImage(e);
      const { dispatch } = this.props;
      const which = e.button;
      if (which === 0 && typeof onCanvasLeftClick === 'function') {
        onCanvasLeftClick(dispatch, x, y);
      } else if (which === 2 && typeof onCanvasRightClick === 'function') {
        onCanvasRightClick(dispatch, x, y);
      }
    }
  }

  private handleContextMenu = (e: React.MouseEvent<SVGElement>) => {
    e.preventDefault();
  }
}

export default TracingViewer;
