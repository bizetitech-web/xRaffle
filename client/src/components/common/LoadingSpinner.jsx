import React from 'react';

const spinnerStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: '#38bdf8',
  fontWeight: 600,
};

const dotStyle = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: '#38bdf8',
  animation: 'pulse 1.2s ease-in-out infinite',
};

const LoadingSpinner = ({ label = 'Loading' }) => (
  <div style={spinnerStyle}>
    <span style={{ ...dotStyle, animationDelay: '0s' }} />
    <span style={{ ...dotStyle, animationDelay: '0.2s' }} />
    <span style={{ ...dotStyle, animationDelay: '0.4s' }} />
    <span>{label}</span>
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 0.2; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.05); }
      }
    `}</style>
  </div>
);

export default LoadingSpinner;
