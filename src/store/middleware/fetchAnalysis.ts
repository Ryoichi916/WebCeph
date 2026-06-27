import { isActionOfType } from 'utils/store';
import { fetchAnalysisSucceeded, fetchAnalysisFailed } from 'actions/workspace';
import { Store, Middleware } from 'redux';

const middleware = (_: Store<StoreState>) => (next: GenericDispatch) =>
  async (action: GenericAction) => {
    if (!isActionOfType(action, 'SET_ANALYSIS_REQUESTED')) {
      return next(action);
    } else {
      const { imageType, analysisId } = action.payload;
      try {
        // Webpack 5 code-splitting: lazily load the analysis module on demand.
        await import(
          /* webpackChunkName: "analysis" */
          /* webpackExclude: /\.test\.tsx?$/ */
          `analyses/${analysisId}`
        );
        next(fetchAnalysisSucceeded({ imageType, analysisId}));
      } catch (e) {
        next(fetchAnalysisFailed({
          error: { message: e.message },
          analysisId,
          imageType,
        }));
      }
    }
  };

export default middleware as Middleware;
