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
import { formatAgeFull, formatSexFull } from 'utils/patient';

import Wigglegram from './Wigglegram';

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

/**
 * localStorage keys for the clinic/clinician identity. This is presentation
 * identity (letterhead), not patient data, so device-local storage is the
 * honest scope: it prints on every report generated from this machine.
 */
const STORAGE_KEY_CLINIC = 'webceph-report-clinic-name';
const STORAGE_KEY_CLINICIAN = 'webceph-report-clinician-name';
const STORAGE_KEY_LICENSE = 'webceph-report-clinician-license';

const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const writeStored = (key: string, value: string) => {
  try {
    if (value === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage unavailable (private mode) — the field still edits on screen.
  }
};

interface StoredEditableProps {
  storageKey: string;
  className?: string;
  /** Screen-only hint shown while the field is empty (never printed). */
  placeholder: string;
  ariaLabel: string;
}

/**
 * A single-line, device-persistent editable field for the report letterhead
 * (clinic name, clinician name, license number). Uncontrolled contentEditable:
 * the initial text is read once from localStorage and every edit is written
 * back, so the identity re-appears on the next report without any dialog.
 * Empty fields render nothing in print — just the ruled signature line.
 */
class StoredEditable extends React.PureComponent<StoredEditableProps> {
  /** Read once; the DOM owns the text afterwards (uncontrolled). */
  private initialText = readStored(this.props.storageKey);

  render() {
    const { className, placeholder, ariaLabel } = this.props;
    return (
      <span
        className={cx(classes.editable, className)}
        contentEditable={true}
        suppressContentEditableWarning={true}
        spellCheck={false}
        role="textbox"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={this.handleInput}
        onBlur={this.handleInput}
        onKeyDown={this.handleKeyDown}
        onPaste={this.handlePaste}
      >
        {this.initialText}
      </span>
    );
  }

  private handleInput = (e: React.FormEvent<HTMLSpanElement>) => {
    const text = (e.currentTarget.textContent || '').trim();
    writeStored(this.props.storageKey, text);
  };

  // Single-line field: Enter confirms (blurs) instead of inserting <div>s.
  private handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  // Paste as plain text so pasted rich content cannot break the letterhead.
  private handlePaste = (e: React.ClipboardEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, text);
  };
}

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
      scaleFactor, manualLandmarks, imageSrc, landmarksBySymbol,
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

    // Demographics: DOB printed as recorded (ISO, unambiguous), age computed
    // at the report date since it changes with every visit.
    const dateOfBirth =
      patient !== null && patient.dateOfBirth !== undefined &&
      patient.dateOfBirth !== ''
        ? patient.dateOfBirth
        : null;
    const age = patient !== null ? formatAgeFull(patient.dateOfBirth) : null;
    const sex = patient !== null ? formatSexFull(patient.sex) : null;

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
                {/* Device-persistent clinic identity; empty → screen-only
                    placeholder, nothing in print. */}
                <StoredEditable
                  storageKey={STORAGE_KEY_CLINIC}
                  className={classes.masthead_clinic}
                  placeholder="+ Clinic name"
                  ariaLabel="Clinic name (click to edit)"
                />
              </div>
            </header>

            <h1 className={classes.doc_title}>Cephalometric Analysis Report</h1>

            {/* Identity row + demographics row; three aligned columns each.
                Absent optional fields print an em-dash — a clinical report
                states "not recorded" rather than hiding the field. The report
                date lives in the masthead, not here. */}
            <div className={classes.patient_block}>
              <div className={classes.patient_row}>
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
              </div>
              <div className={classes.patient_row}>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Date of birth</span>
                  <span className={classes.patient_value}>
                    {dateOfBirth !== null ? dateOfBirth : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Age at report</span>
                  <span className={classes.patient_value}>
                    {age !== null ? age : '—'}
                  </span>
                </div>
                <div className={classes.patient_cell}>
                  <span className={classes.patient_label}>Sex</span>
                  <span className={classes.patient_value}>
                    {sex !== null ? sex : '—'}
                  </span>
                </div>
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

            {hasResults ? (
              <Wigglegram
                results={results}
                landmarksBySymbol={landmarksBySymbol}
              />
            ) : null}

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

            {/* Clinician certification: ruled signature lines, as on any
                clinical letterhead. Name and license persist per device;
                the signature and date rules are signed by hand. */}
            <div className={classes.sig_section}>
              <div className={classes.section_label}>Certification</div>
              <div className={classes.sig_row}>
                <div className={cx(classes.sig_field, classes.sig_field__wide)}>
                  <div className={classes.sig_line}>
                    <StoredEditable
                      storageKey={STORAGE_KEY_CLINICIAN}
                      placeholder="Clinician name"
                      ariaLabel="Clinician name (click to edit)"
                    />
                  </div>
                  <span className={classes.sig_caption}>
                    Examined by — name &amp; signature
                  </span>
                </div>
                <div className={classes.sig_field}>
                  <div className={classes.sig_line}>
                    <StoredEditable
                      storageKey={STORAGE_KEY_LICENSE}
                      placeholder="License no."
                      ariaLabel="License number (click to edit)"
                    />
                  </div>
                  <span className={classes.sig_caption}>License no.</span>
                </div>
                <div className={classes.sig_field}>
                  <div className={classes.sig_line} />
                  <span className={classes.sig_caption}>Date</span>
                </div>
              </div>
            </div>

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
      // While a letterhead field is being edited, Escape leaves the field
      // rather than closing the whole report.
      const target = e.target as HTMLElement | null;
      if (target !== null && target.isContentEditable) {
        target.blur();
        return;
      }
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
