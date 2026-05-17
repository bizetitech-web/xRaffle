import { hasPermission } from '../../../middleware/rbac.js';

export const requirePermissions = (permissions = []) => {
  return hasPermission(permissions);
};
