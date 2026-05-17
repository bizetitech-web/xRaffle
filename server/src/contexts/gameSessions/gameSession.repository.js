export class GameSessionRepository {
  async findTemplateForSessionCreate(connection, templateId) {
    const [rows] = await connection.query(
      `SELECT
        gt.id,
        gt.company_id AS companyId,
        gt.branch_id AS branchId,
        gt.title,
        gt.card_price AS cardPrice,
        gt.total_cards AS totalCards,
        gt.numbers_per_card AS numbersPerCard,
        gt.total_prize_beers AS totalPrizeBeers,
        gt.total_numbers_pool AS totalNumbersPool,
        gt.is_active AS isActive
       FROM game_templates gt
       WHERE gt.id = ?
       LIMIT 1`,
      [templateId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      isActive: Number(row.isActive) === 1,
      cardPrice: Number(row.cardPrice || 0),
      totalCards: Number(row.totalCards || 0),
      numbersPerCard: Number(row.numbersPerCard || 0),
      totalPrizeBeers: Number(row.totalPrizeBeers || 0),
      totalNumbersPool: Number(row.totalNumbersPool || 0),
    };
  }

  async createFromTemplate(connection, payload) {
    await connection.query(
      `INSERT INTO games (
        id,
        branch_id,
        game_code,
        title,
        card_price,
        total_cards,
        numbers_per_card,
        total_prize_beers,
        total_numbers_pool,
        status,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW()
      )`,
      [
        payload.branchId,
        payload.gameCode,
        payload.title,
        payload.cardPrice,
        payload.totalCards,
        payload.numbersPerCard,
        payload.totalPrizeBeers,
        payload.totalNumbersPool,
        payload.createdBy,
      ]
    );

    const [[createdRow]] = await connection.query(
      `SELECT id
       FROM games
       WHERE game_code = ?
       LIMIT 1`,
      [payload.gameCode]
    );

    await connection.query(
      `INSERT INTO game_prizes (id, game_id, draw_position, beer_quantity, created_at)
       SELECT
         UUID(),
         ?,
         gtp.draw_position,
         gtp.beer_quantity,
         NOW()
       FROM game_template_prizes gtp
       WHERE gtp.template_id = ?
       ORDER BY gtp.draw_position ASC`,
      [createdRow.id, payload.templateId]
    );

    return this.findById(connection, createdRow.id);
  }

  async findById(connection, sessionId, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const [rows] = await connection.query(
      `SELECT
        g.id AS sessionId,
        g.id,
        g.game_code AS sessionCode,
        g.title,
        g.status,
        g.branch_id AS branchId,
        hb.company_id AS companyId,
        g.started_at AS startedAt,
        g.ended_at AS endedAt,
        g.updated_at AS updatedAt
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
      version: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    };
  }

  async list(connection, filters = {}) {
    const whereClauses = [];
    const params = [];

    if (filters.companyId) {
      whereClauses.push('hb.company_id = ?');
      params.push(filters.companyId);
    }

    if (filters.branchId) {
      whereClauses.push('g.branch_id = ?');
      params.push(filters.branchId);
    }

    if (filters.status) {
      whereClauses.push('g.status = ?');
      params.push(filters.status);
    }

    if (filters.from) {
      whereClauses.push('DATE(g.created_at) >= ?');
      params.push(filters.from);
    }

    if (filters.to) {
      whereClauses.push('DATE(g.created_at) <= ?');
      params.push(filters.to);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await connection.query(
      `SELECT
        g.id AS sessionId,
        g.id,
        g.game_code AS sessionCode,
        g.title,
        g.status,
        g.branch_id AS branchId,
        hb.name AS branchName,
        hb.company_id AS companyId,
        g.card_price AS cardPrice,
        g.total_cards AS totalCards,
        g.numbers_per_card AS numbersPerCard,
        g.total_numbers_pool AS totalNumbersPool,
        g.total_prize_beers AS totalPrizeBeers,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt,
        g.started_at AS startedAt,
        g.ended_at AS endedAt,
        COALESCE(SUM(CASE WHEN c.status = 'AVAILABLE' THEN 1 ELSE 0 END), 0) AS availableCards,
        COALESCE(SUM(CASE WHEN c.status = 'SOLD' THEN 1 ELSE 0 END), 0) AS soldCards,
        COALESCE(SUM(CASE WHEN c.status = 'WINNER' THEN 1 ELSE 0 END), 0) AS winnerCards,
        COALESCE(SUM(CASE WHEN c.status = 'CLAIMED' THEN 1 ELSE 0 END), 0) AS claimedCards,
        COALESCE(COUNT(DISTINCT d.id), 0) AS drawCount,
        COALESCE(COUNT(DISTINCT w.id), 0) AS winnersCount,
        COALESCE(SUM(CASE WHEN w.is_claimed = 1 THEN 1 ELSE 0 END), 0) AS claimsCount
       FROM games g
       JOIN hotel_branches hb ON hb.id = g.branch_id
       LEFT JOIN cards c ON c.game_id = g.id
       LEFT JOIN draws d ON d.game_id = g.id
       LEFT JOIN winners w ON w.game_id = g.id
       ${whereSql}
       GROUP BY g.id, hb.name, hb.company_id
       ORDER BY g.created_at DESC`,
      params
    );

    return rows.map((row) => ({
      ...row,
      totalCards: Number(row.totalCards || 0),
      numbersPerCard: Number(row.numbersPerCard || 0),
      totalNumbersPool: Number(row.totalNumbersPool || 0),
      totalPrizeBeers: Number(row.totalPrizeBeers || 0),
      cardPrice: Number(row.cardPrice || 0),
      availableCards: Number(row.availableCards || 0),
      soldCards: Number(row.soldCards || 0),
      winnerCards: Number(row.winnerCards || 0),
      claimedCards: Number(row.claimedCards || 0),
      drawCount: Number(row.drawCount || 0),
      winnersCount: Number(row.winnersCount || 0),
      claimsCount: Number(row.claimsCount || 0),
      version: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    }));
  }

  async findSnapshot(connection, sessionId) {
    const [rows] = await connection.query(
      `SELECT
        g.id AS sessionId,
        g.id,
        g.game_code AS sessionCode,
        g.title,
        g.status,
        g.branch_id AS branchId,
        hb.name AS branchName,
        hb.company_id AS companyId,
        g.card_price AS cardPrice,
        g.total_cards AS totalCards,
        g.numbers_per_card AS numbersPerCard,
        g.total_numbers_pool AS totalNumbersPool,
        g.total_prize_beers AS totalPrizeBeers,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt,
        g.started_at AS startedAt,
        g.ended_at AS endedAt
       FROM games g
       JOIN hotel_branches hb ON hb.id = g.branch_id
       WHERE g.id = ?
       LIMIT 1`,
      [sessionId]
    );

    if (rows.length === 0) {
      return null;
    }

    const session = rows[0];

    const [[cardTotals]] = await connection.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END), 0) AS available,
        COALESCE(SUM(CASE WHEN status = 'SOLD' THEN 1 ELSE 0 END), 0) AS sold,
        COALESCE(SUM(CASE WHEN status = 'WINNER' THEN 1 ELSE 0 END), 0) AS winner,
        COALESCE(SUM(CASE WHEN status = 'CLAIMED' THEN 1 ELSE 0 END), 0) AS claimed
       FROM cards
       WHERE game_id = ?`,
      [sessionId]
    );

    const [calledRows] = await connection.query(
      `SELECT winning_number AS calledNumber
       FROM draws
       WHERE game_id = ?
       ORDER BY draw_position ASC`,
      [sessionId]
    );

    const [[winnerSummary]] = await connection.query(
      `SELECT
        COUNT(*) AS winners,
        COALESCE(SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END), 0) AS claims,
        COALESCE(SUM(beer_quantity), 0) AS beersAwarded
       FROM winners
       WHERE game_id = ?`,
      [sessionId]
    );

    const [[revenueSummary]] = await connection.query(
      `SELECT COALESCE(SUM(sold_price), 0) AS revenue
       FROM game_sales
       WHERE game_id = ?`,
      [sessionId]
    );

    return {
      ...session,
      cardPrice: Number(session.cardPrice || 0),
      totalCards: Number(session.totalCards || 0),
      numbersPerCard: Number(session.numbersPerCard || 0),
      totalNumbersPool: Number(session.totalNumbersPool || 0),
      totalPrizeBeers: Number(session.totalPrizeBeers || 0),
      currentRound: calledRows.length,
      calledNumbers: calledRows.map((item) => Number(item.calledNumber)),
      counts: {
        available: Number(cardTotals.available || 0),
        sold: Number(cardTotals.sold || 0),
        winner: Number(cardTotals.winner || 0),
        claimed: Number(cardTotals.claimed || 0),
      },
      winnerSummary: {
        winners: Number(winnerSummary.winners || 0),
        claims: Number(winnerSummary.claims || 0),
        beersAwarded: Number(winnerSummary.beersAwarded || 0),
      },
      revenuePreview: Number(revenueSummary.revenue || 0),
      version: Math.floor(new Date(session.updatedAt).getTime() / 1000),
    };
  }

  async updateStatus(_connection, _sessionId, _nextStatus, _expectedVersion) {
    const options = arguments[4] || {};
    const updates = ['status = ?', 'updated_at = NOW()'];
    const params = [_nextStatus];

    if (options.setStartedAt) {
      updates.push('started_at = COALESCE(started_at, NOW())');
    }

    if (options.clearStartedAt) {
      updates.push('started_at = NULL');
    }

    if (options.setEndedAt) {
      updates.push('ended_at = NOW()');
    }

    if (options.clearEndedAt) {
      updates.push('ended_at = NULL');
    }

    params.push(_sessionId);
    await _connection.query(
      `UPDATE games
       SET ${updates.join(', ')}
       WHERE id = ?`,
      params
    );

    return this.findById(_connection, _sessionId);
  }

  async resetRuntime(connection, sessionId) {
    await connection.query('DELETE FROM winners WHERE game_id = ?', [sessionId]);
    await connection.query('DELETE FROM draws WHERE game_id = ?', [sessionId]);
    await connection.query('DELETE FROM game_sales WHERE game_id = ?', [sessionId]);
    await connection.query(
      `UPDATE cards
       SET status = 'AVAILABLE', sold_at = NULL, updated_at = NOW()
       WHERE game_id = ?`,
      [sessionId]
    );
  }

  async complete(connection, sessionId, _expectedVersion) {
    const session = await this.updateStatus(connection, sessionId, 'COMPLETED', _expectedVersion, {
      setEndedAt: true,
    });

    const [[summaryRow]] = await connection.query(
      `SELECT
        (SELECT COUNT(*) FROM draws WHERE game_id = ?) AS drawCount,
        (SELECT COUNT(*) FROM winners WHERE game_id = ?) AS winnersCount,
        (SELECT COALESCE(SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END), 0) FROM winners WHERE game_id = ?) AS claimsCount,
        (SELECT COALESCE(SUM(sold_price), 0) FROM game_sales WHERE game_id = ?) AS revenue`
      ,
      [sessionId, sessionId, sessionId, sessionId]
    );

    return {
      sessionId: session.id,
      status: session.status,
      version: session.version,
      summary: {
        drawCount: Number(summaryRow.drawCount || 0),
        winnersCount: Number(summaryRow.winnersCount || 0),
        claimsCount: Number(summaryRow.claimsCount || 0),
        revenue: Number(summaryRow.revenue || 0),
      },
    };
  }
}

export const gameSessionRepository = new GameSessionRepository();
