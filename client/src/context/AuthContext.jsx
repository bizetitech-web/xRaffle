import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [permissions, setPermissions] = useState([]);

  useEffect(() => {
    // Check for stored token on mount
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        // Check if token is expired
        if (decoded.exp * 1000 > Date.now()) {
          setAuthToken(token);
          fetchProfile();
        } else {
          localStorage.removeItem('token');
          setLoading(false);
        }
      } catch (err) {
        localStorage.removeItem('token');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const setAuthToken = (token) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${API_BASE}/auth/profile`);
      setUser(response.data.user);
      setPermissions(response.data.user.permissions || []);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setError(null);
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email,
        password
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      setAuthToken(token);
      setUser(user);
      setPermissions(user.permissions || []);
      
      return { success: true };
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      return { success: false, error: err.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setAuthToken(null);
    setUser(null);
    setPermissions([]);
  };

  // Permission check functions
  const hasPermission = (permissionName) => {
    if (!permissions || permissions.length === 0) return false;
    
    // Super admins implicitly have all permissions.
    if (user?.role?.level === 1) return true;
    
    return permissions.includes(permissionName);
  };

  const normalizedRoleName = () => {
    return (user?.role?.name || '')
      .toLowerCase()
      .replace(/[\s_-]/g, '');
  };

  const isSuperAdmin = () => {
    return normalizedRoleName() === 'superadmin' || user?.role?.level === 1;
  };

  const value = {
    user,
    loading,
    error,
    permissions,
    login,
    logout,
    fetchProfile,
    isAuthenticated: !!user,
    // Permission functions
    hasPermission,
    // Role check functions
    isSuperAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};