import pool from '../../../config/database.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';

export const ensureBranchScope = async (req, branchId) => {
  if (!branchId) {
    throw AppError.validation('branchId is required');
  }

  const [rows] = await pool.query(
    'SELECT id, company_id FROM hotel_branches WHERE id = ? LIMIT 1',
    [branchId]
  );

  if (rows.length === 0) {
    throw AppError.notFound('Branch not found', ErrorCodes.BRANCH_SCOPE_VIOLATION);
  }

  const branch = rows[0];
  const isSuperAdmin = req.user?.role_level === 1;

  if (!isSuperAdmin && branch.company_id !== req.hotelCompanyId) {
    throw AppError.forbidden(
      'Branch is outside your organization scope',
      ErrorCodes.BRANCH_SCOPE_VIOLATION
    );
  }

  return branch;
};
