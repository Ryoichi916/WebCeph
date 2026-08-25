import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import { PatientRecord } from 'store/reducers/workspace';

import { formatScale } from 'components/TracingToolbar/CalibrationDialog';

import {
  formatCaptureDate,
  getImageTypeLabel,
  getImpliedFilmSize,
  getTimepointToken,
  FILM_SIZE_BAND,
} from 'utils/records';

const classes = require('./applyscale.scss');

export interface ApplyScaleDialogProps {
  open: boolean;
  /**
   * Which direction this review runs in — writing the source's scale onto the
   * films listed, or taking it back off them.
   *
   * One dialog and not two, because it is one act read both ways: the same source
   * film, the same factor, the same list of films, the same tick-box review, and
   * the same "nothing changes until you press it". A batched write with no batched
   * reversal is a one-way door, and a second dialog restating this one's list in
   * its own words would be a second vocabulary for one record's calibration.
   */
  mode?: 'apply' | 'remove';
  /** The film whose calibration is being carried over. */
  source: PatientRecord | null;
  /**
   * The films it would be written onto — every uncalibrated film of the same type
   * and the same pixel size (see `utils/records#getScalePropagationTargets`) — or,
   * in removal mode, the films that press has already written it onto and which
   * still carry exactly that factor.
   */
  targets: PatientRecord[];
  /**
   * Apply the source's scale to the chosen films. The source film is handed over
   * with it: what is written is a *copy of this film's* calibration, and the record
   * stores that so the card can say so and the reversal can be derived from it.
   */
  onApply(imageIds: string[], scaleFactor: number, sourceImageId: string): any;
  /** Clear it off the chosen films. Required in removal mode. */
  onRemove?(imageIds: string[]): any;
  onCancel(): any;
}

interface State {
  /**
   * Which of the offered films are ticked, by image id. Every film starts ticked
   * — the offer is only ever made about films the scale is a claim about — and
   * each is individually reviewable, because a clinician may know that one of
   * three films came off a different machine at the same export size.
   */
  chosen: { [imageId: string]: boolean };
  /**
   * Whether the clinician has ticked the acknowledgement a *suspect* source
   * requires (see `render`).
   *
   * A dialog that has just said the number in it is "almost certainly wrong" must
   * not offer to spread it behind its most emphatic control: the primary button
   * was pressed, and the record's footer went from "1 scale needs checking" to
   * "3 scales need checking". So on that one path the button is demoted and held
   * until the warning has been read and answered. Reset on every open — an
   * acknowledgement is about one film and one number, never a setting.
   */
  isAcknowledged: boolean;
}

/** How this dialog names one film of the record. */
const filmLabel = (record: PatientRecord): string => {
  const token = getTimepointToken(record.timepoint);
  const date = formatCaptureDate(record.captureDate);
  return [
    token !== null ? token : 'No timepoint',
    getImageTypeLabel(record.type),
    date !== null ? date : 'no capture date',
  ].join(' · ');
};

const allChosen = (targets: PatientRecord[]): State['chosen'] => {
  const chosen: State['chosen'] = {};
  targets.forEach(({ imageId }) => { chosen[imageId] = true; });
  return chosen;
};

/**
 * "Apply this scale to the record's other films" — the explicit, reviewable act
 * that carries one mm/px calibration to the films it is *also* true of.
 *
 * The gap it closes, in the words of the orthodontist who found it: "Calibration
 * is per film with no propagation. All three of my cephs came from the same
 * machine and I calibrated each one separately, then got '3 scales need checking'
 * three times." A scale is a property of the machine and the export, not of the
 * patient — so a record whose films share a type and a pixel size shares one
 * scale, and marking a 10 mm ruler by hand three times is three chances to get it
 * wrong.
 *
 * Three rules make this safe enough to offer at all:
 *
 *  - **Never silent.** It is a control a clinician presses, and it opens this
 *    dialog, which names every film it would change and the exact number it would
 *    write. Nothing is copied on save, on upload or on calibration.
 *  - **Never over an existing calibration.** Only films carrying no scale are
 *    offered (see `getScalePropagationTargets`): an existing factor is a
 *    measurement someone made, and re-calibrating it is its own act on its own
 *    film.
 *  - **Never over a guess.** Same image type, same pixel dimensions, or the film
 *    is not offered — a different type came off a different geometry and a
 *    different pixel size was exported or cropped differently.
 *
 * And it does not launder a bad scale: where the source's own calibration implies
 * a film outside the size a cephalogram measures, this dialog says so before the
 * number is spread, in the same words the card's amber chip uses.
 */
export default class ApplyScaleDialog
  extends React.PureComponent<ApplyScaleDialogProps, State> {
  state: State = { chosen: allChosen(this.props.targets), isAcknowledged: false };

  componentWillReceiveProps(next: ApplyScaleDialogProps) {
    // Re-opening starts from the films actually on offer for *this* film, never
    // from a set ticked for another one.
    if (next.open && !this.props.open) {
      this.setState({
        chosen: allChosen(next.targets), isAcknowledged: false,
      });
    }
  }

  render() {
    const { open, source, targets, onCancel } = this.props;
    const isRemoving = this.props.mode === 'remove';
    if (source === null || source.scaleFactor === null) {
      return null;
    }
    const scale = source.scaleFactor;
    const { chosen, isAcknowledged } = this.state;
    const count = targets.filter(({ imageId }) => chosen[imageId]).length;
    const size = getImpliedFilmSize(source.width, source.height, scale);
    const isSuspect = size !== null && !size.isPlausible;
    // The one path this dialog holds shut behind a tick: spreading a scale it has
    // itself just called almost certainly wrong (see `State#isAcknowledged`). The
    // reversal is never gated — taking a bad number *off* films needs no
    // acknowledgement.
    const needsAck = isSuspect && !isRemoving;
    const isBlocked = needsAck && !isAcknowledged;
    const pixels = source.width !== null && source.height !== null
      ? `${source.width} × ${source.height} px` : null;
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onCancel}
        // Screen-only chrome: printing the records chart with a dialog open put
        // the overlay's grey wash over the whole sheet.
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <h3 id="apply-scale-dialog-title" className={classes.title_heading}>
              {isRemoving
                ? 'Remove this scale from the films it was applied to'
                : 'Apply this scale to other films'}
            </h3>
            <span className={classes.title_caption}>
              From {filmLabel(source)}
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="cancel"
            label="Cancel"
            labelStyle={{ textTransform: 'none' }}
            onClick={onCancel}
          />,
          <RaisedButton
            key="apply"
            // Demoted on the suspect path: a product that has just told a clinician
            // a number is wrong does not put spreading it behind the same
            // full-strength primary it uses for the ordinary case.
            primary={!needsAck}
            // Nothing counts down to zero in the label of a control that cannot
            // be pressed: the greyed button and the sentence under the list
            // already carry that state, and "Apply to 0 films" is a sentence no
            // clinical dialog prints.
            label={count === 0
              ? (isRemoving ? 'Remove' : 'Apply')
              : count === 1
                ? (isRemoving ? 'Remove from 1 film' : 'Apply to 1 film')
                : (isRemoving
                  ? `Remove from ${count} films`
                  : `Apply to ${count} films`)}
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            style={{ marginLeft: 8 }}
            disabled={count === 0 || isBlocked}
            onClick={this.handleApply}
          />,
        ]}
        contentStyle={{ width: '92%', maxWidth: 560 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
        paperProps={{
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'apply-scale-dialog-title',
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        {/* The number itself, and what it says about the film it came from. */}
        <div className={classes.scale}>
          <span className={classes.scale_key}>
            {isRemoving ? 'Scale to remove' : 'Scale to apply'}
          </span>
          <span className={classes.scale_value}>{formatScale(scale)}</span>
          {size !== null ? (
            <span
              className={cx(classes.scale_note, {
                [classes.scale_note__warn]: isSuspect,
              })}
            >
              {pixels !== null ? `${pixels} · ` : ''}film {size.label}
            </span>
          ) : null}
        </div>
        {/* A wrong scale must not be spread quietly: the source's own implausible
            calibration is stated here, before the number leaves its film. */}
        {isSuspect && size !== null && !isRemoving ? (
          <p className={classes.warn}>
            This scale makes the source film {size.label} — outside the{' '}
            {FILM_SIZE_BAND.minMm}–{FILM_SIZE_BAND.maxMm} mm a cephalogram
            measures, so it is almost certainly wrong. Re-calibrate that film
            against a known distance on it before carrying the scale over;
            applied here, every millimetre on every film below is wrong by the
            same factor.
          </p>
        ) : null}
        {/* …and the answer to it. The warning above was already there and the
            primary button beside it was still full strength: pressed, the record's
            footer went from "1 scale needs checking" to "3 scales need checking".
            A clinician may have a reason — a cropped export, a film this app's
            plausible band does not cover — so the act is not forbidden, only held
            until the sentence above has been answered. */}
        {needsAck ? (
          <label className={classes.ack}>
            <input
              type="checkbox"
              className={classes.ack_check}
              checked={isAcknowledged}
              onChange={this.handleAcknowledge}
            />
            <span className={classes.ack_text}>
              I know this scale is outside the plausible band
            </span>
          </label>
        ) : null}
        <p className={classes.why}>
          {isRemoving
            ? `These are the films this scale was applied to from ` +
              `${filmLabel(source)}, and they still carry exactly it. Removing ` +
              'puts each of them back to carrying no scale of its own — the ' +
              'state it was in before. This film keeps its own calibration, and ' +
              'nothing else on the record is touched.'
            : 'These films carry no scale of their own and were exported at the ' +
              'same pixel size, as the same type of image — the same machine and ' +
              'the same export, so the same millimetres per pixel. Nothing else ' +
              'on the record is touched, and a film that is already calibrated ' +
              'is never overwritten.'}
        </p>
        <ul className={classes.list}>
          {targets.map((record) => {
            const isOn = chosen[record.imageId] === true;
            return (
              <li key={record.imageId} className={classes.item}>
                <label className={classes.item_label}>
                  <input
                    type="checkbox"
                    className={classes.item_check}
                    checked={isOn}
                    onChange={this.handleToggle(record.imageId)}
                  />
                  <span className={classes.item_name}>{filmLabel(record)}</span>
                  <span className={classes.item_note}>
                    {record.width} × {record.height} px ·{' '}
                    {isRemoving
                      ? `carrying ${formatScale(scale)}`
                      : 'not calibrated'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {/* What pressing Apply will do, counted off the ticks, in millimetres —
            because that is the change: a linear measurement that was withheld for
            want of a scale starts being reported on these films. */}
        <p className={classes.effect}>
          {count === 0
            ? 'No film is selected, so nothing will change.'
            : isRemoving
              ? `Removing clears ${formatScale(scale)} off ` +
                `${count === 1 ? 'this film' : `these ${count} films`}. ` +
                'Their millimetre measurements are withheld again until each is ' +
                'calibrated; angles and ratios are unaffected. A film left ' +
                'unticked keeps the scale.'
              : `Applying writes ${formatScale(scale)} onto ` +
                `${count === 1 ? 'this film' : `these ${count} films`}. ` +
                'Their linear measurements start reporting in millimetres; angles ' +
                'and ratios are unaffected. It can be taken back off all of them ' +
                'in one press, from this film’s card on the records dashboard, or ' +
                'off any one of them from its tracing toolbar (Remove ' +
                'calibration).'}
        </p>
      </Dialog>
    );
  }

  private handleToggle = (imageId: string) => () =>
    this.setState(({ chosen }) => ({
      chosen: { ...chosen, [imageId]: chosen[imageId] !== true },
    }));

  private handleApply = () => {
    const { source, targets, onApply, onRemove, mode } = this.props;
    if (source === null || source.scaleFactor === null) {
      return;
    }
    const { chosen } = this.state;
    const ids = targets
      .filter(({ imageId }) => chosen[imageId] === true)
      .map(({ imageId }) => imageId);
    if (ids.length === 0) {
      return;
    }
    // The same gate the button carries, enforced here as well: a keyboard press on
    // a control whose disabled state has just been re-derived must not write a
    // scale the warning above has not been answered for.
    const size = getImpliedFilmSize(source.width, source.height, source.scaleFactor);
    if (
      mode !== 'remove' && size !== null && !size.isPlausible &&
      !this.state.isAcknowledged
    ) {
      return;
    }
    if (mode === 'remove') {
      if (onRemove !== undefined) {
        onRemove(ids);
      }
      return;
    }
    onApply(ids, source.scaleFactor, source.imageId);
  };

  private handleAcknowledge = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ isAcknowledged: e.target.checked });
}
