import React from 'react';
import { DataGrid } from '@mui/x-data-grid';

const DataTable = ({ rows = [], columns = [], pageSize = 10, onRowClick }) => (
  <div style={{ width: '100%' }}>
    <DataGrid
      rows={rows}
      columns={columns}
      pageSize={pageSize}
      rowsPerPageOptions={[pageSize]}
      autoHeight
      disableSelectionOnClick
      onRowClick={onRowClick}
    />
  </div>
);

export default DataTable;
