import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Phone as PhoneIcon,
  LocationCity as CityIcon,
  Apartment as BranchIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

const defaultFormData = {
  companyId: '',
  name: '',
  branchCode: '',
  city: '',
  address: '',
  phone: '',
  status: 'ACTIVE',
};

const BranchManagement = () => {
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery('(max-width:600px)');
  const { isSuperAdmin, user } = useAuth();

  const [branches, setBranches] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formData, setFormData] = useState(defaultFormData);

  useEffect(() => {
    fetchBranches();
    if (isSuperAdmin()) {
      fetchHotels();
    }
  }, []);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/admin/hotel_branches`);
      setBranches(response.data || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch branches');
    } finally {
      setLoading(false);
    }
  };

  const fetchHotels = async () => {
    try {
      const response = await axios.get(`${API_BASE}/admin/hotel_companies`);
      setHotels(response.data || []);
    } catch (err) {
      console.error('Failed to fetch hotels for branch management', err);
    }
  };

  const handleOpenDialog = (branch = null) => {
    setError(null);

    if (branch) {
      setSelectedBranch(branch);
      setFormData({
        companyId: branch.company_id || '',
        name: branch.name || '',
        branchCode: branch.branch_code || '',
        city: branch.city || '',
        address: branch.address || '',
        phone: branch.phone || '',
        status: branch.status || 'ACTIVE',
      });
    } else {
      setSelectedBranch(null);
      setFormData({
        ...defaultFormData,
        companyId: isSuperAdmin() ? '' : (user?.organization?.id || ''),
      });
    }

    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedBranch(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        name: formData.name,
        branchCode: formData.branchCode,
        city: formData.city,
        address: formData.address,
        phone: formData.phone,
        status: formData.status,
      };

      if (isSuperAdmin() && formData.companyId) {
        payload.companyId = formData.companyId;
      }

      if (selectedBranch) {
        await axios.put(`${API_BASE}/admin/hotel_branches/${selectedBranch.id}`, payload);
        setSuccess('Branch updated successfully');
      } else {
        await axios.post(`${API_BASE}/admin/hotel_branches`, payload);
        setSuccess('Branch created successfully');
      }

      handleCloseDialog();
      fetchBranches();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this branch?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/admin/hotel_branches/${id}`);
      setSuccess('Branch deleted successfully');
      fetchBranches();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete branch');
    }
  };

  const filteredBranches = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return branches;
    }

    return branches.filter((branch) =>
      branch.name?.toLowerCase().includes(term) ||
      branch.branch_code?.toLowerCase().includes(term) ||
      branch.company_name?.toLowerCase().includes(term) ||
      branch.city?.toLowerCase().includes(term)
    );
  }, [branches, searchTerm]);

  const columns = [
    {
      field: 'name',
      headerName: 'Branch',
      width: 210,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BranchIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {params.row.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {params.row.branch_code}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'company_name',
      headerName: 'Hotel',
      width: 200,
      hide: !isSuperAdmin(),
    },
    {
      field: 'city',
      headerName: 'City',
      width: 140,
      valueGetter: (params) => params.row.city || '-',
    },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 140,
      valueGetter: (params) => params.row.phone || '-',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.row.status}
          sx={{
            bgcolor: params.row.status === 'ACTIVE' ? '#10b98120' : '#f4433620',
            color: params.row.status === 'ACTIVE' ? '#10b981' : '#f44336',
          }}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <IconButton size="small" onClick={() => handleOpenDialog(params.row)} sx={{ color: '#3b82f6' }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => handleDelete(params.row.id)} sx={{ color: '#f44336' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 600 }}>
            Hotel Branches
          </Typography>
          {!isMobile && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Manage hotel branch records
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ bgcolor: '#FF8A00', '&:hover': { bgcolor: '#CC6E00' } }}
        >
          {isMobile ? 'New' : 'New Branch'}
        </Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Total Branches
              </Typography>
              <Typography variant="h3" sx={{ color: 'text.primary', mt: 1 }}>
                {branches.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Active Branches
              </Typography>
              <Typography variant="h3" sx={{ color: '#10b981', mt: 1 }}>
                {branches.filter((b) => b.status === 'ACTIVE').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ bgcolor: 'background.paper', p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search branches by name, code, city, or hotel..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={fetchBranches} sx={{ color: 'text.secondary' }}>
                  <RefreshIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
        />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      <Paper sx={{ bgcolor: 'background.paper', height: 560 }}>
        <DataGrid
          rows={filteredBranches}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10, 25, 50]}
          getRowId={(row) => row.id}
          disableSelectionOnClick
          sx={{
            border: 'none',
            color: 'text.primary',
            '& .MuiDataGrid-cell': { borderBottom: `1px solid ${muiTheme.palette.divider}` },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.default',
              color: 'text.primary',
              borderBottom: `1px solid ${muiTheme.palette.divider}`,
            },
          }}
        />
      </Paper>

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper' } }}
      >
        <DialogTitle sx={{ color: 'text.primary', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BusinessIcon sx={{ color: '#FF8A00' }} />
            {selectedBranch ? 'Edit Branch' : 'Create New Branch'}
          </Box>
        </DialogTitle>

        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {isSuperAdmin() && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Hotel</InputLabel>
                  <Select
                    name="companyId"
                    value={formData.companyId}
                    onChange={handleChange}
                    label="Hotel"
                    sx={{ bgcolor: 'background.default' }}
                  >
                    {hotels.map((hotel) => (
                      <MenuItem key={hotel.id} value={hotel.id}>{hotel.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Branch Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Branch Code"
                name="branchCode"
                value={formData.branchCode}
                onChange={handleChange}
                required
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <CityIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                multiline
                minRows={2}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  label="Status"
                  sx={{ bgcolor: 'background.default' }}
                >
                  <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                  <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ p: 3, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Button onClick={handleCloseDialog} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            sx={{ bgcolor: '#FF8A00', '&:hover': { bgcolor: '#CC6E00' } }}
          >
            {selectedBranch ? 'Update' : 'Create'} Branch
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BranchManagement;
