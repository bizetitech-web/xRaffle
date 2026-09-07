import { getWalletTransactionsService } from '../../services/onboardingService.js';
export async function getWalletTransactions(req, res) {
  try {
    const { companyId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;
    const result = await getWalletTransactionsService(companyId, Number(page), Number(pageSize));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
import {
  getWalletService,
  topupWalletService
} from '../../services/onboardingService.js';
// Wallet onboarding controller stubs
export async function getWallet(req, res) {
  // TODO: Implement wallet retrieval logic
  try {
    const wallet = await getWalletService(req.params.companyId);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function topupWallet(req, res) {
  // TODO: Implement wallet topup logic
  try {
    const { amount, paymentMethod, referenceNumber } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Amount is required and must be a number' });
    const createdBy = req.user?.sub || null;
    const result = await topupWalletService(req.params.companyId, Number(amount), paymentMethod || null, referenceNumber || null, createdBy);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
