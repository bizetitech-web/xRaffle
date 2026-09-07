import pool from '../../../config/database.js';
import crypto from 'crypto';
import { withTransaction } from '../../core/db/transaction.js';
import { writeAuditLog } from '../../core/audit/auditLog.js';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';

const buildChargeIdempotencyEndpoint = ({ gameId, userId }) =>
  `POST:/api/games/:gameId/charge:${gameId}:${userId || 'anonymous'}`;

const buildChargeRequestHash = ({ gameId, chargeAmount, chargePercentage, userId }) => {
  const payload = {
    action: 'upsertGameCharge',
    gameId,
    chargeAmount: Number(chargeAmount),
    chargePercentage: chargePercentage === undefined || chargePercentage === null ? null : Number(chargePercentage),
    userId: userId || null,
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

class GameChargesService {
  async upsertCharge(req) {
    let { gameId } = req.params;
    const { chargeAmount, chargePercentage } = req.body || {};

    if (chargeAmount === undefined || chargeAmount === null) {
      throw AppError.validation('chargeAmount is required');
    }

    return withTransaction(async (connection) => {
      // Resolve provided identifier to canonical games.id. Accept either id or game_code.
      const [[gameById]] = await connection.query('SELECT id, branch_id FROM games WHERE id = ? LIMIT 1', [gameId]);
      let canonicalGameId = gameById ? gameById.id : null;
      if (!canonicalGameId) {
        // Try resolving by game_code (legacy session code)
        const [[gameByCode]] = await connection.query('SELECT id, branch_id FROM games WHERE game_code = ? LIMIT 1', [gameId]);
        if (gameByCode) canonicalGameId = gameByCode.id;
      }
      if (!canonicalGameId) throw AppError.notFound('Game not found');
      gameId = canonicalGameId;

      const idempotencyKey = String(req.idempotencyKey || '').trim();
      const hasIdempotencyKey = Boolean(idempotencyKey);
      let idempotencyRecord = null;

      if (hasIdempotencyKey) {
        const idempotencyEndpoint = buildChargeIdempotencyEndpoint({
          gameId,
          userId: req.user?.sub || null,
        });
        const requestHash = buildChargeRequestHash({
          gameId,
          chargeAmount,
          chargePercentage,
          userId: req.user?.sub || null,
        });

        await connection.query(
          `INSERT INTO wallet_idempotency_requests
            (id, endpoint, idempotency_key, request_hash, request_payload, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())
           ON DUPLICATE KEY UPDATE id = id`,
          [
            crypto.randomUUID(),
            idempotencyEndpoint,
            idempotencyKey,
            requestHash,
            JSON.stringify({
              gameId,
              chargeAmount: Number(chargeAmount),
              chargePercentage: chargePercentage === undefined || chargePercentage === null
                ? null
                : Number(chargePercentage),
            }),
          ]
        );

        const [[record]] = await connection.query(
          `SELECT id, request_hash AS requestHash, response_code AS responseCode, response_body AS responseBody, status
           FROM wallet_idempotency_requests
           WHERE endpoint = ? AND idempotency_key = ?
           LIMIT 1
           FOR UPDATE`,
          [idempotencyEndpoint, idempotencyKey]
        );

        if (!record) {
          throw new AppError('Failed to reserve idempotency key', {
            status: 500,
            code: ErrorCodes.INTERNAL_ERROR,
          });
        }

        if (String(record.requestHash) !== String(requestHash)) {
          throw AppError.conflict(
            'Idempotency-Key was already used with a different request payload',
            ErrorCodes.IDEMPOTENCY_KEY_CONFLICT
          );
        }

        if (record.status === 'COMPLETED' && record.responseBody) {
          const replayPayload = typeof record.responseBody === 'string'
            ? JSON.parse(record.responseBody)
            : record.responseBody;
          if (replayPayload && typeof replayPayload === 'object') {
            return {
              ...replayPayload,
              idempotencyStatus: 'replay',
            };
          }
        }

        idempotencyRecord = record;
      }

      // determine whether a charge row exists
      const [rows] = await connection.query('SELECT id FROM game_charges WHERE game_id = ? LIMIT 1', [gameId]);
      if (rows.length > 0) {
        const id = rows[0].id;
        await connection.query(
          `UPDATE game_charges SET charge_amount = ?, charge_percentage = ?, created_at = NOW() WHERE id = ?`,
          [chargeAmount, chargePercentage || null, id]
        );
        const [[updated]] = await connection.query('SELECT * FROM game_charges WHERE id = ? LIMIT 1', [id]);
        const response = {
          ...updated,
          ...(idempotencyRecord ? { idempotencyStatus: 'new' } : {}),
        };

        await writeAuditLog(connection, {
          companyId: req.hotelCompanyId || null,
          userId: req.user?.sub || null,
          action: 'GAME_CHARGE_UPDATED',
          tableName: 'game_charges',
          entityType: 'GAME_CHARGE',
          recordId: id,
          details: {
            gameId,
            chargeAmount: Number(chargeAmount),
            chargePercentage: chargePercentage === undefined || chargePercentage === null
              ? null
              : Number(chargePercentage),
          },
        });

        if (idempotencyRecord) {
          await connection.query(
            `UPDATE wallet_idempotency_requests
             SET status = 'COMPLETED', response_code = 200, response_body = ?, completed_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(response), idempotencyRecord.id]
          );
        }

        return response;
      }

      const id = crypto.randomUUID();
      await connection.query(
        `INSERT INTO game_charges (id, game_id, charge_amount, charge_percentage, created_at) VALUES (?, ?, ?, ?, NOW())`,
        [id, gameId, chargeAmount, chargePercentage || null]
      );

      const [[created]] = await connection.query('SELECT * FROM game_charges WHERE id = ? LIMIT 1', [id]);
      const response = {
        ...created,
        ...(idempotencyRecord ? { idempotencyStatus: 'new' } : {}),
      };

      await writeAuditLog(connection, {
        companyId: req.hotelCompanyId || null,
        userId: req.user?.sub || null,
        action: 'GAME_CHARGE_CREATED',
        tableName: 'game_charges',
        entityType: 'GAME_CHARGE',
        recordId: id,
        details: {
          gameId,
          chargeAmount: Number(chargeAmount),
          chargePercentage: chargePercentage === undefined || chargePercentage === null
            ? null
            : Number(chargePercentage),
        },
      });

      if (idempotencyRecord) {
        await connection.query(
          `UPDATE wallet_idempotency_requests
           SET status = 'COMPLETED', response_code = 200, response_body = ?, completed_at = NOW()
           WHERE id = ?`,
          [JSON.stringify(response), idempotencyRecord.id]
        );
      }

      return response;
    });
  }
}

export const gameChargesService = new GameChargesService();
