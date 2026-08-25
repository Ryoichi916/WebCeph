import * as React from 'react';

import {
  isGeoPoint,
  isGeoVector,
  isGeoAngle,
} from 'utils/math';

import Angle, { AngleProps } from './Angle';

import { pure } from 'recompose';

import map from 'lodash/map';

import Props from './props';

export type { AngleProps };
export type PointProps = React.SVGAttributes<SVGCircleElement>;
export type VectorProps = React.SVGAttributes<SVGLineElement>;

import { Rect } from 'utils/math';

// Not memoized: both real call sites (TracingViewer and the SVG exporter)
// always pass top=0, so lodash's default memoize resolver — which keys the
// cache on the first argument only — would permanently cache the *first*
// image's dimensions and silently reuse them for every image loaded
// afterward in the same session. That corrupted Angle's extend-vs-parallel
// geometry (isPointWithinRect against boundingRect) for any patient with
// multiple images of different resolution, a default first-class workflow
// (T1/T2/T3 follow-up visits). The computation itself is a trivial object
// literal, not worth caching.
const createBoundingRect = (top: number, left: number, width: number, height: number): Rect => ({
  top, left,
  right: width,
  bottom: height,
});

const GeoViewer = pure((props: Props) => {
  const {
    objects,
    top, left,
    width, height,
    getPropsForPoint,
    getPropsForVector,
    getPropsForAngle,
    style,
    children,
  } = props;
  // A <g>, not a nested <svg>: a nested svg element establishes its own
  // viewport, and with no width/height/viewBox that viewport defaults to the
  // *CSS* size of the outer svg (a few hundred px) with overflow hidden — so
  // geometry drawn in the film's pixel coordinate space (e.g. 1578×2089) was
  // clipped to a corner and every measurement line, landmark dot and hover
  // highlight was invisible on a real high-resolution film. A group inherits
  // the parent coordinate system (including the fit/zoom transform) and never
  // clips.
  return (
    <g style={style}>
      {children}
      {
        map(objects, ({ value, symbol }) => {
          if (isGeoPoint(value)) {
            const rest = getPropsForPoint(symbol);
            return (
              <circle
                key={symbol}
                cx={value.x}
                cy={value.y}
                r={15}
                {...rest}
              />
            );
          } else if (isGeoVector(value)) {
            const rest = getPropsForVector(symbol);
            return (
              <line
                key={symbol}
                {...value}
                {...rest}
              />
            );
          } else if (isGeoAngle(value)) {
            const rest = getPropsForAngle(symbol);
            return (
              <Angle
                key={symbol}
                {...value}
                {...rest}
                symbol={symbol}
                boundingRect={createBoundingRect(top, left, width, height)}
              />
            );
          }
          return null;
        })
      }
    </g>
  );
});

export default GeoViewer;
