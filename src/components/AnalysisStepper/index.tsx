import * as React from 'react';
import scrollIntoViewIfNeeded from 'scroll-into-view-if-needed';

import * as cx from 'classnames';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconDone from 'material-ui/svg-icons/action/done';
import IconHourglass from 'material-ui/svg-icons/action/hourglass-empty';
import IconPlayArrow from 'material-ui/svg-icons/av/play-arrow';

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
const ICON_CURRENT = <IconPlayArrow color={PRIMARY} style={stateIconStyle} />;
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

export class AnalysisStepper extends React.PureComponent<Props, { }> {
  private itemToScrollTo: HTMLElement | null = null;
  private lastScrolledSymbol: string | null = null;

  public componentDidMount() {
    this.scrollToActiveStep();
  }

  public componentDidUpdate() {
    this.scrollToActiveStep();
  }

  public render() {
    const {
      className,
      steps,
      analysisName,
      getStepState,
      getStepValue,
      isStepRemovable,
      onRemoveLandmarkClick,
      onStepMouseEnter, onStepMouseLeave,
    } = this.props;
    const firstPendingIndex = findIndex(steps, (step) => getStepState(step) === 'current');
    const lastDoneIndex = findLastIndex(steps, (step) => getStepState(step) === 'done');
    const doneCount = steps.filter((step) => getStepState(step) === 'done').length;
    const total = steps.length;
    const progress = total > 0 ? (doneCount / total) * 100 : 0;
    return (
      <div className={cx(classes.root, className)}>
        <header className={classes.header}>
          <div className={classes.header_text}>
            <span className={classes.header_label}>Analysis</span>
            <span className={classes.header_title}>
              {analysisName || '—'}
            </span>
          </div>
          <span
            className={classes.header_progress}
            title={`${doneCount} of ${total} steps completed`}
          >
            {doneCount}/{total}
          </span>
        </header>
        <div className={classes.progress_track} aria-hidden="true">
          <div
            className={classes.progress_fill}
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className={classes.list}>
        {
          map(steps, (step, i) => {
            const value = getStepValue(step);
            const state = getStepState(step);
            const isDone = state === 'done';
            const command = getCommandForStep(step);
            const description = getDescriptionForLandmark(step);
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
    );
  }

  private scrollTargetSymbol: string | null = null;

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
      this.lastScrolledSymbol = this.scrollTargetSymbol;
    }
  }
};

export default AnalysisStepper;
