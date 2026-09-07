// User onboarding API routes
import express from 'express';
import { createUser, listUsers, updateUser, updateUserStatus } from '../../controllers/onboarding/userController.js';
import {
	validateCreateUser,
	validateListUsers,
	validateUpdateUser,
	validateUpdateUserStatus,
	handleValidationResult
} from '../../validators/onboardingValidators.js';

const router = express.Router();

router.post('/', validateCreateUser, handleValidationResult, createUser);
router.get('/', validateListUsers, handleValidationResult, listUsers);
router.put('/:id', validateUpdateUser, handleValidationResult, updateUser);
router.patch('/:id/status', validateUpdateUserStatus, handleValidationResult, updateUserStatus);

export default router;
