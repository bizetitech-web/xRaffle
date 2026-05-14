import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists and is active
    const [users] = await pool.query(
      'SELECT id, organization_id, is_active FROM users WHERE id = ?',
      [decoded.sub]
    );

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Attach user info to request
    req.user = {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      role_level: decoded.roleLevel,
      organization_id: decoded.organizationId
    };
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};