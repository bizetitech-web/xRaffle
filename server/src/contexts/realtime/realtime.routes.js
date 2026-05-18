import express from 'express';
import { realtimeGateway } from './realtime.gateway.js';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { realtimeGatewayTesting } from './realtime.gateway.js';

const router = express.Router();

// Phase 2 smoke endpoint for websocket readiness and contracts visibility.
router.get('/realtime/health', (_req, res) => {
  res.json(realtimeGateway.getHealthSnapshot());
});

router.post('/realtime/token', authenticate, canAccessOrganization, asyncHandler(async (req, res) => {
  const roleLevel = req.userRole?.level ?? req.user?.role_level;
  const role = req.userRole?.name ?? req.user?.role ?? 'user';
  const hotelCompanyId = req.hotelCompanyId ?? req.user?.hotel_company_id ?? null;
  const expiresIn = Number(process.env.REALTIME_TOKEN_TTL_SECONDS || 3600);

  const socketToken = realtimeGatewayTesting.issueRealtimeToken({
    sub: req.user.sub,
    email: req.user.email,
    role,
    roleLevel,
    hotelCompanyId,
  }, {
    expiresInSeconds: expiresIn,
  });

  res.json({
    socketToken,
    expiresIn,
  });
}));

export default router;
