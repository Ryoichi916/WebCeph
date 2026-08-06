import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

const classes = require('./style.scss');

export interface CalibrationDialogProps {
  /** The current mm/px calibration, or null if the image is not calibrated. */
  scaleFactor: number | null;
  onSave(value: number): any;
  onRemove(): any;
  onRequestClose(): any;
}

type EntryMode = 'known' | 'direct';

interface CalibrationDialogState {
  mode: EntryMode;
  /** "Known distance" helper fields (kept as raw strings while typing). */
  realMm: string;
  imagePx: string;
  /** Direct mm-per-pixel entry. */
  directMmPx: string;
}

/** Parses a positive finite number from user input; null when invalid. */
const parsePositive = (raw: string): number | null => {
  if (raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return (isFinite(value) && value > 0) ? value : null;
};

/**
 * mm/px factors are small (~0.1); 4 significant-ish decimals keeps the
 * preview honest without drowning the user in digits.
 */
export const formatMmPx = (value: number, decimals = 4): string => {
  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '.0');
};

/**
 * Small hand-rolled modal for setting the image's mm-per-pixel calibration.
 * Rendered through a portal so the toolbar's own stacking context and the
 * dark canvas never clip or tint it.
 */
export default class CalibrationDialog extends
  React.PureComponent<CalibrationDialogProps, CalibrationDialogState> {

  constructor(props: CalibrationDialogProps) {
    super(props);
    this.state = {
      // A calibrated image reopens in direct mode with its current factor
      // prefilled so "nudge the value" is a two-click edit.
      mode: props.scaleFactor !== null ? 'direct' : 'known',
      realMm: '',
      imagePx: '',
      directMmPx: props.scaleFactor !== null ? formatMmPx(props.scaleFactor) : '',
    };
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  render() {
    const { scaleFactor } = this.props;
    const { mode, realMm, imagePx, directMmPx } = this.state;
    const computed = this.getComputedScale();
    return ReactDOM.createPortal(
      (
        <div className={classes.calib_backdrop} onMouseDown={this.handleBackdropMouseDown}>
          <div
            className={classes.calib_dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calibration-dialog-title"
            onMouseDown={this.stopPropagation}
          >
            <div className={classes.calib_header}>
              <h2 id="calibration-dialog-title" className={classes.calib_title}>
                Image calibration
              </h2>
              <p className={classes.calib_subtitle}>
                Set the real-world scale of this radiograph so linear
                measurements read in millimeters. Angular measurements are
                scale-independent and never need calibration.
              </p>
            </div>

            <div className={classes.calib_tabs} role="tablist" aria-label="Calibration method">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'known'}
                className={cx(classes.calib_tab, {
                  [classes.calib_tab__active]: mode === 'known',
                })}
                onClick={this.switchToKnown}
              >
                Known distance
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'direct'}
                className={cx(classes.calib_tab, {
                  [classes.calib_tab__active]: mode === 'direct',
                })}
                onClick={this.switchToDirect}
              >
                Direct scale
              </button>
            </div>

            <form className={classes.calib_body} onSubmit={this.handleSubmit} noValidate>
              {mode === 'known' ? (
                <div>
                  <p className={classes.calib_hint}>
                    Most films include an embedded ruler or a marker of known
                    size. Enter a distance you can trust and the length it
                    spans in the image.
                  </p>
                  <div className={classes.calib_fields}>
                    <label className={classes.calib_field}>
                      <span className={classes.calib_label}>Actual distance</span>
                      <span className={classes.calib_input_group}>
                        <input
                          className={classes.calib_input}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="10"
                          value={realMm}
                          autoFocus
                          onChange={this.handleRealMmChange}
                        />
                        <span className={classes.calib_unit}>mm</span>
                      </span>
                    </label>
                    <span className={classes.calib_fields_divider} aria-hidden="true">=</span>
                    <label className={classes.calib_field}>
                      <span className={classes.calib_label}>Length on image</span>
                      <span className={classes.calib_input_group}>
                        <input
                          className={classes.calib_input}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="96"
                          value={imagePx}
                          onChange={this.handleImagePxChange}
                        />
                        <span className={classes.calib_unit}>px</span>
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <p className={classes.calib_hint}>
                    Enter the scale directly if it is known from the imaging
                    device. Typical lateral cephalograms fall between 0.08 and
                    0.15&nbsp;mm/px.
                  </p>
                  <div className={classes.calib_fields}>
                    <label className={classes.calib_field}>
                      <span className={classes.calib_label}>Image scale</span>
                      <span className={classes.calib_input_group}>
                        <input
                          className={classes.calib_input}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="0.1042"
                          value={directMmPx}
                          autoFocus
                          onChange={this.handleDirectChange}
                        />
                        <span className={classes.calib_unit}>mm/px</span>
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div
                className={cx(classes.calib_preview, {
                  [classes.calib_preview__ready]: computed !== null,
                  [classes.calib_preview__invalid]: computed === null && this.hasInvalidInput(),
                })}
                aria-live="polite"
              >
                {computed !== null ? (
                  <span>
                    Computed scale
                    <strong className={classes.calib_preview_value}>
                      {formatMmPx(computed)} mm/px
                    </strong>
                    <span className={classes.calib_preview_alt}>
                      1 mm ≈ {(1 / computed).toFixed(1)} px
                    </span>
                  </span>
                ) : this.hasInvalidInput() ? (
                  <span>Both values must be numbers greater than zero.</span>
                ) : (
                  <span>
                    {mode === 'known'
                      ? 'Enter both values to compute the scale.'
                      : 'Enter the scale in millimeters per pixel.'}
                  </span>
                )}
              </div>

              <div className={classes.calib_footer}>
                {scaleFactor !== null && (
                  <button
                    type="button"
                    className={classes.calib_remove}
                    onClick={this.handleRemove}
                  >
                    Remove calibration
                  </button>
                )}
                <span className={classes.calib_footer_spacer} />
                <button
                  type="button"
                  className={classes.calib_cancel}
                  onClick={this.props.onRequestClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={classes.calib_save}
                  disabled={computed === null}
                >
                  Save calibration
                </button>
              </div>
            </form>
          </div>
        </div>
      ),
      document.body,
    );
  }

  /** The mm/px value implied by the current inputs, or null when invalid. */
  private getComputedScale(): number | null {
    if (this.state.mode === 'direct') {
      return parsePositive(this.state.directMmPx);
    }
    const mm = parsePositive(this.state.realMm);
    const px = parsePositive(this.state.imagePx);
    return (mm !== null && px !== null) ? mm / px : null;
  }

  /** True when the user has typed something but it does not parse to > 0. */
  private hasInvalidInput(): boolean {
    const { mode, realMm, imagePx, directMmPx } = this.state;
    const isBad = (raw: string) => raw.trim() !== '' && parsePositive(raw) === null;
    if (mode === 'direct') {
      return isBad(directMmPx);
    }
    return isBad(realMm) || isBad(imagePx);
  }

  private handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const computed = this.getComputedScale();
    if (computed !== null) {
      this.props.onSave(computed);
    }
  };

  private handleRemove = () => {
    this.props.onRemove();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.props.onRequestClose();
    }
  };

  private handleBackdropMouseDown = () => {
    this.props.onRequestClose();
  };

  private stopPropagation = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  private switchToKnown = () => this.setState({ mode: 'known' });
  private switchToDirect = () => this.setState({ mode: 'direct' });

  private handleRealMmChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ realMm: e.currentTarget.value });
  private handleImagePxChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ imagePx: e.currentTarget.value });
  private handleDirectChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ directMmPx: e.currentTarget.value });
}
