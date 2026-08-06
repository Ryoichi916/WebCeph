import * as React from 'react';
import Props from './props';

import * as cx from 'classnames';

import CalibrationDialog, { formatMmPx } from './CalibrationDialog';

import ClinicalReport from 'components/ClinicalReport/connected';

import Popover from 'material-ui/Popover';
import Menu from 'material-ui/Menu';
import MenuItem from 'material-ui/MenuItem';
import CircularProgress from 'material-ui/CircularProgress';

import IconAnalysis from 'material-ui/svg-icons/action/assessment';
import IconAutoPlot from 'material-ui/svg-icons/image/flash-auto';
import IconPlotFromRefs from 'material-ui/svg-icons/action/timeline';
import IconProfilogram from 'material-ui/svg-icons/image/blur-on';
import IconSummary from 'material-ui/svg-icons/action/list';
import IconReport from 'material-ui/svg-icons/action/description';
import IconExport from 'material-ui/svg-icons/file/file-download';
import IconArrowUp from 'material-ui/svg-icons/navigation/arrow-drop-up';
import IconZoomIn from 'material-ui/svg-icons/action/zoom-in';
import IconZoomOut from 'material-ui/svg-icons/action/zoom-out';
import IconZoomFit from 'material-ui/svg-icons/maps/zoom-out-map';
import IconRuler from 'material-ui/svg-icons/image/straighten';
import IconUndo from 'material-ui/svg-icons/content/undo';
import IconRedo from 'material-ui/svg-icons/content/redo';

const classes = require('./style.scss');

// Lateral-cephalometric analyses the user can switch between. The id is the
// analysis module name (see src/analyses/<id>.ts); `focus` is the one-line
// clinical scope shown as the menu item's secondary text.
const ANALYSES: Array<{ id: string; name: string; focus: string }> = [
  { id: 'downs', name: 'Downs', focus: 'Facial pattern & skeletal profile' },
  { id: 'steiner', name: 'Steiner', focus: 'SNA · SNB · ANB skeletal relations' },
  { id: 'tweed', name: 'Tweed', focus: 'FMA · FMIA · IMPA diagnostic triangle' },
  { id: 'ricketts', name: 'Ricketts', focus: 'Comprehensive skeletal & dental' },
  { id: 'bjork', name: 'Björk', focus: 'Growth direction & jaw rotation' },
  { id: 'jarabak', name: 'Jarabak', focus: 'Posterior angles & growth ratio' },
  { id: 'dental', name: 'Dental', focus: 'U1 · IMPA · interincisal relations' },
  { id: 'softTissues', name: 'Soft Tissue', focus: 'E-line lips & facial esthetics' },
  { id: 'wits', name: 'Wits & vertical', focus: 'Wits · facial-height · FMA' },
];

interface State {
  openMenu: 'analysis' | 'export' | null;
  anchorEl: Element | null;
  isCalibrationOpen: boolean;
  isReportOpen: boolean;
}

const ICON_COLOR = 'currentColor';
const iconStyle: React.CSSProperties = { width: 18, height: 18 };
const caretStyle: React.CSSProperties = { width: 18, height: 18, margin: '0 -6px 0 -2px' };

// Analysis menu rows carry a title + clinical-focus line, so the mui
// MenuItem's fixed 48px line-height/font must be reset; the selected row is
// marked with the panel's own language — primary-050 fill + 3px inset rail —
// rather than a lone checkmark.
const analysisItemStyle: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 'normal',
  minHeight: 0,
  whiteSpace: 'normal',
};
const selectedAnalysisItemStyle: React.CSSProperties = {
  ...analysisItemStyle,
  backgroundColor: '#EBF3FB',
  boxShadow: 'inset 3px 0 0 #1565C0',
};
const analysisItemInnerStyle: React.CSSProperties = {
  padding: '8px 16px',
};

// Menus/popovers follow the card spec: 8px radius on all corners (mui's Paper
// defaults to 2px) and the level-2 shadow reserved for overlays.
const popoverStyle: React.CSSProperties = {
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(16, 30, 50, .14)',
};

// Same zoom bounds as the mouse-wheel zoom tool (see editorTools/zoomWithWheel).
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2;
const ZOOM_STEP = 1.25;

export default class TracingToolbar extends React.PureComponent<Props, State> {
  state: State = {
    openMenu: null,
    anchorEl: null,
    isCalibrationOpen: false,
    isReportOpen: false,
  };

  render() {
    const {
      imageId, className,
      canAutoPlot, isAutoPlotting,
      canPlotFromReferences, onPlotFromReferencesClick,
      isProfilogramShown, onToggleProfilogramClick,
      activeAnalysisId,
      canShowSummary, missingLandmarkCount,
      canUndo, onUndoClick,
      canRedo, onRedoClick,
      scaleFactor,
    } = this.props;
    const { openMenu, anchorEl, isCalibrationOpen, isReportOpen } = this.state;
    const isCalibrated = scaleFactor !== null;
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
          onClick={this.handleAutoPlotClick}
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

        <button
          type="button"
          className={cx(classes.calibration_chip, {
            [classes.calibration_chip__calibrated]: isCalibrated,
          })}
          title={
            isCalibrated
              ? `Calibrated: 1 px = ${formatMmPx(scaleFactor!)} mm. ` +
                'Linear (mm) measurements use this scale; ' +
                'angular measurements are scale-independent. Click to adjust.'
              : 'No mm calibration is set for this image. ' +
                'Angular measurements are scale-independent and unaffected; ' +
                'linear (mm) measurements require calibration. Click to calibrate.'
          }
          aria-haspopup="dialog"
          onClick={this.openCalibrationDialog}
        >
          <IconRuler color="currentColor" style={{ width: 14, height: 14 }} />
          {isCalibrated
            ? `Calibrated · ${formatMmPx(scaleFactor!, 3)} mm/px`
            : 'Not calibrated'}
        </button>

        <span className={classes.separator} />

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
          <button
            type="button"
            className={cx(classes.button, classes.zoom_value)}
            title="Reset zoom to 100% (fit)"
            aria-label="Reset zoom to 100%"
            onClick={this.zoomToFit}
          >
            {Math.round(this.props.zoom * 100)}%
          </button>
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
          <span className={classes.zoom_divider} />
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
          title={
            !canShowSummary && missingLandmarkCount > 0
              ? `${missingLandmarkCount} landmark` +
                `${missingLandmarkCount === 1 ? '' : 's'} remaining — ` +
                'run Auto-plot to complete the analysis'
              : 'Show the analysis results summary'
          }
          onClick={this.handleSummaryClick}
        >
          <IconSummary color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>Summary</span>
        </button>

        <button
          type="button"
          className={classes.button}
          disabled={!hasImage}
          title="Open the printable clinical report (print or save as PDF)"
          onClick={this.openReport}
        >
          <IconReport color={ICON_COLOR} style={iconStyle} />
          <span className={classes.button_label}>Report</span>
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
          style={popoverStyle}
          anchorEl={anchorEl as any}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          targetOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          onRequestClose={this.closeMenu}
        >
          <Menu desktop width={264} onEscKeyDown={this.closeMenu}>
            <div className={classes.menu_heading}>Analysis</div>
            {ANALYSES.map((a) => {
              const isSelected = a.id === activeAnalysisId;
              return (
                <MenuItem
                  key={a.id}
                  style={isSelected ? selectedAnalysisItemStyle : analysisItemStyle}
                  innerDivStyle={analysisItemInnerStyle}
                  onClick={this.selectAnalysis.bind(this, a.id)}
                >
                  <span
                    className={cx(classes.menu_item, {
                      [classes.menu_item__selected]: isSelected,
                    })}
                  >
                    <span className={classes.menu_item_title}>{a.name}</span>
                    <span className={classes.menu_item_focus}>{a.focus}</span>
                  </span>
                </MenuItem>
              );
            })}
          </Menu>
        </Popover>

        <Popover
          open={openMenu === 'export'}
          style={popoverStyle}
          anchorEl={anchorEl as any}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          targetOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          onRequestClose={this.closeMenu}
        >
          <Menu desktop width={248} onEscKeyDown={this.closeMenu}>
            <div className={classes.menu_heading}>Export tracing</div>
            <MenuItem
              style={analysisItemStyle}
              innerDivStyle={analysisItemInnerStyle}
              onClick={this.exportAs.bind(this, 'png' as 'png')}
            >
              <span className={classes.menu_item}>
                <span className={classes.menu_item_title}>PNG image</span>
                <span className={classes.menu_item_focus}>Lossless — best for records</span>
              </span>
            </MenuItem>
            <MenuItem
              style={analysisItemStyle}
              innerDivStyle={analysisItemInnerStyle}
              onClick={this.exportAs.bind(this, 'jpeg' as 'jpeg')}
            >
              <span className={classes.menu_item}>
                <span className={classes.menu_item_title}>JPG image</span>
                <span className={classes.menu_item_focus}>Smaller file — best for sharing</span>
              </span>
            </MenuItem>
          </Menu>
        </Popover>

        {isReportOpen && (
          <ClinicalReport
            imageId={imageId}
            onRequestClose={this.closeReport}
          />
        )}

        {isCalibrationOpen && (
          <CalibrationDialog
            scaleFactor={scaleFactor}
            onSave={this.saveCalibration}
            onRemove={this.removeCalibration}
            onRequestClose={this.closeCalibrationDialog}
          />
        )}
      </div>
    );
  }

  // Blur before delegating so the button doesn't keep a focus/pressed pill
  // after the action's dialog closes or the plotting run finishes.
  private handleAutoPlotClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    this.props.onAutoPlotClick();
  };

  private handleSummaryClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    this.props.onShowSummaryClick();
  };

  private openReport = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    this.setState({ isReportOpen: true });
  };

  private closeReport = () => {
    this.setState({ isReportOpen: false });
  };

  private openCalibrationDialog = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    this.setState({ isCalibrationOpen: true });
  };

  private closeCalibrationDialog = () => {
    this.setState({ isCalibrationOpen: false });
  };

  private saveCalibration = (value: number) => {
    this.setState({ isCalibrationOpen: false });
    this.props.onSetScaleFactor(value);
  };

  private removeCalibration = () => {
    this.setState({ isCalibrationOpen: false });
    this.props.onUnsetScaleFactor();
  };

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
