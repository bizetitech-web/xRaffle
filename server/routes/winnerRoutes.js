import express from 'express';
import { param, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { canAccessOrganization, hasPermission } from '../middleware/rbac.js';
import pool from '../config/database.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

router.post(
  '/:winnerId/claim',
  hasPermission(['CLAIM_PRIZES']),
  [param('winnerId').isUUID()],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { winnerId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [winnerRows] = await connection.query(
        `SELECT
           w.id,
           w.game_id,
           w.card_id,
           w.is_claimed,
           hb.company_id,
           c.status AS card_status
         FROM winners w
         JOIN games g ON g.id = w.game_id
         JOIN hotel_branches hb ON hb.id = g.branch_id
         JOIN cards c ON c.id = w.card_id
         WHERE w.id = ?
         LIMIT 1
         FOR UPDATE`,
        [winnerId]
      );

      if (winnerRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Winner not found' });
      }

      const winner = winnerRows[0];
      if (!isSuperAdmin && winner.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (Number(winner.is_claimed) === 1) {
        await connection.rollback();
        return res.status(409).json({
          error: 'Winner prize already claimed',
          code: 'WINNER_ALREADY_CLAIMED',
        });
      }

      if (winner.card_status !== 'WINNER') {
        await connection.rollback();
        return res.status(409).json({
          error: `Card is not claimable (current status: ${winner.card_status})`,
          code: 'CARD_NOT_WINNER',
        });
      }

      await connection.query(
        `UPDATE winners
         SET is_claimed = 1, claimed_at = NOW(), claimed_by = ?
         WHERE id = ?`,
        [req.user.sub, winnerId]
      );

      await connection.query(
        `UPDATE cards
         SET status = 'CLAIMED', updated_at = NOW()
         WHERE id = ?`,
        [winner.card_id]
      );

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), winner.company_id, req.user.sub, 'CLAIM_WINNER_PRIZE', 'winners', winnerId]
      );

      const [[updatedWinner]] = await connection.query(
        `SELECT claimed_at AS claimedAt
         FROM winners
         WHERE id = ?
         LIMIT 1`,
        [winnerId]
      );

      await connection.commit();

      return res.json({
        winnerId,
        gameId: winner.game_id,
        claimed: true,
        claimedAt: updatedWinner?.claimedAt || null,
        cardStatus: 'CLAIMED',
      });
    } catch (error) {
      await connection.rollback();
      console.error('Claim winner prize error:', error);
      return res.status(500).json({ error: 'Failed to claim winner prize' });
    } finally {
      connection.release();
    }
  }
);

export default router;
