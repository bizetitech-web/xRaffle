import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Avatar,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  CircularProgress,
  FormHelperText,
  FormControlLabel,
  Switch,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Block as BlockIcon,
  CheckCircle as ActiveIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

const UserManagement = () => {
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery('(max-width:600px)');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roleId: '',
    organizationId: '', // Add this field
    phone: '',
    isActive: true,
  });
  const [roles, setRoles] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const { user: currentUser, isSuperAdmin } = useAuth();

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    if (isSuperAdmin()) {
      fetchOrganizations();
    }
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/admin/users`);
      setUsers(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch users: ' + (err.response?.data?.error || err.message));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/admin/roles`);
      setRoles(response.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get(`${API_BASE}/admin/organizations`);
      setOrganizations(response.data);
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    }
  };

  const handleOpenDialog = (user = null) => {
    if (user) {
      setSelectedUser(user);
      setFormData({
        email: user.email || '',
        password: '', // Password field empty for edit
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        roleId: user.role_id || '',
        organizationId: user.organization_id || (isSuperAdmin() ? '' : currentUser?.organization?.id),
        phone: user.phone || '',
        isActive: user.is_active === 1 || user.is_active === true,
      });
    } else {
      setSelectedUser(null);
      setFormData({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        roleId: '',
        organizationId: isSuperAdmin() ? '' : (currentUser?.organization?.id || ''),
        phone: '',
        isActive: true,
      });
    }
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedUser(null);
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear field error when user types
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }
    if (!selectedUser && !formData.password) {
      errors.password = 'Password is required for new users';
    } else if (!selectedUser && formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    if (!formData.roleId) {
      errors.roleId = 'Role is required';
    }
    if (!formData.organizationId && isSuperAdmin()) {
      errors.organizationId = 'Organization is required';
    }

    return errors;
  };

  const handleSubmit = async () => {
    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      // Prepare payload
      const payload = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        roleId: formData.roleId,
        phone: formData.phone || null,
        isActive: formData.isActive,
      };

      // Only include organizationId for super admin or if explicitly set
      if (isSuperAdmin() && formData.organizationId) {
        payload.organizationId = formData.organizationId;
      }

      // Only include password for new users or if changed
      if (!selectedUser && formData.password) {
        payload.password = formData.password;
      } else if (selectedUser && formData.password) {
        payload.password = formData.password; // Allow password change
      }

      if (selectedUser) {
        // Update user
        await axios.put(`${API_BASE}/admin/users/${selectedUser.id}`, payload);
        setSuccess('User updated successfully');
      } else {
        // Create user
        await axios.post(`${API_BASE}/admin/users`, payload);
        setSuccess('User created successfully');
      }
      fetchUsers();
      handleCloseDialog();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      await axios.put(`${API_BASE}/admin/users/${userId}/status`, {
        isActive: !currentStatus
      });
      setSuccess(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_BASE}/admin/users/${userId}`);
      setSuccess('User deleted successfully');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const columns = [
    {
      field: 'name',
      headerName: 'User',
      width: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ 
            width: 36, 
            height: 36, 
            bgcolor: params.row.is_active ? '#3b82f6' : '#6b7280',
            fontSize: '0.9rem'
          }}>
            {params.row.first_name?.[0]}{params.row.last_name?.[0]}
          </Avatar>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {params.row.first_name} {params.row.last_name}
            </Typography>
            <Typography variant="caption" sx={{ color: '#aaaaaa' }}>
              {params.row.email}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'organization_name',
      headerName: 'Organization',
      width: 180,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value || 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'role_name',
      headerName: 'Role',
      width: 130,
      renderCell: (params) => (
        <Chip 
          label={params.value || 'No Role'}
          size="small"
          sx={{ 
            bgcolor: params.value ? '#3b82f620' : '#6b728020',
            color: params.value ? '#3b82f6' : '#6b7280',
          }}
        />
      ),
    },
    {
      field: 'permission_count',
      headerName: 'Permissions',
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={params.value || 0}
          size="small"
          sx={{ bgcolor: '#10b98120', color: '#10b981' }}
        />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          sx={{ 
            bgcolor: params.value ? '#10b98120' : '#f4433620',
            color: params.value ? '#10b981' : '#f44336',
          }}
        />
      ),
    },
    {
      field: 'last_login',
      headerName: 'Last Login',
      width: 150,
      valueFormatter: (params) => params.value ? new Date(params.value).toLocaleDateString() : 'Never',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params) => (
        <Box>
          <IconButton 
            size="small" 
            onClick={() => handleOpenDialog(params.row)}
            aria-label={`edit-user-${params.row.id}`}
            sx={{ color: '#3b82f6' }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={() => handleToggleStatus(params.row.id, params.row.is_active)}
            aria-label={`toggle-user-status-${params.row.id}`}
            sx={{ color: params.row.is_active ? '#f44336' : '#10b981' }}
          >
            {params.row.is_active ? <BlockIcon fontSize="small" /> : <ActiveIcon fontSize="small" />}
          </IconButton>
          {isSuperAdmin() && (
            <IconButton 
              size="small" 
              onClick={() => handleDeleteUser(params.row.id)}
              aria-label={`delete-user-${params.row.id}`}
              sx={{ color: '#f44336' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ),
    },
  ];

  const filteredUsers = users.filter(user => 
    user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.organization_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && users.length === 0) {
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
            {isMobile ? 'Users' : 'User Management'}
          </Typography>
          {!isMobile && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Manage users, roles, and permissions
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          data-testid="add-user-button"
          sx={{ 
            bgcolor: '#FF8A00',
            '&:hover': { bgcolor: '#CC6E00' }
          }}
        >
          {isMobile ? 'User' : 'Add User'}
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Total Users
              </Typography>
              <Typography variant="h4" sx={{ color: '#3b82f6', mt: 0.5, fontWeight: 700 }}>
                {users.length}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Active Users
              </Typography>
              <Typography variant="h4" sx={{ color: '#10b981', mt: 0.5, fontWeight: 700 }}>
                {users.filter(u => u.is_active === 1 || u.is_active === true).length}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Pending Invites
              </Typography>
              <Typography variant="h4" sx={{ color: '#f59e0b', mt: 0.5, fontWeight: 700 }}>
                0
              </Typography>
            </Paper>
          </Grid>
      </Grid>

      {/* Error/Success Messages */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}
      {success && (
        <Alert 
          severity="success" 
          sx={{ mb: 3 }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      {/* Search Bar */}
      <Paper sx={{ bgcolor: 'background.paper', p: 2, mb: 3 }}>
        <TextField
          fullWidth
          data-testid="user-search-input"
          placeholder="Search users by name, email, or organization..."
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
                <IconButton onClick={fetchUsers} sx={{ color: 'text.secondary' }}>
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

      {/* Users Table */}
      <Paper sx={{ bgcolor: 'background.paper', height: 500 }}>
        <DataGrid
          rows={filteredUsers}
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
        />
      </Paper>

      {/* User Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'background.paper' }
        }}
      >
        <DialogTitle sx={{ color: 'text.primary', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          {selectedUser ? 'Edit User' : 'Create New User'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Organization Selection (Super Admin only) */}
            {isSuperAdmin() && (
              <Grid item xs={12}>
                <FormControl fullWidth error={!!formErrors.organizationId}>
                  <InputLabel sx={{ color: 'text.secondary' }}>Organization *</InputLabel>
                  <Select
                    name="organizationId"
                    data-testid="user-organization-select"
                    value={formData.organizationId}
                    onChange={handleChange}
                    label="Organization *"
                    sx={{
                      color: 'text.primary',
                      bgcolor: 'background.default',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                    }}
                  >
                    {organizations.map((org) => (
                      <MenuItem key={org.id} value={org.id}>
                        {org.name} ({org.code})
                      </MenuItem>
                    ))}
                  </Select>
                  {formErrors.organizationId && (
                    <FormHelperText>{formErrors.organizationId}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
            )}

            {/* First Name */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name *"
                name="firstName"
                data-testid="user-first-name-input"
                value={formData.firstName}
                onChange={handleChange}
                error={!!formErrors.firstName}
                helperText={formErrors.firstName}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Last Name */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name *"
                name="lastName"
                data-testid="user-last-name-input"
                value={formData.lastName}
                onChange={handleChange}
                error={!!formErrors.lastName}
                helperText={formErrors.lastName}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Email */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email *"
                name="email"
                data-testid="user-email-input"
                type="email"
                value={formData.email}
                onChange={handleChange}
                error={!!formErrors.email}
                helperText={formErrors.email}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Password */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={selectedUser ? "New Password (leave blank to keep current)" : "Password *"}
                name="password"
                data-testid="user-password-input"
                type="password"
                value={formData.password}
                onChange={handleChange}
                error={!!formErrors.password}
                helperText={formErrors.password}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Phone */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                data-testid="user-phone-input"
                value={formData.phone}
                onChange={handleChange}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Role Selection */}
            <Grid item xs={12}>
              <FormControl fullWidth error={!!formErrors.roleId}>
                <InputLabel sx={{ color: 'text.secondary' }}>Role *</InputLabel>
                <Select
                  name="roleId"
                  data-testid="user-role-select"
                  value={formData.roleId}
                  onChange={handleChange}
                  label="Role *"
                  sx={{
                    color: 'text.primary',
                    bgcolor: 'background.default',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  }}
                >
                  {roles.map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name} (Level {role.level})
                    </MenuItem>
                  ))}
                </Select>
                {formErrors.roleId && (
                  <FormHelperText>{formErrors.roleId}</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {/* Active Status (only for edit) */}
            {selectedUser && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.isActive}
                      onChange={handleChange}
                      name="isActive"
                      inputProps={{ 'data-testid': 'user-active-switch' }}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: 'success.main' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'success.main' },
                      }}
                    />
                  }
                  label="Active User"
                  sx={{ color: 'text.primary' }}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Button 
            onClick={handleCloseDialog}
            startIcon={<CancelIcon />}
            sx={{ color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            variant="contained"
            startIcon={<SaveIcon />}
            data-testid="save-user-button"
            sx={{ 
              bgcolor: '#FF8A00',
              '&:hover': { bgcolor: '#CC6E00' }
            }}
          >
            {selectedUser ? 'Update' : 'Create'} User
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;