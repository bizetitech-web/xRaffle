import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import pool from '../../../config/database.js';
import { gameSessionRepository } from './gameSession.repository.js';
import { withTransaction } from '../../core/db/transaction.js';
import { ensureBranchScope } from '../../core/policy/scopePolicy.js';
import { realtimeGateway } from '../realtime/realtime.gateway.js';
import { RealtimeEventContracts } from '../realtime/realtime.events.js';

const generateSessionCode = () => {
  const stamp = Date.now().toString().slice(-8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GAME-${stamp}-${rand}`;
};

const assertSessionScope = (req, session) => {
  const isSuperAdmin = req.user?.role_level === 1;
  if (!isSuperAdmin && session.companyId !== req.hotelCompanyId) {
    throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
  }
};

const assertExpectedVersion = (expectedVersion, currentVersion) => {
  if (expectedVersion && Number(expectedVersion) !== Number(currentVersion)) {
    throw AppError.conflict('Session version mismatch', ErrorCodes.VERSION_CONFLICT, {
      expectedVersion: Number(expectedVersion),
      currentVersion: Number(currentVersion),
    });
  }
};

const assertAllowedStatus = (status, allowedStatuses, actionName) => {
  if (!allowedStatuses.includes(status)) {
    throw AppError.conflict(
      `Cannot ${actionName} session in ${status} state`,
      ErrorCodes.SESSION_INVALID_STATE,
      {
        action: actionName,
        currentStatus: status,
        allowedStatuses,
      }
    );
  }
};

const emitSessionLifecycleEvent = ({
  event,
  action,
  sessionId,
  sessionCode,
  companyId,
  status,
  version,
  actorUserId,
  summary,
}) => {
  realtimeGateway.emitSessionEvent({
    event,
    sessionId,
    companyId,
    payload: {
      action,
      sessionId,
      sessionCode,
      status,
      version,
      actorUserId,
      ...(summary ? { summary } : {}),
    },
  });
};

export class GameSessionService {
  async createSession(req) {
    return withTransaction(async (connection) => {
      const template = await gameSessionRepository.findTemplateForSessionCreate(
        connection,
        req.body.templateId
      );

      if (!template) {
        throw AppError.notFound('Game template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
      }

      if (!template.isActive) {
        throw AppError.validation('Cannot create session from archived template.');
      }

      const isSuperAdmin = req.user?.role_level === 1;
      if (!isSuperAdmin && template.companyId !== req.hotelCompanyId) {
        throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
      }

      const resolvedBranchId = req.body.branchId || template.branchId;
      if (!resolvedBranchId) {
        throw AppError.validation('branchId is required when template has no default branch.');
      }

      const scopedBranch = await ensureBranchScope(req, resolvedBranchId);
      if (scopedBranch.company_id !== template.companyId) {
        throw AppError.forbidden('Branch is outside template company scope', ErrorCodes.BRANCH_SCOPE_VIOLATION);
      }

      const created = await gameSessionRepository.createFromTemplate(connection, {
        templateId: template.id,
        branchId: scopedBranch.id,
        title: template.title,
        cardPrice: template.cardPrice,
        totalCards: template.totalCards,
        numbersPerCard: template.numbersPerCard,
        totalPrizeBeers: template.totalPrizeBeers,
        totalNumbersPool: template.totalNumbersPool,
        gameCode: generateSessionCode(),
        createdBy: req.user.sub,
      });

      return {
        sessionId: created.id,
        sessionCode: created.sessionCode,
        status: created.status,
        version: created.version,
      };
    });
  }

  async listSessions(req) {
    const isSuperAdmin = req.user?.role_level === 1;
    const items = await gameSessionRepository.list(pool, {
      companyId: isSuperAdmin ? req.query.companyId : req.hotelCompanyId,
      branchId: req.query.branchId,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    });

    return {
      total: items.length,
      items,
    };
  }

  async getSessionSnapshot(req) {
    const session = await gameSessionRepository.findSnapshot(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    const isSuperAdmin = req.user?.role_level === 1;
    if (!isSuperAdmin && session.companyId !== req.hotelCompanyId) {
      throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
    }

    return session;
  }

  async startSession(_req) {
    const req = _req;
    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertSessionScope(req, session);
      assertExpectedVersion(req.body.expectedVersion, session.version);
      assertAllowedStatus(session.status, ['PENDING'], 'start');

      const updated = await gameSessionRepository.updateStatus(
        connection,
        session.id,
        'ACTIVE',
        req.body.expectedVersion,
        { setStartedAt: true }
      );

      emitSessionLifecycleEvent({
        event: RealtimeEventContracts.session.statusChanged,
        action: 'start',
        sessionId: updated.id,
        sessionCode: updated.sessionCode,
        companyId: session.companyId,
        status: updated.status,
        version: updated.version,
        actorUserId: req.user.sub,
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  async pauseSession(_req) {
    const req = _req;
    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertSessionScope(req, session);
      assertExpectedVersion(req.body.expectedVersion, session.version);
      assertAllowedStatus(session.status, ['DRAWING'], 'pause');

      const updated = await gameSessionRepository.updateStatus(
        connection,
        session.id,
        'ACTIVE',
        req.body.expectedVersion
      );

      emitSessionLifecycleEvent({
        event: RealtimeEventContracts.session.statusChanged,
        action: 'pause',
        sessionId: updated.id,
        sessionCode: updated.sessionCode,
        companyId: session.companyId,
        status: updated.status,
        version: updated.version,
        actorUserId: req.user.sub,
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  async resumeSession(_req) {
    const req = _req;
    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertSessionScope(req, session);
      assertExpectedVersion(req.body.expectedVersion, session.version);
      assertAllowedStatus(session.status, ['ACTIVE'], 'resume');

      const updated = await gameSessionRepository.updateStatus(
        connection,
        session.id,
        'DRAWING',
        req.body.expectedVersion
      );

      emitSessionLifecycleEvent({
        event: RealtimeEventContracts.session.statusChanged,
        action: 'resume',
        sessionId: updated.id,
        sessionCode: updated.sessionCode,
        companyId: session.companyId,
        status: updated.status,
        version: updated.version,
        actorUserId: req.user.sub,
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  async endSession(_req) {
    const req = _req;
    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertSessionScope(req, session);
      assertExpectedVersion(req.body.expectedVersion, session.version);
      assertAllowedStatus(session.status, ['ACTIVE', 'DRAWING'], 'end');

      const updated = await gameSessionRepository.updateStatus(
        connection,
        session.id,
        'CANCELLED',
        req.body.expectedVersion,
        { setEndedAt: true }
      );

      emitSessionLifecycleEvent({
        event: RealtimeEventContracts.session.statusChanged,
        action: 'end',
        sessionId: updated.id,
        sessionCode: updated.sessionCode,
        companyId: session.companyId,
        status: updated.status,
        version: updated.version,
        actorUserId: req.user.sub,
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  async resetSession(_req) {
    const req = _req;
    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertSessionScope(req, session);
      assertExpectedVersion(req.body.expectedVersion, session.version);
      assertAllowedStatus(session.status, ['PENDING', 'ACTIVE', 'DRAWING', 'CANCELLED'], 'reset');

      await gameSessionRepository.resetRuntime(connection, session.id);

      const updated = await gameSessionRepository.updateStatus(
        connection,
        session.id,
        'PENDING',
        req.body.expectedVersion,
        { clearStartedAt: true, clearEndedAt: true }
      );

      emitSessionLifecycleEvent({
        event: RealtimeEventContracts.session.reset,
        action: 'reset',
        sessionId: updated.id,
        sessionCode: updated.sessionCode,
        companyId: session.companyId,
        status: updated.status,
        version: updated.version,
        actorUserId: req.user.sub,
      });

      return {
        sessionId: updated.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  async completeSession(_req) {
    const req = _req;
    return withTransaction(async (connection) => {
      const session = await gameSessionRepository.findById(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertSessionScope(req, session);
      assertExpectedVersion(req.body.expectedVersion, session.version);
      assertAllowedStatus(session.status, ['ACTIVE', 'DRAWING'], 'complete');

      const completed = await gameSessionRepository.complete(connection, session.id, req.body.expectedVersion);

      emitSessionLifecycleEvent({
        event: RealtimeEventContracts.session.statusChanged,
        action: 'complete',
        sessionId: completed.sessionId,
        sessionCode: session.sessionCode,
        companyId: session.companyId,
        status: completed.status,
        version: completed.version,
        actorUserId: req.user.sub,
        summary: completed.summary,
      });

      return completed;
    });
  }
}

export const gameSessionService = new GameSessionService();
