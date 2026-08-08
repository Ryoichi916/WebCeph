import * as React from 'react';

import * as cx from 'classnames';

const classes = require('./style.scss');

export interface AboutDisclosureProps {
  /**
   * The affordance's label — what the reader gets by opening it ("About this
   * view", "What this does not model"). Never "More info".
   */
  label: string;
  className?: string;
  children?: React.ReactNode;
}

interface State {
  isOpen: boolean;
}

/** Ids for `aria-controls`; unique per mounted disclosure. */
let nextId = 0;

/**
 * An unobtrusive info affordance: one small "i" button that reveals a block of
 * explanatory copy under it.
 *
 * Why this exists. Several of these views owe the reader an honest account of
 * what their geometry does and does not mean — which plane a millimetre was
 * measured on, that a soft-tissue ratio is a population mean, that a profile
 * curve is inferred rather than traced. Printed inline, those accounts became
 * three walls of grey text that dominated the screens they were meant to
 * qualify, and a caveat nobody reads is not a caveat. So each view now states
 * the one sentence a clinician must not miss inline, and keeps the rest here,
 * one click away.
 *
 * **The copy is condensed, never dropped, and on paper it is not hidden at
 * all**: the print stylesheet below expands every disclosure and drops the
 * button, so a sheet handed to a colleague or filed in a chart carries the full
 * text whatever the reader happened to have open on screen. This is the only
 * reason the body is rendered-but-hidden rather than mounted on demand.
 *
 * Colour-neutral on purpose (`currentColor`, `opacity`): it sits on the light
 * Plan panel and on the dark superimposition legend without a variant.
 */
export default class AboutDisclosure extends React.PureComponent<AboutDisclosureProps, State> {
  state: State = { isOpen: false };

  private bodyId = `about-disclosure-${nextId++}`;

  render() {
    const { label, className, children } = this.props;
    const { isOpen } = this.state;
    return (
      <div className={cx(classes.about, className)}>
        <button
          type="button"
          className={cx(classes.toggle, { [classes.toggle__on]: isOpen })}
          aria-expanded={isOpen}
          aria-controls={this.bodyId}
          onClick={this.toggle}
        >
          <span className={classes.glyph} aria-hidden="true">i</span>
          <span className={classes.label}>{label}</span>
        </button>
        <div
          id={this.bodyId}
          className={cx(classes.body, { [classes.body__closed]: !isOpen })}
        >
          {children}
        </div>
      </div>
    );
  }

  private toggle = () => {
    this.setState((s) => ({ isOpen: !s.isOpen }));
  };
}
