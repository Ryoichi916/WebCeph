import * as React from 'react';
import Props from './props';

import * as cx from 'classnames';

import Popover from 'material-ui/Popover';
import Menu from 'material-ui/Menu';
import MenuItem from 'material-ui/MenuItem';
import CircularProgress from 'material-ui/CircularProgress';

import IconAnalysis from 'material-ui/svg-icons/action/assessment';
import IconAutoPlot from 'material-ui/svg-icons/image/flash-auto';
import IconPlotFromRefs from 'material-ui/svg-icons/action/timeline';
import IconProfilogram from 'material-ui/svg-icons/image/blur-on';
import IconSummary from 'material-ui/svg-icons/action/list';
import IconExport from 'material-ui/svg-icons/file/file-download';
import IconImage from 'material-ui/svg-icons/image/image';
import IconArrowUp from 'material-ui/svg-icons/navigation/arrow-drop-up';
import IconZoomIn from 'material-ui/svg-icons/action/zoom-in';
import IconZoomOut from 'material-ui/svg-icons/action/zoom-out';
import IconZoomFit from 'material-ui/svg-icons/maps/zoom-out-map';
import IconUndo from 'material-ui/svg-icons/content/undo';
import IconRedo from 'material-ui/svg-icons/content/redo';

const classes = require('./style.scss');

// Lateral-cephalometric analyses the user can switch between. The id is the
// analysis module name (see src/analyses/<id>.ts).
const ANALYSES: Array<{ id: string; name: string }> = [
  { id: 'downs', name: 'Downs' },
  { id: 'steiner', name: 'Steiner' },
  { id: 'tweed', name: 'Tweed' },
  { id: 'ricketts', name: 'Ricketts' },
  { id: 'bjork', name: 'Björk' },
];

interface State {
  openMenu: 'analysis' | 'export' | null;
  anchorEl: Element | null;
}

const ICON_COLOR = 'currentColor';
const iconStyle: React.CSSProperties = { width: 18, height: 18 };
const caretStyle: React.CSSProperties = { width: 18, height: 18, margin: '0 -6px 0 -2px' };

// Same zoom bounds as the mouse-wheel zoom tool (see editorTools/zoomWithWheel).
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2;
const ZOOM_STEP = 1.25;

export default class TracingToolbar extends React.PureComponent<Props, State> {
  state: State = { openMenu: null, anchorEl: null };

  render() {
    const {
      imageId, className,
      canAutoPlot, isAutoPlotting, onAutoPlotClick,
      canPlotFromReferences, onPlotFromReferencesClick,
      isProfilogramShown, onToggleProfilogramClick,
      activeAnalysisId,
      canShowSummary, onShowSummaryClick,
      canUndo, onUndoClick,
      canRedo, onRedoClick,
    } = this.props;
    const { openMenu, anchorEl } = this.state;
    const hasImage = imageId !== null;
    // Before an image exists none of these actions apply — hide the strip
    // entirely rather than showing a row of disabled gray labels.
    if (!hasImage) {
      return null;
    }
    const activeAnalysis = ANALYSES.find((a) => a.id === activeAnalysisId);
    return (
      <div className={cx(classes.root, className)} role="toolbar" aria-label="Tracing actions">
        <button
          type="button"
          className={cx(classes.button, {
            [classes.button__open]: openMenu === 'analysis',
          })}
          disabled={!hasImage}
          title="Switch the active cephalometric analysis"
          aria-haspopup="true"
          onClick={this.openAnalysisMenu}
        >
          <IconAnalysis color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>
            {activeAnalysis ? `Analysis: ${activeAnalysis.name}` : 'Analysis'}
          </span>
          <IconArrowUp color={ICON_COLOR} style={caretStyle} />
        </button>

        <span className={classes.separator} />

        <div className={classes.zoom_group} role="group" aria-label="History">
          <button
            type="button"
            className={cx(classes.button, classes.button__icon)}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            onClick={onUndoClick}
          >
            <IconUndo color={ICON_COLOR} style={iconStyle} />
          </button>
          <button
            type="button"
            className={cx(classes.button, classes.button__icon)}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            onClick={onRedoClick}
          >
            <IconRedo color={ICON_COLOR} style={iconStyle} />
          </button>
        </div>

        <span className={classes.separator} />

        <button
          type="button"
          className={classes.button}
          disabled={!canAutoPlot || isAutoPlotting}
          title="Detect and place all landmarks automatically"
          onClick={onAutoPlotClick}
        >
          {isAutoPlotting
            ? <CircularProgress size={16} thickness={2} />
            : <IconAutoPlot color={ICON_COLOR} style={iconStyle} />}
          <span className={classes.button_label}>
            {isAutoPlotting ? 'Auto-plotting…' : 'Auto-plot'}
          </span>
        </button>

        <button
          type="button"
          className={classes.button}
          disabled={!canPlotFromReferences}
          title="Place the remaining landmarks at standard positions from Sella and Nasion"
          onClick={onPlotFromReferencesClick}
        >
          <IconPlotFromRefs color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>Plot from S & N</span>
        </button>

        <button
          type="button"
          className={cx(classes.button, {
            [classes.button__active]: isProfilogramShown,
          })}
          disabled={!hasImage}
          title="Toggle the profilogram (profile lines through the placed landmarks)"
          aria-pressed={isProfilogramShown}
          onClick={onToggleProfilogramClick}
        >
          <IconProfilogram color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>Profilogram</span>
        </button>

        <span className={classes.spacer} />

        <div className={classes.zoom_group} role="group" aria-label="Zoom">
          <button
            type="button"
            className={cx(classes.button, classes.button__icon)}
            disabled={this.props.zoom <= ZOOM_MIN}
            title="Zoom out"
            aria-label="Zoom out"
            onClick={this.zoomOut}
          >
            <IconZoomOut color={ICON_COLOR} style={iconStyle} />
          </button>
          <span className={classes.zoom_value} title="Zoom level (100% = fit)">
            {Math.round(this.props.zoom * 100)}%
          </span>
          <button
            type="button"
            className={cx(classes.button, classes.button__icon)}
            disabled={this.props.zoom >= ZOOM_MAX}
            title="Zoom in"
            aria-label="Zoom in"
            onClick={this.zoomIn}
          >
            <IconZoomIn color={ICON_COLOR} style={iconStyle} />
          </button>
          <button
            type="button"
            className={cx(classes.button, classes.button__icon)}
            disabled={this.props.zoom === 1}
            title="Fit image to screen"
            aria-label="Fit image to screen"
            onClick={this.zoomToFit}
          >
            <IconZoomFit color={ICON_COLOR} style={iconStyle} />
          </button>
        </div>

        <span className={classes.separator} />

        <button
          type="button"
          className={classes.button}
          disabled={!canShowSummary}
          title="Show the analysis results summary"
          onClick={onShowSummaryClick}
        >
          <IconSummary color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>Summary</span>
        </button>

        <button
          type="button"
          className={cx(classes.button, {
            [classes.button__open]: openMenu === 'export',
          })}
          disabled={!hasImage}
          title="Save the tracing as an image"
          aria-haspopup="true"
          onClick={this.openExportMenu}
        >
          <IconExport color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>Export</span>
          <IconArrowUp color={ICON_COLOR} style={caretStyle} />
        </button>

        <Popover
          open={openMenu === 'analysis'}
          anchorEl={anchorEl as any}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          targetOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          onRequestClose={this.closeMenu}
        >
          <Menu desktop onEscKeyDown={this.closeMenu}>
            {ANALYSES.map((a) => (
              <MenuItem
                key={a.id}
                primaryText={a.name}
                checked={a.id === activeAnalysisId}
                insetChildren={a.id !== activeAnalysisId}
                onClick={this.selectAnalysis.bind(this, a.id)}
              />
            ))}
          </Menu>
        </Popover>

        <Popover
          open={openMenu === 'export'}
          anchorEl={anchorEl as any}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          targetOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          onRequestClose={this.closeMenu}
        >
          <Menu desktop onEscKeyDown={this.closeMenu}>
            <MenuItem
              primaryText="PNG image"
              leftIcon={<IconImage />}
              onClick={this.exportAs.bind(this, 'png' as 'png')}
            />
            <MenuItem
              primaryText="JPG image"
              leftIcon={<IconImage />}
              onClick={this.exportAs.bind(this, 'jpeg' as 'jpeg')}
            />
          </Menu>
        </Popover>
      </div>
    );
  }

  private openAnalysisMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    this.setState({ openMenu: 'analysis', anchorEl: e.currentTarget });
  };

  private openExportMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    this.setState({ openMenu: 'export', anchorEl: e.currentTarget });
  };

  private closeMenu = () => {
    this.setState({ openMenu: null, anchorEl: null });
  };

  private selectAnalysis = (id: string) => {
    this.closeMenu();
    this.props.onSelectAnalysis(id);
  };

  private exportAs = (format: 'png' | 'jpeg') => {
    this.closeMenu();
    this.props.onExportImage(format);
  };

  private zoomIn = () => {
    this.props.onZoomChange(Math.min(this.props.zoom * ZOOM_STEP, ZOOM_MAX));
  };

  private zoomOut = () => {
    this.props.onZoomChange(Math.max(this.props.zoom / ZOOM_STEP, ZOOM_MIN));
  };

  private zoomToFit = () => {
    this.props.onZoomChange(1);
  };
}
