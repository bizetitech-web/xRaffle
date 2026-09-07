import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import { withTransaction } from '../../core/db/transaction.js';
import { writeAuditLog } from '../../core/audit/auditLog.js';
import pool from '../../../config/database.js';
import crypto from 'crypto';
import { gameSessionRepository } from './gameSession.repository.js';
import { realtimeGateway } from '../realtime/realtime.gateway.js';
import { emitRealtimeEventWithOutbox } from '../realtime/realtime.outbox.js';
import { RealtimeEventContracts } from '../realtime/realtime.events.js';

const SESSION_TRANSITIONS = Object.freeze({
  start: {
    from: ['PENDING'],
    to: 'ACTIVE',
  },
  beginDraw: {
    from: ['ACTIVE'],
    to: 'DRAWING',
  },
  pause: {
    from: ['DRAWING'],
    to: 'PAUSED',
  },
  resume: {
    from: ['PAUSED'],
    to: 'DRAWING',
  },
  end: {
    from: ['ACTIVE', 'DRAWING', 'PAUSED'],
    to: 'ENDED',
  },
  reset: {
    from: ['ACTIVE', 'DRAWING', 'PAUSED', 'ENDED', 'COMPLETED', 'CANCELLED'],
    to: 'PENDING',
  },
  complete: {
    from: ['DRAWING', 'ENDED'],
    to: 'COMPLETED',
  },
});

const isSuperAdmin = (req) => Number(req.user?.role_level || 0) <= 1;

const assertCompanyAccess = (req, companyId) => {
  if (isSuperAdmin(req)) {
    return;
  }

  if (!companyId || req.hotelCompanyId !== companyId) {
    throw AppError.forbidden('Session is outside your company scope', ErrorCodes.ACCESS_DENIED);
  }
};

const assertExpectedVersion = (session, expectedVersion) => {
  if (expectedVersion === undefined || expectedVersion === null) {
    return;
  }

  if (Number(expectedVersion) !== Number(session.version)) {
    throw AppError.conflict('Stale session version', ErrorCodes.VERSION_CONFLICT);
  }
};

const assertTransitionAllowed = (session, transitionKey) => {
  const definition = SESSION_TRANSITIONS[transitionKey];
  if (!definition || !definition.from.includes(session.status)) {
    throw AppError.conflict('Invalid session state transition', ErrorCodes.SESSION_INVALID_STATE);
  }
  return definition;
};

const toSessionSummary = (record, fallbackCode = null) => ({
  sessionId: record.id || record.sessionId,
  sessionCode: record.sessionCode || fallbackCode || null,
  status: record.status,
  version: record.version,
});

const START_SESSION_ENDPOINT = 'POST:/api/game-sessions/:sessionId/start';

const buildStartSessionIdempotencyEndpoint = ({ sessionId, userId }) => `${START_SESSION_ENDPOINT}:${sessionId}:${userId || 'anonymous'}`;

const buildStartSessionRequestHash = ({ sessionId, expectedVersion, userId, companyId }) => {
  const payload = {
    action: 'startSession',
    sessionId,
    expectedVersion: expectedVersion ?? null,
    userId: userId || null,
    companyId: companyId || null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const writeSessionTransitionAudit = async ({
  connection,
  session,
  userId,
  action,
  fromStatus,
  toStatus,
  version,
}) => {
  await writeAuditLog(connection, {
    companyId: session.companyId || null,
    userId: userId || null,
    action,
    tableName: 'games',
    entityType: 'GAME_SESSION',
    recordId: session.id,
    details: {
      gameId: session.id,
      fromStatus,
      toStatus,
      version: version ?? null,
    },
  });
};

const emitSessionEventWithOutbox = async ({
  connection,
  event,
  sessionId,
  companyId,
  payload,
}) => {
  const envelope = {
    event,
    sessionId,
    companyId,
    payload,
  };

  await emitRealtimeEventWithOutbox({
    connection,
    eventGroup: 'session',
    event,
    sessionId,
    companyId,
    payload,
    emit: () => realtimeGateway.emitSessionEvent(envelope),
  });
};

export class GameSessionService {
  async listSessions(req) {
    const companyId = isSuperAdmin(req) ? (req.query.companyId || undefined) : req.hotelCompanyId;
    return gameSessionRepository.listSessions(pool, {
      companyId,
      branchId: req.query.branchId,
      templateId: req.query.templateId,
      status: req.query.status,
    });
  }

  async getSession(req) {
    const session = await gameSessionRepository.findById(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    assertCompanyAccess(req, session.companyId);

    return {
      sessionId: session.id,
      sessionCode: session.sessionCode,
      templateId: session.templateId || null,
      title: session.title,
      status: session.status,
      branchId: session.branchId,
      companyId: session.companyId,
      cardPrice: session.cardPrice,
      totalCards: session.totalCards,
      numbersPerCard: session.numbersPerCard,
      totalPrizeBeers: session.totalPrizeBeers,
      totalNumbersPool: session.totalNumbersPool,
      version: session.version,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async createSession(req) {
    const { templateId } = req.body || {};
    if (!templateId) {
      throw AppError.validation('templateId is required');
    }

    return withTransaction(async (connection) => {
      const template = await gameSessionRepository.findTemplateForSessionCreate(connection, templateId);
      if (!template) {
        throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
      }

      if (!template.isActive) {
        throw AppError.validation('Template is archived and cannot be used');
      }

      assertCompanyAccess(req, template.companyId);

      const hasPersistedCards = await gameSessionRepository.hasPersistedTemplateCards(connection, template.id);
      if (!hasPersistedCards) {
        throw AppError.validation('Template has no persisted cards. Regenerate template cards before creating a session.');
      }

      const resolvedBranchId = template.branchId || await gameSessionRepository.findDefaultBranchByCompany(connection, template.companyId);
      if (!resolvedBranchId) {
        throw AppError.validation('No active branch found for this template company. Assign a branch or create an active branch first.');
      }

      const gameCode = `GAME-${Date.now()}`;
      const created = await gameSessionRepository.createFromTemplate(connection, {
        templateId: template.id,
        gameCode,
        companyId: template.companyId,
        branchId: resolvedBranchId,
        createdBy: req.user?.sub || null,
      });

      if (!created) {
        throw new AppError('Failed to create game session', { status: 500, code: ErrorCodes.INTERNAL_ERROR });
      }

      return {
        ...toSessionSummary(created, gameCode),
        sessionCode: created.sessionCode || gameCode,
      };
    });
  }

  async startSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};
    const providedIdempotencyKey = String(req.idempotencyKey || '').trim();
    // Route-level middleware enforces the header for external API calls.
    // Keep service-level fallback for internal/test invocations that bypass middleware.
    const idempotencyKey = providedIdempotencyKey || `auto:${sessionId}:${req.user?.sub || 'system'}:${expectedVersion ?? 'na'}`;

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      const idempotencyEndpoint = buildStartSessionIdempotencyEndpoint({
        sessionId,
        userId: req.user?.sub,
      });
      const requestHash = buildStartSessionRequestHash({
        sessionId,
        expectedVersion,
        userId: req.user?.sub,
        companyId: session.companyId,
      });

      const idempotencyRowId = crypto.randomUUID();
      await connection.query(
        `INSERT INTO wallet_idempotency_requests
          (id, endpoint, idempotency_key, request_hash, request_payload, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())
         ON DUPLICATE KEY UPDATE id = id`,
        [
          idempotencyRowId,
          idempotencyEndpoint,
          idempotencyKey,
          requestHash,
          JSON.stringify({ expectedVersion: expectedVersion ?? null, sessionId }),
        ]
      );

      const [[idempotencyRecord]] = await connection.query(
        `SELECT id, request_hash, response_code, response_body, status
         FROM wallet_idempotency_requests
         WHERE endpoint = ? AND idempotency_key = ?
         LIMIT 1
         FOR UPDATE`,
        [idempotencyEndpoint, idempotencyKey]
      );

      if (!idempotencyRecord) {
        throw new AppError('Failed to reserve idempotency key', {
          status: 500,
          code: ErrorCodes.INTERNAL_ERROR,
        });
      }

      if (String(idempotencyRecord.request_hash) !== String(requestHash)) {
        throw AppError.conflict(
          'Idempotency-Key was already used with a different request payload',
          ErrorCodes.IDEMPOTENCY_KEY_CONFLICT
        );
      }

      if (idempotencyRecord.status === 'COMPLETED' && idempotencyRecord.response_body) {
        let replayPayload = null;
        try {
          replayPayload = typeof idempotencyRecord.response_body === 'string'
            ? JSON.parse(idempotencyRecord.response_body)
            : idempotencyRecord.response_body;
        } catch (e) {
          replayPayload = null;
        }

        if (replayPayload && typeof replayPayload === 'object') {
          return {
            ...replayPayload,
            idempotencyStatus: 'replay',
          };
        }
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      const transition = assertTransitionAllowed(session, 'start');

      // If a charge is configured for this game and hasn't been applied yet,
      // deduct it from the company's wallet and create a wallet transaction.
      // This must be done atomically within the same DB transaction.
      const [[chargeRow]] = await connection.query(
        'SELECT id, charge_amount, wallet_transaction_id FROM game_charges WHERE game_id = ? LIMIT 1 FOR UPDATE',
        [sessionId]
      );

      console.info('[startSession] checking game_charges for game_id=', sessionId, 'found=', Boolean(chargeRow));

      if (chargeRow && !chargeRow.wallet_transaction_id) {
        const chargeAmount = Number(chargeRow.charge_amount || 0);
        if (chargeAmount > 0) {
          // lock wallet row for the company
          const [[walletRow]] = await connection.query(
            'SELECT id, balance FROM wallet_accounts WHERE company_id = ? FOR UPDATE',
            [session.companyId]
          );

          if (!walletRow) {
            throw AppError.notFound('Wallet not found for company');
          }

          const balanceBefore = Number(walletRow.balance || 0);
          if (balanceBefore < chargeAmount) {
            throw AppError.conflict(
              `Insufficient wallet balance: required ${chargeAmount}, available ${balanceBefore}`,
              ErrorCodes.INSUFFICIENT_WALLET_BALANCE,
              { required: chargeAmount, available: balanceBefore }
            );
          }

          const balanceAfter = balanceBefore - chargeAmount;
          console.info('[startSession] debiting wallet id=', walletRow.id, 'amount=', chargeAmount, 'before=', balanceBefore, 'after=', balanceAfter);
          await connection.query('UPDATE wallet_accounts SET balance = ? WHERE id = ?', [balanceAfter, walletRow.id]);

          const txnId = crypto.randomUUID();
          await connection.query(
            `INSERT INTO wallet_transactions (id, wallet_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by, created_at)
             VALUES (?, ?, 'GAME_FEE', ?, ?, ?, 'GAME_CHARGE', ?, ?, ?, NOW())`,
            [txnId, walletRow.id, chargeAmount, balanceBefore, balanceAfter, sessionId, sessionId, req.user ? req.user.sub : null]
          );

          // link wallet transaction to game_charges
          await connection.query('UPDATE game_charges SET wallet_transaction_id = ? WHERE id = ?', [txnId, chargeRow.id]);
          console.info('[startSession] wallet_transaction recorded id=', txnId, 'linked to game_charges.id=', chargeRow.id);
        }
      }

      const updated = await gameSessionRepository.updateStatus(connection, sessionId, transition.to, req.user?.sub || null, {
        setStartedAt: true,
      });

      const resolvedSessionId = updated?.id || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.statusChanged,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'start',
          status: transition.to,
          version: updated?.version,
        },
      });

      // If a wallet charge was applied earlier in this transaction, include details
      // in the response so clients can surface transaction id / balances.
      const chargeInfoRes = await connection.query(
        'SELECT gc.id AS chargeId, gc.charge_amount AS chargeAmount, gc.wallet_transaction_id AS walletTransactionId FROM game_charges gc WHERE gc.game_id = ? LIMIT 1',
        [sessionId]
      );
      const chargeInfo = (chargeInfoRes && chargeInfoRes[0] && chargeInfoRes[0][0]) || null;

      let appliedCharge = null;
      if (chargeInfo && chargeInfo.walletTransactionId) {
        const [[txnRow]] = await connection.query('SELECT id, amount, balance_before, balance_after FROM wallet_transactions WHERE id = ? LIMIT 1', [chargeInfo.walletTransactionId]);
        if (txnRow) {
          appliedCharge = {
            chargeId: chargeInfo.chargeId,
            transactionId: txnRow.id,
            amount: Number(txnRow.amount || 0),
            balanceBefore: Number(txnRow.balance_before || 0),
            balanceAfter: Number(txnRow.balance_after || 0),
          };
        }
      }

      const response = {
        sessionId: resolvedSessionId,
        status: updated?.status || transition.to,
        version: updated?.version,
        idempotencyStatus: 'new',
      };

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_START',
        fromStatus: session.status,
        toStatus: updated?.status || transition.to,
        version: updated?.version,
      });

      if (appliedCharge) response.appliedCharge = appliedCharge;

      await connection.query(
        `UPDATE wallet_idempotency_requests
         SET status = 'COMPLETED', response_code = 200, response_body = ?, completed_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(response), idempotencyRecord.id]
      );

      return response;
    });
  }

  async beginDrawSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      const transition = assertTransitionAllowed(session, 'beginDraw');

      const updated = await gameSessionRepository.updateStatus(connection, sessionId, transition.to, req.user?.sub || null, {});

      const resolvedSessionId = updated?.id || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.statusChanged,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'beginDraw',
          status: transition.to,
          version: updated?.version,
        },
      });

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_BEGIN_DRAW',
        fromStatus: session.status,
        toStatus: updated?.status || transition.to,
        version: updated?.version,
      });

      return {
        sessionId: resolvedSessionId,
        status: updated?.status || transition.to,
        version: updated?.version,
      };
    });
  }

  async pauseSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      const transition = assertTransitionAllowed(session, 'pause');

      const updated = await gameSessionRepository.updateStatus(connection, sessionId, transition.to, req.user?.sub || null, {});

      const resolvedSessionId = updated?.id || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.statusChanged,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'pause',
          status: transition.to,
          version: updated?.version,
        },
      });

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_PAUSE',
        fromStatus: session.status,
        toStatus: updated?.status || transition.to,
        version: updated?.version,
      });

      return {
        sessionId: resolvedSessionId,
        status: updated?.status || transition.to,
        version: updated?.version,
      };
    });
  }

  async resumeSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      const transition = assertTransitionAllowed(session, 'resume');

      const updated = await gameSessionRepository.updateStatus(connection, sessionId, transition.to, req.user?.sub || null, {});

      const resolvedSessionId = updated?.id || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.statusChanged,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'resume',
          status: transition.to,
          version: updated?.version,
        },
      });

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_RESUME',
        fromStatus: session.status,
        toStatus: updated?.status || transition.to,
        version: updated?.version,
      });

      return {
        sessionId: resolvedSessionId,
        status: updated?.status || transition.to,
        version: updated?.version,
      };
    });
  }

  async endSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      const transition = assertTransitionAllowed(session, 'end');

      const drawCount = await gameSessionRepository.countDraws(connection, sessionId);
      const prizeCount = await gameSessionRepository.countPrizes(connection, sessionId);
      if (drawCount < prizeCount) {
        throw AppError.conflict(
          'Cannot end session until all configured prizes have been drawn',
          ErrorCodes.SESSION_INVALID_STATE,
          { drawCount, prizeCount }
        );
      }

      let updated;
      try {
        updated = await gameSessionRepository.updateStatus(connection, sessionId, transition.to, req.user?.sub || null, {
          setEndedAt: true,
        });
      } catch (error) {
        const isInvalidStatusEnum = error?.code === 'WARN_DATA_TRUNCATED'
          || error?.errno === 1265
          || String(error?.sqlMessage || '').includes("Data truncated for column 'status'");

        if (isInvalidStatusEnum && transition.to === 'ENDED') {
          return await gameSessionRepository.complete(connection, sessionId, req.user?.sub || null);
        }

        throw error;
      }

      const resolvedSessionId = updated?.id || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.statusChanged,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'end',
          status: updated?.status || transition.to,
          version: updated?.version,
        },
      });

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_END',
        fromStatus: session.status,
        toStatus: updated?.status || transition.to,
        version: updated?.version,
      });

      return {
        sessionId: resolvedSessionId,
        status: updated?.status || transition.to,
        version: updated?.version,
      };
    });
  }

  async resetSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      const transition = assertTransitionAllowed(session, 'reset');

      await gameSessionRepository.resetRuntime(connection, sessionId);
      const updated = await gameSessionRepository.updateStatus(connection, sessionId, transition.to, req.user?.sub || null, {
        clearStartedAt: true,
        clearEndedAt: true,
      });

      const resolvedSessionId = updated?.id || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.reset,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'reset',
          status: transition.to,
          version: updated?.version,
        },
      });

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_RESET',
        fromStatus: session.status,
        toStatus: updated?.status || transition.to,
        version: updated?.version,
      });

      return {
        sessionId: resolvedSessionId,
        status: updated?.status || transition.to,
        version: updated?.version,
      };
    });
  }

  async completeSession(req) {
    const { sessionId } = req.params;
    const { expectedVersion } = req.body || {};

    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, sessionId);
      if (!session) {
        throw AppError.notFound('Session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertCompanyAccess(req, session.companyId);
      assertExpectedVersion(session, expectedVersion);
      assertTransitionAllowed(session, 'complete');

      const summary = await gameSessionRepository.complete(connection, session.id, req.user?.sub || null);
      if (!summary) {
        throw new AppError('Failed to complete session', { status: 500, code: ErrorCodes.INTERNAL_ERROR });
      }

      const resolvedSessionId = summary.sessionId || session.id;

      await emitSessionEventWithOutbox({
        connection,
        event: RealtimeEventContracts.session.statusChanged,
        sessionId: resolvedSessionId,
        companyId: session.companyId,
        payload: {
          action: 'complete',
          status: summary.status || 'COMPLETED',
          version: summary.version,
          summary: summary.summary || null,
        },
      });

      await writeSessionTransitionAudit({
        connection,
        session,
        userId: req.user?.sub || null,
        action: 'SESSION_COMPLETE',
        fromStatus: session.status,
        toStatus: summary.status || 'COMPLETED',
        version: summary.version,
      });

      return {
        sessionId: resolvedSessionId,
        status: summary.status,
        version: summary.version,
        summary: summary.summary,
      };
    });
  }
}

export const gameSessionService = new GameSessionService();
