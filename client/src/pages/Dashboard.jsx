import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, permissions, hasPermission, isSuperAdmin } = useAuth();

  const reportLinks = [
    {
      label: 'Global Overview',
      path: '/admin/reports/global',
      allowed: hasPermission('VIEW_GLOBAL_REPORTS'),
    },
    {
      label: 'Branch Daily',
      path: '/admin/reports/branch-daily',
      allowed: hasPermission('VIEW_REPORTS'),
    },
    {
      label: 'Company Wallet',
      path: '/admin/reports/company-wallet',
      allowed: hasPermission('VIEW_REPORTS'),
    },
  ].filter((item) => item.allowed);

  const adminLinks = [
    {
      label: 'Manage Users',
      path: '/admin/users',
      allowed: hasPermission('MANAGE_USERS'),
    },
    {
      label: 'Manage Roles',
      path: '/admin/roles',
      allowed: hasPermission('MANAGE_ROLES'),
    },
    {
      label: 'Hotels',
      path: '/admin/organization',
      allowed: hasPermission('MANAGE_HOTELS'),
    },
    {
      label: 'Branches',
      path: '/admin/branches',
      allowed: hasPermission('MANAGE_HOTELS'),
    },
  ].filter((item) => item.allowed);

  const summaryCards = [
    {
      title: 'Role',
      value: user?.role?.name || 'Unknown',
      helper: isSuperAdmin() ? 'Platform-wide access' : 'Scoped organization access',
    },
    {
      title: 'Organization',
      value: user?.organization?.name || 'Not assigned',
      helper: user?.organization?.code || 'No code available',
    },
    {
      title: 'Permissions',
      value: String(permissions?.length || 0),
      helper: 'Effective permissions loaded',
    },
    {
      title: 'Report Access',
      value: String(reportLinks.length),
      helper: 'Available report pages',
    },
  ];

  return (
    <Box>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}. Jump into reports or administration tasks from here.
        </Typography>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {summaryCards.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  {card.title}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {card.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {card.helper}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Reports
              </Typography>
              {reportLinks.length > 0 ? (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {reportLinks.map((link) => (
                    <Chip
                      key={link.path}
                      label={link.label}
                      color="primary"
                      variant="outlined"
                      onClick={() => navigate(link.path)}
                      clickable
                    />
                  ))}
                </Stack>
              ) : (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  You do not currently have report permissions.
                </Alert>
              )}
              {reportLinks[0] && (
                <Button variant="contained" onClick={() => navigate(reportLinks[0].path)}>
                  Open {reportLinks[0].label}
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Administration
              </Typography>
              {adminLinks.length > 0 ? (
                <Stack spacing={1}>
                  {adminLinks.map((link) => (
                    <Button
                      key={link.path}
                      variant="text"
                      onClick={() => navigate(link.path)}
                      sx={{ justifyContent: 'flex-start' }}
                    >
                      {link.label}
                    </Button>
                  ))}
                </Stack>
              ) : (
                <Alert severity="info">No admin pages are available for your role.</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
