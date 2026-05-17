export class PlaygroundRepository {
  async findSession(connection, sessionId, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const [rows] = await connection.query(
      `SELECT
        g.id AS sessionId,
        g.id,
        g.status,
        g.total_numbers_pool AS totalNumbersPool,
        g.updated_at AS updatedAt,
        hb.company_id AS companyId
       FROM games g
       JOIN hotel_branches hb ON hb.id = g.branch_id
       WHERE g.id = ?
       LIMIT 1
       ${lockClause}`,
      [sessionId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      totalNumbersPool: Number(row.totalNumbersPool || 0),
      version: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    };
  }

  async getDrawRows(connection, sessionId, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const [rows] = await connection.query(
      `SELECT
        id AS drawId,
        draw_position AS drawPosition,
        winning_number AS winningNumber,
        beer_quantity AS beerQuantity,
        created_at AS createdAt
       FROM draws
       WHERE game_id = ?
       ORDER BY draw_position ASC
       ${lockClause}`,
      [sessionId]
    );

    return rows.map((row) => ({
      ...row,
      drawPosition: Number(row.drawPosition || 0),
      winningNumber: Number(row.winningNumber || 0),
      beerQuantity: Number(row.beerQuantity || 0),
    }));
  }

  async getNextPrize(connection, sessionId, drawPosition) {
    const [rows] = await connection.query(
      `SELECT draw_position AS drawPosition, beer_quantity AS beerQuantity
       FROM game_prizes
       WHERE game_id = ? AND draw_position = ?
       LIMIT 1`,
      [sessionId, drawPosition]
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      drawPosition: Number(rows[0].drawPosition || 0),
      beerQuantity: Number(rows[0].beerQuantity || 0),
    };
  }

  async getPoolState(connection, sessionId) {
    const session = await this.findSession(connection, sessionId);
    if (!session) {
      return null;
    }

    const draws = await this.getDrawRows(connection, sessionId);
    const calledNumbers = draws.map((item) => item.winningNumber);

    return {
      sessionId: session.id,
      status: session.status,
      totalNumbersPool: session.totalNumbersPool,
      calledNumbers,
      remainingCount: Math.max(0, session.totalNumbersPool - calledNumbers.length),
      currentRound: calledNumbers.length,
      version: session.version,
    };
  }

  async drawNext(connection, sessionId, payload) {
    await connection.query(
      `INSERT INTO draws (id, game_id, draw_position, winning_number, beer_quantity, created_by, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW())`,
      [sessionId, payload.drawPosition, payload.winningNumber, payload.beerQuantity, payload.createdBy]
    );

    const [[drawRow]] = await connection.query(
      `SELECT
        id AS drawId,
        draw_position AS drawPosition,
        winning_number AS winningNumber,
        beer_quantity AS beerQuantity
       FROM draws
       WHERE game_id = ? AND draw_position = ?
       LIMIT 1`,
      [sessionId, payload.drawPosition]
    );

    const [winnerCardRows] = await connection.query(
      `SELECT c.id AS cardId, c.card_number AS cardNumber
       FROM card_numbers cn
       JOIN cards c ON c.id = cn.card_id
       WHERE cn.game_id = ?
         AND cn.number_value = ?
         AND c.game_id = ?
         AND c.status = 'SOLD'
       ORDER BY c.card_number ASC
       FOR UPDATE`,
      [sessionId, payload.winningNumber, sessionId]
    );

    const winners = [];
    for (const row of winnerCardRows) {
      await connection.query(
        `INSERT INTO winners (id, game_id, draw_id, card_id, beer_quantity, is_claimed, created_at)
         VALUES (UUID(), ?, ?, ?, ?, 0, NOW())`,
        [sessionId, drawRow.drawId, row.cardId, payload.beerQuantity]
      );

      const [[winnerRow]] = await connection.query(
        `SELECT id AS winnerId
         FROM winners
         WHERE game_id = ? AND draw_id = ? AND card_id = ?
         LIMIT 1`,
        [sessionId, drawRow.drawId, row.cardId]
      );

      winners.push({
        winnerId: winnerRow.winnerId,
        cardId: row.cardId,
        cardNumber: Number(row.cardNumber || 0),
      });
    }

    if (winners.length > 0) {
      const placeholders = winners.map(() => '?').join(', ');
      await connection.query(
        `UPDATE cards
         SET status = 'WINNER', updated_at = NOW()
         WHERE id IN (${placeholders})`,
        winners.map((item) => item.cardId)
      );
    }

    await connection.query('UPDATE games SET updated_at = NOW() WHERE id = ?', [sessionId]);

    return {
      drawId: drawRow.drawId,
      drawPosition: Number(drawRow.drawPosition || 0),
      calledNumber: Number(drawRow.winningNumber || 0),
      beerQuantity: Number(drawRow.beerQuantity || 0),
      winners,
    };
  }

  async setAutoDraw(connection, sessionId, payload) {
    await connection.query('UPDATE games SET updated_at = NOW() WHERE id = ?', [sessionId]);
    return {
      enabled: Boolean(payload.enabled),
      secondsPerCall: payload.secondsPerCall ? Number(payload.secondsPerCall) : null,
    };
  }

  async drawHistory(connection, sessionId, filters = {}) {
    const page = Number(filters.page || 1);
    const pageSize = Number(filters.pageSize || 100);
    const offset = (page - 1) * pageSize;

    const [[countRow]] = await connection.query(
      'SELECT COUNT(*) AS total FROM draws WHERE game_id = ?',
      [sessionId]
    );

    const [rows] = await connection.query(
      `SELECT
        d.id AS drawId,
        d.draw_position AS drawPosition,
        d.winning_number AS winningNumber,
        d.beer_quantity AS beerQuantity,
        d.created_at AS createdAt,
        COALESCE(COUNT(w.id), 0) AS winnerCount
       FROM draws d
       LEFT JOIN winners w ON w.draw_id = d.id
       WHERE d.game_id = ?
       GROUP BY d.id
       ORDER BY d.draw_position ASC
       LIMIT ? OFFSET ?`,
      [sessionId, pageSize, offset]
    );

    return {
      items: rows.map((row) => ({
        ...row,
        drawPosition: Number(row.drawPosition || 0),
        winningNumber: Number(row.winningNumber || 0),
        beerQuantity: Number(row.beerQuantity || 0),
        winnerCount: Number(row.winnerCount || 0),
      })),
      total: Number(countRow.total || 0),
      page,
      pageSize,
    };
  }

  async listWinners(connection, sessionId, filters = {}) {
    const whereClauses = ['w.game_id = ?'];
    const params = [sessionId];

    if (filters.claimed === true || filters.claimed === false) {
      whereClauses.push('w.is_claimed = ?');
      params.push(filters.claimed ? 1 : 0);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM winners w
       ${whereSql}`,
      params
    );

    const [rows] = await connection.query(
      `SELECT
        w.id AS winnerId,
        w.game_id AS sessionId,
        w.draw_id AS drawId,
        d.draw_position AS drawPosition,
        d.winning_number AS winningNumber,
        c.id AS cardId,
        c.card_number AS cardNumber,
        w.beer_quantity AS beerQuantity,
        w.is_claimed AS isClaimed,
        w.claimed_at AS claimedAt,
        w.created_at AS createdAt
       FROM winners w
       JOIN draws d ON d.id = w.draw_id
       JOIN cards c ON c.id = w.card_id
       ${whereSql}
       ORDER BY d.draw_position ASC, c.card_number ASC`,
      params
    );

    return {
      items: rows.map((row) => ({
        ...row,
        drawPosition: Number(row.drawPosition || 0),
        winningNumber: Number(row.winningNumber || 0),
        cardNumber: Number(row.cardNumber || 0),
        beerQuantity: Number(row.beerQuantity || 0),
        isClaimed: Number(row.isClaimed) === 1,
      })),
      total: Number(countRow.total || 0),
    };
  }

  async findWinner(connection, winnerId, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const [rows] = await connection.query(
      `SELECT
        w.id AS winnerId,
        w.game_id AS sessionId,
        w.card_id AS cardId,
        w.is_claimed AS isClaimed,
        w.claimed_at AS claimedAt,
        g.updated_at AS sessionUpdatedAt,
        hb.company_id AS companyId
       FROM winners w
       JOIN games g ON g.id = w.game_id
       JOIN hotel_branches hb ON hb.id = g.branch_id
       WHERE w.id = ?
       LIMIT 1
       ${lockClause}`,
      [winnerId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      isClaimed: Number(row.isClaimed) === 1,
      version: Math.floor(new Date(row.sessionUpdatedAt).getTime() / 1000),
    };
  }

  async claimWinner(connection, winnerId, payload) {
    await connection.query(
      `UPDATE winners
       SET is_claimed = 1,
           claimed_at = NOW(),
           claimed_by = ?
       WHERE id = ?`,
      [payload.claimedBy, winnerId]
    );

    const [[winnerRow]] = await connection.query(
      `SELECT
        id AS winnerId,
        game_id AS sessionId,
        card_id AS cardId,
        claimed_at AS claimedAt
       FROM winners
       WHERE id = ?
       LIMIT 1`,
      [winnerId]
    );

    await connection.query(
      `UPDATE cards
       SET status = 'CLAIMED', updated_at = NOW()
       WHERE id = ?`,
      [winnerRow.cardId]
    );

    await connection.query('UPDATE games SET updated_at = NOW() WHERE id = ?', [winnerRow.sessionId]);

    const refreshedWinner = await this.findWinner(connection, winnerId);
    return {
      winnerId: winnerRow.winnerId,
      sessionId: winnerRow.sessionId,
      claimed: true,
      claimedAt: winnerRow.claimedAt,
      version: refreshedWinner.version,
    };
  }
}

export const playgroundRepository = new PlaygroundRepository();
