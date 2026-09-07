import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, CssBaseline, Typography } from '@mui/material';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { SnackbarProvider } from 'notistack';
import PrivateRoute from './components/auth/PrivateRoute';
import RoleGuard from './components/auth/RoleGuard';
import Layout from './components/layout/Layout';
import Login from './pages/auth/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Help from './pages/Help';

// Admin pages
import UserManagement from './pages/admin/UserManagement';
import RoleManagement from './pages/admin/RoleManagement';
import Permissions from './pages/admin/Permissions';
import OrganizationSettings from './pages/admin/OrganizationSettings';
import WalletManagement from './pages/admin/WalletManagement';
import BranchManagement from './pages/admin/BranchManagement';
import GameTemplateWizard from './pages/admin/GameTemplateWizard';
import GameTemplates from './pages/admin/GameTemplates';
import GameBoard from './pages/admin/GameBoard';
import Playground from './pages/admin/Playground';
import HotelChargeTemplates from './pages/admin/HotelChargeTemplates';
// Games module removed

const GlobalOverviewReport = lazy(() => import('./pages/admin/GlobalOverviewReport'));
const BranchDailyReport = lazy(() => import('./pages/admin/BranchDailyReport'));
const CompanyWalletReport = lazy(() => import('./pages/admin/CompanyWalletReport'));

const reportsFallback = (
  <Box
    sx={{
      minHeight: 220,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1.5,
    }}
  >
    <CircularProgress size={26} />
    <Typography variant="body2" color="text.secondary">
      Loading report...
    </Typography>
  </Box>
);

function App() {
  return (
    <ThemeProvider>
      <CssBaseline />
      <AuthProvider>
        <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            
            {/* Protected routes with Layout */}
            <Route path="/" element={
              <PrivateRoute>
                <Navigate to="/dashboard" replace />
              </PrivateRoute>
            } />

            <Route path="/dashboard" element={
              <PrivateRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </PrivateRoute>
            } />
            
            <Route path="/settings" element={
              <PrivateRoute>
                <Layout>
                  <Settings />
                </Layout>
              </PrivateRoute>
            } />
            
            <Route path="/help" element={
              <PrivateRoute>
                <Layout>
                  <Help />
                </Layout>
              </PrivateRoute>
            } />
            
            {/* Admin routes */}
            <Route path="/admin/users" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_USERS']}>
                  <Layout>
                    <UserManagement />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />
            
            <Route path="/admin/roles" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_ROLES']}>
                  <Layout>
                    <RoleManagement />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/permissions" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_ROLES']}>
                  <Layout>
                    <Permissions />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />
            
            <Route path="/admin/organization" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_HOTELS']}>
                  <Layout>
                    <OrganizationSettings />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/wallets" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_WALLET']}>
                  <Layout>
                    <WalletManagement />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/branches" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_HOTEL']}>
                  <Layout>
                    <BranchManagement />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/game-templates" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={["MANAGE_GAMES"]}>
                  <Layout>
                    <GameTemplates />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/game-templates/new" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={["MANAGE_GAMES"]}>
                  <Layout>
                    <GameTemplateWizard />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/game-templates/edit/:id" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={["MANAGE_GAMES"]}>
                  <Layout>
                    <GameTemplateWizard />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/games" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_GAMES']}>
                  <Layout>
                    <GameBoard />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/games/:sessionId/board" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_GAMES']}>
                  <Layout>
                    <GameBoard />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/games/:sessionId/playground" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_GAMES']}>
                  <Layout>
                    <Playground />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/hotel-charge-templates" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_FEE_TEMPLATES']}>
                  <Layout>
                    <HotelChargeTemplates />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            {/* Games module removed */}

            <Route path="/admin/reports/global" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_GLOBAL_REPORTS']}>
                  <Layout>
                    <Suspense fallback={reportsFallback}>
                      <GlobalOverviewReport />
                    </Suspense>
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/reports/branch-daily" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_DAILY_REPORTS']}>
                  <Layout>
                    <Suspense fallback={reportsFallback}>
                      <BranchDailyReport />
                    </Suspense>
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />

            <Route path="/admin/reports/company-wallet" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['VIEW_DAILY_REPORTS']}>
                  <Layout>
                    <Suspense fallback={reportsFallback}>
                      <CompanyWalletReport />
                    </Suspense>
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />
            
            {/* Redirect unknown routes */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </BrowserRouter>
        </SnackbarProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;