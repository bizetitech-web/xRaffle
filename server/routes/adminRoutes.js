import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { hasPermission, hasRoleLevel, canAccessOrganization } from '../middleware/rbac.js';
import pool from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const router = express.Router();

// All admin routes require authentication and organization access
router.use(authenticate);
router.use(canAccessOrganization);

/**
 * @access  Private (requires MANAGE_USERS permission)
 */
router.get('/users',
  hasPermission(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const isSuperAdmin = req.user.role_level === 1;
      const hotelCompanyId = isSuperAdmin
        ? (req.query.hotelCompanyId || req.hotelCompanyId)
        : req.hotelCompanyId;

      let query = `
        SELECT 
          u.id, u.email, u.name, u.first_name, u.last_name, 
          u.phone, u.is_active, u.last_login, u.created_at,
          u.hotel_company_id, u.branch_id,
          r.id as role_id, r.name as role_name, r.level as role_level,
          o.name as hotel_company_name,
          hb.name as branch_name
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON r.id = ur.role_id
        LEFT JOIN hotel_companies o ON u.hotel_company_id = o.id
        LEFT JOIN hotel_branches hb ON hb.id = u.branch_id
      `;

      const params = [];
      
      // Apply organization filter
      if (hotelCompanyId && !isSuperAdmin) {
        query += ` WHERE u.hotel_company_id = ?`;
        params.push(hotelCompanyId);
      } else if (hotelCompanyId && isSuperAdmin) {
        query += ` WHERE u.hotel_company_id = ?`;
        params.push(hotelCompanyId);
      }

      query += ` ORDER BY u.created_at DESC`;

      const [rows] = await pool.query(query, params);
      
      // Get permission counts for each user
      for (let user of rows) {
        if (user.role_id) {
          const [permCount] = await pool.query(
            `SELECT COUNT(*) as count FROM role_permissions WHERE role_id = ?`,
            [user.role_id]
          );
          user.permission_count = permCount[0].count;
        } else {
          user.permission_count = 0;
        }
      }

      res.json(rows);
    } catch (error) {
      console.error('Fetch users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get single user by ID
 * @access  Private (requires MANAGE_USERS permission)
 */
router.get('/users/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const hotelCompanyId = req.hotelCompanyId;
      const isSuperAdmin = req.user.role_level === 1;

      let query = `
        SELECT 
          u.*, 
          r.id as role_id, r.name as role_name, r.level as role_level,
          o.name as hotel_company_name,
          hb.name as branch_name
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON r.id = ur.role_id
        LEFT JOIN hotel_companies o ON u.hotel_company_id = o.id
        LEFT JOIN hotel_branches hb ON hb.id = u.branch_id
        WHERE u.id = ?
      `;
      
      const params = [id];
      
      // Non-super admins can only see users in their org
      if (!isSuperAdmin) {
        query += ` AND u.hotel_company_id = ?`;
        params.push(hotelCompanyId);
      }

      const [rows] = await pool.query(query, params);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = rows[0];

      // Get user's permissions
      if (user.role_id) {
        const [permissions] = await pool.query(
          `SELECT p.* FROM permissions p
           JOIN role_permissions rp ON p.id = rp.permission_id
           WHERE rp.role_id = ?`,
          [user.role_id]
        );
        user.permissions = permissions;
      } else {
        user.permissions = [];
      }

      // Get user's activity log
      const [auditLogs] = await pool.query(
        `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
        [id]
      );
      user.recent_activity = auditLogs;

      res.json(user);
    } catch (error) {
      console.error('Fetch user error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
);

/**
 * @route   POST /api/admin/users
 * @desc    Create new user
 * @access  Private (requires MANAGE_USERS permission)
 */
router.post('/users',
  hasPermission(['MANAGE_USERS']),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('roleId').isUUID(),
    body('hotelCompanyId').optional().isUUID(),
    body('branchId').optional({ nullable: true }).isUUID(),
    body('phone').optional(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        roleId,
        hotelCompanyId,
        branchId,
        phone
      } = req.body;

      const fullName = `${firstName} ${lastName}`.trim();
      const isSuperAdmin = req.user.role_level === 1;

      // Determine which organization to use
      let targetOrgId = hotelCompanyId;
      
      // If not super admin, force to their own organization
      if (!isSuperAdmin) {
        targetOrgId = req.hotelCompanyId;
      }

      if (!targetOrgId) {
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      // Check if email already exists
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Check if role exists and is accessible
      const [roleCheck] = await pool.query(
        'SELECT id, level FROM roles WHERE id = ?',
        [roleId]
      );

      if (roleCheck.length === 0) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Non-super admins cannot assign roles higher than their own
      if (!isSuperAdmin && roleCheck[0].level < req.user.role_level) {
        return res.status(403).json({ error: 'Cannot assign higher privilege role' });
      }

      // Check if organization exists
      const [orgCheck] = await pool.query(
        'SELECT id FROM hotel_companies WHERE id = ?',
        [targetOrgId]
      );

      if (orgCheck.length === 0) {
        return res.status(400).json({ error: 'Invalid organization' });
      }

      let targetBranchId = null;
      if (branchId) {
        const [branchCheck] = await pool.query(
          'SELECT id, company_id FROM hotel_branches WHERE id = ? LIMIT 1',
          [branchId]
        );

        if (branchCheck.length === 0 || branchCheck[0].company_id !== targetOrgId) {
          return res.status(400).json({ error: 'Invalid branch for selected hotel' });
        }

        targetBranchId = branchId;
      }

      const userId = uuidv4();
      const passwordHash = await bcrypt.hash(password, 12);

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Create user
        await connection.query(
          `INSERT INTO users (
            id, hotel_company_id, branch_id, email, password_hash, 
            first_name, last_name, name, phone, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
          [
            userId,
            targetOrgId,
            targetBranchId,
            email,
            passwordHash,
            firstName,
            lastName,
            fullName,
            phone || null
          ]
        );

        // Assign role
        await connection.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [userId, roleId]
        );

        // Log action
        await connection.query(
          `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user.sub,
            'CREATE_USER',
            'users',
            userId
          ]
        );

        await connection.commit();

        res.status(201).json({
          message: 'User created successfully',
          userId
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user
 * @access  Private (requires MANAGE_USERS permission)
 */
router.put('/users/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const hotelCompanyId = req.hotelCompanyId;
      const isSuperAdmin = req.user.role_level === 1;
      const {
        firstName,
        lastName,
        phone,
        roleId,
        branchId,
        isActive
      } = req.body;

      // Check if user exists and is in same org (unless super admin)
      let userCheckQuery = 'SELECT * FROM users WHERE id = ?';
      const userCheckParams = [id];
      
      if (!isSuperAdmin) {
        userCheckQuery += ' AND hotel_company_id = ?';
        userCheckParams.push(hotelCompanyId);
      }

      const [userCheck] = await pool.query(userCheckQuery, userCheckParams);

      if (userCheck.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const existingUser = userCheck[0];
      const fullName = firstName && lastName ? `${firstName} ${lastName}`.trim() : undefined;

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Update user
        const updates = [];
        const params = [];

        if (firstName) {
          updates.push('first_name = ?');
          params.push(firstName);
        }
        if (lastName) {
          updates.push('last_name = ?');
          params.push(lastName);
        }
        if (fullName) {
          updates.push('name = ?');
          params.push(fullName);
        }
        if (phone !== undefined) {
          updates.push('phone = ?');
          params.push(phone);
        }
        if (branchId !== undefined) {
          if (branchId === null) {
            updates.push('branch_id = NULL');
          } else {
            const [branchCheck] = await connection.query(
              'SELECT id, company_id FROM hotel_branches WHERE id = ? LIMIT 1',
              [branchId]
            );

            if (branchCheck.length === 0 || branchCheck[0].company_id !== existingUser.hotel_company_id) {
              throw new Error('Invalid branch for user organization');
            }

            updates.push('branch_id = ?');
            params.push(branchId);
          }
        }
        if (isActive !== undefined) {
          updates.push('is_active = ?');
          params.push(isActive ? 1 : 0);
        }
        
        updates.push('updated_at = NOW()');

        if (updates.length > 1) { // More than just updated_at
          params.push(id);
          await connection.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            params
          );
        }

        // Update role if provided
        if (roleId) {
          // Check if role exists
          const [roleCheck] = await connection.query(
            'SELECT id FROM roles WHERE id = ?',
            [roleId]
          );
          
          if (roleCheck.length > 0) {
            // Check if user already has a role
            const [existingRole] = await connection.query(
              'SELECT role_id FROM user_roles WHERE user_id = ?',
              [id]
            );
            
            if (existingRole.length > 0) {
              await connection.query(
                'UPDATE user_roles SET role_id = ? WHERE user_id = ?',
                [roleId, id]
              );
            } else {
              await connection.query(
                'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
                [id, roleId]
              );
            }
          }
        }

        // Log action
        await connection.query(
          `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user.sub,
            'UPDATE_USER',
            'users',
            id
          ]
        );

        await connection.commit();

        res.json({ message: 'User updated successfully' });
      } catch (error) {
        await connection.rollback();
        if (error.message === 'Invalid branch for user organization') {
          return res.status(400).json({ error: error.message });
        }
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

/**
 * @route   PUT /api/admin/users/:id/status
 * @desc    Activate or deactivate user
 * @access  Private (requires MANAGE_USERS permission)
 */
router.put('/users/:id/status',
  param('id').isUUID(),
  hasPermission(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { isActive } = req.body;
      const hotelCompanyId = req.hotelCompanyId;
      const isSuperAdmin = req.user.role_level === 1;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean value' });
      }

      // Prevent users from deactivating themselves.
      if (id === req.user.sub && !isActive) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }

      let userCheckQuery = 'SELECT id FROM users WHERE id = ?';
      const userCheckParams = [id];

      if (!isSuperAdmin) {
        userCheckQuery += ' AND hotel_company_id = ?';
        userCheckParams.push(hotelCompanyId);
      }

      const [userCheck] = await pool.query(userCheckQuery, userCheckParams);

      if (userCheck.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      await pool.query(
        'UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?',
        [isActive ? 1 : 0, id]
      );

      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.user.sub,
          isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
          'users',
          id
        ]
      );

      res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }
);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user (soft delete)
 * @access  Private (requires MANAGE_USERS permission)
 */
router.delete('/users/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const hotelCompanyId = req.hotelCompanyId;
      const isSuperAdmin = req.user.role_level === 1;

      // Check if user exists and is in same org (unless super admin)
      let userCheckQuery = 'SELECT * FROM users WHERE id = ?';
      const userCheckParams = [id];
      
      if (!isSuperAdmin) {
        userCheckQuery += ' AND hotel_company_id = ?';
        userCheckParams.push(hotelCompanyId);
      }

      const [userCheck] = await pool.query(userCheckQuery, userCheckParams);

      if (userCheck.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Soft delete - deactivate user
      await pool.query(
        'UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?',
        [id]
      );

      // Log action
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.user.sub,
          'DELETE_USER',
          'users',
          id
        ]
      );

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

// ==================== ROLE MANAGEMENT ====================

/**
 * @route   GET /api/admin/roles
 * @desc    Get all roles
 * @access  Private (requires MANAGE_ROLES permission)
 */
router.get('/roles',
  hasPermission(['MANAGE_ROLES']),
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT 
          r.*,
          COUNT(DISTINCT ur.user_id) as user_count,
          COUNT(DISTINCT rp.permission_id) as permission_count
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        GROUP BY r.id
        ORDER BY r.level ASC
      `);

      // Get permissions for each role
      for (let role of rows) {
        const [permissions] = await pool.query(
          `SELECT p.name FROM permissions p
           JOIN role_permissions rp ON p.id = rp.permission_id
           WHERE rp.role_id = ?
           LIMIT 5`,
          [role.id]
        );
        role.permissions = permissions.map(p => p.name);
      }

      res.json(rows);
    } catch (error) {
      console.error('Fetch roles error:', error);
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  }
);

/**
 * @route   GET /api/admin/roles/:id
 * @desc    Get single role with permissions
 * @access  Private (requires MANAGE_ROLES permission)
 */
router.get('/roles/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_ROLES']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      const [roleRows] = await pool.query(
        'SELECT * FROM roles WHERE id = ?',
        [id]
      );

      if (roleRows.length === 0) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const role = roleRows[0];

      const [permissions] = await pool.query(
        `SELECT p.* FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = ?`,
        [id]
      );

      role.permissions = permissions;

      // Get users with this role
      const [users] = await pool.query(
        `SELECT u.id, u.name, u.email FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         WHERE ur.role_id = ?`,
        [id]
      );
      role.users = users;

      res.json(role);
    } catch (error) {
      console.error('Fetch role error:', error);
      res.status(500).json({ error: 'Failed to fetch role' });
    }
  }
);

/**
 * @route   POST /api/admin/roles
 * @desc    Create new role
 * @access  Private (requires MANAGE_ROLES permission, super admin only)
 */
router.post('/roles',
  hasRoleLevel(1), // Super admin only
  [
    body('name').notEmpty().trim(),
    body('level').isInt({ min: 1, max: 9 }),
    body('description').optional(),
    body('permissions').isArray(),
    body('permissions.*').isUUID(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, level, permissions } = req.body;
      const permissionIds = Array.from(new Set(permissions));

      if (permissionIds.length > 0) {
        const placeholders = permissionIds.map(() => '?').join(', ');
        const [permissionRows] = await pool.query(
          `SELECT id FROM permissions WHERE id IN (${placeholders})`,
          permissionIds
        );

        if (permissionRows.length !== permissionIds.length) {
          return res.status(400).json({ error: 'One or more permission IDs are invalid' });
        }
      }

      // Check if role name already exists
      const [existing] = await pool.query(
        'SELECT id FROM roles WHERE name = ?',
        [name]
      );

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Role name already exists' });
      }

      const roleId = uuidv4();

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Create role
        await connection.query(
          `INSERT INTO roles (id, name, description, level, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [roleId, name, description || null, level]
        );

        // Assign permissions
        for (const permId of permissionIds) {
          await connection.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [roleId, permId]
          );
        }

        // Log action
        await connection.query(
          `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user.sub,
            'CREATE_ROLE',
            'roles',
            roleId
          ]
        );

        await connection.commit();

        res.status(201).json({
          message: 'Role created successfully',
          roleId
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Create role error:', error);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
);

/**
 * @route   PUT /api/admin/roles/:id
 * @desc    Update role
 * @access  Private (requires MANAGE_ROLES permission, super admin only)
 */
router.put('/roles/:id',
  param('id').isUUID(),
  hasRoleLevel(1), // Super admin only
  [
    body('name').notEmpty().trim(),
    body('level').isInt({ min: 1, max: 9 }),
    body('description').optional(),
    body('permissions').isArray(),
    body('permissions.*').isUUID(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { name, description, level, permissions } = req.body;
      const permissionIds = Array.from(new Set(permissions));

      if (permissionIds.length > 0) {
        const placeholders = permissionIds.map(() => '?').join(', ');
        const [permissionRows] = await pool.query(
          `SELECT id FROM permissions WHERE id IN (${placeholders})`,
          permissionIds
        );

        if (permissionRows.length !== permissionIds.length) {
          return res.status(400).json({ error: 'One or more permission IDs are invalid' });
        }
      }

      // Check if role exists
      const [existing] = await pool.query(
        'SELECT * FROM roles WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Role not found' });
      }

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Update role
        await connection.query(
          `UPDATE roles SET name = ?, description = ?, level = ?, updated_at = NOW()
           WHERE id = ?`,
          [name, description || null, level, id]
        );

        // Update permissions
        await connection.query(
          'DELETE FROM role_permissions WHERE role_id = ?',
          [id]
        );

        for (const permId of permissionIds) {
          await connection.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [id, permId]
          );
        }

        // Log action
        await connection.query(
          `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user.sub,
            'UPDATE_ROLE',
            'roles',
            id
          ]
        );

        await connection.commit();

        res.json({ message: 'Role updated successfully' });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Update role error:', error);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

/**
 * @route   DELETE /api/admin/roles/:id
 * @desc    Delete role
 * @access  Private (requires MANAGE_ROLES permission, super admin only)
 */
router.delete('/roles/:id',
  param('id').isUUID(),
  hasRoleLevel(1), // Super admin only
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      // Check if role has users
      const [userCount] = await pool.query(
        'SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?',
        [id]
      );

      if (userCount[0].count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete role with assigned users. Reassign users first.' 
        });
      }

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Delete role permissions
        await connection.query(
          'DELETE FROM role_permissions WHERE role_id = ?',
          [id]
        );

        // Delete role
        await connection.query(
          'DELETE FROM roles WHERE id = ?',
          [id]
        );

        // Log action
        await connection.query(
          `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user.sub,
            'DELETE_ROLE',
            'roles',
            id
          ]
        );

        await connection.commit();

        res.json({ message: 'Role deleted successfully' });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Delete role error:', error);
      res.status(500).json({ error: 'Failed to delete role' });
    }
  }
);

// ==================== PERMISSION MANAGEMENT ====================

/**
 * @route   GET /api/admin/permissions
 * @desc    Get all permissions grouped by module
 * @access  Private (Super Admin only)
 */
router.get('/permissions',
  hasRoleLevel(1),
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT 
          p.*,
          COUNT(DISTINCT rp.role_id) as role_count
        FROM permissions p
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id
        GROUP BY p.id
        ORDER BY p.module, p.name
      `);

      // Group by module
      const grouped = rows.reduce((acc, perm) => {
        if (!acc[perm.module]) {
          acc[perm.module] = [];
        }
        acc[perm.module].push(perm);
        return acc;
      }, {});

      res.json(grouped);
    } catch (error) {
      console.error('Fetch permissions error:', error);
      res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  }
);

/**
 * @route   GET /api/admin/permissions/:id
 * @desc    Get single permission
 * @access  Private (Super Admin only)
 */
router.get('/permissions/:id',
  param('id').isUUID(),
  hasRoleLevel(1),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      const [rows] = await pool.query(
        `SELECT p.*, COUNT(DISTINCT rp.role_id) as role_count
         FROM permissions p
         LEFT JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE p.id = ?
         GROUP BY p.id`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Permission not found' });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('Fetch permission error:', error);
      res.status(500).json({ error: 'Failed to fetch permission' });
    }
  }
);

/**
 * @route   POST /api/admin/permissions
 * @desc    Create new permission
 * @access  Private (Super Admin only)
 */
router.post('/permissions',
  hasRoleLevel(1),
  [
    body('name').notEmpty().matches(/^[A-Z][A-Z0-9_]*$/),
    body('module').notEmpty(),
    body('description').optional(),
  ],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await connection.rollback();
        return res.status(400).json({ errors: errors.array() });
      }

      const permissionId = uuidv4();
      const { name, module, description } = req.body;

      // Check if permission name already exists
      const [existing] = await connection.query(
        'SELECT id FROM permissions WHERE name = ?',
        [name]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Permission name already exists' });
      }

      await connection.query(
        `INSERT INTO permissions (id, name, module, description, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [permissionId, name, module.toLowerCase(), description || null]
      );

      // Log action
      await connection.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, entity_type, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuidv4(),
          req.user.sub,
          'CREATE_PERMISSION',
          'permissions',
          'permission',
          permissionId,
        ]
      );

      await connection.commit();

      res.status(201).json({
        message: 'Permission created successfully',
        permissionId
      });
    } catch (error) {
      await connection.rollback();
      console.error('Create permission error:', error);
      res.status(500).json({ error: 'Failed to create permission' });
    } finally {
      connection.release();
    }
  }
);

/**
 * @route   PUT /api/admin/permissions/:id
 * @desc    Update permission
 * @access  Private (Super Admin only)
 */
router.put('/permissions/:id',
  param('id').isUUID(),
  hasRoleLevel(1),
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await connection.rollback();
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { name, module, description } = req.body;

      // Check if permission exists
      const [existing] = await connection.query(
        'SELECT * FROM permissions WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Permission not found' });
      }

      // Check if new name conflicts
      if (name && name !== existing[0].name) {
        const [nameCheck] = await connection.query(
          'SELECT id FROM permissions WHERE name = ? AND id != ?',
          [name, id]
        );
        if (nameCheck.length > 0) {
          await connection.rollback();
          return res.status(400).json({ error: 'Permission name already exists' });
        }
      }

      // Build update query
      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }
      if (module) {
        updates.push('module = ?');
        params.push(module.toLowerCase());
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description || null);
      }

      if (updates.length > 0) {
        params.push(id);
        await connection.query(
          `UPDATE permissions SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
      }

      // Log action
      await connection.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, entity_type, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuidv4(),
          req.user.sub,
          'UPDATE_PERMISSION',
          'permissions',
          'permission',
          id,
        ]
      );

      await connection.commit();

      res.json({ message: 'Permission updated successfully' });
    } catch (error) {
      await connection.rollback();
      console.error('Update permission error:', error);
      res.status(500).json({ error: 'Failed to update permission' });
    } finally {
      connection.release();
    }
  }
);

/**
 * @route   DELETE /api/admin/permissions/:id
 * @desc    Delete permission
 * @access  Private (Super Admin only)
 */
router.delete('/permissions/:id',
  param('id').isUUID(),
  hasRoleLevel(1),
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { id } = req.params;

      // Check if permission is assigned to any roles
      const [roleCount] = await connection.query(
        'SELECT COUNT(*) as count FROM role_permissions WHERE permission_id = ?',
        [id]
      );

      if (roleCount[0].count > 0) {
        // Remove from all roles first
        await connection.query(
          'DELETE FROM role_permissions WHERE permission_id = ?',
          [id]
        );
      }

      // Delete permission
      await connection.query(
        'DELETE FROM permissions WHERE id = ?',
        [id]
      );

      // Log action
      await connection.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, entity_type, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuidv4(),
          req.user.sub,
          'DELETE_PERMISSION',
          'permissions',
          'permission',
          id,
        ]
      );

      await connection.commit();

      res.json({ 
        message: 'Permission deleted successfully',
        removedFromRoles: roleCount[0].count
      });
    } catch (error) {
      await connection.rollback();
      console.error('Delete permission error:', error);
      res.status(500).json({ error: 'Failed to delete permission' });
    } finally {
      connection.release();
    }
  }
);

// ==================== ORGANIZATION MANAGEMENT ====================

/**
 * @route   GET /api/admin/hotel_companies
 * @desc    Get all hotel_companies (super admin only)
 * @access  Private (requires super admin)
 */
router.get('/hotel_companies',
  hasRoleLevel(1), // Only super admin (level 1)
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT 
          o.*,
          COUNT(DISTINCT u.id) as user_count
        FROM hotel_companies o
        LEFT JOIN users u ON o.id = u.hotel_company_id AND u.is_active = 1
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `);

      res.json(rows);
    } catch (error) {
      console.error('Fetch hotel_companies error:', error);
      res.status(500).json({ error: 'Failed to fetch hotel_companies' });
    }
  }
);

/**
 * @route   GET /api/admin/hotel_companies/:id
 * @desc    Get single organization by ID
 * @access  Private (requires super admin)
 */
router.get('/hotel_companies/:id',
  param('id').isUUID(),
  hasRoleLevel(1),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      const [rows] = await pool.query(
        'SELECT * FROM hotel_companies WHERE id = ?',
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const organization = rows[0];

      // Get organization stats
      const [userCount] = await pool.query(
        'SELECT COUNT(*) as count FROM users WHERE hotel_company_id = ? AND is_active = 1',
        [id]
      );
      const [branchCount] = await pool.query(
        'SELECT COUNT(*) as count FROM hotel_branches WHERE company_id = ?',
        [id]
      );

      organization.stats = {
        users: userCount[0].count,
        branches: branchCount[0].count,
      };

      res.json(organization);
    } catch (error) {
      console.error('Fetch organization error:', error);
      res.status(500).json({ error: 'Failed to fetch organization' });
    }
  }
);

/**
 * @route   GET /api/admin/hotel_companies/:id/stats
 * @desc    Get organization statistics
 * @access  Private (requires super admin or org admin)
 */
router.get('/hotel_companies/:id/stats',
  param('id').isUUID(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const userId = req.user.sub;
      const userRole = req.user.role_level;

      // Check authorization
      if (userRole > 2) { // Only super admin (1) and org admin (2)
        // For org admin, check if they belong to this org
        if (userRole === 2) {
          const [userCheck] = await pool.query(
            'SELECT hotel_company_id FROM users WHERE id = ?',
            [userId]
          );
          if (userCheck[0]?.hotel_company_id !== id) {
            return res.status(403).json({ error: 'Access denied' });
          }
        } else {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Get user count
      const [userCount] = await pool.query(
        'SELECT COUNT(*) as count FROM users WHERE hotel_company_id = ? AND is_active = 1',
        [id]
      );
      const [branchCount] = await pool.query(
        'SELECT COUNT(*) as count FROM hotel_branches WHERE company_id = ?',
        [id]
      );

      // Get recent users
      const [recentUsers] = await pool.query(
        `SELECT id, name, email, created_at 
         FROM users 
         WHERE hotel_company_id = ? 
         ORDER BY created_at DESC 
         LIMIT 5`,
        [id]
      );

      res.json({
        userCount: userCount[0].count,
        branchCount: branchCount[0].count,
        recentUsers
      });
    } catch (error) {
      console.error('Fetch org stats error:', error);
      res.status(500).json({ error: 'Failed to fetch organization statistics' });
    }
  }
);

/**
 * @route   POST /api/admin/hotel_companies
 * @desc    Create new organization
 * @access  Private (requires super admin)
 */
router.post('/hotel_companies',
  hasRoleLevel(1),
  [
    body('name').notEmpty().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional(),
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        email,
        phone,
        status = 'active'
      } = req.body;

      // Check if organization name already exists
      const [nameCheck] = await pool.query(
        'SELECT id FROM hotel_companies WHERE name = ?',
        [name]
      );

      if (nameCheck.length > 0) {
        return res.status(400).json({ error: 'Organization name already exists' });
      }

      const hotelCompanyId = uuidv4();

      await pool.query(
        `INSERT INTO hotel_companies (
          id, name, email, phone, status, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [
          hotelCompanyId,
          name,
          email || null,
          phone || null,
          status
        ]
      );

      // Log action
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.user.sub,
          'CREATE_ORGANIZATION',
          'hotel_companies',
          hotelCompanyId
        ]
      );

      res.status(201).json({
        message: 'Organization created successfully',
        hotelCompanyId
      });
    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({ error: 'Failed to create organization' });
    }
  }
);

/**
 * @route   PUT /api/admin/hotel_companies/:id
 * @desc    Update organization
 * @access  Private (requires super admin or org admin)
 */
router.put('/hotel_companies/:id',
  param('id').isUUID(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const userId = req.user.sub;
      const userRole = req.user.role_level;

      // Check authorization
      if (userRole > 2) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // For org admin, check if they belong to this org
      if (userRole === 2) {
        const [userCheck] = await pool.query(
          'SELECT hotel_company_id FROM users WHERE id = ?',
          [userId]
        );
        if (userCheck[0]?.hotel_company_id !== id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        name,
        email,
        phone,
        status,
        isActive
      } = req.body;

      // Build update query
      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }
      if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }
      if (status) {
        updates.push('status = ?');
        params.push(status);
      }
      if (isActive !== undefined) {
        updates.push('is_active = ?');
        params.push(isActive ? 1 : 0);
      }

      updates.push('updated_at = NOW()');

      if (updates.length === 1) { // Only updated_at
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(id);

      await pool.query(
        `UPDATE hotel_companies SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      // Log action
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          userId,
          'UPDATE_ORGANIZATION',
          'hotel_companies',
          id
        ]
      );

      res.json({ message: 'Organization updated successfully' });
    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({ error: 'Failed to update organization' });
    }
  }
);

/**
 * @route   PUT /api/admin/hotel_companies/:id/status
 * @desc    Update organization status
 * @access  Private (requires super admin)
 */
router.put('/hotel_companies/:id/status',
  param('id').isUUID(),
  hasRoleLevel(1),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { isActive } = req.body;

      await pool.query(
        'UPDATE hotel_companies SET is_active = ?, updated_at = NOW() WHERE id = ?',
        [isActive ? 1 : 0, id]
      );

      // Log action
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.user.sub,
          isActive ? 'ACTIVATE_ORGANIZATION' : 'DEACTIVATE_ORGANIZATION',
          'hotel_companies',
          id
        ]
      );

      res.json({ message: `Organization ${isActive ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
      console.error('Update organization status error:', error);
      res.status(500).json({ error: 'Failed to update organization status' });
    }
  }
);

/**
 * @route   DELETE /api/admin/hotel_companies/:id
 * @desc    Delete organization (super admin only)
 * @access  Private (requires super admin)
 */
router.delete('/hotel_companies/:id',
  param('id').isUUID(),
  hasRoleLevel(1),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      // Check if organization has users
      const [userCheck] = await pool.query(
        'SELECT COUNT(*) as count FROM users WHERE hotel_company_id = ?',
        [id]
      );

      if (userCheck[0].count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete organization with existing users. Deactivate it instead.' 
        });
      }

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Delete organization
        await connection.query('DELETE FROM hotel_companies WHERE id = ?', [id]);

        await connection.commit();

        // Log action
        await pool.query(
          `INSERT INTO audit_logs (id, user_id, action, table_name, record_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user.sub,
            'DELETE_ORGANIZATION',
            'hotel_companies',
            id
          ]
        );

        res.json({ message: 'Organization deleted successfully' });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Delete organization error:', error);
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  }
);

// ==================== HOTEL BRANCH MANAGEMENT ====================

/**
 * @route   GET /api/admin/hotel_branches
 * @desc    Get hotel branches (super admin sees all; others restricted to own hotel)
 * @access  Private (requires MANAGE_HOTELS)
 */
router.get('/hotel_branches',
  hasPermission(['MANAGE_HOTELS']),
  async (req, res) => {
    try {
      const isSuperAdmin = req.user.role_level === 1;
      const requestedCompanyId = req.query.companyId;
      const effectiveCompanyId = isSuperAdmin ? requestedCompanyId : req.hotelCompanyId;

      let sql = `
        SELECT hb.*, hc.name AS company_name
        FROM hotel_branches hb
        JOIN hotel_companies hc ON hc.id = hb.company_id
      `;
      const params = [];

      if (effectiveCompanyId) {
        sql += ' WHERE hb.company_id = ?';
        params.push(effectiveCompanyId);
      }

      sql += ' ORDER BY hb.created_at DESC';

      const [rows] = await pool.query(sql, params);
      res.json(rows);
    } catch (error) {
      console.error('Fetch hotel branches error:', error);
      res.status(500).json({ error: 'Failed to fetch hotel branches' });
    }
  }
);

/**
 * @route   GET /api/admin/hotel_branches/:id
 * @desc    Get hotel branch by ID
 * @access  Private (requires MANAGE_HOTELS)
 */
router.get('/hotel_branches/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_HOTELS']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const isSuperAdmin = req.user.role_level === 1;
      const { id } = req.params;

      let sql = `
        SELECT hb.*, hc.name AS company_name
        FROM hotel_branches hb
        JOIN hotel_companies hc ON hc.id = hb.company_id
        WHERE hb.id = ?
      `;
      const params = [id];

      if (!isSuperAdmin) {
        sql += ' AND hb.company_id = ?';
        params.push(req.hotelCompanyId);
      }

      const [rows] = await pool.query(sql, params);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('Fetch hotel branch error:', error);
      res.status(500).json({ error: 'Failed to fetch hotel branch' });
    }
  }
);

/**
 * @route   POST /api/admin/hotel_branches
 * @desc    Create hotel branch
 * @access  Private (requires MANAGE_HOTELS)
 */
router.post('/hotel_branches',
  hasPermission(['MANAGE_HOTELS']),
  [
    body('name').notEmpty().trim(),
    body('branchCode').notEmpty().trim(),
    body('companyId').optional().isUUID(),
    body('city').optional(),
    body('address').optional(),
    body('phone').optional(),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const isSuperAdmin = req.user.role_level === 1;
      const {
        companyId,
        name,
        branchCode,
        city,
        address,
        phone,
        status = 'ACTIVE',
      } = req.body;

      const targetCompanyId = isSuperAdmin ? (companyId || req.hotelCompanyId) : req.hotelCompanyId;
      if (!targetCompanyId) {
        return res.status(400).json({ error: 'Hotel company is required' });
      }

      const [companyRows] = await pool.query(
        'SELECT id FROM hotel_companies WHERE id = ? LIMIT 1',
        [targetCompanyId]
      );
      if (companyRows.length === 0) {
        return res.status(400).json({ error: 'Invalid hotel company' });
      }

      const [existingCode] = await pool.query(
        'SELECT id FROM hotel_branches WHERE branch_code = ? LIMIT 1',
        [branchCode]
      );
      if (existingCode.length > 0) {
        return res.status(400).json({ error: 'Branch code already exists' });
      }

      const branchId = uuidv4();
      await pool.query(
        `INSERT INTO hotel_branches (
          id, company_id, name, branch_code, city, address, phone, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          branchId,
          targetCompanyId,
          name,
          branchCode,
          city || null,
          address || null,
          phone || null,
          status,
        ]
      );

      await pool.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, entity_type, record_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          targetCompanyId,
          req.user.sub,
          'CREATE_HOTEL_BRANCH',
          'hotel_branches',
          'hotel_branch',
          branchId,
        ]
      );

      res.status(201).json({ message: 'Branch created successfully', branchId });
    } catch (error) {
      console.error('Create hotel branch error:', error);
      res.status(500).json({ error: 'Failed to create hotel branch' });
    }
  }
);

/**
 * @route   PUT /api/admin/hotel_branches/:id
 * @desc    Update hotel branch
 * @access  Private (requires MANAGE_HOTELS)
 */
router.put('/hotel_branches/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_HOTELS']),
  [
    body('companyId').optional().isUUID(),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const isSuperAdmin = req.user.role_level === 1;
      const { id } = req.params;
      const {
        companyId,
        name,
        branchCode,
        city,
        address,
        phone,
        status,
      } = req.body;

      const [existingRows] = await pool.query('SELECT * FROM hotel_branches WHERE id = ? LIMIT 1', [id]);
      if (existingRows.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      const existingBranch = existingRows[0];
      if (!isSuperAdmin && existingBranch.company_id !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (branchCode) {
        const [duplicateCode] = await pool.query(
          'SELECT id FROM hotel_branches WHERE branch_code = ? AND id != ? LIMIT 1',
          [branchCode, id]
        );
        if (duplicateCode.length > 0) {
          return res.status(400).json({ error: 'Branch code already exists' });
        }
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (branchCode !== undefined) {
        updates.push('branch_code = ?');
        params.push(branchCode);
      }
      if (city !== undefined) {
        updates.push('city = ?');
        params.push(city || null);
      }
      if (address !== undefined) {
        updates.push('address = ?');
        params.push(address || null);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone || null);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }

      if (companyId !== undefined && isSuperAdmin) {
        const [companyRows] = await pool.query(
          'SELECT id FROM hotel_companies WHERE id = ? LIMIT 1',
          [companyId]
        );
        if (companyRows.length === 0) {
          return res.status(400).json({ error: 'Invalid hotel company' });
        }

        updates.push('company_id = ?');
        params.push(companyId);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');
      params.push(id);

      await pool.query(
        `UPDATE hotel_branches SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      await pool.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, entity_type, record_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          existingBranch.company_id,
          req.user.sub,
          'UPDATE_HOTEL_BRANCH',
          'hotel_branches',
          'hotel_branch',
          id,
        ]
      );

      res.json({ message: 'Branch updated successfully' });
    } catch (error) {
      console.error('Update hotel branch error:', error);
      res.status(500).json({ error: 'Failed to update hotel branch' });
    }
  }
);

/**
 * @route   DELETE /api/admin/hotel_branches/:id
 * @desc    Delete hotel branch
 * @access  Private (requires MANAGE_HOTELS)
 */
router.delete('/hotel_branches/:id',
  param('id').isUUID(),
  hasPermission(['MANAGE_HOTELS']),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const isSuperAdmin = req.user.role_level === 1;
      const { id } = req.params;

      const [rows] = await pool.query('SELECT * FROM hotel_branches WHERE id = ? LIMIT 1', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      const branch = rows[0];
      if (!isSuperAdmin && branch.company_id !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await pool.query('DELETE FROM hotel_branches WHERE id = ?', [id]);

      await pool.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, entity_type, record_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          branch.company_id,
          req.user.sub,
          'DELETE_HOTEL_BRANCH',
          'hotel_branches',
          'hotel_branch',
          id,
        ]
      );

      res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
      console.error('Delete hotel branch error:', error);
      res.status(500).json({ error: 'Failed to delete hotel branch' });
    }
  }
);

// ==================== AUDIT LOGS ====================

/**
 * @route   GET /api/admin/audit-logs
 * @desc    Get audit logs
 * @access  Private (requires VIEW_AUDIT_LOGS permission)
 */
router.get('/audit-logs',
  hasPermission(['VIEW_AUDIT_LOGS']),
  async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 50,
        entityType,
        userId,
        startDate,
        endDate
      } = req.query;

      const offset = (page - 1) * limit;
      let baseQuery = `
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (entityType) {
        baseQuery += ` AND al.table_name = ?`;
        params.push(entityType);
      }

      if (userId) {
        baseQuery += ` AND al.user_id = ?`;
        params.push(userId);
      }

      if (startDate) {
        baseQuery += ` AND al.created_at >= ?`;
        params.push(startDate);
      }

      if (endDate) {
        baseQuery += ` AND al.created_at <= ?`;
        params.push(endDate);
      }

      // Get total count
      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total ${baseQuery}`,
        params
      );
      const total = countResult[0].total;

      // Add sorting and pagination
      const dataQuery = `
        SELECT 
          al.*,
          u.name as user_name,
          u.email as user_email
        ${baseQuery}
        ORDER BY al.created_at DESC LIMIT ? OFFSET ?
      `;
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await pool.query(dataQuery, params);

      res.json({
        logs: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Fetch audit logs error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

/**
 * @route   GET /api/admin/audit-logs/summary
 * @desc    Get audit logs summary
 * @access  Private (requires VIEW_AUDIT_LOGS permission)
 */
router.get('/audit-logs/summary',
  hasPermission(['VIEW_AUDIT_LOGS']),
  async (req, res) => {
    try {
      const isSuperAdmin = req.user.role_level === 1;
      const orgCondition = isSuperAdmin ? '' : 'WHERE hotel_company_id = ?';
      const params = isSuperAdmin ? [] : [req.hotelCompanyId];

      // Get counts by action type
      const [actionCounts] = await pool.query(
        `SELECT action, COUNT(*) as count 
         FROM audit_logs 
         ${orgCondition}
         GROUP BY action 
         ORDER BY count DESC 
         LIMIT 10`,
        params
      );

      // Get counts by entity type
      const [entityCounts] = await pool.query(
        `SELECT entity_type, COUNT(*) as count 
         FROM audit_logs 
         ${orgCondition}
         GROUP BY entity_type 
         ORDER BY count DESC`,
        params
      );

      // Get daily activity for last 30 days
      const [dailyActivity] = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count 
         FROM audit_logs 
         ${orgCondition}
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        params
      );

      res.json({
        actionCounts,
        entityCounts,
        dailyActivity
      });
    } catch (error) {
      console.error('Fetch audit summary error:', error);
      res.status(500).json({ error: 'Failed to fetch audit summary' });
    }
  }
);

export default router;