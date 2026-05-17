import express from 'express';
import { realtimeGateway } from './realtime.gateway.js';

const router = express.Router();

// Phase 2 smoke endpoint for websocket readiness and contracts visibility.
router.get('/realtime/health', (_req, res) => {
  res.json(realtimeGateway.getHealthSnapshot());
});

export default router;
