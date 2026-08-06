import React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import IconClose from 'material-ui/svg-icons/navigation/close';
import IconCopy from 'material-ui/svg-icons/content/content-copy';
import IconCheck from 'material-ui/svg-icons/navigation/check';
import IconDownload from 'material-ui/svg-icons/file/file-download';

import { saveAs } from 'file-saver';

import * as cx from 'classnames';

import map from 'lodash/map';

import Props from './props';

import {
  mapCategoryToString,
  mapIndicationToString,
} from './strings';

const classes = require('./style.scss');

/**
 * Display names for the analysis badge in the dialog header.
 * Exported (with the formatters below) for the printable clinical report,
 * which must match this dialog's conventions exactly.
 */
export const ANALYSIS_NAMES: { [id: string]: string | undefined } = {
  basic: 'Basic',
  bjork: 'Björk',
  common: 'Common',
  dental: 'Dental',
  downs: 'Downs',
  ricketts_lateral: 'Ricketts',
  softTissues: 'Soft tissues',
  soft_tissues_lateral: 'Soft tissues',
  steiner: 'Steiner',
  tweed: 'Tweed',
};

// One decimal everywhere (design brief); avoid the "-0.0" artifact.
export const formatNumber = (n: number): string => {
  const s = n.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
};

// Signed deviation, e.g. "+3.4" / "-29.9"; a rounded zero gets no sign.
export const formatSigned = (n: number): string => {
  const s = formatNumber(Math.abs(n));
  if (s === '0.0') {
    return '0.0';
  }
  return (n < 0 ? '-' : '+') + s;
};

/** Unit suffix for a measurement, e.g. `°` for angles, ` mm` for distances. */
export const getUnitSuffix = (landmark?: CephLandmark): string => {
  if (landmark === undefined) {
    return '';
  }
  if (landmark.type === 'angle' || landmark.type === 'sum' || landmark.unit === 'degree') {
    return '°';
  }
  if (landmark.unit === 'mm' || landmark.unit === 'cm' || landmark.unit === 'in') {
    return ` ${landmark.unit}`;
  }
  return '';
};

/**
 * Number of severity markers for a value, following the clinical convention
 * of the reference software: one star per full standard deviation beyond the
 * first, capped at three. The norm range (min–max) is treated as mean ± 1 SD.
 */
export const getSeverityStars = (
  value: number, mean: number, min: number, max: number,
): 0 | 1 | 2 | 3 => {
  const sd = (max - min) / 2;
  if (sd <= 0) {
    return 0;
  }
  const t = Math.abs(value - mean) / sd;
  if (t >= 3) {
    return 3;
  }
  if (t >= 2) {
    return 2;
  }
  if (t >= 1) {
    return 1;
  }
  return 0;
};

export const STARS: { [n: number]: string } = { 1: '*', 2: '**', 3: '***' };

/**
 * Flattens the categorized results into report rows (header + one row per
 * measurement) for the clipboard/CSV export actions. Values are formatted
 * exactly as displayed so the exported report matches the on-screen table.
 */
const buildReportRows = (
  results: Props['results'],
  landmarksBySymbol: Props['landmarksBySymbol'],
): string[][] => {
  const rows: string[][] = [[
    'Finding', 'Interpretation', 'Measurement', 'Name',
    'Value', 'Norm ± SD', 'Deviation', 'Severity',
  ]];
  results.forEach(({ category, indication, relevantComponents }) => {
    relevantComponents.forEach(({ symbol, value, mean, min, max }) => {
      const landmark = landmarksBySymbol[symbol];
      const unit = getUnitSuffix(landmark);
      const stars = getSeverityStars(value, mean, min, max);
      const name = landmark !== undefined ? landmark.name : undefined;
      rows.push([
        mapCategoryToString(category) || '',
        mapIndicationToString(indication) || '',
        symbol,
        name !== undefined && name !== symbol ? name : '',
        formatNumber(value) + unit,
        `${formatNumber(mean)} ± ${formatNumber((max - min) / 2)}`,
        formatSigned(value - mean) + unit,
        stars > 0 ? STARS[stars] : '',
      ]);
    });
  });
  return rows;
};

const csvEscape = (cell: string): string => (
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
);

/**
 * Copies plain text to the clipboard; async Clipboard API first, hidden
 * textarea + execCommand as the fallback for older engines.
 */
const copyTextToClipboard = async (text: string): Promise<boolean> => {
  const nav = navigator as Navigator & {
    clipboard?: { writeText(data: string): Promise<void> };
  };
  if (nav.clipboard !== undefined) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch (_e) {
      // Fall through to the legacy path (e.g. permission denied).
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (_e) {
    return false;
  }
};

const dialogContentStyle: React.CSSProperties = {
  maxWidth: 780,
  borderRadius: 8,
};

const dialogBodyStyle: React.CSSProperties = {
  padding: '0 24px 8px',
};

const dialogActionsStyle: React.CSSProperties = {
  padding: '8px 16px 16px',
};

const closeLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 600,
};

// Secondary (left-side) actions: sentence case, quieter than "Close".
const secondaryLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 500,
  fontSize: 13.5,
  color: '#52616F',
  paddingLeft: 8,
  paddingRight: 12,
};

const copiedLabelStyle: React.CSSProperties = {
  ...secondaryLabelStyle,
  color: '#2E7D32',
};

const secondaryIconStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  marginLeft: 10,
};

interface ViewerState {
  copied: boolean;
}

export class AnalysisResultsViewer extends React.PureComponent<Props, ViewerState> {
  state: ViewerState = { copied: false };

  private copiedTimer: number | null = null;

  componentDidUpdate(prevProps: Props) {
    // Reset the transient "Copied" confirmation whenever the dialog reopens.
    if (prevProps.open && !this.props.open && this.state.copied) {
      this.setState({ copied: false });
    }
  }

  componentWillUnmount() {
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer);
    }
  }

  render() {
    const { open, onRequestClose, results, analysisId, landmarksBySymbol } = this.props;
    const { copied } = this.state;
    const analysisName = analysisId !== null
      ? (ANALYSIS_NAMES[analysisId] || analysisId)
      : null;
    const hasResults = results.length > 0;

    // A measurement can support more than one clinical finding (e.g. the
    // facial angle backs both "Skeletal profile" and "Chin prominence").
    // The first finding shows the full row; later findings reference it
    // instead of repeating identical numbers.
    const firstCategoryOf: { [symbol: string]: Category | undefined } = {};
    results.forEach(({ category, relevantComponents }) => {
      relevantComponents.forEach(({ symbol }) => {
        if (firstCategoryOf[symbol] === undefined) {
          firstCategoryOf[symbol] = category;
        }
      });
    });

    return (
      <Dialog
        open={open}
        onRequestClose={onRequestClose}
        title={
          <div className={classes.title}>
            <div className={classes.title_text}>
              <div className={classes.title_row}>
                <h3 className={classes.title_heading}>Analysis summary</h3>
                {analysisName !== null ? (
                  <span className={classes.title_badge}>{analysisName}</span>
                ) : null}
              </div>
              <span className={classes.title_caption}>
                Interpretation of the calculated cephalometric values
              </span>
            </div>
            <button
              type="button"
              className={classes.close_button}
              aria-label="Close"
              onClick={onRequestClose}
            >
              {/* mui SvgIcon pins an inline `color` from the theme, so
                  `currentColor` would not track the button — pass the hex. */}
              <IconClose color="#7B8794" style={{ width: 20, height: 20 }} />
            </button>
          </div>
        }
        actions={[
          <div key="actions" className={classes.actions}>
            <div className={classes.actions_left}>
              <span title="Copy the results table to the clipboard — paste into a spreadsheet or chart notes">
                <FlatButton
                  label={copied ? 'Copied' : 'Copy table'}
                  disabled={!hasResults}
                  icon={copied
                    ? <IconCheck color="#2E7D32" style={secondaryIconStyle} />
                    : <IconCopy color="#52616F" style={secondaryIconStyle} />}
                  labelStyle={copied ? copiedLabelStyle : secondaryLabelStyle}
                  onClick={this.handleCopyTable}
                />
              </span>
              <span title="Download the results table as a CSV report">
                <FlatButton
                  label="Export CSV"
                  disabled={!hasResults}
                  icon={<IconDownload color="#52616F" style={secondaryIconStyle} />}
                  labelStyle={secondaryLabelStyle}
                  onClick={this.handleExportCsv}
                />
              </span>
            </div>
            <FlatButton
              primary
              label="Close"
              labelStyle={closeLabelStyle}
              onClick={onRequestClose}
            />
          </div>,
        ]}
        contentStyle={dialogContentStyle}
        bodyStyle={dialogBodyStyle}
        actionsContainerStyle={dialogActionsStyle}
        autoScrollBodyContent
      >
        {hasResults ? (
          <div>
            <div className={classes.table_wrap}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th className={classes.col_finding}>Finding</th>
                    <th>Measurement</th>
                    <th className={classes.col_numeric}>Value</th>
                    <th className={classes.col_numeric}>Norm ± SD</th>
                    <th className={classes.col_numeric}>Deviation</th>
                  </tr>
                </thead>
                {map(results, ({ category, indication, relevantComponents }) => {
                  // The finding's overall tone follows its worst measurement.
                  const worst = Math.max(0, ...map(
                    relevantComponents,
                    ({ value, mean, min, max }) => getSeverityStars(value, mean, min, max),
                  ));
                  // Green is reserved for genuinely normal findings; an atypical
                  // indication whose values sit within norm (e.g. a "tendency")
                  // gets a neutral chip instead.
                  const isNormalIndication = indication === 'normal' || indication === 'class1';
                  const chipClass = cx(classes.chip, {
                    [classes.chip__success]: worst === 0 && isNormalIndication,
                    [classes.chip__neutral]: worst === 0 && !isNormalIndication,
                    [classes.chip__warn]: worst === 1,
                    [classes.chip__error]: worst >= 2,
                  });
                  return (
                    <tbody key={category} className={classes.group}>
                      {map(relevantComponents, (component, i) => {
                        const { symbol, value, mean, min, max } = component;
                        const landmark = landmarksBySymbol[symbol];
                        const unit = getUnitSuffix(landmark);
                        const stars = getSeverityStars(value, mean, min, max);
                        const sd = (max - min) / 2;
                        const name = landmark !== undefined ? landmark.name : undefined;
                        const findingCell = i === 0 ? (
                          <td
                            rowSpan={relevantComponents.length}
                            className={classes.cell_finding}
                          >
                            <span className={classes.finding_category}>
                              {mapCategoryToString(category) || '—'}
                            </span>
                            <span className={chipClass}>
                              {mapIndicationToString(indication) || '—'}
                            </span>
                          </td>
                        ) : null;
                        const firstCategory = firstCategoryOf[symbol];
                        if (firstCategory !== undefined && firstCategory !== category) {
                          // Shared measurement, already listed in full under an
                          // earlier finding — cross-reference it instead of
                          // repeating the identical row.
                          return (
                            <tr key={symbol}>
                              {findingCell}
                              <td className={classes.cell_measurement}>
                                <span
                                  className={cx(
                                    classes.measurement_symbol,
                                    classes.measurement_symbol__muted,
                                  )}
                                >
                                  {symbol}
                                </span>
                                {name !== undefined && name !== symbol ? (
                                  <span className={classes.measurement_name} title={name}>
                                    {name}
                                  </span>
                                ) : null}
                              </td>
                              <td colSpan={3} className={classes.cell_crossref}>
                                {formatNumber(value)}{unit}
                                {' — see '}
                                “{mapCategoryToString(firstCategory)}”
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={symbol}>
                            {findingCell}
                            <td className={classes.cell_measurement}>
                              <span className={classes.measurement_symbol}>{symbol}</span>
                              {name !== undefined && name !== symbol ? (
                                <span className={classes.measurement_name} title={name}>
                                  {name}
                                </span>
                              ) : null}
                            </td>
                            <td
                              className={cx(classes.cell_numeric, classes.cell_value, {
                                [classes.cell_value__warn]: stars === 1,
                                [classes.cell_value__error]: stars >= 2,
                              })}
                            >
                              {formatNumber(value)}{unit}
                            </td>
                            <td
                              className={cx(classes.cell_numeric, classes.cell_norm)}
                              title={`Normal range: ${formatNumber(min)} to ${formatNumber(max)}${unit}`}
                            >
                              {formatNumber(mean)}
                              <span className={classes.norm_sd}>
                                {' ± '}{formatNumber(sd)}
                              </span>
                            </td>
                            <td
                              className={cx(classes.cell_numeric, classes.cell_deviation, {
                                [classes.cell_deviation__warn]: stars === 1,
                                [classes.cell_deviation__error]: stars >= 2,
                              })}
                            >
                              {formatSigned(value - mean)}{unit}
                              {/* The slot is always rendered so the numbers stay
                                  aligned whether or not a row carries markers. */}
                              <span className={classes.deviation_stars}>
                                {stars > 0 ? STARS[stars] : ''}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
            <div className={classes.legend}>
              Deviation from norm:{' '}
              <span className={classes.legend_stars}>*</span> over 1 SD
              <span className={classes.legend_dot}>·</span>
              <span className={classes.legend_stars}>**</span> over 2 SD
              <span className={classes.legend_dot}>·</span>
              <span className={classes.legend_stars}>***</span> over 3 SD
            </div>
          </div>
        ) : (
          <div className={classes.empty}>
            <span className={classes.empty_headline}>No results to summarize yet</span>
            <span className={classes.empty_hint}>
              Place the required landmarks or run Auto-plot to calculate the analysis.
            </span>
          </div>
        )}
      </Dialog>
    );
  }

  private handleCopyTable = () => {
    const { results, landmarksBySymbol } = this.props;
    const text = buildReportRows(results, landmarksBySymbol)
      .map((cells) => cells.join('\t'))
      .join('\n');
    copyTextToClipboard(text).then((ok) => {
      if (ok) {
        this.setState({ copied: true });
        if (this.copiedTimer !== null) {
          window.clearTimeout(this.copiedTimer);
        }
        this.copiedTimer = window.setTimeout(
          () => this.setState({ copied: false }),
          2500,
        );
      }
    });
  };

  private handleExportCsv = () => {
    const { results, landmarksBySymbol, analysisId } = this.props;
    const rows = buildReportRows(results, landmarksBySymbol);
    // BOM so Excel opens the °/± characters as UTF-8.
    const csv = '\uFEFF' + rows.map(
      (cells) => cells.map(csvEscape).join(','),
    ).join('\r\n');
    const stem = analysisId !== null ? `${analysisId}-analysis` : 'analysis';
    saveAs(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `${stem}-summary.csv`,
    );
  };
}

export default AnalysisResultsViewer;
