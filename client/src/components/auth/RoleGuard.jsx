import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Box, Typography, Button } from '@mui/material';

/**
 * RoleGuard component to restrict access based on permissions
 * @param {Object} props
 * @param {React.ReactNode} props.children - Component to render if authorized
 * @param {string[]} [props.requiredPermissions] - Required permissions
 * @param {string} [props.fallbackPath] - Path to redirect if unauthorized
 */
const RoleGuard = ({ 
  children, 
  requiredPermissions = [],
  requireAnyPermission = false,
  fallbackPath = '/admin/users'
}) => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();

  // Check if user is authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check permissions
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requireAnyPermission
      ? requiredPermissions.some(perm => hasPermission(perm))
      : requiredPermissions.every(perm => hasPermission(perm));
    
    if (!hasRequiredPermissions) {
      return (
        <Box 
          sx={{ 
            p: 4, 
            textAlign: 'center',
            bgcolor: '#1a1a1a',
            borderRadius: 2,
            maxWidth: 400,
            mx: 'auto',
            mt: 4
          }}
        >
          <Typography variant="h6" sx={{ color: '#f1f1f1', mb: 2 }}>
            Permission Denied
          </Typography>
          <Typography variant="body2" sx={{ color: '#aaaaaa', mb: 3 }}>
            You don't have the required permissions.
          </Typography>
          <Button 
            variant="contained" 
            onClick={() => navigate(fallbackPath)}
          >
            Go to User Management
          </Button>
        </Box>
      );
    }
  }

  // If all checks pass, render children
  return children;
};

export default RoleGuard;