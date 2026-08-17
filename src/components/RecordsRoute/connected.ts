import { connect } from 'react-redux';

import { withRouter, RouteComponentProps } from 'react-router-dom';

import RecordsRoute, {
  RecordsRouteStateProps,
  RecordsRouteDispatchProps,
} from './index';

import { isRecordsDashboardShown } from 'store/reducers/workspace/records';

import { setRecordsDashboardShown } from 'actions/workspace';

const mapStateToProps = (state: StoreState): RecordsRouteStateProps => ({
  isShown: isRecordsDashboardShown(state),
});

// The same action every other entrance and exit of the surface dispatches, so
// the address and the surface can never disagree about how it was opened.
const mapDispatchToProps = (
  dispatch: GenericDispatch,
): RecordsRouteDispatchProps => ({
  onEnter: () => dispatch(setRecordsDashboardShown({ isShown: true })),
  onExit: () => dispatch(setRecordsDashboardShown({ isShown: false })),
});

/**
 * `withRouter` sits *outside* `connect`, and that order is the whole point: a
 * connected component is pure, so with the router binding underneath it a hash
 * change never reached this component at all — the surface pushed `#/records`
 * on opening but ignored the Back button that followed. Outside, the fresh
 * location arrives as an ordinary prop and the update runs.
 */
export default withRouter<{ }>(
  connect<
    RecordsRouteStateProps, RecordsRouteDispatchProps, RouteComponentProps
  >(
    mapStateToProps, mapDispatchToProps,
  )(RecordsRoute),
);
