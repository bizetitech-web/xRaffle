import crypto from 'crypto';
import { withTransaction } from '../../core/db/transaction.js';
import { AppError } from '../../core/errors/AppError.js';
import pool from '../../../config/database.js';

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapTemplateRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id || row.companyId || null,
    branchId: row.branch_id || row.branchId || null,
    chargeAmount: row.charge_amount ?? row.chargeAmount ?? null,
    chargePercentage: row.charge_percentage ?? row.chargePercentage ?? null,
    createdBy: row.created_by || row.createdBy || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
};

const isSuperAdmin = (req) => Number(req?.user?.role_level || 99) === 1;

class HotelChargeTemplatesService {
  async assertScopeAccess(connection, req, { branchId, companyId }) {
    if (isSuperAdmin(req)) {
      return;
    }

    const userCompanyId = req.hotelCompanyId;

    if (companyId && companyId !== userCompanyId) {
      throw AppError.forbidden('Cannot manage templates for another company');
    }

    if (branchId) {
      const [branchRows] = await connection.query(
        `SELECT id, company_id
         FROM hotel_branches
         WHERE id = ?
         LIMIT 1`,
        [branchId]
      );

      if (branchRows.length === 0) {
        throw AppError.validation('Invalid branchId');
      }

      if (branchRows[0].company_id !== userCompanyId) {
        throw AppError.forbidden('Cannot manage templates for another company branch');
      }
    }
  }

  async upsertTemplate(req) {
    const { branchId, companyId } = req.body || {};
    const chargeAmount = toNumberOrNull(req.body?.chargeAmount);
    const chargePercentage = toNumberOrNull(req.body?.chargePercentage);

    if (!branchId && !companyId) {
      throw AppError.validation('branchId or companyId is required');
    }

    if (chargeAmount === null && chargePercentage === null) {
      throw AppError.validation('chargeAmount or chargePercentage is required');
    }

    if (chargeAmount !== null && chargeAmount < 0) {
      throw AppError.validation('chargeAmount must be >= 0');
    }

    if (chargePercentage !== null && (chargePercentage < 0 || chargePercentage > 100)) {
      throw AppError.validation('chargePercentage must be between 0 and 100');
    }

    return withTransaction(async (connection) => {
      await this.assertScopeAccess(connection, req, { branchId, companyId });

      // Prefer branch-level template when branchId provided
      if (branchId) {
        const [existing] = await connection.query(
          'SELECT id FROM hotel_charge_templates WHERE branch_id = ? ORDER BY updated_at DESC LIMIT 1',
          [branchId]
        );
        if (existing.length > 0) {
          const id = existing[0].id;
          await connection.query(
            `UPDATE hotel_charge_templates SET charge_amount = ?, charge_percentage = ?, updated_at = NOW() WHERE id = ?`,
            [chargeAmount, chargePercentage, id]
          );
          const [[row]] = await connection.query('SELECT * FROM hotel_charge_templates WHERE id = ? LIMIT 1', [id]);
          return mapTemplateRow(row);
        }
      }

      // Next, try to upsert company-level template
      if (companyId) {
        const [existing] = await connection.query(
          'SELECT id FROM hotel_charge_templates WHERE company_id = ? AND branch_id IS NULL ORDER BY updated_at DESC LIMIT 1',
          [companyId]
        );
        if (existing.length > 0) {
          const id = existing[0].id;
          await connection.query(
            `UPDATE hotel_charge_templates SET charge_amount = ?, charge_percentage = ?, updated_at = NOW() WHERE id = ?`,
            [chargeAmount, chargePercentage, id]
          );
          const [[row]] = await connection.query('SELECT * FROM hotel_charge_templates WHERE id = ? LIMIT 1', [id]);
          return mapTemplateRow(row);
        }
      }

      const id = crypto.randomUUID();
      await connection.query(
        `INSERT INTO hotel_charge_templates (id, company_id, branch_id, charge_amount, charge_percentage, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [id, companyId || null, branchId || null, chargeAmount, chargePercentage, req.user ? req.user.sub : null]
      );

      const [[created]] = await connection.query('SELECT * FROM hotel_charge_templates WHERE id = ? LIMIT 1', [id]);
      return mapTemplateRow(created);
    });
  }

  async getLatestForBranchOrCompany(connection, branchId, companyId) {
    // Try branch-level first
    try {
      if (branchId) {
        const [rows] = await connection.query(
          `SELECT charge_amount AS chargeAmount, charge_percentage AS chargePercentage
           FROM hotel_charge_templates
           WHERE branch_id = ?
           ORDER BY updated_at DESC
           LIMIT 1`,
          [branchId]
        );
        if (rows.length > 0) return rows[0];
      }

      if (companyId) {
        const [rows] = await connection.query(
          `SELECT charge_amount AS chargeAmount, charge_percentage AS chargePercentage
           FROM hotel_charge_templates
           WHERE company_id = ?
           ORDER BY updated_at DESC
           LIMIT 1`,
          [companyId]
        );
        if (rows.length > 0) return rows[0];
      }
    } catch (err) {
      // Table may not exist in older schemas; return null to fall back.
      return null;
    }

    return null;
  }
}

export const hotelChargeTemplatesService = new HotelChargeTemplatesService();

// Lightweight HTTP-facing helper to fetch latest template for branch/company.
HotelChargeTemplatesService.prototype.getLatestFor = async function ({ branchId, companyId, req }) {
  try {
    if (branchId) {
      const [rows] = await pool.query(
        `SELECT id, charge_amount, charge_percentage, branch_id, company_id, created_by, created_at, updated_at
         FROM hotel_charge_templates
         WHERE branch_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
        [branchId]
      );
      if (rows.length > 0) {
        const [branchRows] = await pool.query(
          `SELECT company_id
           FROM hotel_branches
           WHERE id = ?
           LIMIT 1`,
          [branchId]
        );

        if (!isSuperAdmin(req) && branchRows[0]?.company_id !== req?.hotelCompanyId) {
          throw AppError.forbidden('Cannot access templates for another company branch');
        }

        return mapTemplateRow(rows[0]);
      }
    }

    if (companyId) {
      if (!isSuperAdmin(req) && companyId !== req?.hotelCompanyId) {
        throw AppError.forbidden('Cannot access templates for another company');
      }

      const [rows] = await pool.query(
        `SELECT id, charge_amount, charge_percentage, branch_id, company_id, created_by, created_at, updated_at
         FROM hotel_charge_templates
         WHERE company_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
        [companyId]
      );
      if (rows.length > 0) return mapTemplateRow(rows[0]);
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    return null;
  }

  return null;
};
