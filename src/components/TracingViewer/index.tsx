import * as React from 'react';

import BrightnessFilter from './filters/Brightness';
import ContrastFilter from './filters/Contrast';
import DropShadow from './filters/DropShadow';
import InvertFilter from './filters/Invert';
import GlowFilter from './filters/Glow';

import * as cx from 'classnames';

import Props from './props';

import GeoViewer from 'components/GeoViewer';
import { isGeoPoint, isGeoVector } from 'utils/math';
import { mapCursor } from 'utils/constants';
import {
  buildOutlines,
  outlineToSvgPath,
  OUTLINE_COLOR,
  OUTLINE_WIDTH,
  OUTLINE_OPACITY,
  LandmarkMap,
} from './outlines';

const classes = require('./style.scss');

// On-screen (device-pixel) sizes of the landmark UI; divided by the current
// scale when rendered so they stay constant regardless of zoom.
const POINT_RADIUS = 4.5;
const POINT_HIT_RADIUS = 13;
const LABEL_FONT_SIZE = 11;

/**
 * Candidate label positions around a landmark dot, tried in order until one
 * does not collide with an already-placed label or another dot. Offsets are
 * on-screen pixels relative to the dot; `anchor` is the SVG text-anchor. The
 * `far` candidates sit further out and get a small leader line back to the dot.
 */
interface LabelCandidate {
  dx: number;
  dy: number;
  anchor: 'start' | 'end' | 'middle';
  far: boolean;
}

const LABEL_CANDIDATES: LabelCandidate[] = [
  { dx: 9, dy: -7, anchor: 'start', far: false },   // right-above (default)
  { dx: 9, dy: 15, anchor: 'start', far: false },   // right-below
  { dx: -9, dy: -7, anchor: 'end', far: false },    // left-above
  { dx: -9, dy: 15, anchor: 'end', far: false },    // left-below
  { dx: 0, dy: -10, anchor: 'middle', far: false }, // centered above
  { dx: 0, dy: 18, anchor: 'middle', far: false },  // centered below
  { dx: 18, dy: -16, anchor: 'start', far: true },  // far right-above + leader
  { dx: 18, dy: 24, anchor: 'start', far: true },   // far right-below + leader
  { dx: -18, dy: -16, anchor: 'end', far: true },   // far left-above + leader
  { dx: -18, dy: 24, anchor: 'end', far: true },    // far left-below + leader
];

/**
 * Anatomically informed first choices: for landmarks that sit directly on the
 * traced bony outline (the chin cluster especially), place the label on the
 * side that is typically clear film so it never sits across the outline. The
 * generic candidates above remain as fallbacks.
 */
const PREFERRED_CANDIDATES: { [symbol: string]: LabelCandidate[] } = {
  // Menton is the lowest point of the chin — below it is clear film.
  Me: [{ dx: 0, dy: 19, anchor: 'middle', far: false }],
  // Gnathion sits on the chin curve between Pog and Me — label inward (up-left
  // into the symphysis body) keeps it off the outline.
  Gn: [{ dx: -10, dy: 4, anchor: 'end', far: false },
       { dx: -10, dy: -8, anchor: 'end', far: false }],
  // Pogonion / B point sit on the anterior symphysis outline — label inward.
  Pog: [{ dx: -10, dy: 4, anchor: 'end', far: false }],
  B: [{ dx: -10, dy: 4, anchor: 'end', far: false }],
  // Gonion sits on the posterior jaw angle — label outward (down-left).
  Go: [{ dx: -9, dy: 15, anchor: 'end', far: false }],
};

interface LabelPlacement extends LabelCandidate {
  symbol: string;
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const rectsIntersect = (a: ScreenRect, b: ScreenRect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The same rect grown by a margin on every side (for soft-proximity tests). */
const inflateRect = (r: ScreenRect, m: number): ScreenRect => ({
  left: r.left - m,
  right: r.right + m,
  top: r.top - m,
  bottom: r.bottom + m,
});

/** Approximate on-screen bounding box of a label drawn with a candidate. */
const getLabelRect = (
  sx: number, sy: number, textWidth: number, c: LabelCandidate,
): ScreenRect => {
  const left = c.anchor === 'start' ? sx + c.dx
    : c.anchor === 'end' ? sx + c.dx - textWidth
    : sx + c.dx - textWidth / 2;
  const baseline = sy + c.dy;
  return {
    left: left - 1,
    right: left + textWidth + 1,
    top: baseline - LABEL_FONT_SIZE - 1,
    bottom: baseline + 2,
  };
};

interface ScreenSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Liang-Barsky: does the segment pass through the (slightly padded) rect? */
const segmentIntersectsRect = (s: ScreenSegment, r: ScreenRect, pad: number): boolean => {
  const left = r.left - pad;
  const right = r.right + pad;
  const top = r.top - pad;
  const bottom = r.bottom + pad;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [s.x1 - left, right - s.x1, s.y1 - top, bottom - s.y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) {
        return false;
      }
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) { return false; }
        if (t > t0) { t0 = t; }
      } else {
        if (t < t0) { return false; }
        if (t < t1) { t1 = t; }
      }
    }
  }
  return true;
};

const LABEL_FONT_FAMILY = [
  '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
  '"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"',
  'Meiryo', 'sans-serif',
].join(', ');

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
   * Greedy collision-aware label layout: labels are placed in reading order
   * (top-to-bottom), each taking the first candidate position that overlaps
   * neither an already-placed label nor another landmark dot, so adjacent
   * labels (e.g. A and Po near the ear region) never stack.
   */
  private computeLabelPlacements = (
    points: Array<{ symbol: string; x: number; y: number }>,
  ): { [symbol: string]: LabelPlacement } => {
    const { scale } = this.props;
    const placements: { [symbol: string]: LabelPlacement } = {};
    const occupied: ScreenRect[] = points.map(({ x, y }) => ({
      left: x * scale - 7,
      right: x * scale + 7,
      top: y * scale - 7,
      bottom: y * scale + 7,
    }));
    // Visible tracing lines (S-N, Go-Me, …) in screen space: labels must not
    // sit across them.
    const lines: ScreenSegment[] = this.getRenderedLandmarks()
      .filter(({ value }) => isGeoVector(value))
      .map(({ value }) => ({
        x1: (value as GeoVector).x1 * scale,
        y1: (value as GeoVector).y1 * scale,
        x2: (value as GeoVector).x2 * scale,
        y2: (value as GeoVector).y2 * scale,
      }));
    const sorted = points
      .slice()
      .sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.symbol < b.symbol ? -1 : 1));
    for (const point of sorted) {
      const sx = point.x * scale;
      const sy = point.y * scale;
      // ~0.62em average glyph advance for an 11px 600-weight system font.
      const textWidth = point.symbol.length * LABEL_FONT_SIZE * 0.62 + 2;
      const candidates = [
        ...(PREFERRED_CANDIDATES[point.symbol] || []),
        ...LABEL_CANDIDATES,
      ];
      // First candidate that collides with nothing wins; otherwise the least
      // objectionable one. Hard overlaps (label on label/dot, line through the
      // text) weigh most; mere proximity (within a few px of a dot, label or
      // line) gets a soft penalty so labels are nudged clear of crowded areas
      // — the N fan and the Pog/Gn/Me chin cluster especially — instead of
      // parking flush against them. Far candidates carry a small cost so the
      // leader-line treatment only appears when the near ring is truly full.
      let chosen = candidates[0];
      let bestPenalty = Infinity;
      for (const candidate of candidates) {
        const rect = getLabelRect(sx, sy, textWidth, candidate);
        const softRect = inflateRect(rect, 3);
        let penalty = candidate.far ? 0.75 : 0;
        for (const other of occupied) {
          if (rectsIntersect(rect, other)) {
            penalty += 3;
          } else if (rectsIntersect(softRect, other)) {
            penalty += 1;
          }
        }
        for (const line of lines) {
          if (segmentIntersectsRect(line, rect, 1.5)) {
            penalty += 1.5;
          } else if (segmentIntersectsRect(line, rect, 4.5)) {
            penalty += 0.5;
          }
        }
        if (penalty === 0) {
          chosen = candidate;
          break;
        }
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          chosen = candidate;
        }
      }
      occupied.push(getLabelRect(sx, sy, textWidth, chosen));
      placements[point.symbol] = { symbol: point.symbol, ...chosen };
    }
    return placements;
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
                {symbol}
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

  private renderProfilogram = () => {
    const { profilogram } = this.props;
    if (profilogram.length === 0) {
      return null;
    }
    return (
      <g>
        {profilogram.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke="#0091EA"
            strokeWidth={1.5}
            opacity={0.85}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      </g>
    );
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
    return this.dedupeCoincidentVectors(points);
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
