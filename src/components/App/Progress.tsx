import * as React from 'react';
import CircularProgress from 'material-ui/CircularProgress';
import { CSSTransitionGroup as ReactCSSTransitionGroup } from 'react-transition-group';

const scaleInAndRotate = require('transitions/scale-in-and-rotate.scss');

const wordmarkStyle: React.CSSProperties = {
  marginTop: 24,
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: '#1F2933',
  textAlign: 'center',
};

const captionStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12.5,
  color: '#7B8794',
  textAlign: 'center',
};

const Progress = () => (
  <div style={{ textAlign: 'center' }}>
    <ReactCSSTransitionGroup
      className={scaleInAndRotate.root}
      transitionAppear
      transitionLeave
      transitionName={scaleInAndRotate}
      transitionAppearTimeout={1000}
      transitionEnterTimeout={1000}
      transitionLeaveTimeout={1000}
    >
      <CircularProgress thickness={2.5} color="#1565C0" size={56} />
    </ReactCSSTransitionGroup>
    <div style={wordmarkStyle}>WebCeph</div>
    <div style={captionStyle}>Loading your workspace…</div>
  </div>
);

export default Progress;
