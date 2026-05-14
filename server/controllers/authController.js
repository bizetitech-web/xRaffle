import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = '7d';

const issueToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT 
        u.id,
        u.organization_id,
        u.name,
        u.email,
        u.password_hash,
        u.phone,
        u.is_active,
        u.created_at,
        o.name AS organization_name,
        o.code AS organization_code,
        o.email AS organization_email,
        o.phone AS organization_phone,
        o.address AS organization_address,
        o.city AS organization_city,
        o.state AS organization_state,
        o.country AS organization_country,
        o.postal_code AS organization_postal_code,
        ur.role_id,
        r.name AS role_name,
        r.level AS role_level
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      // Use generic error message to prevent user enumeration
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    
    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive. Please contact support.' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login timestamp (skip if column doesn't exist)
    try {
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    } catch (err) {
      // Column last_login may not exist in current schema; ignore
    }

    // Get user permissions (optional - can be fetched on demand)
    const [permissions] = await pool.query(
      `SELECT p.name, p.module
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [user.role_id]
    );

    // Generate token with comprehensive payload
    const token = issueToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role_name || 'user',
      roleId: user.role_id,
      roleLevel: user.role_level,
      organizationId: user.organization_id,
      organization: { 
        id: user.organization_id, 
        name: user.organization_name,
        code: user.organization_code 
      },
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.name?.split(' ')[0] || '',
        lastName: user.name?.split(' ').slice(1).join(' ') || '',
        role: {
          id: user.role_id,
          name: user.role_name || 'user',
          level: user.role_level
        },
        organization: { 
          id: user.organization_id, 
          name: user.organization_name,
          code: user.organization_code
        },
        permissions: permissions.map(p => p.name), // Optional: include basic permissions
        lastLogin: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [rows] = await pool.query(
      `SELECT 
        u.id,
        u.organization_id,
        u.name,
        u.email,
        u.password_hash,
        u.phone,
        u.is_active,
        u.created_at,
        o.name AS organization_name,
        o.code AS organization_code,
        ur.role_id,
        r.name AS role_name,
        r.level AS role_level
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const firstName = user.first_name || user.name?.split(' ')[0] || '';
    const lastName = user.last_name || user.name?.split(' ').slice(1).join(' ') || '';

    // Get user permissions
    const [permissions] = await pool.query(
      `SELECT p.name, p.module
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [user.role_id]
    );

    return res.json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName,
        lastName,
        phone: user.phone,
        role: {
          id: user.role_id,
          name: user.role_name || 'user',
          level: user.role_level
        },
        organization: { 
          id: user.organization_id, 
          name: user.organization_name,
          code: user.organization_code,
          email: user.organization_email,
          phone: user.organization_phone,
          address: user.organization_address,
          city: user.organization_city,
          state: user.organization_state,
          country: user.organization_country,
          postalCode: user.organization_postal_code
        },
        permissions: permissions.map(p => p.name),
        isActive: user.is_active,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      } 
    });
  } catch (error) {
    console.error('Profile error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { firstName, lastName, email, phone } = req.body;

    const safeFirstName = (firstName || '').trim();
    const safeLastName = (lastName || '').trim();
    const safeEmail = (email || '').trim().toLowerCase();
    const safePhone = typeof phone === 'string' ? phone.trim() : null;
    const fullName = `${safeFirstName} ${safeLastName}`.trim();

    if (!fullName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    const [emailCheck] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
      [safeEmail, userId]
    );

    if (emailCheck.length > 0) {
      return res.status(400).json({ error: 'Email already in use by another account' });
    }

    await pool.query(
      `UPDATE users
       SET name = ?, first_name = ?, last_name = ?, email = ?, phone = ?, updated_at = NOW()
       WHERE id = ?`,
      [fullName, safeFirstName, safeLastName, safeEmail, safePhone || null, userId]
    );

    return res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Optional: Refresh token endpoint
export const refreshToken = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [rows] = await pool.query(
            `SELECT u.id, u.organization_id, u.name, u.email, u.password_hash, u.phone, u.is_active, u.created_at,
              o.name AS organization_name, o.code AS organization_code,
              ur.role_id, r.name AS role_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    const token = issueToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role_name || 'user',
      roleId: user.role_id,
      organizationId: user.organization_id,
      organization: { 
        id: user.organization_id, 
        name: user.organization_name,
        code: user.organization_code 
      },
    });

    return res.json({ token });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
};

// Optional: Logout (client-side only, but can blacklist tokens if needed)
export const logout = async (req, res) => {
  // In a stateless JWT setup, logout is handled client-side by removing the token
  // For enhanced security, you could implement a token blacklist here
  return res.json({ message: 'Logged out successfully' });
};