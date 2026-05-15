import pool from '../config/database.js';

const PERMISSION_ALIASES = {
  MANAGE_HOTELS: ['MANAGE_HOTELS', 'MANAGE_ORGANIZATIONS'],
  MANAGE_ORGANIZATIONS: ['MANAGE_ORGANIZATIONS', 'MANAGE_HOTELS'],
};

function expandPermissionAliases(permissionNames = []) {
  const expanded = new Set();

  for (const name of permissionNames) {
    expanded.add(name);
    const aliases = PERMISSION_ALIASES[name] || [];
    for (const alias of aliases) {
      expanded.add(alias);
    }
  }

  return expanded;
}

/**
 * Middleware to check if user has required permissions
 * @param {string[]} requiredPermissions - Array of permission names needed
 */
export const hasPermission = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // If no specific permissions required, just check if user is authenticated
      if (requiredPermissions.length === 0) {
        return next();
      }

      // Get user's permissions from database
      const [permissions] = await pool.query(
        `SELECT DISTINCT p.name 
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId]
      );

      const userPermissions = permissions.map(p => p.name);
      const effectivePermissions = expandPermissionAliases(userPermissions);
      
      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every(perm => 
        effectivePermissions.has(perm)
      );

      if (!hasAllPermissions) {
        return res.status(403).json({ 
          error: 'Access denied. Insufficient permissions.',
          required: requiredPermissions,
          has: userPermissions
        });
      }

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

/**
 * Middleware to check if user has at least one of the required permissions
 * @param {string[]} requiredPermissions - Array of permission names
 */
export const hasAnyPermission = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.sub;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (requiredPermissions.length === 0) {
        return next();
      }

      const [permissions] = await pool.query(
        `SELECT DISTINCT p.name
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId]
      );

      const userPermissions = permissions.map(p => p.name);
      const effectivePermissions = expandPermissionAliases(userPermissions);
      const hasAtLeastOnePermission = requiredPermissions.some(perm =>
        effectivePermissions.has(perm)
      );

      if (!hasAtLeastOnePermission) {
        return res.status(403).json({
          error: 'Access denied. Insufficient permissions.',
          requiredAnyOf: requiredPermissions,
          has: userPermissions
        });
      }

      next();
    } catch (error) {
      console.error('RBAC any-permission middleware error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

/**
 * Middleware to check if user has a specific role level or higher
 * @param {number} minimumLevel - Minimum role level required (1 = highest, 9 = lowest)
 */
export const hasRoleLevel = (minimumLevel) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [rows] = await pool.query(
        `SELECT r.level 
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.id = ?`,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'No role assigned' });
      }

      const userLevel = rows[0].level;
      
      // Lower level number = higher privilege (1 is highest)
      if (userLevel > minimumLevel) {
        return res.status(403).json({ 
          error: 'Access denied. Insufficient role level.',
          required: minimumLevel,
          current: userLevel
        });
      }

      next();
    } catch (error) {
      console.error('Role level check error:', error);
      return res.status(500).json({ error: 'Role check failed' });
    }
  };
};

/**
 * Middleware to check if user can access a specific organization's data
 */
export const canAccessOrganization = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's organization and role
    const [rows] = await pool.query(
      `SELECT u.hotel_company_id, r.name as role_name, r.level as role_level
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    const { hotel_company_id: userOrgId, role_name, role_level } = rows[0];

    // Store organization ID in request for later use
    req.hotelCompanyId = userOrgId;
    req.userRole = {
      name: role_name,
      level: role_level
    };

    next();
  } catch (error) {
    console.error('Organization access error:', error);
    return res.status(500).json({ error: 'Organization check failed' });
  }
};

/**
 * Middleware to check if user can access a specific organization
 * @param {string} targetOrgId - The organization ID to check access for
 */
export const canAccessSpecificOrganization = (targetOrgId) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      const orgId = targetOrgId || req.params.hotelCompanyId || req.body.hotelCompanyId || req.query.hotelCompanyId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!orgId) {
        return next(); // No specific org to check
      }

      // Get user's organization and role
      const [rows] = await pool.query(
        `SELECT u.hotel_company_id, r.level as role_level
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.id = ?`,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const { hotel_company_id: userOrgId, role_level } = rows[0];

      // Super admin (level 1) can access any organization
      if (role_level === 1) {
        return next();
      }

      // Regular users can only access their own organization
      if (orgId && orgId !== userOrgId) {
        return res.status(403).json({ error: 'Cannot access data from other hotel_companies' });
      }

      next();
    } catch (error) {
      console.error('Organization access error:', error);
      return res.status(500).json({ error: 'Organization check failed' });
    }
  };
};