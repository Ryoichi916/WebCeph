import * as React from 'react';

import { RouteComponentProps } from 'react-router-dom';

/**
 * The address of the records dashboard.
 *
 * The dashboard is a full-page surface reached by an in-app navigation, but it
 * was pure store state: nothing in the address bar changed when it opened, so
 * the browser's Back button — the control every user reaches for to leave a
 * full-page surface — left the application and took the unsaved session with it.
 *
 * This component owns the one thing that fixes that: it keeps the surface's
 * visibility and the router's history in step, in both directions.
 *
 *  - The store opens the dashboard (the patient bar's Records button, the
 *    identity pill, the read-only viewer's link, or landing on a loaded project)
 *    → the surface is given its own history entry, so Back leaves *it*.
 *  - The store closes it (the page bar's exit, Escape, opening a record) → that
 *    entry is replaced rather than popped, so a further Back can never be
 *    answered by re-entering a surface the user just left.
 *  - The address moves on its own (Back, Forward, a typed `#/records`) → the
 *    store follows it, and the dashboard opens or closes to match.
 *
 * `/settings` renders *over* whatever surface is beneath it (see
 * components/App), so entering or leaving it decides nothing here.
 */
export const RECORDS_PATH = '/records';

const isRecordsPath = (pathname: string): boolean =>
  pathname === RECORDS_PATH || pathname === `${RECORDS_PATH}/`;

const isOverlayPath = (pathname: string): boolean =>
  pathname.indexOf('/settings') === 0;

export interface RecordsRouteStateProps {
  /** Whether the records dashboard is the surface on screen. */
  isShown: boolean;
}

export interface RecordsRouteDispatchProps {
  /** Open the dashboard because the address says so. */
  onEnter(): any;
  /** Close the dashboard because the address no longer says so. */
  onExit(): any;
}

export type RecordsRouteProps =
  RecordsRouteStateProps & RecordsRouteDispatchProps;

export type Props = RecordsRouteProps & RouteComponentProps;

/** Renders nothing: it is the surface's router binding, not part of the page. */
export default class RecordsRoute extends React.Component<Props, { }> {
  componentDidMount() {
    const { isShown, location, history } = this.props;
    if (isShown && !isRecordsPath(location.pathname)) {
      history.push(RECORDS_PATH);
    } else if (!isShown && isRecordsPath(location.pathname)) {
      // Reloaded or opened straight on #/records: honour the address.
      this.props.onEnter();
    }
  }

  componentDidUpdate(prev: Props) {
    const { isShown, location, history } = this.props;
    if (isOverlayPath(location.pathname) || isOverlayPath(prev.location.pathname)) {
      return;
    }
    const isRecords = isRecordsPath(location.pathname);
    if (isShown !== prev.isShown) {
      // The store moved first; the address follows it.
      if (isShown && !isRecords) {
        history.push(RECORDS_PATH);
      } else if (!isShown && isRecords) {
        history.replace('/');
      }
      return;
    }
    // The address moved first (Back / Forward); the store follows it.
    if (isRecords !== isRecordsPath(prev.location.pathname)) {
      if (isRecords && !isShown) {
        this.props.onEnter();
      } else if (!isRecords && isShown) {
        this.props.onExit();
      }
    }
  }

  render() {
    return null;
  }
}
