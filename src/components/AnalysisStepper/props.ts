export interface OwnProps {
  className?: string;
}

export interface StateProps {
  steps: CephLandmark[];
  highlightedStep: string | null;
  /** Display name of the active analysis, for the panel header. */
  analysisName: string | null;
  getStepState(step: CephLandmark): StepState;
  getStepValue(step: CephLandmark): number | undefined;
  /**
   * Whether the step's value is withheld only because the image has no mm/px
   * scale. Such rows explain that instead of rendering an empty value column.
   */
  isStepValuePendingScale(step: CephLandmark): boolean;
  isStepRemovable(step: CephLandmark): boolean;
  isStepSkippable(step: CephLandmark): boolean;
}

export interface DispatchProps {
  onRemoveLandmarkClick(step: CephLandmark): void;
  onEditLandmarkClick(step: CephLandmark): void;
  onStepMouseEnter(step: CephLandmark): any;
  onStepMouseLeave(step: CephLandmark): any;
}

export interface AdditionalPropsToMerge {

}

export type ConnectableProps = StateProps & DispatchProps & AdditionalPropsToMerge;

export type Props = OwnProps & StateProps & DispatchProps;

export default Props;
