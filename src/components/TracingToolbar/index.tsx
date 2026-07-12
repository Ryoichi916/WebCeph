import * as React from 'react';
import Props from './props';

import { CommandBar, ICommandBarProps } from 'office-ui-fabric-react/lib/CommandBar';


export default class TracingToolbar extends React.PureComponent<Props, { }> {
  render() {
    const { imageId, className, canAutoPlot, isAutoPlotting, onAutoPlotClick } = this.props;
    const items: ICommandBarProps['items'] = [
      {
        iconProps: { iconName: 'Add' },
        key: 'newItem',
        name: 'Add',
        disabled: imageId === null,
      },
      {
        iconProps: { iconName: 'LightningBolt' },
        key: 'autoPlot',
        name: isAutoPlotting ? 'Auto-plotting…' : 'Auto-plot',
        disabled: !canAutoPlot || isAutoPlotting,
        onClick: onAutoPlotClick,
      },
    ];
    return (
      <CommandBar
        className={className}
        items={items}
      />
    );
  }
}
