import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import { withTransaction } from '../../core/db/transaction.js';
import { writeAuditLog } from '../../core/audit/auditLog.js';
import pool from '../../../config/database.js';
import { boardRepository } from './board.repository.js';
import { realtimeGateway } from '../realtime/realtime.gateway.js';
import { emitRealtimeEventWithOutbox } from '../realtime/realtime.outbox.js';
import { RealtimeEventContracts } from '../realtime/realtime.events.js';
import crypto from 'node:crypto';

const assertScope = (req, session) => {
  const isSuperAdmin = req.user?.role_level === 1;
  if (!isSuperAdmin && session.companyId !== req.hotelCompanyId) {
    throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
  }
};

const assertVersion = (expectedVersion, currentVersion) => {
  if (expectedVersion && Number(expectedVersion) !== Number(currentVersion)) {
    throw AppError.conflict('Session version mismatch', ErrorCodes.VERSION_CONFLICT, {
      expectedVersion: Number(expectedVersion),
      currentVersion: Number(currentVersion),
    });
  }
};

const buildSellCardIdempotencyEndpoint = ({ sessionId, userId }) =>
  `POST:/api/game-sessions/:sessionId/board/sell:${sessionId}:${userId || 'anonymous'}`;

const buildSellCardRequestHash = ({
  sessionId,
  userId,
  cardId,
  cardNumber,
  amount,
  paymentMethod,
  customerName,
  customerPhone,
  note,
  expectedVersion,
}) => {
  const payload = {
    action: 'sellCard',
    sessionId,
    userId: userId || null,
    cardId: cardId || null,
    cardNumber: cardNumber || null,
    amount: amount ?? null,
    paymentMethod: paymentMethod || null,
    customerName: customerName || null,
    customerPhone: customerPhone || null,
    note: note || null,
    expectedVersion: expectedVersion ?? null,
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const emitBoardEvent = async ({
  connection,
  event,
  action,
  sessionId,
  companyId,
  actorUserId,
  cardId,
  cardNumber,
  processedCount,
  skippedCount,
  totals,
  revenuePreview,
  version,
}) => {
  const envelope = {
    event,
    sessionId,
    companyId,
    payload: {
      action,
      sessionId,
      actorUserId,
      ...(cardId ? { cardId } : {}),
      ...(cardNumber !== undefined ? { cardNumber } : {}),
      ...(processedCount !== undefined ? { processedCount } : {}),
      ...(skippedCount !== undefined ? { skippedCount } : {}),
      ...(totals ? { totals } : {}),
      ...(revenuePreview !== undefined ? { revenuePreview } : {}),
      version,
    },
  };

  await emitRealtimeEventWithOutbox({
    connection,
    eventGroup: 'board',
    event,
    sessionId,
    companyId,
    payload: envelope.payload,
    emit: () => realtimeGateway.emitBoardEvent(envelope),
  });
};

export class BoardService {
  async listPrizes(req) {
    const session = await boardRepository.findSession(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    assertScope(req, session);
    const prizes = await boardRepository.listPrizes(pool, req.params.sessionId);
    return {
      sessionId: req.params.sessionId,
      prizes,
      version: session.version,
    };
  }

  async listCards(req) {
    const session = await boardRepository.findSession(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    assertScope(req, session);

    const data = await boardRepository.listCards(pool, req.params.sessionId, {
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });

    return {
      ...data,
      version: session.version,
    };
  }

  async sellCard(req) {
    return withTransaction(async (connection) => {
      const idempotencyKey = String(req.idempotencyKey || '').trim();
      const hasIdempotencyKey = Boolean(idempotencyKey);

      const session = await boardRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      let idempotencyRecord = null;
      if (hasIdempotencyKey) {
        const idempotencyEndpoint = String(
          req.idempotencyEndpoint
          || buildSellCardIdempotencyEndpoint({
            sessionId: req.params.sessionId,
            userId: req.user?.sub || null,
          })
        );

        const resolvedAmount = Number(req.body.amount || session.cardPrice);
        const resolvedPaymentMethod = String(req.body.paymentMethod || 'CASH').toUpperCase();
        const requestHash = buildSellCardRequestHash({
          sessionId: req.params.sessionId,
          userId: req.user?.sub || null,
          cardId: req.body.cardId,
          cardNumber: req.body.cardNumber,
          amount: resolvedAmount,
          paymentMethod: resolvedPaymentMethod,
          customerName: req.body.customerName,
          customerPhone: req.body.customerPhone,
          note: req.body.note,
          expectedVersion: req.body.expectedVersion,
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
              sessionId: req.params.sessionId,
              cardId: req.body.cardId || null,
              cardNumber: req.body.cardNumber || null,
              amount: resolvedAmount,
              paymentMethod: resolvedPaymentMethod,
              customerName: req.body.customerName || null,
              customerPhone: req.body.customerPhone || null,
              note: req.body.note || null,
              expectedVersion: req.body.expectedVersion ?? null,
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

      assertScope(req, session);
      assertVersion(req.body.expectedVersion, session.version);

      if (session.status !== 'ACTIVE') {
        throw AppError.conflict('Cards can only be sold for ACTIVE sessions', ErrorCodes.SESSION_INVALID_STATE, {
          currentStatus: session.status,
        });
      }

      const result = await boardRepository.sellCard(connection, req.params.sessionId, {
        cardId: req.body.cardId,
        cardNumber: req.body.cardNumber,
        amount: Number(req.body.amount || session.cardPrice),
        paymentMethod: String(req.body.paymentMethod || 'CASH').toUpperCase(),
        customerName: req.body.customerName,
        customerPhone: req.body.customerPhone,
        note: req.body.note,
        soldBy: req.user.sub,
      });

      if (!result) {
        throw AppError.notFound('Card not found for session', ErrorCodes.CARD_NOT_AVAILABLE);
      }

      if (result.skipped) {
        throw AppError.conflict('Card is not available', ErrorCodes.CARD_NOT_AVAILABLE);
      }

      const refreshed = await boardRepository.findSession(connection, req.params.sessionId);
      const totals = await boardRepository.getTotals(connection, req.params.sessionId);

      await emitBoardEvent({
        connection,
        event: RealtimeEventContracts.board.cardSold,
        action: 'SELL',
        sessionId: req.params.sessionId,
        companyId: session.companyId,
        actorUserId: req.user.sub,
        cardId: result.card.cardId,
        cardNumber: Number(result.card.cardNumber),
        totals,
        version: refreshed.version,
      });

      const response = {
        cardState: 'SOLD',
        saleId: result.sale?.saleId || null,
        cardId: result.card.cardId,
        cardNumber: Number(result.card.cardNumber),
        paymentMethod: result.sale?.paymentMethod || null,
        totals,
        version: refreshed.version,
      };

      await writeAuditLog(connection, {
        companyId: session.companyId || null,
        userId: req.user?.sub || null,
        action: 'BOARD_CARD_SOLD',
        tableName: 'game_cards',
        entityType: 'GAME_CARD',
        recordId: result.card.cardId,
        details: {
          gameId: req.params.sessionId,
          sessionId: req.params.sessionId,
          cardNumber: Number(result.card.cardNumber),
          saleId: result.sale?.saleId || null,
        },
      });

      if (idempotencyRecord) {
        response.idempotencyStatus = 'new';
        await connection.query(
          `UPDATE wallet_idempotency_requests
           SET status = 'COMPLETED', response_code = 201, response_body = ?, completed_at = NOW()
           WHERE id = ?`,
          [JSON.stringify(response), idempotencyRecord.id]
        );
      }

      return response;
    });
  }

  async unsellCard(req) {
    return withTransaction(async (connection) => {
      const session = await boardRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertScope(req, session);
      assertVersion(req.body.expectedVersion, session.version);

      if (session.status !== 'ACTIVE') {
        throw AppError.conflict('Cards can only be unsold for ACTIVE sessions', ErrorCodes.SESSION_INVALID_STATE, {
          currentStatus: session.status,
        });
      }

      const result = await boardRepository.unsellCard(connection, req.params.sessionId, {
        cardId: req.body.cardId,
        cardNumber: req.body.cardNumber,
      });

      if (!result) {
        throw AppError.notFound('Card not found for session', ErrorCodes.CARD_ALREADY_AVAILABLE);
      }

      if (result.skipped) {
        throw AppError.conflict('Card is not sold', ErrorCodes.CARD_ALREADY_AVAILABLE);
      }

      const refreshed = await boardRepository.findSession(connection, req.params.sessionId);
      const totals = await boardRepository.getTotals(connection, req.params.sessionId);

      await emitBoardEvent({
        connection,
        event: RealtimeEventContracts.board.cardUnsold,
        action: 'UNSELL',
        sessionId: req.params.sessionId,
        companyId: session.companyId,
        actorUserId: req.user.sub,
        cardId: result.card.cardId,
        cardNumber: Number(result.card.cardNumber),
        totals,
        version: refreshed.version,
      });

      await writeAuditLog(connection, {
        companyId: session.companyId || null,
        userId: req.user?.sub || null,
        action: 'BOARD_CARD_UNSOLD',
        tableName: 'game_cards',
        entityType: 'GAME_CARD',
        recordId: result.card.cardId,
        details: {
          gameId: req.params.sessionId,
          sessionId: req.params.sessionId,
          cardNumber: Number(result.card.cardNumber),
        },
      });

      return {
        cardState: 'AVAILABLE',
        cardId: result.card.cardId,
        cardNumber: Number(result.card.cardNumber),
        totals,
        version: refreshed.version,
      };
    });
  }

  async bulkAction(req) {
    return withTransaction(async (connection) => {
      const session = await boardRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertScope(req, session);
      assertVersion(req.body.expectedVersion, session.version);

      if (session.status !== 'ACTIVE') {
        throw AppError.conflict('Bulk board action requires ACTIVE session', ErrorCodes.SESSION_INVALID_STATE, {
          currentStatus: session.status,
        });
      }

      const result = await boardRepository.bulkAction(connection, req.params.sessionId, {
        action: req.body.action,
        cardIds: req.body.cardIds,
        cardNumbers: req.body.cardNumbers,
        amount: Number(req.body.amount || session.cardPrice),
        paymentMethod: String(req.body.paymentMethod || 'CASH').toUpperCase(),
        soldBy: req.user.sub,
      });

      const refreshed = await boardRepository.findSession(connection, req.params.sessionId);

      await emitBoardEvent({
        connection,
        event: RealtimeEventContracts.board.bulkUpdated,
        action: String(req.body.action || '').toUpperCase(),
        sessionId: req.params.sessionId,
        companyId: session.companyId,
        actorUserId: req.user.sub,
        processedCount: result.processedCount,
        skippedCount: result.skippedCount,
        totals: result.totals,
        revenuePreview: result.revenuePreview,
        version: refreshed.version,
      });

      await writeAuditLog(connection, {
        companyId: session.companyId || null,
        userId: req.user?.sub || null,
        action: 'BOARD_BULK_ACTION',
        tableName: 'games',
        entityType: 'GAME_SESSION',
        recordId: req.params.sessionId,
        details: {
          gameId: req.params.sessionId,
          action: String(req.body.action || '').toUpperCase(),
          processedCount: result.processedCount,
          skippedCount: result.skippedCount,
        },
      });

      return {
        ...result,
        version: refreshed.version,
      };
    });
  }

  async resetBoard(req) {
    return withTransaction(async (connection) => {
      const session = await boardRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertScope(req, session);
      assertVersion(req.body.expectedVersion, session.version);

      if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
        throw AppError.conflict('Cannot reset board after session is closed', ErrorCodes.SESSION_INVALID_STATE, {
          currentStatus: session.status,
        });
      }

      const result = await boardRepository.resetBoard(connection, req.params.sessionId);
      const refreshed = await boardRepository.findSession(connection, req.params.sessionId);

      await emitBoardEvent({
        connection,
        event: RealtimeEventContracts.board.reset,
        action: 'RESET',
        sessionId: req.params.sessionId,
        companyId: session.companyId,
        actorUserId: req.user.sub,
        totals: result.totals,
        version: refreshed.version,
      });

      await writeAuditLog(connection, {
        companyId: session.companyId || null,
        userId: req.user?.sub || null,
        action: 'BOARD_RESET',
        tableName: 'games',
        entityType: 'GAME_SESSION',
        recordId: req.params.sessionId,
        details: {
          gameId: req.params.sessionId,
          totals: result.totals,
        },
      });

      return {
        ...result,
        version: refreshed.version,
      };
    });
  }
}

export const boardService = new BoardService();
