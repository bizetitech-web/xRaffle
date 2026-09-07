// Onboarding API route aggregator
import express from 'express';
import companyRoutes from './company.js';
import walletRoutes from './wallet.js';
import branchRoutes from './branch.js';
import userRoutes from './user.js';

const router = express.Router();

router.use('/company', companyRoutes);
router.use('/wallet', walletRoutes);
router.use('/branch', branchRoutes);
router.use('/user', userRoutes);

export default router;
