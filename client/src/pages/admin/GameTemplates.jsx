import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, Stack, IconButton, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Switch } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { listGameTemplates, archiveGameTemplate } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';

export default function GameTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [onlyDefault, setOnlyDefault] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState(null);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (!showArchived) params.isActive = true;
      if (onlyDefault) params.isDefault = true;
      const res = await listGameTemplates(params);
      setTemplates((res?.data || res || []));
    } catch (err) {
      // ignore for now
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [onlyDefault, showArchived]);

  const handleCreate = () => navigate('/admin/game-templates/new');
  const handleEdit = (id) => navigate(`/admin/game-templates/edit/${id}`);
  const handleDelete = (id) => {
    setSelectedArchiveId(id);
    setConfirmOpen(true);
  };

  const confirmArchive = async () => {
    try {
      await archiveGameTemplate(selectedArchiveId);
      enqueueSnackbar('Template archived', { variant: 'success' });
      await load();
    } catch (err) {
      enqueueSnackbar('Failed to archive template', { variant: 'error' });
    } finally {
      setConfirmOpen(false);
      setSelectedArchiveId(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Game Templates</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <FormControlLabel control={<Switch size="small" checked={onlyDefault} onChange={(e) => setOnlyDefault(Boolean(e.target.checked))} />} label="Only default" />
            <FormControlLabel control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(Boolean(e.target.checked))} />} label="Show archived" />
          </Stack>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreate}>Create Template</Button>
      </Stack>

      <Paper sx={{ height: 520 }}>
        <DataGrid
          rows={templates}
          loading={loading}
          getRowId={(r) => r.id}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => setPageSize(newSize)}
          rowsPerPageOptions={[5, 10, 25]}
          pagination
          disableSelectionOnClick
          columns={[
            { field: 'templateCode', headerName: 'Code', flex: 0.8 },
            { field: 'title', headerName: 'Title', flex: 1.8 },
            { field: 'totalCards', headerName: 'Cards', flex: 0.6 },
            { field: 'isDefault', headerName: 'Default', flex: 0.6, valueGetter: (params) => (Number(params.row.isDefault) === 1 ? 'Yes' : '') },
            {
              field: 'actions', headerName: 'Actions', flex: 0.8, sortable: false, filterable: false, align: 'right', renderCell: (params) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <IconButton size="small" onClick={() => handleEdit(params.row.id)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(params.row.id)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              ),
            },
          ]}
        />
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Archive Template</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to archive this template? This action can be reverted from the server if needed.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="error" onClick={confirmArchive}>Archive</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
