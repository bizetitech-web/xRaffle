import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Toolbar,
  useMediaQuery,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Settings as SettingsIcon,
  Help as HelpIcon,
  Lock as LockIcon,
  Person as UsersIcon,
  Security as RolesIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
const drawerWidth = 240;
const miniDrawerWidth = 72;

const Sidebar = ({ open, variant, onClose }) => {
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width:768px)');
  const isMini = isMobile || (variant === 'permanent' && !open);
  const { hasPermission } = useAuth();
  const muiTheme = useMuiTheme();

  // Helper function to check if menu item should be shown
  const canShowMenuItem = (item) => {
    // Check by required permissions
    if (item.requiredPermissions && item.requiredPermissions.length > 0) {
      return item.requiredPermissions.some(perm => hasPermission(perm));
    }

    return true;
  };

  const mainMenuItems = [];

  // Admin menu items (only for super_admin and org_admin)
  const adminMenuItems = [
    { 
      text: 'Users', 
      icon: <UsersIcon />, 
      path: '/admin/users',
      requiredPermissions: ['MANAGE_USERS']
    },
    { 
      text: 'Roles', 
      icon: <RolesIcon />, 
      path: '/admin/roles',
      requiredPermissions: ['MANAGE_ROLES']
    },
    { 
      text: 'Permissions',
      icon: <LockIcon />, 
      path: '/admin/permissions',
      requiredPermissions: ['MANAGE_ROLES']
    },
    { 
      text: 'Hotels', 
      icon: <BusinessIcon />, 
      path: '/admin/organization',
      requiredPermissions: ['MANAGE_HOTELS']
    },
    {
      text: 'Hotel Branches',
      icon: <BusinessIcon />,
      path: '/admin/branches',
      requiredPermissions: ['MANAGE_HOTELS']
    },
  ];

  // System menu items
  const systemMenuItems = [
    { 
      text: 'Settings', 
      icon: <SettingsIcon />, 
      path: '/settings',
      requiredPermissions: ['MANAGE_USERS'],
    },
    { 
      text: 'Help', 
      icon: <HelpIcon />, 
      path: '/help',
    },
  ];

  // Filter menu items based on user role
  const filteredMainItems = mainMenuItems.filter(canShowMenuItem);
  const filteredAdminItems = adminMenuItems.filter(canShowMenuItem);
  const filteredSystemItems = systemMenuItems.filter(canShowMenuItem);

  const renderMenuItem = (item) => (
    <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
      <ListItemButton
        component={NavLink}
        to={item.path}
        selected={location.pathname === item.path}
        sx={{
          minHeight: 48,
          justifyContent: isMini ? 'center' : 'initial',
          px: 2.5,
          '&.Mui-selected': {
            backgroundColor: muiTheme.palette.action.selected,
            '&:hover': {
              backgroundColor: muiTheme.palette.action.hover,
            },
          },
          '&:hover': {
            backgroundColor: muiTheme.palette.action.hover,
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            mr: isMini ? 'auto' : 3,
            justifyContent: 'center',
            color: location.pathname === item.path ? muiTheme.palette.primary.main : muiTheme.palette.text.primary,
            '& svg': { fontSize: 20 },
          }}
        >
          {item.icon}
        </ListItemIcon>
        {!isMini && (
          <ListItemText
            primary={item.text}
            primaryTypographyProps={{ sx: { fontSize: 14, fontWeight: 500 } }}
          />
        )}
      </ListItemButton>
    </ListItem>
  );

  const drawerSx = {
    width: isMini ? miniDrawerWidth : drawerWidth,
    flexShrink: 0,
    '& .MuiDrawer-paper': {
      width: isMini ? miniDrawerWidth : drawerWidth,
      boxSizing: 'border-box',
      backgroundColor: muiTheme.palette.background.sidebar || muiTheme.palette.background.paper,
      borderRight: `1px solid ${muiTheme.palette.divider}`,
      overflowX: 'hidden',
      transition: 'width 0.3s',
    },
  };

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={drawerSx}
    >
      <Toolbar />
      <Box sx={{ overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Main Menu */}
        {filteredMainItems.length > 0 && (
          <List>
            {filteredMainItems.map(renderMenuItem)}
          </List>
        )}

        {/* Admin Section */}
        {filteredAdminItems.length > 0 && (
          <>
            {!isMini && (
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="subtitle2" sx={{ color: muiTheme.palette.text.secondary }}>
                  ADMINISTRATION
                </Typography>
              </Box>
            )}
            <List>
              {filteredAdminItems.map(renderMenuItem)}
            </List>
            <Divider sx={{ borderColor: muiTheme.palette.divider }} />
          </>
        )}

        {/* System Section */}
        {filteredSystemItems.length > 0 && (
          <>
            {!isMini && (
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="subtitle2" sx={{ color: muiTheme.palette.text.secondary }}>
                  SYSTEM
                </Typography>
              </Box>
            )}
            <List>
              {filteredSystemItems.map(renderMenuItem)}
            </List>
            <Divider sx={{ borderColor: muiTheme.palette.divider }} />
          </>
        )}

        {!isMini && (
          <Box sx={{ mt: 'auto', p: 2 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              © 2026 xRaffle
            </Typography>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default Sidebar;