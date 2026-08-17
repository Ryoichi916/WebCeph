export interface OwnProps {
  className?: string;
}

export type StateProps = {
  shouldCheckCompatibility: boolean;
  shouldShowWorkspaceSwitcher: boolean;
  hasActivePatient: boolean;
  /** Whether the patient's records dashboard replaces the editor. */
  isRecordsDashboardShown: boolean;
  isReady: boolean;
  activeWorkspaceId: string;
  locale: string;
  messages: Locale | undefined;
  title: string | null;
  userAgent: string;
};

export interface DispatchProps {
  dispatch: GenericDispatch;
  handlers: KeyboardHandlers;
  keyMap: KeyboardMap;
}

export interface MergeProps {
  onComponentMount: () => any;
  onComponentUpdate: () => any;
}

export type ConnectableProps = StateProps & DispatchProps & MergeProps;

export type Props = OwnProps & StateProps & DispatchProps & MergeProps;

export default Props;
