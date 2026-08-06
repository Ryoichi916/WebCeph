import * as React from 'react';
import scrollIntoViewIfNeeded from 'scroll-into-view-if-needed';

import * as cx from 'classnames';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconDone from 'material-ui/svg-icons/action/done';
import IconHourglass from 'material-ui/svg-icons/action/hourglass-empty';

import findIndex from 'lodash/findIndex';
import findLastIndex from 'lodash/findLastIndex';
import map from 'lodash/map';

import Props from './props';
import { getDescriptionForLandmark, getCommandForStep } from './strings';

const classes = require('./style.scss');

const SUCCESS = '#2E7D32';
const PRIMARY = '#1565C0';

const stateIconStyle: React.CSSProperties = { width: 18, height: 18 };

const ICON_DONE = <IconDone color={SUCCESS} style={stateIconStyle} />;
// Concentric ring + dot ("you are here") — reads clinical, and pairs with the
// hollow pending circle and the green done check better than a media-player
// play arrow would.
const ICON_CURRENT = <span className={classes.icon_current_ring} />;
const ICON_PENDING = <span className={classes.icon_pending_circle} />;
const ICON_EVALUATING = (
  <IconHourglass
    color={PRIMARY}
    style={stateIconStyle}
    className={classes.icon_pending__evaluating}
  />
);

const icons: { [id: string]: JSX.Element } = {
  current: ICON_CURRENT,
  done: ICON_DONE,
  evaluating: ICON_EVALUATING,
  pending: ICON_PENDING,
};

/** Formats a calculated value per the design brief: 1 decimal, tabular, unit-aware. */
const formatStepValue = (step: CephLandmark, value: number): string => {
  const rounded = value.toFixed(1);
  if (step.type === 'angle' || step.unit === 'degree') {
    return `${rounded}°`;
  }
  if (step.unit === 'mm' || step.unit === 'cm' || step.unit === 'in') {
    return `${rounded} ${step.unit}`;
  }
  return rounded;
};

interface State {
  canScrollUp: boolean;
  canScrollDown: boolean;
}

export class AnalysisStepper extends React.PureComponent<Props, State> {
  public state: State = { canScrollUp: false, canScrollDown: false };

  private itemToScrollTo: HTMLElement | null = null;
  private lastScrolledSymbol: string | null = null;

  public componentDidMount() {
    this.scrollToActiveStep();
    this.updateScrollState();
  }

  public componentDidUpdate() {
    this.scrollToActiveStep();
    this.updateScrollState();
  }

  public render() {
    const {
      className,
      steps,
      analysisName,
      getStepState,
      getStepValue,
      isCalibrated,
      isStepRemovable,
      onRemoveLandmarkClick,
      onStepMouseEnter, onStepMouseLeave,
    } = this.props;
    const firstPendingIndex = findIndex(steps, (step) => getStepState(step) === 'current');
    const lastDoneIndex = findLastIndex(steps, (step) => getStepState(step) === 'done');
    const doneCount = steps.filter((step) => getStepState(step) === 'done').length;
    const total = steps.length;
    const progress = total > 0 ? (doneCount / total) * 100 : 0;
    const isComplete = total > 0 && doneCount === total;
    return (
      <div className={cx(classes.root, className)}>
        <header className={classes.header}>
          <div className={classes.header_text}>
            <span
              className={cx(classes.header_label, {
                [classes.header_label__complete]: isComplete,
              })}
            >
              {isComplete ? 'Analysis complete' : 'Analysis'}
            </span>
            <span className={classes.header_title}>
              {analysisName || '—'}
            </span>
          </div>
          <span
            className={cx(classes.header_progress, {
              [classes.header_progress__complete]: isComplete,
            })}
            title={isComplete
              ? `Analysis complete — all ${total} steps done`
              : `${doneCount} of ${total} steps completed`}
          >
            {isComplete
              ? <IconDone color="currentColor" style={{ width: 13, height: 13 }} />
              : null}
            {doneCount}/{total}
          </span>
        </header>
        <div className={classes.progress_track} aria-hidden="true">
          <div
            className={cx(classes.progress_fill, {
              [classes.progress_fill__complete]: isComplete,
            })}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className={cx(classes.list_wrap, {
            [classes.list_wrap__can_scroll_up]: this.state.canScrollUp,
            [classes.list_wrap__can_scroll_down]: this.state.canScrollDown,
          })}
        >
        <ol
          ref={this.setListRef}
          className={classes.list}
          onScroll={this.updateScrollState}
        >
        {
          map(steps, (step, i) => {
            const value = getStepValue(step);
            const state = getStepState(step);
            const isDone = state === 'done';
            const command = getCommandForStep(step);
            const rawDescription = getDescriptionForLandmark(step);
            // A secondary line that merely repeats the command carries no
            // information ("Draw line Frankfort Horizontal Plane" over
            // "Frankfort Horizontal Plane") — suppress it.
            const description =
              rawDescription !== null &&
              command.toLowerCase().indexOf(rawDescription.toLowerCase()) === -1
                ? rawDescription
                : null;
            const shouldScrollTo = (
              i === firstPendingIndex ||
              (firstPendingIndex === -1 && i === lastDoneIndex)
            );
            return (
              <li
                key={step.symbol}
                ref={shouldScrollTo ? this.setScrollTo(step.symbol) : undefined}
                className={cx(classes.step, {
                  [classes.step__current]: state === 'current',
                  [classes.step__done]: isDone,
                })}
                onMouseEnter={isDone ? onStepMouseEnter.bind(null, step) : undefined}
                onMouseLeave={isDone ? onStepMouseLeave.bind(null, step) : undefined}
              >
                <span className={classes.step_icon}>{icons[state]}</span>
                <span className={classes.step_text}>
                  <span className={classes.step_title} title={command}>
                    {command}
                  </span>
                  {description ? (
                    <span className={classes.step_description} title={description}>
                      {description}
                    </span>
                  ) : null}
                </span>
                {typeof value === 'number' ? (
                  <span className={classes.step_value}>
                    {formatStepValue(step, value)}
                  </span>
                ) : step.unit === 'mm' && !isCalibrated ? (
                  // A linear measurement has no honest value until the image
                  // scale is known — say so instead of leaving the row blank.
                  <span
                    className={classes.step_value__pending}
                    title={
                      'Set the image scale (the calibration chip in the ' +
                      'toolbar) to report this measurement in millimeters.'
                    }
                  >
                    needs scale
                  </span>
                ) : null}
                {isDone && isStepRemovable(step) ? (
                  <button
                    type="button"
                    className={classes.step_remove}
                    title="Remove this landmark"
                    aria-label={`Remove ${step.symbol}`}
                    onClick={onRemoveLandmarkClick.bind(null, step)}
                  >
                    <IconDelete color="currentColor" style={{ width: 16, height: 16 }} />
                  </button>
                ) : null}
              </li>
            );
          })
        }
        </ol>
        </div>
      </div>
    );
  }

  /**
   * The fade scrims under the sticky header and above the bottom edge only
   * show when there actually is overflowed content in that direction, so
   * half-clipped rows dissolve instead of being guillotined against the
   * panel chrome.
   */
  private updateScrollState = () => {
    const list = this.listElement;
    if (list === null) {
      return;
    }
    const canScrollUp = list.scrollTop > 1;
    const canScrollDown =
      list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    if (
      canScrollUp !== this.state.canScrollUp ||
      canScrollDown !== this.state.canScrollDown
    ) {
      this.setState({ canScrollUp, canScrollDown });
    }
  };

  private scrollTargetSymbol: string | null = null;
  private listElement: HTMLOListElement | null = null;

  private setListRef = (node: HTMLOListElement | null) => {
    this.listElement = node;
  };

  private setScrollTo = (symbol: string) => (node: HTMLElement | null) => {
    this.itemToScrollTo = node;
    this.scrollTargetSymbol = symbol;
  };

  private scrollToActiveStep() {
    if (
      this.itemToScrollTo !== null &&
      this.scrollTargetSymbol !== this.lastScrolledSymbol
    ) {
      scrollIntoViewIfNeeded(this.itemToScrollTo, false);
      this.snapListToRowBoundary();
      this.lastScrolledSymbol = this.scrollTargetSymbol;
    }
  }

  /**
   * After a programmatic scroll, nudge the list so no row is left half-clipped
   * under the panel header: if a row straddles the top edge of the scrollport,
   * advance scrollTop to that row's bottom edge. When the list is already at
   * (or near) max scroll and cannot advance, retreat to the row's top edge
   * instead — the generous bottom slack padding on the list guarantees the
   * row scrolled into view stays fully visible either way, so no row ever
   * sits half-greyed under the top fade scrim.
   */
  private snapListToRowBoundary() {
    const list = this.listElement;
    if (list === null) {
      return;
    }
    const rows = list.children;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] as HTMLElement;
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      if (rowTop < list.scrollTop && rowBottom > list.scrollTop) {
        const maxScrollTop = list.scrollHeight - list.clientHeight;
        list.scrollTop = rowBottom <= maxScrollTop
          ? rowBottom
          : Math.max(rowTop, 0);
        break;
      }
    }
  }
};

export default AnalysisStepper;
