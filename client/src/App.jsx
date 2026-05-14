import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/auth/PrivateRoute';
import RoleGuard from './components/auth/RoleGuard';
import Layout from './components/layout/Layout';
import Login from './pages/auth/Login';
import Settings from './pages/Settings';
import Help from './pages/Help';

// Admin pages
import UserManagement from './pages/admin/UserManagement';
import RoleManagement from './pages/admin/RoleManagement';
import Permissions from './pages/admin/Permissions';
import OrganizationSettings from './pages/admin/OrganizationSettings';

function App() {
  return (
    <ThemeProvider>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            
            {/* Protected routes with Layout */}
            <Route path="/" element={
              <PrivateRoute>
                <Navigate to="/admin/users" replace />
              </PrivateRoute>
            } />
            
            <Route path="/settings" element={
              <PrivateRoute>
                <RoleGuard requiredPermissions={['MANAGE_USERS']}>
                  <Layout>
                    <Settings />
                  </Layout>
                </RoleGuard>
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
                <RoleGuard requiredPermissions={['MANAGE_ORGANIZATIONS']}>
                  <Layout>
                    <OrganizationSettings />
                  </Layout>
                </RoleGuard>
              </PrivateRoute>
            } />
            
            {/* Redirect unknown routes */}
            <Route path="*" element={<Navigate to="/admin/users" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;