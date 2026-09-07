import express from 'express';
import boardRoutes from './board/board.routes.js';
import playgroundRoutes from './playground/playground.routes.js';
import realtimeRoutes from './realtime/realtime.routes.js';
import gameTemplateRoutes from './gameTemplates/gameTemplate.routes.js';
import gameSessionRoutes from './gameSessions/gameSession.routes.js';
import gameChargesRoutes from './gameCharges/gameCharges.routes.js';
import hotelChargeTemplatesRoutes from './hotelChargeTemplates/hotelChargeTemplates.routes.js';

const router = express.Router();

router.use(realtimeRoutes);
router.use(boardRoutes);
router.use(playgroundRoutes);
router.use(gameTemplateRoutes);
router.use(gameSessionRoutes);
router.use(gameChargesRoutes);
router.use(hotelChargeTemplatesRoutes);

export default router;
