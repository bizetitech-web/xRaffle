import React from 'react';

const containerStyle = {
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  border: '1px solid #fecdd3',
  fontWeight: 600,
};

const ErrorAlert = ({ message = 'Something went wrong.' }) => (
  <div role="alert" style={containerStyle}>
    {message}
  </div>
);

export default ErrorAlert;
