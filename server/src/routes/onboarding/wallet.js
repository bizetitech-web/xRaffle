// Wallet onboarding API routes
import express from 'express';
import { getWallet, topupWallet } from '../../controllers/onboarding/walletController.js';
import {
	validateGetWallet,
	validateTopupWallet,
	handleValidationResult
} from '../../validators/onboardingValidators.js';

const router = express.Router();


import { getWalletTransactions } from '../../controllers/onboarding/walletController.js';

router.get('/:companyId', validateGetWallet, handleValidationResult, getWallet);
router.post('/:companyId/topup', validateTopupWallet, handleValidationResult, topupWallet);
router.get('/:companyId/transactions', getWalletTransactions);

export default router;
