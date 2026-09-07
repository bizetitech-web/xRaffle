// Company onboarding API routes
import express from 'express';
import { createCompany, listCompanies, updateCompany } from '../../controllers/onboarding/companyController.js';
import {
	validateCreateCompany,
	validateUpdateCompany,
	handleValidationResult
} from '../../validators/onboardingValidators.js';

const router = express.Router();

router.post('/', validateCreateCompany, handleValidationResult, createCompany);
router.get('/', listCompanies);
router.put('/:id', validateUpdateCompany, handleValidationResult, updateCompany);

export default router;
