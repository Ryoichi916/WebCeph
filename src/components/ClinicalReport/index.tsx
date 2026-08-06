import * as React from 'react';
import * as ReactDOM from 'react-dom';

import * as cx from 'classnames';

import map from 'lodash/map';

import IconPrint from 'material-ui/svg-icons/action/print';
import IconClose from 'material-ui/svg-icons/navigation/close';

import Props from './props';

// The report must match the Summary dialog's conventions exactly (formatting,
// units, severity stars), so it reuses that component's exported helpers.
import {
  ANALYSIS_NAMES,
  formatNumber,
  formatSigned,
  getUnitSuffix,
  getSeverityStars,
  STARS,
} from 'components/AnalysisResultsViewer';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';

import { formatMmPx } from 'components/TracingToolbar/CalibrationDialog';

import { buildProfilogram } from 'analyses/profilogram';
import { renderTracingSnapshot } from 'utils/tracingSnapshot';
import { isGeoPoint } from 'utils/math';

const classes = require('./style.scss');

/**
 * Global (unhashed) body class toggled while the report is open; the print
 * stylesheet keys off it to hide the app and print only the paper.
 */
const BODY_OPEN_CLASS = 'clinical-report-open';

/** Human-readable caption names for the image types the app knows about. */
const IMAGE_TYPE_NAMES: { [type: string]: string | undefined } = {
  ceph_lateral: 'Lateral cephalometric radiograph',
  ceph_frontal: 'Frontal cephalometric radiograph',
  panoramic: 'Panoramic radiograph',
  photo_lateral: 'Lateral photograph',
  photo_frontal: 'Frontal photograph',
};

/** The brand mark, redrawn in report ink (see PatientPicker's BrandMark). */
const ReportMark = () => (
  <svg width="40" height="40" viewBox="0 0 56 56" aria-hidden="true">
    <circle
      cx="28" cy="28" r="26"
      fill="#EBF3FB"
      stroke="#10538F"
      strokeWidth="1.5"
    />
    <path
      d={
        'M24 10.5 C29 10.5 33.5 13 35 17 C36 19.8 35.2 21.6 36.6 23.8 ' +
        'L39.4 27.9 L36.4 28.9 C36.6 30.3 37.2 31.5 36.2 32.5 ' +
        'C35.3 33.4 33.8 32.9 33.4 34.3 C32.9 36.1 33.6 37.7 31 38.9 ' +
        'C28.4 40 24.8 39.5 22 37.9'
      }
      fill="none"
      stroke="#0C3B66"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="21" y1="21.5" x2="35" y2="17.5"
      stroke="#1565C0"
      strokeWidth="1.2"
      opacity=".9"
    />
    <circle cx="21" cy="21.5" r="2.1" fill="#FFC400" stroke="#0C3B66" />
    <circle cx="35" cy="17.5" r="2.1" fill="#FFC400" stroke="#0C3B66" />
    <circle cx="31" cy="38.9" r="2.1" fill="#FFC400" stroke="#0C3B66" />
  </svg>
);

interface State {
  /** Data URL of the composited radiograph + tracing, once rendered. */
  snapshotUrl: string | null;
}

/**
 * Full-screen, print-ready clinical report: an A4-portrait paper card with the
 * clinic header, patient block, traced-radiograph snapshot, analysis results
 * table and clinical interpretation — the document an orthodontist hands to
 * a patient or referring colleague. "Print / Save as PDF" prints only the
 * paper (see the @media print rules in style.scss).
 */
export default class ClinicalReport extends React.PureComponent<Props, State> {
  state: State = { snapshotUrl: null };

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    document.body.classList.add(BODY_OPEN_CLASS);
    this.renderSnapshot();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.body.classList.remove(BODY_OPEN_CLASS);
  }

  render() {
    return ReactDOM.createPortal(this.renderReport(), document.body);
  }

  private renderReport() {
    const {
      patient, results, analysisId, imageType,
      scaleFactor, manualLandmarks, imageSrc,
    } = this.props;
    const { snapshotUrl } = this.state;

    const analysisName = analysisId !== null
      ? (ANALYSIS_NAMES[analysisId] || analysisId)
      : null;
    const date = new Date().toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const imageTypeName =
      (imageType !== null && IMAGE_TYPE_NAMES[imageType]) ||
      'Radiograph';
    const landmarkCount = Object.keys(manualLandmarks)
      .filter((s) => isGeoPoint(manualLandmarks[s]))
      .length;
    const hasResults = results.length > 0;

    return (
      <div
        className={classes.root}
        role="dialog"
        aria-modal="true"
        aria-label="Clinical report"
      >
        <div className={classes.chrome}>
          <span className={classes.chrome_title}>
            Clinical report
            <span className={classes.chrome_hint}>
              Print preview · A4 portrait
            </span>
          </span>
          <div className={classes.chrome_actions}>
            <button
              type="button"
              className={classes.chrome_button}
              onClick={this.props.onRequestClose}
            >
              <IconClose color="currentColor" style={{ width: 18, height: 18 }} />
              Close
            </button>
            <button
              type="button"
              className={cx(classes.chrome_button, classes.chrome_button__primary)}
              autoFocus
              onClick={this.handlePrint}
            >
              <IconPrint color="currentColor" style={{ width: 18, height: 18 }} />
              Print / Save as PDF
            </button>
          </div>
        </div>

        <div className={classes.scroll} onMouseDown={this.handleBackdropMouseDown}>
          <div className={classes.paper}>
            <header className={classes.masthead}>
              <div className={classes.brand}>
                <ReportMark />
                <div className={classes.brand_text}>
                  <span className={classes.brand_word}>WebCeph</span>
                  <span className={classes.brand_sub}>
                    Cephalometric tracing &amp; analysis
                  </span>
                </div>
              </div>
              <div className={classes.masthead_right}>
                <span className={classes.doc_kicker}>Clinical report</span>
                <span className={classes.doc_date}>{date}</span>
              </div>
            </header>

            <h1 className={classes.doc_title}>Cephalometric Analysis Report</h1>

            <div className={classes.patient_block}>
              <div className={classes.patient_cell}>
                <span className={classes.patient_label}>Patient</span>
                <span className={classes.patient_value}>
                  {patient !== null && patient.name ? patient.name : '—'}
                </span>
              </div>
              <div className={classes.patient_cell}>
                <span className={classes.patient_label}>Chart ID</span>
                <span className={classes.patient_value}>
                  {patient !== null && patient.chartId ? patient.chartId : '—'}
                </span>
              </div>
              <div className={classes.patient_cell}>
                <span className={classes.patient_label}>Analysis</span>
                <span className={classes.patient_value}>
                  {analysisName !== null ? analysisName : '—'}
                </span>
              </div>
              <div className={classes.patient_cell}>
                <span className={classes.patient_label}>Report date</span>
                <span className={classes.patient_value}>{date}</span>
              </div>
            </div>

            <div className={classes.section_label}>Traced radiograph</div>
            <figure className={classes.figure}>
              <div className={classes.figure_frame}>
                {(snapshotUrl || imageSrc) ? (
                  <img
                    className={classes.figure_image}
                    src={snapshotUrl || imageSrc || undefined}
                    alt="Traced cephalometric radiograph"
                  />
                ) : (
                  <span className={classes.figure_missing}>
                    No radiograph available
                  </span>
                )}
              </div>
              <figcaption className={classes.figure_caption}>
                {imageTypeName}
                <span className={classes.caption_dot}>·</span>
                {landmarkCount > 0
                  ? `${landmarkCount} landmarks traced`
                  : 'No landmarks traced'}
                <span className={classes.caption_dot}>·</span>
                {scaleFactor !== null
                  ? `Calibrated: 1 px = ${formatMmPx(scaleFactor)} mm`
                  : 'Not calibrated — angular values unaffected'}
              </figcaption>
            </figure>

            <div className={classes.section_label}>
              Analysis results
              {analysisName !== null ? (
                <span className={classes.section_badge}>
                  {analysisName} analysis
                </span>
              ) : null}
            </div>
            {hasResults ? this.renderResultsTable() : (
              <p className={classes.empty_note}>
                No measurements have been calculated yet. Place the required
                landmarks or run Auto-plot, then generate the report again.
              </p>
            )}

            {hasResults ? (
              <div className={classes.interp_section}>
                <div className={classes.section_label}>Clinical interpretation</div>
                {this.renderInterpretation()}
              </div>
            ) : null}

            <footer className={classes.foot}>
              <span className={classes.foot_brand}>
                Generated with WebCeph · {date}
              </span>
              <span className={classes.foot_note}>
                Computed values depend on landmark placement and calibration —
                review before clinical use.
              </span>
              <span className={classes.foot_page}>End of report</span>
            </footer>
          </div>
        </div>
      </div>
    );
  }

  private renderResultsTable() {
    const { results, landmarksBySymbol } = this.props;

    // Same cross-reference logic as the Summary dialog: a measurement shared
    // by several findings is listed in full once and referenced afterwards.
    const firstCategoryOf: { [symbol: string]: Category | undefined } = {};
    results.forEach(({ category, relevantComponents }) => {
      relevantComponents.forEach(({ symbol }) => {
        if (firstCategoryOf[symbol] === undefined) {
          firstCategoryOf[symbol] = category;
        }
      });
    });

    return (
      <div>
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
            const worst = Math.max(0, ...map(
              relevantComponents,
              ({ value, mean, min, max }) => getSeverityStars(value, mean, min, max),
            ));
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
                            <span className={classes.measurement_name}>
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
                          <span className={classes.measurement_name}>
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
                      <td className={cx(classes.cell_numeric, classes.cell_norm)}>
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
        <div className={classes.legend}>
          Deviation from norm:{' '}
          <span className={classes.legend_stars}>*</span> over 1 SD
          <span className={classes.legend_dot}>·</span>
          <span className={classes.legend_stars}>**</span> over 2 SD
          <span className={classes.legend_dot}>·</span>
          <span className={classes.legend_stars}>***</span> over 3 SD
        </div>
      </div>
    );
  }

  private renderInterpretation() {
    const { results } = this.props;
    return (
      <div className={classes.interp_grid}>
        {map(results, ({ category, indication, relevantComponents }) => {
          const worst = Math.max(0, ...map(
            relevantComponents,
            ({ value, mean, min, max }) => getSeverityStars(value, mean, min, max),
          ));
          const isNormalIndication = indication === 'normal' || indication === 'class1';
          const chipClass = cx(classes.chip, classes.chip__interp, {
            [classes.chip__success]: worst === 0 && isNormalIndication,
            [classes.chip__neutral]: worst === 0 && !isNormalIndication,
            [classes.chip__warn]: worst === 1,
            [classes.chip__error]: worst >= 2,
          });
          return (
            <div key={category} className={classes.interp_item}>
              <span className={classes.interp_category}>
                {mapCategoryToString(category) || '—'}
              </span>
              <span className={chipClass}>
                {mapIndicationToString(indication) || '—'}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  private renderSnapshot() {
    const { imageSrc, imageWidth, imageHeight, manualLandmarks } = this.props;
    if (imageSrc === null || !imageWidth || !imageHeight) {
      return;
    }
    // The report always shows the full tracing (profilogram + points),
    // independent of the on-screen profilogram toggle — the tracing is what
    // the report documents.
    renderTracingSnapshot(
      imageSrc, imageWidth, imageHeight,
      manualLandmarks, buildProfilogram(manualLandmarks),
    ).then((url) => {
      if (url !== null) {
        this.setState({ snapshotUrl: url });
      }
    });
  }

  private handlePrint = () => {
    window.print();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      this.props.onRequestClose();
    }
  };

  // Clicking the dark backdrop (not the paper) closes the preview.
  private handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      this.props.onRequestClose();
    }
  };
}
