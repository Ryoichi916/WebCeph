import * as React from 'react';

import BrightnessFilter from './filters/Brightness';
import ContrastFilter from './filters/Contrast';
import DropShadow from './filters/DropShadow';
import InvertFilter from './filters/Invert';
import GlowFilter from './filters/Glow';

import * as cx from 'classnames';

import Props from './props';

import GeoViewer from 'components/GeoViewer';
import { isGeoPoint } from 'utils/math';

const classes = require('./style.scss');

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
}

export class TracingViewer extends React.PureComponent<Props, State> {
  state: State = {
    draggedSymbol: null,
    dragX: 0,
    dragY: 0,
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
                />
              </g>
            </g>
            <g transform={this.getTransformAttribute()}>
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
    const { scale } = this.props;
    let transform = '';
    const translateX = 0; // (imageWidth * scale) - scaleOriginX;
    const translateY = 0; // (scaleOriginY * scale) - scaleOriginY;
    transform += ` translate(${-1 * translateX}, ${-1 * translateY}) `;
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
    if (!this.props.isDraggableLandmark(symbol)) {
      return base;
    }
    return {
      ...base,
      // .landmark disables pointer events (decorative geometry); re-enable them
      // inline for manually placed points so they can be grabbed.
      style: { ...base.style, pointerEvents: 'auto', cursor: 'move' },
      onMouseDown: (e: React.MouseEvent<SVGCircleElement>) =>
        this.handleLandmarkMouseDown(symbol, e),
    };
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
            stroke="#00e5ff"
            strokeWidth={1.25}
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
    // Render only the landmark points. The analysis' own lines/angles are not
    // drawn on the canvas — the profile geometry is shown by the (toggleable)
    // profilogram overlay instead — while the analysis still computes its values
    // for the stepper.
    const points = landmarks.filter((landmark) => isGeoPoint(landmark.value));
    if (draggedSymbol === null) {
      return points;
    }
    return points.map((landmark) =>
      landmark.symbol === draggedSymbol
        ? { ...landmark, value: { x: dragX, y: dragY } }
        : landmark,
    );
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
