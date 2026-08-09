/**
 * `/settings` is a `Route`, so react-router hands this component the history it
 * needs to leave the address again. Optional, because the props are the router's
 * and not the store's — a Settings rendered outside a Route simply has no way
 * back, and says so by doing nothing.
 */
export interface OwnProps extends Partial<RouteComponentProps> {
  className?: string;
}

import { RouteComponentProps } from 'react-router-dom';

export interface StateProps {
  currentUserPreferredLocale: string | null;
}


export interface DispatchProps {
  onLocaleChange(newLocale: string): any;
  onLocaleUnset(): any;
}

export interface MergeProps {
}

export type ConnectableProps = StateProps & DispatchProps & MergeProps;

export type Props = OwnProps & StateProps & DispatchProps & MergeProps;

export default Props;
