import * as React from 'react';

import { Simulation } from 'analyses/simulation';
import {
  assembleMorphControls, buildRoi, anchorRing, buildMorphField,
} from 'analyses/photoMorph';
import {
  solvePhotoRegistration, REGISTRATION_SYMBOLS,
} from 'analyses/photoOverlay';
import { LandmarkMap, placedPoints } from 'analyses/superimposition';
import { warpPhotoRegion } from 'utils/photoMorphCanvas';

const classes = require('./style.scss');

export interface PhotoMorphProps {
  /** The registered profile photograph. */
  src: string;
  width: number;
  height: number;
  registration: PhotoRegistration;
  /** The ceph tracing the registration reads from — this simulation's film. */
  cephMap: LandmarkMap;
  cephWidth: number;
  simulation: Simulation;
}

interface State {
  /** The decoded photograph, once loaded. */
  image: HTMLImageElement | null;
}

/**
 * The simulation's plan illustrated on the patient's registered profile
 * photograph: the soft-tissue displacement vectors the tracing figure already
 * draws (the published ratios — @see SOFT_TISSUE_RESPONSE) are mapped into
 * photo space through the Photo Overlay's two-point registration and applied
 * as a Moving Least Squares warp confined to the lip region
 * (@see analyses/photoMorph). Everything outside the region — eyes, forehead,
 * background — is the untouched photograph by construction.
 *
 * This view only *reads* the registration the Photo Overlay wrote; it
 * dispatches nothing, same as the rest of the simulation. And it is an
 * illustration of the plan's stated ratios on a two-point approximate
 * alignment — not a prediction of appearance — which the caption under the
 * figure states permanently.
 */
export default class PhotoMorph extends React.PureComponent<PhotoMorphProps, State> {
  state: State = { image: null };

  /** The composited output; redrawn when the plan or the photo changes. */
  private canvas: HTMLCanvasElement | null = null;
  /** True while the compare button holds the original photograph up. */
  private isComparing = false;

  componentDidMount() {
    const image = new Image();
    image.onload = () => this.setState({ image });
    image.src = this.props.src;
  }

  componentDidUpdate(prevProps: PhotoMorphProps, prevState: State) {
    if (
      prevProps.simulation !== this.props.simulation ||
      prevProps.registration !== this.props.registration ||
      prevState.image !== this.state.image
    ) {
      this.draw();
    }
  }

  render() {
    return (
      <div className={classes.morph}>
        <canvas
          ref={this.setCanvas}
          className={classes.morph_canvas}
          width={this.props.width}
          height={this.props.height}
        />
        <div className={classes.morph_footer}>
          <p className={classes.morph_note}>
            Geometric illustration of the plan on the photograph — not a
            prediction of appearance. The lips move by the same published mean
            ratios as the tracing (individual response varies by roughly
            ±0.3), through the Photo Overlay’s approximate two-point
            alignment. Nothing is measured on the photograph.
          </p>
          <button
            type="button"
            className={classes.morph_compare}
            title="Hold to see the photograph as taken"
            onMouseDown={this.startCompare}
            onMouseUp={this.stopCompare}
            onMouseLeave={this.stopCompare}
            onTouchStart={this.startCompare}
            onTouchEnd={this.stopCompare}
          >
            Hold to compare
          </button>
        </div>
      </div>
    );
  }

  private setCanvas = (el: HTMLCanvasElement | null) => {
    this.canvas = el;
    if (el !== null) {
      this.draw();
    }
  };

  private startCompare = () => {
    this.isComparing = true;
    this.draw();
  };

  private stopCompare = () => {
    this.isComparing = false;
    this.draw();
  };

  /**
   * The ceph → photo transform from the stored registration, or null when
   * the registration is incomplete or degenerate — the parent only mounts
   * this component with both points stored, but the tracing's own Pn/Pog′
   * could have been unplotted since, so this stays defensive.
   */
  private transform() {
    const { registration, cephMap, cephWidth } = this.props;
    const points = placedPoints(cephMap);
    const cephPn = points[REGISTRATION_SYMBOLS[0]];
    const cephPog = points[REGISTRATION_SYMBOLS[1]];
    const photoPn = registration.points[REGISTRATION_SYMBOLS[0]];
    const photoPog = registration.points[REGISTRATION_SYMBOLS[1]];
    if (
      cephPn === undefined || cephPog === undefined ||
      photoPn === undefined || photoPog === undefined
    ) {
      return null;
    }
    return solvePhotoRegistration(
      cephPn, cephPog, photoPn, photoPog, registration.isFlipped, cephWidth,
    );
  }

  private draw() {
    const { image } = this.state;
    const canvas = this.canvas;
    if (image === null || canvas === null) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return;
    }
    const { width, height, cephMap, simulation } = this.props;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    if (this.isComparing) {
      return;
    }
    const transform = this.transform();
    if (transform === null) {
      return;
    }
    const controls = assembleMorphControls(cephMap, simulation, transform);
    // An empty plan (or the response held) moves nothing: the photograph as
    // drawn *is* the output, and warping through an identity field would only
    // resample it for no change.
    const moves = controls.some(
      (c) => Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y) > 1e-3,
    );
    if (!moves) {
      return;
    }
    const roi = buildRoi(controls, width, height);
    if (roi === null) {
      return;
    }
    const field = buildMorphField(
      [...controls, ...anchorRing(roi)], roi,
    );
    const warped = warpPhotoRegion(image, width, height, field);
    if (warped !== null) {
      ctx.drawImage(warped, roi.left, roi.top);
    }
  }
}
