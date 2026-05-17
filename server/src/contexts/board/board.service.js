import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import { withTransaction } from '../../core/db/transaction.js';
import pool from '../../../config/database.js';
import { boardRepository } from './board.repository.js';

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

export class BoardService {
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
      const session = await boardRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
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

      return {
        cardState: 'SOLD',
        cardId: result.card.cardId,
        cardNumber: Number(result.card.cardNumber),
        totals,
        version: refreshed.version,
      };
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
      return {
        ...result,
        version: refreshed.version,
      };
    });
  }
}

export const boardService = new BoardService();
