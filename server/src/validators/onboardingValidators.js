// Onboarding input validation middleware
import { body, param, query, validationResult } from 'express-validator';

// --- Company Validators ---
export const validateCreateCompany = [
  body('name').isString().notEmpty().withMessage('Company name is required'),
  body('address').optional().isString(),
];

export const validateUpdateCompany = [
  param('id').isString().notEmpty().withMessage('Company ID is required'),
  body('name').optional().isString(),
  body('address').optional().isString(),
];

// --- Wallet Validators ---
export const validateGetWallet = [
  param('companyId').isString().notEmpty().withMessage('Company ID is required'),
];

export const validateTopupWallet = [
  param('companyId').isString().notEmpty().withMessage('Company ID is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
  body('paymentMethod').optional().isIn(['CASH','TELEBIRR','CBEBIRR','BANK','OTHER']).withMessage('Invalid payment method'),
  body('referenceNumber').optional().isString(),
];

// --- Branch Validators ---
export const validateCreateBranch = [
  body('company_id').isString().notEmpty().withMessage('company_id is required'),
  body('name').isString().notEmpty().withMessage('Branch name is required'),
  body('address').optional().isString(),
];

export const validateListBranches = [
  query('company_id').optional().isString().withMessage('company_id must be a string'),
];

export const validateUpdateBranch = [
  param('id').isString().notEmpty().withMessage('Branch ID is required'),
  body('name').optional().isString(),
  body('address').optional().isString(),
];

export const validateDeleteBranch = [
  param('id').isString().notEmpty().withMessage('Branch ID is required'),
];

// --- User Validators ---
export const validateCreateUser = [
  // Accept either `company_id` (API style) or `hotelCompanyId` (frontend style)
  body('company_id').optional().isString(),
  body('hotelCompanyId').optional().isString(),
  // Accept either `branch_id` or `branchId`
  body('branch_id').optional().isString(),
  body('branchId').optional().isString(),
  // Accept email from frontend
  body('email').isEmail().withMessage('email is required'),
  body('password').isString().notEmpty().withMessage('password is required'),
  // Accept either `role_id` or `roleId`
  body('role_id').optional().isString(),
  body('roleId').isString().notEmpty().withMessage('roleId is required'),
];

export const validateListUsers = [
  query('company_id').optional().isString().withMessage('company_id must be a string'),
];

export const validateUpdateUser = [
  param('id').isString().notEmpty().withMessage('User ID is required'),
  body('username').optional().isString(),
  body('role_id').optional().isString(),
];

export const validateUpdateUserStatus = [
  param('id').isString().notEmpty().withMessage('User ID is required'),
  body('status').isString().notEmpty().withMessage('status is required'),
];

// --- Validation Result Handler ---
export function handleValidationResult(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const arr = errors.array();
    return res.status(400).json({ error: arr[0].msg || 'Validation failed', errors: arr });
  }
  next();
}
