// Minimal ambient types for react-transition-group@1.x (CSSTransitionGroup),
// which ships no declarations. Mirrors the legacy ReactCSSTransitionGroup API.
declare module 'react-transition-group' {
  import * as React from 'react';

  interface CSSTransitionGroupProps {
    transitionName?: string | {
      enter?: string;
      enterActive?: string;
      leave?: string;
      leaveActive?: string;
      appear?: string;
      appearActive?: string;
    };
    transitionAppear?: boolean;
    transitionEnter?: boolean;
    transitionLeave?: boolean;
    transitionAppearTimeout?: number;
    transitionEnterTimeout?: number;
    transitionLeaveTimeout?: number;
    component?: React.ReactType;
    className?: string;
    children?: React.ReactNode;
  }

  export const CSSTransitionGroup: React.ComponentClass<CSSTransitionGroupProps>;
  export const TransitionGroup: React.ComponentClass<{ component?: React.ReactType }>;
}
