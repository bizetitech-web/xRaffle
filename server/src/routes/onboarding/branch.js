// Branch onboarding API routes
import express from 'express';
import { createBranch, listBranches, updateBranch, deleteBranch } from '../../controllers/onboarding/branchController.js';
import {
	validateCreateBranch,
	validateListBranches,
	validateUpdateBranch,
	validateDeleteBranch,
	handleValidationResult
} from '../../validators/onboardingValidators.js';

const router = express.Router();

router.post('/', validateCreateBranch, handleValidationResult, createBranch);
router.get('/', validateListBranches, handleValidationResult, listBranches);
router.put('/:id', validateUpdateBranch, handleValidationResult, updateBranch);
router.delete('/:id', validateDeleteBranch, handleValidationResult, deleteBranch);

export default router;
