import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export const User = {
  // Find user by email with role info
  async findByEmail(email) {
    const [rows] = await pool.query(`
      SELECT 
        u.*, 
        r.id as role_id, 
        r.name as role_name,
        r.level as role_level
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.email = ?
    `, [email]);
    return rows[0];
  },

  // Find user by ID with organization and role
  async findById(id) {
    const [rows] = await pool.query(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.phone,
        u.hotel_company_id, u.branch_id, u.is_active, u.last_login, u.created_at,
        o.name as hotel_company_name,
        r.id as role_id, r.name as role_name, r.level as role_level
      FROM users u
      JOIN hotel_companies o ON u.hotel_company_id = o.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ?
    `, [id]);
    return rows[0];
  },

  // Create new user with UUID
  async create(userData) {
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    await pool.query(
      `INSERT INTO users (
        id, hotel_company_id, branch_id, email, password_hash, 
        first_name, last_name, phone, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId,
        userData.hotel_company_id,
        userData.branch_id || null,
        userData.email,
        hashedPassword,
        userData.first_name,
        userData.last_name,
        userData.phone || null,
        userData.is_active ?? 1
      ]
    );
    
    return userId;
  },

  // Assign role to user
  async assignRole(userId, roleId) {
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleId]
    );
  },

  // Get user permissions
  async getUserPermissions(userId) {
    const [rows] = await pool.query(`
      SELECT DISTINCT p.* 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?
    `, [userId]);
    
    return rows;
  },

  // Check if user has specific permission
  async hasPermission(userId, permissionName) {
    const [rows] = await pool.query(`
      SELECT COUNT(*) as count
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ? AND p.name = ?
    `, [userId, permissionName]);
    
    return rows[0].count > 0;
  },

  // Update last login
  async updateLastLogin(userId) {
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [userId]
    );
  }
};