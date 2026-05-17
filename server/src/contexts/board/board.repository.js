export class BoardRepository {
  async findSession(connection, sessionId, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const [rows] = await connection.query(
      `SELECT
        g.id AS sessionId,
        g.id,
        g.status,
        g.card_price AS cardPrice,
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
      cardPrice: Number(row.cardPrice || 0),
      version: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    };
  }

  async listCards(connection, sessionId, filters = {}) {
    const page = Number(filters.page || 1);
    const pageSize = Number(filters.pageSize || 100);
    const offset = (page - 1) * pageSize;

    const whereClauses = ['c.game_id = ?'];
    const params = [sessionId];

    if (filters.status) {
      whereClauses.push('c.status = ?');
      params.push(filters.status);
    }

    if (filters.search) {
      whereClauses.push('CAST(c.card_number AS CHAR) LIKE ?');
      params.push(`%${filters.search}%`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM cards c
       ${whereSql}`,
      params
    );

    const [rows] = await connection.query(
      `SELECT
        c.id AS cardId,
        c.card_number AS cardNumber,
        c.status,
        c.sold_at AS soldAt,
        gs.id AS saleId,
        gs.sold_price AS amount,
        gs.payment_method AS paymentMethod,
        gs.customer_name AS customerName,
        gs.customer_phone AS customerPhone,
        gs.note
       FROM cards c
       LEFT JOIN game_sales gs ON gs.card_id = c.id AND gs.game_id = c.game_id
       ${whereSql}
       ORDER BY c.card_number ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const totals = await this.getTotals(connection, sessionId);

    return {
      items: rows.map((row) => ({
        ...row,
        cardNumber: Number(row.cardNumber || 0),
        amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
      })),
      total: Number(countRow.total || 0),
      page,
      pageSize,
      totals,
      revenuePreview: totals.revenue,
    };
  }

  async findCard(connection, sessionId, payload, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    if (payload.cardId) {
      const [rows] = await connection.query(
        `SELECT id AS cardId, card_number AS cardNumber, status
         FROM cards
         WHERE game_id = ? AND id = ?
         LIMIT 1
         ${lockClause}`,
        [sessionId, payload.cardId]
      );
      return rows[0] || null;
    }

    const [rows] = await connection.query(
      `SELECT id AS cardId, card_number AS cardNumber, status
       FROM cards
       WHERE game_id = ? AND card_number = ?
       LIMIT 1
       ${lockClause}`,
      [sessionId, payload.cardNumber]
    );
    return rows[0] || null;
  }

  async touchSession(connection, sessionId) {
    await connection.query('UPDATE games SET updated_at = NOW() WHERE id = ?', [sessionId]);
  }

  async sellCard(connection, sessionId, payload) {
    const card = await this.findCard(connection, sessionId, payload, { forUpdate: true });
    if (!card) {
      return null;
    }

    if (card.status !== 'AVAILABLE') {
      return {
        skipped: true,
        reason: 'CARD_NOT_AVAILABLE',
        card,
      };
    }

    await connection.query(
      `INSERT INTO game_sales (
        id, game_id, card_id, sold_by, sold_price, payment_method,
        customer_name, customer_phone, note, sold_at, created_at
      ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        sessionId,
        card.cardId,
        payload.soldBy,
        payload.amount,
        payload.paymentMethod,
        payload.customerName || null,
        payload.customerPhone || null,
        payload.note || null,
      ]
    );

    await connection.query(
      `UPDATE cards
       SET status = 'SOLD', sold_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [card.cardId]
    );

    await this.touchSession(connection, sessionId);
    return { skipped: false, card: { ...card, status: 'SOLD' } };
  }

  async unsellCard(connection, sessionId, payload) {
    const card = await this.findCard(connection, sessionId, payload, { forUpdate: true });
    if (!card) {
      return null;
    }

    if (card.status !== 'SOLD') {
      return {
        skipped: true,
        reason: 'CARD_ALREADY_AVAILABLE',
        card,
      };
    }

    await connection.query('DELETE FROM game_sales WHERE game_id = ? AND card_id = ?', [sessionId, card.cardId]);
    await connection.query(
      `UPDATE cards
       SET status = 'AVAILABLE', sold_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [card.cardId]
    );

    await this.touchSession(connection, sessionId);
    return { skipped: false, card: { ...card, status: 'AVAILABLE' } };
  }

  async bulkAction(connection, sessionId, payload) {
    const identifiers = [];
    if (Array.isArray(payload.cardIds)) {
      for (const cardId of payload.cardIds) {
        identifiers.push({ cardId });
      }
    }

    if (Array.isArray(payload.cardNumbers)) {
      for (const cardNumber of payload.cardNumbers) {
        identifiers.push({ cardNumber: Number(cardNumber) });
      }
    }

    let processedCount = 0;
    let skippedCount = 0;

    for (const item of identifiers) {
      const result = payload.action === 'SELL'
        ? await this.sellCard(connection, sessionId, { ...payload, ...item })
        : await this.unsellCard(connection, sessionId, { ...payload, ...item });

      if (!result || result.skipped) {
        skippedCount += 1;
      } else {
        processedCount += 1;
      }
    }

    const totals = await this.getTotals(connection, sessionId);
    return {
      processedCount,
      skippedCount,
      totals,
      revenuePreview: totals.revenue,
    };
  }

  async resetBoard(connection, sessionId) {
    await connection.query('DELETE FROM winners WHERE game_id = ?', [sessionId]);
    await connection.query('DELETE FROM draws WHERE game_id = ?', [sessionId]);
    await connection.query('DELETE FROM game_sales WHERE game_id = ?', [sessionId]);
    await connection.query(
      `UPDATE cards
       SET status = 'AVAILABLE', sold_at = NULL, updated_at = NOW()
       WHERE game_id = ?`,
      [sessionId]
    );

    await this.touchSession(connection, sessionId);

    const totals = await this.getTotals(connection, sessionId);
    return {
      totals,
      revenuePreview: totals.revenue,
    };
  }

  async getTotals(connection, sessionId) {
    const [[row]] = await connection.query(
      `SELECT
        COALESCE(SUM(CASE WHEN c.status = 'AVAILABLE' THEN 1 ELSE 0 END), 0) AS available,
        COALESCE(SUM(CASE WHEN c.status = 'SOLD' THEN 1 ELSE 0 END), 0) AS sold,
        COALESCE(SUM(CASE WHEN c.status = 'WINNER' THEN 1 ELSE 0 END), 0) AS winner,
        COALESCE(SUM(CASE WHEN c.status = 'CLAIMED' THEN 1 ELSE 0 END), 0) AS claimed,
        COALESCE((SELECT SUM(gs.sold_price) FROM game_sales gs WHERE gs.game_id = ?), 0) AS revenue
       FROM cards c
       WHERE c.game_id = ?`,
      [sessionId, sessionId]
    );

    return {
      available: Number(row.available || 0),
      sold: Number(row.sold || 0),
      winner: Number(row.winner || 0),
      claimed: Number(row.claimed || 0),
      revenue: Number(row.revenue || 0),
    };
  }
}

export const boardRepository = new BoardRepository();
