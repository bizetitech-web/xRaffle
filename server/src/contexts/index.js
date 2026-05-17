import express from 'express';
import gameTemplateRoutes from './gameTemplates/gameTemplate.routes.js';
import gameSessionRoutes from './gameSessions/gameSession.routes.js';
import boardRoutes from './board/board.routes.js';
import playgroundRoutes from './playground/playground.routes.js';
import realtimeRoutes from './realtime/realtime.routes.js';

const router = express.Router();

router.use(realtimeRoutes);
router.use(gameTemplateRoutes);
router.use(gameSessionRoutes);
router.use(boardRoutes);
router.use(playgroundRoutes);

export default router;
