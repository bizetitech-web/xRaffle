// --- Ticketing ---
// Purchase tickets for a game session
export const purchaseTickets = (sessionId, quantity) =>
  api.post(`/game-sessions/${sessionId}/tickets`, { quantity });

// List tickets purchased by the current user for a session
export const listMyTickets = (sessionId) =>
  api.get(`/game-sessions/${sessionId}/tickets`);
// --- Onboarding: Wallet ---
export const getWallet = (companyId) => api.get(`/onboarding/wallet/${companyId}`);
export const topupWallet = (companyId, amount, paymentMethod = 'CASH', referenceNumber = null) => api.post(`/onboarding/wallet/${companyId}/topup`, { amount, paymentMethod, referenceNumber });
export const getWalletTransactions = (companyId, page = 1, pageSize = 10) => api.get(`/onboarding/wallet/${companyId}/transactions`, { params: { page, pageSize } });
// --- Onboarding: User ---
export const getUsers = (company_id) => {
  // If company_id is undefined/null/empty, fetch all users (for super admin)
  const params = {};
  if (company_id) params.company_id = company_id;
  return api.get('/onboarding/user', { params });
};
export const createUser = (payload) => api.post('/onboarding/user', payload);
export const updateUser = (id, payload) => api.put(`/onboarding/user/${id}`, payload);
export const updateUserStatus = (id, status) => api.patch(`/onboarding/user/${id}/status`, { status });
// --- Onboarding: Branch ---
export const getBranches = (company_id) => {
  const params = {};
  if (company_id) params.company_id = company_id;
  return api.get('/onboarding/branch', { params });
};
export const createBranch = (payload) => api.post('/onboarding/branch', payload);
export const updateBranch = (id, payload) => api.put(`/onboarding/branch/${id}`, payload);
export const deleteBranch = (id) => api.delete(`/onboarding/branch/${id}`);
// --- Onboarding: Company ---
export const getCompanies = () => api.get('/onboarding/company');
export const createCompany = (payload) => api.post('/onboarding/company', payload);
export const updateCompany = (id, payload) => api.put(`/onboarding/company/${id}`, payload);
export const deleteCompany = (id) => api.delete(`/onboarding/company/${id}`);
// --- Games: Templates ---
export const createGameTemplate = (payload) => api.post('/game-templates', payload);
export const listGameTemplates = (params) => api.get('/game-templates', { params });
export const getGameTemplate = (id) => api.get(`/game-templates/${id}`);
export const updateGameTemplate = (id, payload) => api.put(`/game-templates/${id}`, payload);
export const generateTemplatePreview = (payload) => api.post('/game-templates/preview', payload);
export const archiveGameTemplate = (id) => api.patch(`/game-templates/${id}/archive`);
export const createGameSession = (payload) => api.post('/game-sessions', payload);
export const listGameSessions = (params) => api.get('/game-sessions', { params });
export const getGameSession = (sessionId) => api.get(`/game-sessions/${sessionId}`);
export const startGameSession = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/start`, payload);
export const beginDrawGameSession = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/begin-draw`, payload);
export const pauseGameSession = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/pause`, payload);
export const resumeGameSession = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/resume`, payload);
export const endGameSession = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/end`, payload);
export const completeGameSession = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/complete`, payload);
export const listBoardCards = (sessionId, params) => api.get(`/game-sessions/${sessionId}/board/cards`, { params });
export const listBoardPrizes = (sessionId) => api.get(`/game-sessions/${sessionId}/board/prizes`);
export const sellBoardCard = (sessionId, payload) => api.post(`/game-sessions/${sessionId}/board/sell`, payload);
export const unsellBoardCard = (sessionId, payload) => api.post(`/game-sessions/${sessionId}/board/unsell`, payload);
export const bulkBoardAction = (sessionId, payload) => api.post(`/game-sessions/${sessionId}/board/bulk`, payload);
export const getPlaygroundPool = (sessionId) => api.get(`/game-sessions/${sessionId}/playground/pool`);
export const getPlaygroundHistory = (sessionId, params = {}) => api.get(`/game-sessions/${sessionId}/playground/history`, { params });
export const drawNextNumber = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/playground/draw/next`, payload);
export const setPlaygroundAutoDraw = (sessionId, payload = {}) => api.post(`/game-sessions/${sessionId}/playground/auto-draw`, payload);
export const createGameCharge = (gameId, payload = {}) => api.post(`/games/${gameId}/charge`, payload);
export const setBranchBeerPrice = (branchId, price) => api.post(`/admin/branches/${branchId}/beer-price`, { price });
export const setGameBeerPrice = (gameId, price) => api.patch(`/admin/games/${gameId}/beer-price`, { price });
export const createHotelChargeTemplate = (payload = {}) => api.post('/hotel-charge-templates', payload);
export const getHotelChargeTemplate = (params = {}) => api.get('/hotel-charge-templates', { params });
import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
