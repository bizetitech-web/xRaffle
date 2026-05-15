import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Checkbox,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Tab,
  Tabs,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Security as SecurityIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

const RoleManagement = () => {
  const muiTheme = useMuiTheme();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState({}); // Changed to object to handle grouped permissions
  const [permissionsList, setPermissionsList] = useState([]); // Flat list for selection
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const isMobile = useMediaQuery('(max-width:600px)');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    level: '',
    permissions: [],
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchRoles();
    fetchPermissions();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/admin/roles`);
      setRoles(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch roles: ' + (err.response?.data?.error || err.message));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      // Try to get grouped permissions first
      const response = await axios.get(`${API_BASE}/admin/permissions`);
      
      // Check if response is grouped by module or flat array
      if (response.data && typeof response.data === 'object') {
        if (Array.isArray(response.data)) {
          // If it's an array, convert to grouped format
          const grouped = {};
          response.data.forEach(perm => {
            const module = perm.module || 'other';
            if (!grouped[module]) {
              grouped[module] = [];
            }
            grouped[module].push(perm);
          });
          setPermissions(grouped);
          setPermissionsList(response.data);
        } else {
          // It's already grouped by module
          setPermissions(response.data);
          
          // Create flat list from grouped data
          const flatList = [];
          Object.keys(response.data).forEach(module => {
            if (Array.isArray(response.data[module])) {
              flatList.push(...response.data[module]);
            }
          });
          setPermissionsList(flatList);
        }
      }
    } catch (err) {
      console.error('Failed to fetch permissions:', err);
      // Fallback to empty permissions
      setPermissions({});
      setPermissionsList([]);
    }
  };

  const handleOpenDialog = async (role = null) => {
    if (role) {
      try {
        const detailResponse = await axios.get(`${API_BASE}/admin/roles/${role.id}`);
        const detail = detailResponse.data || role;

        setSelectedRole(detail);
        setFormData({
          name: detail.name || '',
          description: detail.description || '',
          level: detail.level?.toString() || '',
          permissions: Array.isArray(detail.permissions)
            ? detail.permissions.map((p) => p?.id).filter(Boolean)
            : [],
        });
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load role details');
        return;
      }
    } else {
      setSelectedRole(null);
      setFormData({
        name: '',
        description: '',
        level: '5', // Default level
        permissions: [],
      });
    }
    setTabValue(0);
    setOpenDialog(true);
    setError(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedRole(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePermissionToggle = (permissionId) => {
    setFormData(prev => {
      const newPermissions = prev.permissions.includes(permissionId)
        ? prev.permissions.filter(id => id !== permissionId)
        : [...prev.permissions, permissionId];
      return {
        ...prev,
        permissions: newPermissions
      };
    });
  };

  const handleSelectAllPermissions = (modulePermissions) => {
    const modulePermissionIds = modulePermissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => formData.permissions.includes(id));
    
    setFormData(prev => {
      if (allSelected) {
        // Remove all from this module
        return {
          ...prev,
          permissions: prev.permissions.filter(id => !modulePermissionIds.includes(id))
        };
      } else {
        // Add all from this module
        const newPermissions = [...prev.permissions];
        modulePermissionIds.forEach(id => {
          if (!newPermissions.includes(id)) {
            newPermissions.push(id);
          }
        });
        return {
          ...prev,
          permissions: newPermissions
        };
      }
    });
  };

  const handleSubmit = async () => {
    try {
      // Validate form
      if (!formData.name) {
        setError('Role name is required');
        return;
      }
      if (!formData.level) {
        setError('Role level is required');
        return;
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        level: parseInt(formData.level),
        permissions: formData.permissions
      };

      if (selectedRole) {
        // Update role
        await axios.put(`${API_BASE}/admin/roles/${selectedRole.id}`, payload);
        setSuccess('Role updated successfully');
      } else {
        // Create role
        await axios.post(`${API_BASE}/admin/roles`, payload);
        setSuccess('Role created successfully');
      }
      fetchRoles();
      handleCloseDialog();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role? This action cannot be undone.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_BASE}/admin/roles/${roleId}`);
      setSuccess('Role deleted successfully');
      fetchRoles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete role');
    }
  };

  const groupPermissionsByModule = () => {
    // Safely handle permissions object
    if (!permissions || typeof permissions !== 'object') {
      return {};
    }
    return permissions;
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 90 },
    {
      field: 'name',
      headerName: 'Role Name',
      flex: 1,
      minWidth: 160,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon sx={{ color: '#3b82f6', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'level',
      headerName: 'Level',
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={`Level ${params.value}`}
          size="small"
          sx={{ 
            bgcolor: '#8b5cf620', 
            color: '#8b5cf6',
            fontWeight: 500
          }}
        />
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1.2,
      minWidth: 200,
    },
    {
      field: 'user_count',
      headerName: 'Users',
      width: 110,
      renderCell: (params) => (
        <Chip 
          label={params.value || 0}
          size="small"
          sx={{ bgcolor: '#3b82f620', color: '#3b82f6' }}
        />
      ),
    },
    {
      field: 'permission_count',
      headerName: 'Permissions',
      width: 130,
      renderCell: (params) => (
        <Chip 
          label={params.value || 0}
          size="small"
          sx={{ bgcolor: '#10b98120', color: '#10b981' }}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params) => (
        <Box>
          <IconButton 
            size="small" 
            onClick={() => handleOpenDialog(params.row)}
            aria-label={`edit-role-${params.row.id}`}
            sx={{ color: '#3b82f6' }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={() => handleDeleteRole(params.row.id)}
            aria-label={`delete-role-${params.row.id}`}
            sx={{ color: '#f44336' }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const groupedPermissions = groupPermissionsByModule();

  if (loading && roles.length === 0) {
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
            {isMobile ? 'Roles' : 'Role Management'}
          </Typography>
          {!isMobile && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Create and manage roles and their permissions
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          data-testid="add-role-button"
          sx={{ 
            bgcolor: '#FF8A00',
            '&:hover': { bgcolor: '#CC6E00' }
          }}
        >
          New Role
        </Button>
      </Box>

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

      {/* Quick Stats */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Total Roles
              </Typography>
              <Typography variant="h4" sx={{ color: '#3b82f6', mt: 0.5, fontWeight: 700 }}>
                {roles.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Total Permissions
              </Typography>
              <Typography variant="h4" sx={{ color: '#10b981', mt: 0.5, fontWeight: 700 }}>
                {permissionsList.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                Permission Modules
              </Typography>
              <Typography variant="h4" sx={{ color: '#FF8A00', mt: 0.5, fontWeight: 700 }}>
                {Object.keys(groupedPermissions).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Roles Table */}
      <Paper sx={{ bgcolor: 'background.paper', height: 500, mb: 3 }}>
        <DataGrid
          rows={roles}
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

      {/* Role Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'background.paper', minHeight: 500 }
        }}
      >
        <DialogTitle sx={{ color: 'text.primary', borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon sx={{ color: '#FF8A00' }} />
            {selectedRole ? 'Edit Role' : 'Create New Role'}
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
          <Tab label="Permissions" />
        </Tabs>

        <DialogContent>
          {tabValue === 0 && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Role Name"
                  name="name"
                  data-testid="role-name-input"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., manager, editor, viewer"
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  name="description"
                  data-testid="role-description-input"
                  value={formData.description}
                  onChange={handleChange}
                  multiline
                  rows={2}
                  placeholder="Brief description of this role"
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Role Level (1-9)"
                  name="level"
                  data-testid="role-level-input"
                  type="number"
                  value={formData.level}
                  onChange={handleChange}
                  required
                  inputProps={{ min: 1, max: 9 }}
                  helperText="1 = highest privilege (Super Admin), 9 = lowest (Viewer)"
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' } }}
                />
              </Grid>
            </Grid>
          )}

          {tabValue === 1 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.primary', mb: 2 }}>
                Select Permissions
              </Typography>
              
              {Object.keys(groupedPermissions).length === 0 ? (
                <Paper sx={{ p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
                  <Typography sx={{ color: 'text.secondary' }}>
                    No permissions found. Please check your database.
                  </Typography>
                </Paper>
              ) : (
                Object.entries(groupedPermissions).map(([module, perms]) => {
                  // Ensure perms is an array
                  const modulePermissions = Array.isArray(perms) ? perms : [];
                  if (modulePermissions.length === 0) return null;
                  
                  const allSelected = modulePermissions.every(p => 
                    formData.permissions.includes(p.id)
                  );
                  
                  return (
                    <Accordion 
                      key={module}
                      sx={{ 
                        bgcolor: 'background.default',
                        color: 'text.primary',
                        mb: 1,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'text.primary' }} />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                          <Typography sx={{ textTransform: 'capitalize' }}>
                            {module.replace(/_/g, ' ')}
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
                                indeterminate={!allSelected && modulePermissions.some(p => 
                                  formData.permissions.includes(p.id)
                                )}
                                onChange={() => handleSelectAllPermissions(modulePermissions)}
                                size="small"
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
                                    checked={formData.permissions.includes(perm.id)}
                                    onChange={() => handlePermissionToggle(perm.id)}
                                    size="small"
                                    sx={{
                                      color: '#3b82f6',
                                      '&.Mui-checked': { color: '#3b82f6' },
                                    }}
                                  />
                                }
                                label={
                                  <Box>
                                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                      {perm.name}
                                    </Typography>
                                    {perm.description && (
                                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {perm.description}
                                      </Typography>
                                    )}
                                  </Box>
                                }
                                sx={{ 
                                  color: 'text.primary',
                                  alignItems: 'flex-start',
                                  m: 0,
                                  p: 1,
                                  borderRadius: 1,
                                  '&:hover': { bgcolor: 'action.hover' },
                                  width: '100%',
                                }}
                              />
                            </Grid>
                          ))}
                        </Grid>
                      </AccordionDetails>
                    </Accordion>
                  );
                })
              )}
            </Box>
          )}
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
            data-testid="save-role-button"
            startIcon={<SaveIcon />}
            sx={{ 
              bgcolor: '#FF8A00',
              '&:hover': { bgcolor: '#CC6E00' }
            }}
          >
            {selectedRole ? 'Update' : 'Create'} Role
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RoleManagement;