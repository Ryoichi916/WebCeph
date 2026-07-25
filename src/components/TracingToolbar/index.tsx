import * as React from 'react';
import Props from './props';

import { CommandBar, ICommandBarProps } from 'office-ui-fabric-react/lib/CommandBar';

// Lateral-cephalometric analyses the user can switch between. The id is the
// analysis module name (see src/analyses/<id>.ts).
const ANALYSES: Array<{ id: string; name: string }> = [
  { id: 'downs', name: 'Downs' },
  { id: 'steiner', name: 'Steiner' },
  { id: 'tweed', name: 'Tweed' },
  { id: 'ricketts', name: 'Ricketts' },
  { id: 'bjork', name: 'Björk' },
];

export default class TracingToolbar extends React.PureComponent<Props, { }> {
  render() {
    const {
      imageId, className,
      canAutoPlot, isAutoPlotting, onAutoPlotClick,
      canPlotFromReferences, onPlotFromReferencesClick,
      isProfilogramShown, onToggleProfilogramClick,
      activeAnalysisId, onSelectAnalysis,
    } = this.props;
    const activeAnalysis = ANALYSES.find((a) => a.id === activeAnalysisId);
    const items: ICommandBarProps['items'] = [
      {
        iconProps: { iconName: 'Add' },
        key: 'newItem',
        name: 'Add',
        disabled: imageId === null,
      },
      {
        iconProps: { iconName: 'ClipboardList' },
        key: 'analysis',
        name: activeAnalysis ? `Analysis: ${activeAnalysis.name}` : 'Analysis',
        disabled: imageId === null,
        subMenuProps: {
          items: ANALYSES.map((a) => ({
            key: a.id,
            name: a.name,
            canCheck: true,
            checked: a.id === activeAnalysisId,
            onClick: () => onSelectAnalysis(a.id),
          })),
        },
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
