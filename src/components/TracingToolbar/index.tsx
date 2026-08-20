import * as React from 'react';
import Props from './props';

import * as cx from 'classnames';

import CalibrationDialog, { formatScale } from './CalibrationDialog';

import ClinicalReport from 'components/ClinicalReport/connected';
import Superimposition from 'components/Superimposition/connected';
import TreatmentSimulation from 'components/TreatmentSimulation/connected';

import { LATERAL_ANALYSES } from 'analyses/lateral';

import { PatientRecord } from 'store/reducers/workspace';

import EditRecordDialog from 'components/RecordMetaFields/EditRecordDialog';
// The whole case as one file — what it carries and what it does not, stated
// before it is written. @see components/CaseFile
import CaseFile from 'components/CaseFile/connected';
import { CaseFileMode } from 'components/CaseFile/props';
import RemoveRecordDialog from 'components/RecordMetaFields/RemoveRecordDialog';

import {
  getImageTypeShortLabel,
  getImageTypeLabel,
  getTimepointToken,
  formatCaptureDate,
} from 'utils/records';

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
import IconSuperimpose from 'material-ui/svg-icons/maps/layers';
import IconSimulate from 'material-ui/svg-icons/image/tune';
import IconExport from 'material-ui/svg-icons/file/file-download';
import IconArrowUp from 'material-ui/svg-icons/navigation/arrow-drop-up';
import IconZoomIn from 'material-ui/svg-icons/action/zoom-in';
import IconZoomOut from 'material-ui/svg-icons/action/zoom-out';
import IconZoomFit from 'material-ui/svg-icons/maps/zoom-out-map';
// The two states of the calibration chip, told apart by **shape** and not only by
// tint: a tick for a film that carries a scale, a warning triangle for one that
// does not. @see the chip below.
import IconCalibrated from 'material-ui/svg-icons/action/check-circle';
import IconNotCalibrated from 'material-ui/svg-icons/alert/warning';
import IconFilm from 'material-ui/svg-icons/image/crop-original';
import IconUndo from 'material-ui/svg-icons/content/undo';
import IconRedo from 'material-ui/svg-icons/content/redo';

// The record menu's correction dialog edits the visit label a clinical note is
// filed under, so the toolbar reads the note filed there. @see handleSaveRecordMeta
import { getVisitNoteKey, readVisitNote } from 'utils/visitNotes';

const classes = require('./style.scss');

// Lateral-cephalometric analyses the user can switch between — shared with the
// combined clinical report, which prints one section per entry. The id is the
// analysis module name (see src/analyses/<id>.ts); `focus` is the one-line
// clinical scope shown as the menu item's secondary text.
const ANALYSES = LATERAL_ANALYSES;

interface State {
  openMenu: 'analysis' | 'export' | 'record' | null;
  anchorEl: Element | null;
  isCalibrationOpen: boolean;
  /** Correcting this film's record details from the editor. */
  isEditRecordOpen: boolean;
  /** Removing this film from the patient's record, from the editor. */
  isRemoveRecordOpen: boolean;
  isReportOpen: boolean;
  isSuperimpositionOpen: boolean;
  isSimulationOpen: boolean;
  /**
   * Whether the case file dialog is open, and on which half. The editor's Export
   * menu offers the whole case as a `.wceph` beside the two picture formats —
   * they are not the same act, and the menu says so. @see components/CaseFile
   */
  caseFileMode: CaseFileMode;
}

const ICON_COLOR = 'currentColor';
const iconStyle: React.CSSProperties = { width: 18, height: 18 };
const caretStyle: React.CSSProperties = { width: 18, height: 18, margin: '0 -6px 0 -2px' };
/** The calibration chip's state mark. @see the chip in `render`. */
const CHIP_ICON: React.CSSProperties = { width: 14, height: 14 };

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
// 0.5, not the old 0.2: in this app's fixed-viewport layout, fit-to-screen
// (1) already shows the whole film, so the old floor let the zoom-out button
// shrink it into a small thumbnail lost in dead canvas with no benefit.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 1.25;

export default class TracingToolbar extends React.PureComponent<Props, State> {
  state: State = {
    openMenu: null,
    anchorEl: null,
    isCalibrationOpen: false,
    isEditRecordOpen: false,
    isRemoveRecordOpen: false,
    isReportOpen: false,
    isSuperimpositionOpen: false,
    isSimulationOpen: false,
    caseFileMode: null,
  };

  /**
   * Mirrors mui 0.20 Menu's own internal `focusIndex` for the analysis list, so
   * Enter/Space can select the item the keyboard has landed on (@see
   * `handleAnalysisMenuKeyDown` for why the menu needs this tracked at all).
   * Deliberately an instance field, not state: `Menu`'s `componentWillReceiveProps`
   * recomputes its own focus index from its children's `value`/`selected` props
   * on every re-render of this component (none of the `MenuItem`s here carry
   * either, so it resolves to -1 and resets focus toward the top) — routing
   * this through `setState` was exactly what caused that re-render on every
   * keystroke, silently undoing the ArrowDown that triggered it past the 2nd
   * item. Nothing here is rendered, so a field the key handler reads
   * synchronously is all `handleAnalysisMenuFocusChange` needs.
   */
  private analysisMenuFocusIndex = 0;

  /**
   * The two shortcuts the history buttons name in their own tooltips.
   *
   * They were named and not wired: the app binds exactly one key (`n`, a new
   * workspace — see `components/App/shortcuts`), so `Ctrl+Z` over a mis-dragged
   * landmark did nothing while the button beside it promised that it would.
   *
   * Bound here rather than in the app-level `HotKeys` because this toolbar is
   * mounted only while a tracing is open, and it is the piece that knows whether
   * there is anything to undo: the same `canUndo`/`canRedo` that grey the buttons
   * guard the keys, so a shortcut can never do what the button refuses to.
   *
   * A keypress made inside a text field is left alone — the note editor, the
   * record form and the calibration dialog all sit over this surface, and inside
   * them Ctrl+Z is the browser's own undo of what is being typed.
   */
  componentDidMount() {
    document.addEventListener('keydown', this.handleHistoryKey);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleHistoryKey);
  }

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
      canSuperimpose, superimposeReason,
      canSimulate, simulateReason,
      record, records,
    } = this.props;
    const {
      openMenu, anchorEl, isCalibrationOpen, isReportOpen,
      isSuperimpositionOpen, isSimulationOpen, caseFileMode,
    } = this.state;
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
          className={cx(classes.button, classes.button__elastic, {
            [classes.button__open]: openMenu === 'analysis',
          })}
          disabled={!hasImage}
          title="Switch the active cephalometric analysis"
          // Stated explicitly so the accessible name never depends on whether
          // the strip is wide enough to render the "Analysis: " qualifier.
          aria-label={
            activeAnalysis ? `Analysis: ${activeAnalysis.name}` : 'Analysis'
          }
          aria-haspopup="true"
          onClick={this.openAnalysisMenu}
        >
          <IconAnalysis color={ICON_COLOR} style={iconStyle} />
          {/* The "Analysis: " qualifier is CSS-generated (see
              `.label_analysis`) and is dropped on a narrow strip so the two
              clinical actions at the far end keep their names. The analysis
              name, the icon, the tooltip and the aria-label all stay. */}
          <span
            className={cx(classes.button_label, {
              [classes.label_analysis]: !!activeAnalysis,
            })}
          >
            {activeAnalysis ? activeAnalysis.name : 'Analysis'}
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
          aria-label="Plot from S & N"
          onClick={onPlotFromReferencesClick}
        >
          <IconPlotFromRefs color={ICON_COLOR} style={iconStyle} />
          <span className={cx(classes.button_label, classes.label_refs)}>
            S &amp; N
          </span>
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

        {/* What this film *is*, and the two things a record needs done to it when
            it is wrong. Correction and removal used to live only on the records
            dashboard and on the read-only viewer, so whether a record could be
            fixed where it was being looked at depended on its type: a photograph
            carried both controls, the lateral ceph open in this editor carried
            neither. */}
        {record !== null ? (
          <button
            type="button"
            className={cx(
              classes.button,
              classes.button__elastic,
              classes.button__elastic_spare,
              { [classes.button__open]: openMenu === 'record' },
            )}
            title={`This image: ${describeRecord(record)}. ` +
              'Correct its record details, or remove it from the record.'}
            aria-label={`Record: ${describeRecord(record)}`}
            aria-haspopup="true"
            onClick={this.openRecordMenu}
          >
            <IconFilm color={ICON_COLOR} style={iconStyle} />
            <span className={classes.button_label}>
              {[
                getTimepointToken(record.timepoint),
                getImageTypeShortLabel(record.type),
              ].filter((part) => part !== null).join(' · ')}
            </span>
            <IconArrowUp color={ICON_COLOR} style={caretStyle} />
          </button>
        ) : null}

        <button
          type="button"
          className={cx(classes.calibration_chip, {
            [classes.calibration_chip__calibrated]: isCalibrated,
          })}
          title={
            isCalibrated
              ? `Calibrated · ${formatScale(scaleFactor!)}. ` +
                'Linear (mm) measurements use this scale; ' +
                'angular measurements are scale-independent. Click to adjust.'
              : 'No mm calibration is set for this image. ' +
                'Angular measurements are scale-independent and unaffected; ' +
                'linear (mm) measurements require calibration. Click to calibrate.'
          }
          aria-label={
            isCalibrated
              ? `Calibrated · ${formatScale(scaleFactor!)}`
              : 'Not calibrated'
          }
          aria-haspopup="dialog"
          onClick={this.openCalibrationDialog}
        >
          {/* **The state is a shape, not a hue.**
              Below 1720px the strip drops the word before the figure to make room
              for named clinical actions (see `.chip_value`), and at 1280 — where
              this screen is most crowded — the chip then read "0.104 mm/px" in a
              green pill against "Not calibrated" in an amber one: whether the
              millimetres on this film mean anything rode on the tint alone, on a
              clinic monitor, for a clinician who may not distinguish the two. A
              tick and a warning triangle differ at any colour, at any brightness
              and in greyscale, and they cost the strip nothing.
              The mark replaces the ruler rather than joining it: two 14px glyphs
              in a 24px pill is not a legible chip. */}
          {isCalibrated
            ? <IconCalibrated color="currentColor" style={CHIP_ICON} />
            : <IconNotCalibrated color="currentColor" style={CHIP_ICON} />}
          {/* The number *is* the calibration; the CSS-generated word before it
              (see `.chip_value`) is the first thing to go when the strip has to
              make room for a named clinical action. The chip's mark, tint, tooltip
              and aria-label keep saying the film is calibrated either way. */}
          {isCalibrated ? (
            <span className={classes.chip_value}>
              {formatScale(scaleFactor!)}
            </span>
          ) : 'Not calibrated'}
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

        {/* Superimposition of two timepoints. Gated until the patient has two
            registrable tracings. The tooltip lives on this wrapper, not on
            the button: a `disabled` button never fires a hover event in
            Chromium/WebKit, so a `title` sitting on it is unreachable — the
            reason string would be computed correctly and shown to nobody.
            Gated instead by `aria-disabled` + a no-op click guard. */}
        <span className={classes.button_slot} title={superimposeReason}>
          <button
            type="button"
            className={cx(classes.button, classes.button__superimpose)}
            aria-disabled={!canSuperimpose}
            aria-label="Superimpose two timepoints"
            onClick={this.openSuperimposition}
          >
            <IconSuperimpose color={ICON_COLOR} style={iconStyle} />
            <span className={classes.button_label}>Superimpose</span>
          </button>
        </span>

        {/* Treatment simulation (VTO-lite). Needs enough of a tracing for at
            least one movement to have a meaning. Same wrapper-tooltip /
            aria-disabled idiom as Superimpose above, for the same reason. */}
        <span className={classes.button_slot} title={simulateReason}>
          <button
            type="button"
            className={cx(classes.button, classes.button__simulate)}
            aria-disabled={!canSimulate}
            aria-label="Simulate a treatment plan"
            onClick={this.openSimulation}
          >
            <IconSimulate color={ICON_COLOR} style={iconStyle} />
            <span className={classes.button_label}>Simulate</span>
          </button>
        </span>

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
          <Menu
            desktop
            width={264}
            onEscKeyDown={this.closeMenu}
            onKeyDown={this.handleAnalysisMenuKeyDown}
            onMenuItemFocusChange={this.handleAnalysisMenuFocusChange}
          >
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
            <div className={classes.menu_heading}>Export this tracing</div>
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
            {/* A picture of one tracing and the case itself are two different
                things to hand somebody, and this menu used to offer only the
                first. The heading below says which half of the menu this is. */}
            <div className={classes.menu_heading}>Export the whole case</div>
            <MenuItem
              style={analysisItemStyle}
              innerDivStyle={analysisItemInnerStyle}
              onClick={this.openCaseFile}
            >
              <span className={classes.menu_item}>
                <span className={classes.menu_item_title}>Case file (.wceph)</span>
                <span className={classes.menu_item_focus}>
                  Every film, tracing, scale and clinical entry — reopenable here
                </span>
              </span>
            </MenuItem>
          </Menu>
        </Popover>

        <Popover
          open={openMenu === 'record'}
          style={popoverStyle}
          anchorEl={anchorEl as any}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          targetOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          onRequestClose={this.closeMenu}
        >
          <Menu desktop width={264} onEscKeyDown={this.closeMenu}>
            <div className={classes.menu_heading}>
              {record !== null ? describeRecord(record) : 'Record'}
            </div>
            <MenuItem
              style={analysisItemStyle}
              innerDivStyle={analysisItemInnerStyle}
              onClick={this.openEditRecord}
            >
              <span className={classes.menu_item}>
                <span className={classes.menu_item_title}>Edit details…</span>
                <span className={classes.menu_item_focus}>
                  Image type, timepoint, capture date
                </span>
              </span>
            </MenuItem>
            <MenuItem
              style={analysisItemStyle}
              innerDivStyle={analysisItemInnerStyle}
              onClick={this.openRemoveRecord}
            >
              <span className={classes.menu_item}>
                <span className={cx(classes.menu_item_title, classes.menu_item__danger)}>
                  Remove from record…
                </span>
                <span className={classes.menu_item_focus}>
                  Drops this image and its tracing
                </span>
              </span>
            </MenuItem>
          </Menu>
        </Popover>

        {record !== null ? (
          <EditRecordDialog
            open={this.state.isEditRecordOpen}
            initialValue={{
              type: record.type,
              timepoint: record.timepoint,
              captureDate: record.captureDate,
              // Carried through even here, where the record is a cephalogram and
              // therefore holds none: the dialog re-files a record, and a
              // correction to "Intraoral photograph" made from this toolbar must
              // arrive with the same photographic frame the records dashboard
              // would have given it, not with the field silently blanked.
              photoView: record.photoView,
            }}
            fileName={record.name}
            // What a relabelling does to the visit's clinical note, stated by the
            // same dialog wherever it is opened from.
            // @see EditRecordDialog#renderNoteEffect
            visitNote={readVisitNote(
              this.props.notes[getVisitNoteKey(record.timepoint)],
            )}
            isOnlyImageAtVisit={this.countImagesAtVisit(record.timepoint) === 1}
            hasNoteAt={this.hasNoteAt}
            onSave={this.handleSaveRecordMeta}
            onCancel={this.closeEditRecord}
          />
        ) : null}

        {record !== null ? (
          <RemoveRecordDialog
            open={this.state.isRemoveRecordOpen}
            type={record.type}
            timepoint={record.timepoint}
            captureDate={record.captureDate}
            fileName={record.name}
            thumbnail={record.thumbnail}
            otherRecordCount={Math.max(records.length - 1, 0)}
            landmarksPlaced={record.landmarksPlaced}
            onConfirm={this.handleConfirmRemoveRecord}
            onCancel={this.closeRemoveRecord}
          />
        ) : null}

        {isReportOpen && (
          <ClinicalReport
            imageId={imageId}
            onRequestClose={this.closeReport}
          />
        )}

        {isSuperimpositionOpen && (
          <Superimposition onRequestClose={this.closeSuperimposition} />
        )}

        {isSimulationOpen && (
          <TreatmentSimulation
            imageId={imageId}
            onRequestClose={this.closeSimulation}
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

        {/* The same dialog the records dashboard opens, on the same connected
            component: two entry points, one account of what a case file is. */}
        <CaseFile mode={caseFileMode} onRequestClose={this.closeCaseFile} />
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

  private openSuperimposition = (e: React.MouseEvent<HTMLButtonElement>) => {
    // aria-disabled, not `disabled` — the reason tooltip on `.button_slot`
    // needs an always-hoverable control (see the button's own comment), so
    // the gate is enforced here as a no-op instead of by the browser.
    if (!this.props.canSuperimpose) {
      return;
    }
    e.currentTarget.blur();
    this.setState({ isSuperimpositionOpen: true });
  };

  private closeSuperimposition = () => {
    this.setState({ isSuperimpositionOpen: false });
  };

  private openSimulation = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Same aria-disabled + no-op guard as openSuperimposition above.
    if (!this.props.canSimulate) {
      return;
    }
    e.currentTarget.blur();
    this.setState({ isSimulationOpen: true });
  };

  private closeSimulation = () => {
    this.setState({ isSimulationOpen: false });
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
    // Fresh keyboard-focus tracking for this menu session, not whatever a
    // previous open left behind.
    this.analysisMenuFocusIndex = 0;
    this.setState({ openMenu: 'analysis', anchorEl: e.currentTarget });
  };

  private openExportMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    this.setState({ openMenu: 'export', anchorEl: e.currentTarget });
  };

  private openRecordMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    this.setState({ openMenu: 'record', anchorEl: e.currentTarget });
  };

  private openEditRecord = () => {
    this.closeMenu();
    this.setState({ isEditRecordOpen: true });
  };

  private closeEditRecord = () => this.setState({ isEditRecordOpen: false });

  /** How many images are filed at one visit label, as the record groups them. */
  private countImagesAtVisit = (timepoint: string | null): number => {
    const key = getVisitNoteKey(timepoint);
    return this.props.records
      .filter((r) => getVisitNoteKey(r.timepoint) === key).length;
  };

  /** Whether a visit key already holds a clinical note. */
  private hasNoteAt = (key: string): boolean =>
    readVisitNote(this.props.notes[key]) !== null;

  /**
   * Save the corrected details — and carry the visit's clinical note across when
   * the correction is what moves the visit. The same rule, and the same action, as
   * the records dashboard's own path (@see RecordsDashboard#handleSaveMeta): a note
   * is filed under the visit's label, and relabelling the last image of a visit
   * would otherwise leave a clinician's diagnosis pointing at a label nothing
   * carries.
   */
  private handleSaveRecordMeta = (meta: ImageRecordMeta) => {
    const { record } = this.props;
    this.setState({ isEditRecordOpen: false });
    if (record !== null) {
      const from = getVisitNoteKey(record.timepoint);
      const to = getVisitNoteKey(meta.timepoint);
      if (from !== to && this.hasNoteAt(from) &&
        this.countImagesAtVisit(record.timepoint) === 1) {
        this.props.onRefileVisitNote(from, to);
      }
    }
    this.props.onSaveRecordMeta(meta);
  };

  private openRemoveRecord = () => {
    this.closeMenu();
    this.setState({ isRemoveRecordOpen: true });
  };

  private closeRemoveRecord = () => this.setState({ isRemoveRecordOpen: false });

  private handleConfirmRemoveRecord = () => {
    const { record, records, onRemoveRecord } = this.props;
    this.setState({ isRemoveRecordOpen: false });
    if (record === null) {
      return;
    }
    // Another record's rail tile to land on, if the patient has one — the same
    // rule the dashboard and the record viewer apply.
    const fallback = records
      .filter((r) => r.workspaceId !== record.workspaceId)
      .map((r) => r.workspaceId)[0];
    onRemoveRecord(record, fallback !== undefined ? fallback : null);
  };

  private closeMenu = () => {
    this.setState({ openMenu: null, anchorEl: null });
  };

  private selectAnalysis = (id: string) => {
    this.closeMenu();
    this.props.onSelectAnalysis(id);
  };

  /**
   * mui 0.20's desktop `Menu` moves the focus pill on ArrowUp/ArrowDown (and
   * reports it via `onMenuItemFocusChange`, see below) but never wires Enter
   * or Space to anything — `MenuItem` renders on a plain `<span>`
   * (`ListItem`'s default `containerElement`), not a native `<button>`, so
   * there is no element for the browser to auto-activate on a keypress, and
   * `Menu`'s own `handleKeyDown` has no `case` for either key. A menu a mouse
   * can drive but a keyboard cannot operate is not keyboard-accessible at
   * all — only Escape worked. This picks the currently keyboard-focused
   * analysis directly instead, the same list `ANALYSES.map` below renders in
   * and `analysisMenuFocusIndex` (kept in step via `onMenuItemFocusChange`,
   * see the instance field's own doc comment for why it isn't state) indexes
   * into.
   *
   * `Menu` forwards this same `onKeyDown` prop straight through onto the
   * inner `List` element (see its `other` passthrough) *in addition to*
   * invoking it itself from its own wrapping handler, so one keypress can
   * reach this handler twice; `e.preventDefault()` on the first pass makes
   * the second a no-op via the `defaultPrevented` guard below rather than a
   * second dispatch.
   */
  private handleAnalysisMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) {
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') {
      return;
    }
    const analysis = ANALYSES[this.analysisMenuFocusIndex];
    if (analysis === undefined) {
      return;
    }
    e.preventDefault();
    this.selectAnalysis(analysis.id);
  };

  /** @see handleAnalysisMenuKeyDown */
  private handleAnalysisMenuFocusChange = (
    _e: React.SyntheticEvent<{}> | null,
    newFocusIndex: number,
  ) => {
    this.analysisMenuFocusIndex = newFocusIndex;
  };

  /** @see componentDidMount */
  private handleHistoryKey = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      return;
    }
    if (e.key !== 'z' && e.key !== 'Z') {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target !== null) {
      const tag = (target.tagName || '').toUpperCase();
      if (
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
    }
    const isRedo = e.shiftKey;
    if (isRedo ? !this.props.canRedo : !this.props.canUndo) {
      return;
    }
    e.preventDefault();
    if (isRedo) {
      this.props.onRedoClick();
    } else {
      this.props.onUndoClick();
    }
  };

  private exportAs = (format: 'png' | 'jpeg') => {
    this.closeMenu();
    this.props.onExportImage(format);
  };

  /**
   * The whole case as one file, offered from the same menu the picture exports
   * are — because "Export" is where a clinician looks for it, and because the
   * distinction between a picture of this tracing and the case file that carries
   * every film, tracing, scale and clinical entry is exactly what the menu's two
   * headings and the dialog behind this item are for.
   */
  private openCaseFile = () => {
    this.closeMenu();
    this.setState({ caseFileMode: 'export' });
  };

  private closeCaseFile = () => this.setState({ caseFileMode: null });

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

/**
 * One-line identity of the open film for the record control: `T2 · Panoramic
 * radiograph · 2026-03-19`, with every part omitted rather than guessed. Same
 * shape the records dashboard and the record viewer use in their own tooltips.
 */
const describeRecord = (record: PatientRecord): string =>
  [
    record.timepoint,
    getImageTypeLabel(record.type),
    formatCaptureDate(record.captureDate),
  ].filter((part) => part !== null).join(' · ');
