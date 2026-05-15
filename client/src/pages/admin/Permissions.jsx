import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  Tooltip,
  Avatar,
  Divider,
  FormHelperText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Badge,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Security as SecurityIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Assignment as PermissionIcon,
  Group as RoleIcon,
  CheckCircle as ActiveIcon,
  Block as InactiveIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

const Permissions = () => {
  const muiTheme = useMuiTheme();
  const { hasPermission, isSuperAdmin } = useAuth();
  const isMobile = useMediaQuery('(max-width:600px)');
  
  // State
  const [permissions, setPermissions] = useState([]);
  const [groupedPermissions, setGroupedPermissions] = useState({});
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [openRolePermDialog, setOpenRolePermDialog] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    module: '',
    description: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionToDelete, setPermissionToDelete] = useState(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewPermission, setViewPermission] = useState(null);

  // Fetch permissions
  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/admin/permissions`);
      
      // Permissions come grouped by module
      setGroupedPermissions(response.data);
      
      // Also create a flat list
      const flatList = [];
      Object.keys(response.data).forEach(module => {
        flatList.push(...response.data[module]);
      });
      setPermissions(flatList);
      
      setError(null);
    } catch (err) {
      setError('Failed to fetch permissions: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Fetch roles
  const fetchRoles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/admin/roles`);
      setRoles(response.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  useEffect(() => {
    if (isSuperAdmin()) {
      fetchPermissions();
      fetchRoles();
    }
  }, [isSuperAdmin]);

  // Fetch role permissions
  const fetchRolePermissions = async (role) => {
    try {
      const response = await axios.get(`${API_BASE}/admin/roles/${role.id}`);
      setSelectedRole(role);
      setRolePermissions(response.data.permissions || []);
      setOpenRolePermDialog(true);
    } catch (err) {
      setError('Failed to fetch role permissions');
    }
  };

  // Update role permissions
  const handleUpdateRolePermissions = async () => {
    try {
      const permissionIds = rolePermissions.map(p => p.id);
      await axios.put(`${API_BASE}/admin/roles/${selectedRole.id}`, {
        ...selectedRole,
        permissions: permissionIds
      });
      setSuccess(`Permissions updated for role: ${selectedRole.name}`);
      setOpenRolePermDialog(false);
      fetchRoles();
    } catch (err) {
      setError('Failed to update role permissions');
    }
  };

  // Toggle permission for role
  const handleTogglePermission = (permission) => {
    setRolePermissions(prev => {
      const exists = prev.some(p => p.id === permission.id);
      if (exists) {
        return prev.filter(p => p.id !== permission.id);
      } else {
        return [...prev, permission];
      }
    });
  };

  // Select/deselect all permissions in a module
  const handleSelectAllInModule = (module, modulePermissions, checked) => {
    if (checked) {
      // Add all permissions from this module that aren't already selected
      const newPermissions = [...rolePermissions];
      modulePermissions.forEach(perm => {
        if (!newPermissions.some(p => p.id === perm.id)) {
          newPermissions.push(perm);
        }
      });
      setRolePermissions(newPermissions);
    } else {
      // Remove all permissions from this module
      setRolePermissions(prev => 
        prev.filter(p => !modulePermissions.some(mp => mp.id === p.id))
      );
    }
  };

  // Open dialog for create/edit
  const handleOpenDialog = (permission = null) => {
    if (permission) {
      setSelectedPermission(permission);
      setFormData({
        name: permission.name || '',
        module: permission.module || '',
        description: permission.description || '',
      });
    } else {
      setSelectedPermission(null);
      setFormData({
        name: '',
        module: '',
        description: '',
      });
    }
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedPermission(null);
    setFormErrors({});
  };

  // Handle form changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear field error
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Permission name is required';
    }
    if (!formData.module.trim()) {
      errors.module = 'Module name is required';
    }
    // Permission name should be uppercase with underscores
    const namePattern = /^[A-Z][A-Z0-9_]*$/;
    if (!namePattern.test(formData.name.trim())) {
      errors.name = 'Permission name must be uppercase with underscores (e.g., MANAGE_USERS)';
    }
    return errors;
  };

  // Handle submit
  const handleSubmit = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload = {
      name: formData.name.trim().toUpperCase(),
      module: formData.module.trim().toLowerCase(),
      description: formData.description?.trim() || null,
    };

    try {
      if (selectedPermission) {
        // Update
        await axios.put(`${API_BASE}/admin/permissions/${selectedPermission.id}`, payload);
        setSuccess('Permission updated successfully');
      } else {
        // Create
        await axios.post(`${API_BASE}/admin/permissions`, payload);
        setSuccess('Permission created successfully');
      }
      fetchPermissions();
      handleCloseDialog();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  // Handle delete
  const handleDeleteClick = (permission) => {
    setPermissionToDelete(permission);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await axios.delete(`${API_BASE}/admin/permissions/${permissionToDelete.id}`);
      setSuccess('Permission deleted successfully');
      fetchPermissions();
      setDeleteDialogOpen(false);
      setPermissionToDelete(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete permission');
      setDeleteDialogOpen(false);
    }
  };

  // View permission details
  const handleViewPermission = (permission) => {
    setViewPermission(permission);
    setViewDialogOpen(true);
  };

  // Filter permissions
  const filteredPermissions = permissions.filter(perm => 
    perm.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    perm.module?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    perm.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const totalPermissions = permissions.length;
  const totalModules = Object.keys(groupedPermissions).length;

  // Format date
  const formatDate = (date) => {
    return date ? format(new Date(date), 'MMM dd, yyyy HH:mm') : 'N/A';
  };

  // DataGrid columns
  const columns = [
    {
      field: 'name',
      headerName: 'Permission',
      width: 250,
      renderCell: (params) => (
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            cursor: 'pointer',
            '&:hover': { color: 'primary.main' }
          }}
          onClick={() => handleViewPermission(params.row)}
        >
          <Avatar sx={{ bgcolor: '#8b5cf6', width: 32, height: 32 }}>
            <LockIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
              {params.value}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {params.row.module}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'module',
      headerName: 'Module',
      width: 150,
      renderCell: (params) => (
        <Chip 
          label={params.value}
          size="small"
          sx={{ bgcolor: '#3b82f620', color: '#3b82f6', textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      width: 300,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ color: 'text.primary' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'role_count',
      headerName: 'Roles',
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={params.row.role_count || 0}
          size="small"
          icon={<RoleIcon />}
          sx={{ bgcolor: '#10b98120', color: '#10b981' }}
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 150,
      renderCell: (params) => (
        <Tooltip title={formatDate(params.value)}>
          <Typography variant="caption" sx={{ color: 'text.primary' }}>
            {params.value ? format(new Date(params.value), 'MMM dd, yyyy') : 'N/A'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params) => (
        <Box>
          <Tooltip title="View">
            <IconButton 
              size="small" 
              onClick={() => handleViewPermission(params.row)}
              sx={{ color: '#3b82f6' }}
            >
              <LockOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton 
              size="small" 
              onClick={() => handleOpenDialog(params.row)}
              sx={{ color: '#3b82f6' }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton 
              size="small" 
              onClick={() => handleDeleteClick(params.row)}
              sx={{ color: '#f44336' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  // Super admin check
  if (!isSuperAdmin()) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <Typography variant="h6" sx={{ color: 'error.main', mb: 1 }}>
            Access Denied
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            This page is restricted to Super Administrators only.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 600 }}>
            {isMobile ? 'Permissions' : 'Permission Management'}
          </Typography>
          {!isMobile && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Create and manage system permissions for role-based access control
            </Typography>
          )}
        </Box>
        
        {/* New Permission Button */}
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ 
            bgcolor: '#FF8A00',
            '&:hover': { bgcolor: '#CC6E00' }
          }}
        >
          {isMobile ? 'New' : 'New Permission'}
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Total Permissions
              </Typography>
              <Typography variant="h3" sx={{ color: '#8b5cf6', mt: 1 }}>
                {totalPermissions}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Modules
              </Typography>
              <Typography variant="h3" sx={{ color: '#3b82f6', mt: 1 }}>
                {totalModules}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Roles
              </Typography>
              <Typography variant="h3" sx={{ color: '#10b981', mt: 1 }}>
                {roles.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Roles Quick Access */}
      <Paper sx={{ bgcolor: 'background.paper', p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ color: 'text.primary', mb: 2 }}>
          Quick Role Permission Assignment
        </Typography>
        <Grid container spacing={2}>
          {roles.map((role) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={role.id}>
              <Card 
                sx={{ 
                  bgcolor: 'background.default',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' }
                }}
                onClick={() => fetchRolePermissions(role)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <SecurityIcon sx={{ color: '#FF8A00' }} />
                    <Typography variant="subtitle1" sx={{ color: 'text.primary' }}>
                      {role.name}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Chip 
                      label={`Level ${role.level}`}
                      size="small"
                      sx={{ bgcolor: '#8b5cf620', color: '#8b5cf6' }}
                    />
                    <Badge 
                      badgeContent={role.permission_count || 0} 
                      color="primary"
                      sx={{ '& .MuiBadge-badge': { bgcolor: 'primary.main' } }}
                    >
                      <PermissionIcon sx={{ color: 'text.secondary' }} />
                    </Badge>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Error/Success Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Search Bar */}
      <Paper sx={{ bgcolor: 'background.paper', p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search permissions by name, module, or description..."
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
                <IconButton onClick={fetchPermissions} sx={{ color: 'text.secondary' }}>
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

      {/* Permissions Table */}
      <Paper sx={{ bgcolor: 'background.paper', height: 500 }}>
        <DataGrid
          rows={filteredPermissions}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10, 25, 50]}
          disableSelectionOnClick
          loading={loading}
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

      {/* Create/Edit Permission Dialog */}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockIcon sx={{ color: '#FF8A00' }} />
            {selectedPermission ? 'Edit Permission' : 'Create'}
          </Box>
        </DialogTitle>

        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Permission Name */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Permission Name *"
                name="name"
                value={formData.name}
                onChange={handleChange}
                error={!!formErrors.name}
                helperText={formErrors.name || 'Use uppercase with underscores (e.g., MANAGE_USERS)'}
                autoFocus
                placeholder="MANAGE_SOMETHING"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Module */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Module *"
                name="module"
                value={formData.module}
                onChange={handleChange}
                error={!!formErrors.module}
                helperText={formErrors.module || 'e.g., users, roles, hotels'}
                placeholder="users"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SecurityIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>

            {/* Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                multiline
                rows={2}
                placeholder="What this permission allows"
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
              />
            </Grid>
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
            sx={{ 
              bgcolor: '#FF8A00',
              '&:hover': { bgcolor: '#CC6E00' }
            }}
          >
            {selectedPermission ? 'Update' : 'Create'} Permission
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Permission Details Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper' } }}
      >
        <DialogTitle sx={{ color: 'text.primary', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockIcon sx={{ color: '#FF8A00' }} />
            Permission Details
          </Box>
        </DialogTitle>
        <DialogContent>
          {viewPermission && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Permission Name
                  </Typography>
                  <Typography variant="h6" sx={{ color: 'text.primary', fontFamily: 'monospace' }}>
                    {viewPermission.name}
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Module
                  </Typography>
                  <Chip 
                    label={viewPermission.module}
                    sx={{ bgcolor: '#3b82f620', color: '#3b82f6', textTransform: 'capitalize' }}
                  />
                </Paper>
              </Grid>

              {viewPermission.description && (
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                      Description
                    </Typography>
                    <Typography sx={{ color: 'text.primary' }}>
                      {viewPermission.description}
                    </Typography>
                  </Paper>
                </Grid>
              )}

              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Usage Statistics
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Chip 
                      label={`${viewPermission.role_count || 0} roles`}
                      icon={<RoleIcon />}
                      sx={{ bgcolor: '#10b98120', color: '#10b981' }}
                    />
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Created At
                  </Typography>
                  <Typography sx={{ color: 'text.primary' }}>
                    {formatDate(viewPermission.created_at)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Button onClick={() => setViewDialogOpen(false)} sx={{ color: 'text.secondary' }}>
            Close
          </Button>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => {
              setViewDialogOpen(false);
              handleOpenDialog(viewPermission);
            }}
            sx={{ bgcolor: '#3b82f6' }}
          >
            Edit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Permission Assignment Dialog */}
      <Dialog
        open={openRolePermDialog}
        onClose={() => setOpenRolePermDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'background.paper', maxHeight: 600 } }}
      >
        <DialogTitle sx={{ color: 'text.primary', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon sx={{ color: '#FF8A00' }} />
            Assign Permissions: {selectedRole?.name} (Level {selectedRole?.level})
          </Box>
        </DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          {Object.entries(groupedPermissions).map(([module, modulePermissions]) => {
            const allSelected = modulePermissions.every(p => 
              rolePermissions.some(rp => rp.id === p.id)
            );
            const someSelected = modulePermissions.some(p => 
              rolePermissions.some(rp => rp.id === p.id)
            );

            return (
              <Accordion 
                key={module}
                sx={{ 
                  bgcolor: 'background.default',
                  color: 'text.primary',
                  mb: 1,
                  border: `1px solid ${muiTheme.palette.divider}`,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'text.primary' }} />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                    <Typography sx={{ textTransform: 'capitalize' }}>
                      {module}
                    </Typography>
                    <Chip 
                      label={`${modulePermissions.length} permissions`}
                      size="small"
                      sx={{ bgcolor: 'action.hover', color: 'text.secondary' }}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={allSelected}
                          indeterminate={!allSelected && someSelected}
                          onChange={(e) => handleSelectAllInModule(module, modulePermissions, e.target.checked)}
                          sx={{
                            color: '#3b82f6',
                            '&.Mui-checked': { color: '#3b82f6' },
                          }}
                        />
                      }
                      label="Select All"
                      sx={{ ml: 'auto', color: 'text.primary' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={1}>
                    {modulePermissions.map((perm) => (
                      <Grid item xs={12} sm={6} md={4} key={perm.id}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={rolePermissions.some(p => p.id === perm.id)}
                              onChange={() => handleTogglePermission(perm)}
                              sx={{
                                color: '#3b82f6',
                                '&.Mui-checked': { color: '#3b82f6' },
                              }}
                            />
                          }
                          label={
                            <Tooltip title={perm.description || ''}>
                              <Typography variant="body2" sx={{ color: 'text.primary', fontFamily: 'monospace' }}>
                                {perm.name}
                              </Typography>
                            </Tooltip>
                          }
                          sx={{ m: 0 }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Button onClick={() => setOpenRolePermDialog(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpdateRolePermissions}
            variant="contained"
            sx={{ bgcolor: '#FF8A00' }}
          >
            Save Permissions
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { bgcolor: 'background.paper', maxWidth: 400 } }}
      >
        <DialogTitle sx={{ color: 'text.primary' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
            <WarningIcon />
            Delete Permission
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary', mb: 2 }}>
            Are you sure you want to delete the permission "{permissionToDelete?.name}"?
          </Typography>
          {permissionToDelete?.role_count > 0 && (
            <Alert severity="warning" sx={{ bgcolor: '#f59e0b20', color: '#f59e0b' }}>
              This permission is assigned to {permissionToDelete.role_count} role(s). 
              Deleting it will remove access from all roles.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Permissions;