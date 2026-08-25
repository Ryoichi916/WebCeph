import { Store, Middleware } from 'redux';

import { isActionOfType } from 'utils/store';
import { setActiveAnalysis } from 'actions/workspace';
import { getAllImages, getLastActiveAnalysisId } from 'store/reducers/workspace/image';
import { isTraceableImageType } from 'utils/records';

/**
 * A freshly filed lateral cephalogram defaults to a fixed analysis (Downs —
 * see `defaultImageProps.analysis` in `store/reducers/workspace/image`),
 * which means every new film opens on the same checklist no matter which
 * analysis the clinician actually works from day to day. A practice that has
 * standardised on one analysis (Tweed, for this app's target clinic) re-opens
 * the switcher and re-selects it on every single film — a menu-open-and-select
 * that buys nothing.
 *
 * This applies the clinician's most recently *explicitly chosen* analysis
 * (`getLastActiveAnalysisId`, kept current by its own reducer case on
 * `SET_ACTIVE_ANALYSIS_REQUESTED` — see `store/reducers/workspace/image`) to
 * the next brand-new record, so the second film of a session opens on
 * whatever analysis the first one ended on instead of walking back to Downs.
 *
 * Deliberately narrow, so it can never rewrite a clinician's own choice:
 *  - Only a genuinely *new* image id — nothing filed under it yet — is
 *    touched. Re-loading an existing record (a saved case reopened, a
 *    re-read of the same file onto its own id) must never have its already-
 *    stored analysis silently swapped out from under it.
 *  - Only a traceable type (a lateral cephalogram today) is touched — the
 *    reducer's own `reconcileAnalysisWithType` keeps every other type's
 *    analysis at null, and dispatching over that would fight it.
 *  - Nothing happens until the clinician has explicitly picked an analysis at
 *    least once in this project; before that `getLastActiveAnalysisId` is
 *    null and the reducer's own 'downs' default stands, exactly as it always
 *    has.
 */
const middleware = ({ getState, dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => (action: GenericAction) => {
    if (!isActionOfType(action, 'LOAD_IMAGE_SUCCEEDED')) {
      return next(action);
    }
    const { id: imageId, type } = action.payload;
    // Read before `next`: a record already in the store must keep whatever
    // analysis it already has, so "new" is judged on the state as it stood
    // the instant before this action landed.
    const isNewRecord = getAllImages(getState())[imageId] === undefined;
    const result = next(action);
    if (!isNewRecord || !isTraceableImageType(type)) {
      return result;
    }
    const lastUsed = getLastActiveAnalysisId(getState());
    if (lastUsed !== null) {
      dispatch(setActiveAnalysis({ imageId, analysisId: lastUsed }));
    }
    return result;
  };

export default middleware as Middleware;
