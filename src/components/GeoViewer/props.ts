import { AngleProps, VectorProps, PointProps } from './index';

export interface StateProps extends React.SVGAttributes<SVGElement> {
  objects: ReadonlyArray<{
    label: string;
    symbol: string;
    value: GeoObject;
  }>;
  top: number;
  left: number;
  width: number;
  height: number;
  getPropsForPoint: (symbol: string) => Partial<PointProps>;
  getPropsForVector: (symbol: string) => Partial<VectorProps>;
  // GeoViewer supplies symbol/vectors/boundingRect itself, so the callback
  // only contributes styling overrides.
  getPropsForAngle: (symbol: string) => Partial<AngleProps>;
}

export interface DispatchProps {
}

export interface OwnProps {

}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
