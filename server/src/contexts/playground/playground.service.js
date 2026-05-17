import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import { withTransaction } from '../../core/db/transaction.js';
import pool from '../../../config/database.js';
import { playgroundRepository } from './playground.repository.js';

const assertScope = (req, context) => {
  const isSuperAdmin = req.user?.role_level === 1;
  if (!isSuperAdmin && context.companyId !== req.hotelCompanyId) {
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

export class PlaygroundService {
  async getPoolState(req) {
    const session = await playgroundRepository.findSession(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    assertScope(req, session);
    return playgroundRepository.getPoolState(pool, req.params.sessionId);
  }

  async drawNext(req) {
    return withTransaction(async (connection) => {
      const session = await playgroundRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertScope(req, session);
      assertVersion(req.body.expectedVersion, session.version);

      if (session.status !== 'DRAWING') {
        throw AppError.conflict(
          'Draw can only continue while session is DRAWING',
          ErrorCodes.SESSION_INVALID_STATE,
          { currentStatus: session.status }
        );
      }

      const draws = await playgroundRepository.getDrawRows(connection, req.params.sessionId, { forUpdate: true });
      const drawPosition = draws.length + 1;
      const prize = await playgroundRepository.getNextPrize(connection, req.params.sessionId, drawPosition);

      if (!prize) {
        throw AppError.conflict('All configured draw positions have been completed', ErrorCodes.DRAW_POOL_EXHAUSTED, {
          drawPosition,
        });
      }

      const usedNumbers = new Set(draws.map((item) => Number(item.winningNumber)));
      let winningNumber = null;

      if (req.body.forceNumber) {
        const forced = Number(req.body.forceNumber);
        if (forced < 1 || forced > session.totalNumbersPool) {
          throw AppError.validation(`forceNumber must be between 1 and ${session.totalNumbersPool}`);
        }
        if (usedNumbers.has(forced)) {
          throw AppError.conflict('Winning number already used in this session', ErrorCodes.DRAW_NUMBER_ALREADY_USED);
        }
        winningNumber = forced;
      } else {
        const available = [];
        for (let n = 1; n <= session.totalNumbersPool; n += 1) {
          if (!usedNumbers.has(n)) {
            available.push(n);
          }
        }

        if (available.length === 0) {
          throw AppError.conflict('No numbers left to draw', ErrorCodes.DRAW_POOL_EXHAUSTED);
        }

        winningNumber = available[Math.floor(Math.random() * available.length)];
      }

      const drawn = await playgroundRepository.drawNext(connection, req.params.sessionId, {
        drawPosition,
        winningNumber,
        beerQuantity: prize.beerQuantity,
        createdBy: req.user.sub,
      });

      const refreshed = await playgroundRepository.findSession(connection, req.params.sessionId);
      return {
        ...drawn,
        version: refreshed.version,
      };
    });
  }

  async setAutoDraw(req) {
    return withTransaction(async (connection) => {
      const session = await playgroundRepository.findSession(connection, req.params.sessionId, { forUpdate: true });
      if (!session) {
        throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertScope(req, session);
      assertVersion(req.body.expectedVersion, session.version);

      if (session.status !== 'DRAWING') {
        throw AppError.conflict('Auto draw requires DRAWING session state', ErrorCodes.SESSION_INVALID_STATE, {
          currentStatus: session.status,
        });
      }

      const configured = await playgroundRepository.setAutoDraw(connection, req.params.sessionId, {
        enabled: Boolean(req.body.enabled),
        secondsPerCall: req.body.secondsPerCall,
      });

      const refreshed = await playgroundRepository.findSession(connection, req.params.sessionId);
      const seconds = configured.secondsPerCall || 10;
      return {
        enabled: configured.enabled,
        nextTickAt: configured.enabled ? new Date(Date.now() + (seconds * 1000)).toISOString() : null,
        version: refreshed.version,
      };
    });
  }

  async drawHistory(req) {
    const session = await playgroundRepository.findSession(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    assertScope(req, session);
    return playgroundRepository.drawHistory(pool, req.params.sessionId, {
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
  }

  async listWinners(req) {
    const session = await playgroundRepository.findSession(pool, req.params.sessionId);
    if (!session) {
      throw AppError.notFound('Game session not found', ErrorCodes.SESSION_NOT_FOUND);
    }

    assertScope(req, session);

    const claimed = req.query.claimed === undefined
      ? undefined
      : String(req.query.claimed) === 'true';

    return playgroundRepository.listWinners(pool, req.params.sessionId, { claimed });
  }

  async claimWinner(req) {
    return withTransaction(async (connection) => {
      const winner = await playgroundRepository.findWinner(connection, req.params.winnerId, { forUpdate: true });
      if (!winner) {
        throw AppError.notFound('Winner not found', ErrorCodes.SESSION_NOT_FOUND);
      }

      assertScope(req, winner);
      assertVersion(req.body.expectedVersion, winner.version);

      if (winner.isClaimed) {
        throw AppError.conflict('Winner already claimed', ErrorCodes.WINNER_ALREADY_CLAIMED);
      }

      return playgroundRepository.claimWinner(connection, req.params.winnerId, {
        claimedBy: req.user.sub,
      });
    });
  }
}

export const playgroundService = new PlaygroundService();
