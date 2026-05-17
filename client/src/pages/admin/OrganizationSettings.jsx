import React, { useState, useEffect } from 'react';
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
  Tab,
  Tabs,
  Avatar,
  Divider,
  FormControlLabel,
  Switch,
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
  Visibility as ViewIcon,
  Block as BlockIcon,
  CheckCircle as ActiveIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  AccountBalanceWallet as WalletIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

const OrganizationSettings = () => {
  const muiTheme = useMuiTheme();
  const { user, isSuperAdmin } = useAuth();
  const [hotel_companies, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const isMobile = useMediaQuery('(max-width:600px)');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [orgStats, setOrgStats] = useState({});
  const [selectedWalletOrgId, setSelectedWalletOrgId] = useState('');
  const [walletInfo, setWalletInfo] = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletPagination, setWalletPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSubmitting, setWalletSubmitting] = useState(false);
  const [topupData, setTopupData] = useState({
    amount: '',
    paymentMethod: 'CASH',
    referenceNumber: '',
  });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'active',
    isActive: true,
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/admin/hotel_companies`);
      setOrganizations(response.data);

      if (response.data.length > 0) {
        const selectedStillExists = response.data.some((org) => org.id === selectedWalletOrgId);
        const nextSelectedId = selectedStillExists ? selectedWalletOrgId : response.data[0].id;
        setSelectedWalletOrgId(nextSelectedId);
      } else {
        setSelectedWalletOrgId('');
      }
      
      // Fetch stats for each hotel
      const stats = {};
      for (const org of response.data) {
        try {
          const statsResponse = await axios.get(`${API_BASE}/admin/hotel_companies/${org.id}/stats`);
          stats[org.id] = statsResponse.data;
        } catch (err) {
          console.error(`Failed to fetch stats for org ${org.id}:`, err);
        }
      }
      setOrgStats(stats);
      setError(null);
    } catch (err) {
      setError('Failed to fetch hotels');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWalletOrgId) {
      fetchWalletData(selectedWalletOrgId, walletPagination.page, walletPagination.pageSize);
    } else {
      setWalletInfo(null);
      setWalletTransactions([]);
      setWalletPagination((prev) => ({ ...prev, total: 0 }));
    }
  }, [selectedWalletOrgId]);

  const fetchWalletData = async (companyId, page = 1, pageSize = 10) => {
    try {
      setWalletLoading(true);

      const [walletRes, txRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/wallets/company/${companyId}`),
        axios.get(`${API_BASE}/admin/wallets/company/${companyId}/transactions?page=${page}&pageSize=${pageSize}`),
      ]);

      setWalletInfo(walletRes.data);
      setWalletTransactions(txRes.data?.items || []);
      setWalletPagination({
        page: txRes.data?.page || page,
        pageSize: txRes.data?.pageSize || pageSize,
        total: txRes.data?.total || 0,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch wallet data');
    } finally {
      setWalletLoading(false);
    }
  };

  const handleTopupChange = (e) => {
    const { name, value } = e.target;
    setTopupData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTopupSubmit = async () => {
    if (!selectedWalletOrgId) {
      setError('Please select a hotel first');
      return;
    }

    const amount = Number(topupData.amount);
    if (!amount || amount <= 0) {
      setError('Top-up amount must be greater than 0');
      return;
    }

    try {
      setWalletSubmitting(true);
      setError(null);

      await axios.post(`${API_BASE}/admin/wallets/company/${selectedWalletOrgId}/topups`, {
        amount,
        paymentMethod: topupData.paymentMethod,
        referenceNumber: topupData.referenceNumber || null,
      });

      setSuccess('Wallet topped up successfully');
      setTopupData({ amount: '', paymentMethod: 'CASH', referenceNumber: '' });

      await fetchWalletData(selectedWalletOrgId, 1, walletPagination.pageSize);
      await fetchOrganizations();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to top up wallet');
    } finally {
      setWalletSubmitting(false);
    }
  };

  const handleOpenDialog = (org = null) => {
    if (org) {
      setSelectedOrg(org);
      setFormData({
        name: org.name || '',
        email: org.email || '',
        phone: org.phone || '',
        status: org.status || 'active',
        isActive: Boolean(org.is_active),
      });
    } else {
      setSelectedOrg(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        status: 'active',
        isActive: true,
      });
    }
    setOpenDialog(true);
    setError(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedOrg(null);
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        status: formData.status,
        isActive: Boolean(formData.isActive),
      };

      if (selectedOrg) {
        // Update hotel
        await axios.put(`${API_BASE}/admin/hotel_companies/${selectedOrg.id}`, payload);
        setSuccess('Hotel updated successfully');
      } else {
        // Create hotel
        await axios.post(`${API_BASE}/admin/hotel_companies`, payload);
        setSuccess('Hotel created successfully');
      }
      fetchOrganizations();
      handleCloseDialog();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleToggleStatus = async (orgId, currentStatus) => {
    try {
      await axios.put(`${API_BASE}/admin/hotel_companies/${orgId}/status`, {
        isActive: !currentStatus
      });
      setSuccess(`Hotel ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchOrganizations();
    } catch (err) {
      setError('Failed to update hotel status');
    }
  };

  const handleDelete = async (orgId) => {
    if (!window.confirm('Are you sure you want to delete this hotel? This action cannot be undone.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_BASE}/admin/hotel_companies/${orgId}`);
      setSuccess('Hotel deleted successfully');
      fetchOrganizations();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete hotel');
    }
  };

  const columns = [
    {
      field: 'name',
      headerName: 'Hotel',
      width: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ bgcolor: '#3b82f6', width: 32, height: 32 }}>
            {params.value.charAt(0)}
          </Avatar>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {params.value}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'email',
      headerName: 'Contact',
      width: 200,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2">{params.value}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {params.row.phone || 'No phone'}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'stats',
      headerName: 'Stats',
      width: 200,
      renderCell: (params) => {
        const stats = orgStats[params.row.id] || {};
        return (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Chip 
              label={`${stats.userCount || 0} users`}
              size="small"
              sx={{ bgcolor: '#3b82f620', color: '#3b82f6' }}
            />
          </Box>
        );
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.row.is_active ? 'Active' : 'Inactive'}
          size="small"
          sx={{ 
            bgcolor: params.row.is_active ? '#10b98120' : '#f4433620',
            color: params.row.is_active ? '#10b981' : '#f44336',
          }}
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 150,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      renderCell: (params) => (
        <Box>
          <IconButton 
            size="small" 
            onClick={() => handleOpenDialog(params.row)}
            sx={{ color: '#3b82f6' }}
          >
            <EditIcon />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={() => handleToggleStatus(params.row.id, params.row.is_active)}
            sx={{ color: params.row.is_active ? '#f44336' : '#10b981' }}
          >
            {params.row.is_active ? <BlockIcon /> : <ActiveIcon />}
          </IconButton>
          {isSuperAdmin() && (
            <IconButton 
              size="small" 
              onClick={() => handleDelete(params.row.id)}
              sx={{ color: '#f44336' }}
            >
              <DeleteIcon />
            </IconButton>
          )}
        </Box>
      ),
    },
  ];

  const filteredOrgs = hotel_companies.filter(org => 
    org.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isSuperAdmin()) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          You don't have permission to access this page. This area is restricted to Super Admins only.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 600 }}>
            Hotels
          </Typography>
          {!isMobile && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Manage all hotels in the system
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ 
            bgcolor: '#FF8A00',
            '&:hover': { bgcolor: '#CC6E00' }
          }}
        >
          {isMobile ? 'New' : 'New Hotel'}
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Total Hotels
              </Typography>
              <Typography variant="h3" sx={{ color: 'text.primary', mt: 1 }}>
                {hotel_companies.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Active Hotels
              </Typography>
              <Typography variant="h3" sx={{ color: '#10b981', mt: 1 }}>
                {hotel_companies.filter(o => o.is_active).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Total Users
              </Typography>
              <Typography variant="h3" sx={{ color: '#3b82f6', mt: 1 }}>
                {Object.values(orgStats).reduce((sum, stat) => sum + (stat.userCount || 0), 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Filter */}
      <Paper sx={{ bgcolor: 'background.paper', p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search hotels by name or email..."
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
                <IconButton onClick={fetchOrganizations} sx={{ color: 'text.secondary' }}>
                  <RefreshIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'background.default',
            }
          }}
        />
      </Paper>

      {/* Error/Success Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {/* Hotels Table */}
      <Paper sx={{ bgcolor: 'background.paper', height: 600 }}>
        <DataGrid
          rows={filteredOrgs}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10, 25, 50]}
          disableSelectionOnClick
          getRowId={(row) => row.id}
          sx={{
            border: 'none',
            color: 'text.primary',
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${muiTheme.palette.divider}`,
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.default',
              color: 'text.primary',
              borderBottom: `1px solid ${muiTheme.palette.divider}`,
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${muiTheme.palette.divider}`,
            },
          }}
          onRowClick={(params) => setSelectedWalletOrgId(params.row.id)}
        />
      </Paper>

      {/* Wallet Section */}
      <Paper sx={{ bgcolor: 'background.paper', p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WalletIcon sx={{ color: '#FF8A00' }} />
            <Typography variant="h6" sx={{ color: 'text.primary' }}>
              Wallet Management
            </Typography>
          </Box>

          <FormControl sx={{ minWidth: 280 }}>
            <InputLabel sx={{ color: 'text.secondary' }}>Hotel</InputLabel>
            <Select
              value={selectedWalletOrgId}
              label="Hotel"
              onChange={(e) => setSelectedWalletOrgId(e.target.value)}
              sx={{
                color: 'text.primary',
                bgcolor: 'background.default',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
              }}
            >
              {hotel_companies.map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {walletLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Current Balance
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#10b981', mt: 1, fontWeight: 700 }}>
                    {(walletInfo?.balance || 0).toLocaleString()} {walletInfo?.currency || 'ETB'}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Wallet Status
                  </Typography>
                  <Chip
                    label={walletInfo?.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    sx={{
                      mt: 1,
                      bgcolor: walletInfo?.isActive ? '#10b98120' : '#f4433620',
                      color: walletInfo?.isActive ? '#10b981' : '#f44336',
                    }}
                  />
                </Paper>
              </Grid>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Transactions Logged
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#3b82f6', mt: 1, fontWeight: 700 }}>
                    {walletPagination.total || 0}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Top-up Amount"
                  name="amount"
                  type="number"
                  value={topupData.amount}
                  onChange={handleTopupChange}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <MoneyIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: 'text.secondary' }}>Payment Method</InputLabel>
                  <Select
                    name="paymentMethod"
                    value={topupData.paymentMethod}
                    onChange={handleTopupChange}
                    label="Payment Method"
                    sx={{
                      color: 'text.primary',
                      bgcolor: 'background.default',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                    }}
                  >
                    <MenuItem value="CASH">Cash</MenuItem>
                    <MenuItem value="TELEBIRR">Telebirr</MenuItem>
                    <MenuItem value="CBEBIRR">CBEBirr</MenuItem>
                    <MenuItem value="BANK">Bank</MenuItem>
                    <MenuItem value="OTHER">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Reference Number (optional)"
                  name="referenceNumber"
                  value={topupData.referenceNumber}
                  onChange={handleTopupChange}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleTopupSubmit}
                  disabled={walletSubmitting || !selectedWalletOrgId}
                  sx={{
                    height: '56px',
                    bgcolor: '#FF8A00',
                    '&:hover': { bgcolor: '#CC6E00' },
                  }}
                >
                  {walletSubmitting ? 'Processing...' : 'Top Up'}
                </Button>
              </Grid>
            </Grid>

            <Typography variant="subtitle1" sx={{ color: 'text.primary', mb: 1 }}>
              Recent Transactions
            </Typography>
            <Paper sx={{ bgcolor: 'background.default', maxHeight: 320, overflow: 'auto' }}>
              {walletTransactions.length === 0 ? (
                <Typography sx={{ color: 'text.secondary', p: 2 }}>
                  No wallet transactions found for this hotel.
                </Typography>
              ) : (
                <Box>
                  {walletTransactions.map((tx) => (
                    <Box
                      key={tx.id}
                      sx={{
                        p: 1.5,
                        borderBottom: `1px solid ${muiTheme.palette.divider}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 600 }}>
                          {tx.transactionType}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {new Date(tx.createdAt).toLocaleString()} | Ref: {tx.referenceNumber || tx.referenceId || 'N/A'}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 700 }}>
                          +{Number(tx.amount || 0).toLocaleString()} ETB
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {Number(tx.balanceBefore || 0).toLocaleString()} {'->'} {Number(tx.balanceAfter || 0).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </>
        )}
      </Paper>

      {/* Create/Edit Hotel Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'background.paper', minHeight: 600 }
        }}
      >
        <DialogTitle sx={{ color: 'text.primary', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BusinessIcon sx={{ color: '#FF8A00' }} />
            {selectedOrg ? 'Edit Hotel' : 'Create New Hotel'}
          </Box>
        </DialogTitle>
        
        <Tabs
          value={tabValue}
          onChange={(e, v) => setTabValue(v)}
          sx={{
            px: 3,
            pt: 2,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            '& .MuiTab-root': { color: 'text.secondary' },
            '& .Mui-selected': { color: '#FF8A00' },
            '& .MuiTabs-indicator': { bgcolor: '#FF8A00' },
          }}
        >
          <Tab label="Basic Information" />
          <Tab label="Contact" />
          <Tab label="Settings" />
        </Tabs>

        <DialogContent>
          {tabValue === 0 && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Hotel Name"
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
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
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
            </Grid>
          )}

          {tabValue === 1 && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Alert severity="info">
                  Hotel contact details include email and phone only.
                </Alert>
              </Grid>
            </Grid>
          )}

          {tabValue === 2 && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: 'text.secondary' }}>Status</InputLabel>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    label="Status"
                    sx={{
                      color: 'text.primary',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                      bgcolor: 'background.default',
                    }}
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                    <MenuItem value="suspended">Suspended</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.isActive}
                      onChange={handleChange}
                      name="isActive"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: 'success.main' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'success.main' },
                      }}
                    />
                  }
                  label="Active Hotel"
                  sx={{ color: 'text.primary' }}
                />
              </Grid>
              
              {selectedOrg && (
                <>
                  <Grid item xs={12}>
                    <Divider sx={{ borderColor: 'divider', my: 2 }} />
                    <Typography variant="subtitle2" sx={{ color: 'text.primary', mb: 2 }}>
                      Hotel Statistics
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Paper sx={{ p: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                          <Typography variant="h4" sx={{ color: '#3b82f6' }}>
                            {orgStats[selectedOrg.id]?.userCount || 0}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Users
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Paper sx={{ p: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                          <Typography variant="h4" sx={{ color: '#10b981' }}>
                            {orgStats[selectedOrg.id]?.branchCount || 0}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Branches
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Grid>
                </>
              )}
            </Grid>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 3, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Button onClick={handleCloseDialog} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained"
            sx={{ 
              bgcolor: '#FF8A00',
              '&:hover': { bgcolor: '#CC6E00' }
            }}
          >
            {selectedOrg ? 'Update' : 'Create'} Hotel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrganizationSettings;