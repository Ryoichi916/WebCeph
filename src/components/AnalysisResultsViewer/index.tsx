import React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import IconClose from 'material-ui/svg-icons/navigation/close';

import { pure } from 'recompose';

import map from 'lodash/map';

import Props from './props';

import {
  mapCategoryToString,
  mapIndicationToString,
} from './strings';

const classes = require('./style.scss');

// One decimal everywhere (design brief); avoid the "-0.0" artifact.
const formatValue = (n: number): string => {
  const s = n.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
};

const dialogContentStyle: React.CSSProperties = {
  maxWidth: 760,
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

export const AnalysisResultsViewer = pure(({ open, onRequestClose, results }: Props) => (
  <Dialog
    open={open}
    onRequestClose={onRequestClose}
    title={
      <div className={classes.title}>
        <div className={classes.title_text}>
          <h3 className={classes.title_heading}>Analysis summary</h3>
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
      <FlatButton
        key="close"
        primary
        label="Close"
        labelStyle={closeLabelStyle}
        onClick={onRequestClose}
      />,
    ]}
    contentStyle={dialogContentStyle}
    bodyStyle={dialogBodyStyle}
    actionsContainerStyle={dialogActionsStyle}
    autoScrollBodyContent
  >
    <div className={classes.table_wrap}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th>Result</th>
            <th>Interpretation</th>
            <th className={classes.col_numeric}>Calculated</th>
            <th className={classes.col_numeric}>Norm</th>
          </tr>
        </thead>
        <tbody>
          {map(results, ({ category, indication, relevantComponents }) => (
            <tr key={category}>
              <td className={classes.cell_category}>
                {mapCategoryToString(category) || '-'}
              </td>
              <td className={classes.cell_indication}>
                {mapIndicationToString(indication) || '-'}
              </td>
              <td className={classes.cell_numeric}>
                {map(relevantComponents, ({ symbol, value }) => (
                  <div key={symbol} className={classes.component_line}>
                    <span className={classes.component_symbol}>{symbol} = </span>
                    <span className={classes.component_value}>
                      {formatValue(value)}
                    </span>
                  </div>
                ))}
              </td>
              <td className={classes.cell_numeric}>
                {map(relevantComponents, ({ symbol, mean, max, min }) => (
                  <div key={symbol} className={classes.component_line}>
                    <span className={classes.norm_mean}>{formatValue(mean)}</span>
                    <span className={classes.norm_range}>
                      {formatValue(min)}–{formatValue(max)}
                    </span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Dialog>
));

export default AnalysisResultsViewer;
