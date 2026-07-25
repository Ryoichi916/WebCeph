import * as React from 'react';
import Props from './props';

import { CommandBar, ICommandBarProps } from 'office-ui-fabric-react/lib/CommandBar';


export default class TracingToolbar extends React.PureComponent<Props, { }> {
  render() {
    const {
      imageId, className,
      canAutoPlot, isAutoPlotting, onAutoPlotClick,
      canPlotFromReferences, onPlotFromReferencesClick,
      isProfilogramShown, onToggleProfilogramClick,
    } = this.props;
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
      {
        iconProps: { iconName: 'DoubleColumn' },
        key: 'plotFromReferences',
        name: 'Plot from S & N',
        title: 'Place the remaining landmarks at standard positions from Sella and Nasion',
        disabled: !canPlotFromReferences,
        onClick: onPlotFromReferencesClick,
      },
      {
        iconProps: { iconName: 'ClusterView' },
        key: 'profilogram',
        name: 'Profilogram',
        title: 'Toggle the profilogram (profile lines through the placed landmarks)',
        checked: isProfilogramShown,
        disabled: imageId === null,
        onClick: onToggleProfilogramClick,
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
