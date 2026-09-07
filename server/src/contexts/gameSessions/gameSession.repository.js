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
      id: row.id,
      companyId: row.companyId,
      branchId: row.branchId,
      title: row.title,
      cardPrice: Number(row.cardPrice || 0),
      totalCards: Number(row.totalCards || 0),
      numbersPerCard: Number(row.numbersPerCard || 0),
      totalPrizeBeers: Number(row.totalPrizeBeers || 0),
      totalNumbersPool: Number(row.totalNumbersPool || 0),
      isActive: Boolean(row.isActive),
    };
  }

  async createFromTemplate(connection, payload) {
    const [templateRows] = await connection.query(
      `SELECT
        id,
        branch_id AS branchId,
        title,
        card_price AS cardPrice,
        total_cards AS totalCards,
        numbers_per_card AS numbersPerCard,
        total_prize_beers AS totalPrizeBeers,
        total_numbers_pool AS totalNumbersPool
       FROM game_templates
       WHERE id = ?
       LIMIT 1`,
      [payload.templateId]
    );

    if (templateRows.length === 0) {
      return null;
    }

    const template = templateRows[0];
    const branchId = payload.branchId || template.branchId;
    if (!branchId) {
      return null;
    }

    const [[idRow]] = await connection.query('SELECT UUID() AS id');
    const gameId = idRow.id;

    await connection.query(
      `INSERT INTO games (
        id, template_id, branch_id, game_code, title, card_price, total_cards,
        numbers_per_card, total_prize_beers, total_numbers_pool,
        status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
      [
        gameId,
        payload.templateId,
        branchId,
        payload.gameCode,
        template.title,
        template.cardPrice,
        template.totalCards,
        template.numbersPerCard,
        template.totalPrizeBeers,
        template.totalNumbersPool,
        payload.createdBy || null,
      ]
    );

    // Create an initial game_charges row. Try to pre-populate from hotel/company templates
    try {
      // Resolve company_id for the branch (if available)
      let companyId = null;
      try {
        const [[branchRow]] = await connection.query('SELECT company_id AS companyId FROM hotel_branches WHERE id = ? LIMIT 1', [branchId]);
        companyId = branchRow ? branchRow.companyId : null;
      } catch (_) {
        companyId = null;
      }

      // Attempt to find a branch-level or company-level template
      let templateCharge = null;
      try {
        const [branchTemplates] = await connection.query(
          `SELECT charge_amount AS chargeAmount, charge_percentage AS chargePercentage
           FROM hotel_charge_templates
           WHERE branch_id = ?
           ORDER BY updated_at DESC
           LIMIT 1`,
          [branchId]
        );
        if (branchTemplates.length > 0) templateCharge = branchTemplates[0];
      } catch (_) {
        // ignore if table missing
      }

      if (!templateCharge && companyId) {
        try {
          const [companyTemplates] = await connection.query(
            `SELECT charge_amount AS chargeAmount, charge_percentage AS chargePercentage
             FROM hotel_charge_templates
             WHERE company_id = ?
             ORDER BY updated_at DESC
             LIMIT 1`,
            [companyId]
          );
          if (companyTemplates.length > 0) templateCharge = companyTemplates[0];
        } catch (_) {
          // ignore if table missing
        }
      }

      if (templateCharge) {
        await connection.query(
          `INSERT INTO game_charges (id, game_id, charge_amount, charge_percentage, created_at)
           VALUES (UUID(), ?, ?, ?, NOW())`,
          [gameId, templateCharge.chargeAmount || null, templateCharge.chargePercentage || null]
        );
      } else {
        await connection.query(
          `INSERT INTO game_charges (id, game_id, charge_amount, charge_percentage, created_at)
           VALUES (UUID(), ?, NULL, NULL, NOW())`,
          [gameId]
        );
      }
    } catch (e) {
      // If the table doesn't exist or insert fails, continue without breaking game creation.
      // Higher-level processes will surface errors if game_charges is required.
    }

    const [templatePrizes] = await connection.query(
      `SELECT draw_position AS drawPosition, beer_quantity AS beerQuantity
       FROM game_template_prizes
       WHERE template_id = ?
       ORDER BY draw_position ASC`,
      [payload.templateId]
    );

    for (const prize of templatePrizes) {
      await connection.query(
        `INSERT INTO game_prizes (id, game_id, draw_position, beer_quantity, created_at)
         VALUES (UUID(), ?, ?, ?, NOW())`,
        [gameId, prize.drawPosition, prize.beerQuantity]
      );
    }

    const [templateCards] = await connection.query(
      `SELECT id AS templateCardId, card_number AS cardNumber
       FROM game_template_cards
       WHERE template_id = ?
       ORDER BY card_number ASC`,
      [payload.templateId]
    );

    const [templateCardNumbers] = await connection.query(
      `SELECT
        template_card_id AS templateCardId,
        number_position AS numberPosition,
        number_value AS numberValue
       FROM game_template_card_numbers
       WHERE template_id = ?
       ORDER BY template_card_id ASC, number_position ASC`,
      [payload.templateId]
    );

    const numbersByTemplateCard = new Map();
    for (const row of templateCardNumbers) {
      const list = numbersByTemplateCard.get(row.templateCardId) || [];
      list.push(row);
      numbersByTemplateCard.set(row.templateCardId, list);
    }

    for (const templateCard of templateCards) {
      const [[cardIdRow]] = await connection.query('SELECT UUID() AS id');
      const cardId = cardIdRow.id;

      await connection.query(
        `INSERT INTO cards (id, game_id, card_number, status, created_at, updated_at)
         VALUES (?, ?, ?, 'AVAILABLE', NOW(), NOW())`,
        [cardId, gameId, templateCard.cardNumber]
      );

      const cardNumbers = numbersByTemplateCard.get(templateCard.templateCardId) || [];
      for (const cardNumber of cardNumbers) {
        await connection.query(
          `INSERT INTO card_numbers (id, game_id, card_id, number_position, number_value, created_at)
           VALUES (UUID(), ?, ?, ?, ?, NOW())`,
          [gameId, cardId, cardNumber.numberPosition, cardNumber.numberValue]
        );
      }
    }

    return {
      id: gameId,
      sessionCode: payload.gameCode,
      status: 'PENDING',
      version: 1,
    };
  }

  async findDefaultBranchByCompany(connection, companyId) {
    if (!companyId) {
      return null;
    }

    let rows;
    try {
      [rows] = await connection.query(
        `SELECT id
         FROM hotel_branches
         WHERE company_id = ?
           AND status = 'ACTIVE'
         ORDER BY created_at ASC
         LIMIT 1`,
        [companyId]
      );
    } catch (error) {
      // Support older schemas where status enum is not present.
      if (error?.code !== 'ER_BAD_FIELD_ERROR') {
        throw error;
      }

      [rows] = await connection.query(
        `SELECT id
         FROM hotel_branches
         WHERE company_id = ?
           AND is_active = 1
         ORDER BY created_at ASC
         LIMIT 1`,
        [companyId]
      );
    }

    if (rows.length === 0) {
      return null;
    }

    return rows[0].id;
  }

  async hasPersistedTemplateCards(connection, templateId) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM game_template_cards
       WHERE template_id = ?`,
      [templateId]
    );

    return Number(row?.total || 0) > 0;
  }

  async findById(_connection, _sessionId) {
    const [rows] = await _connection.query(
      `SELECT
        g.id,
        g.game_code AS sessionCode,
        g.template_id AS templateId,
        g.title,
        g.status,
        g.card_price AS cardPrice,
        g.total_cards AS totalCards,
        g.numbers_per_card AS numbersPerCard,
        g.total_prize_beers AS totalPrizeBeers,
        g.total_numbers_pool AS totalNumbersPool,
        g.branch_id AS branchId,
        hb.company_id AS companyId,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt
       FROM games g
       JOIN hotel_branches hb ON hb.id = g.branch_id
       WHERE g.id = ?
       LIMIT 1`,
      [_sessionId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      cardPrice: Number(row.cardPrice || 0),
      totalCards: Number(row.totalCards || 0),
      numbersPerCard: Number(row.numbersPerCard || 0),
      totalPrizeBeers: Number(row.totalPrizeBeers || 0),
      totalNumbersPool: Number(row.totalNumbersPool || 0),
      version: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    };
  }

  async countDraws(_connection, _sessionId) {
    const [[row]] = await _connection.query(
      `SELECT COUNT(*) AS total
       FROM draws
       WHERE game_id = ?`,
      [_sessionId]
    );

    return Number(row?.total || 0);
  }

  async countPrizes(_connection, _sessionId) {
    const [[row]] = await _connection.query(
      `SELECT COUNT(*) AS total
       FROM game_prizes
       WHERE game_id = ?`,
      [_sessionId]
    );

    return Number(row?.total || 0);
  }

  async updateStatus(_connection, _sessionId, _status, _actorId = null, _options = {}) {
    const sets = ['status = ?', 'updated_at = NOW()'];
    const params = [_status];

    if (_options.setStartedAt) {
      sets.push('started_at = NOW()');
    }

    if (_options.setEndedAt) {
      sets.push('ended_at = NOW()');
    }

    if (_options.clearStartedAt) {
      sets.push('started_at = NULL');
    }

    if (_options.clearEndedAt) {
      sets.push('ended_at = NULL');
    }

    params.push(_sessionId);
    await _connection.query(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, params);

    return this.findById(_connection, _sessionId);
  }

  async resetRuntime(_connection, _sessionId) {
    await _connection.query('DELETE FROM winners WHERE game_id = ?', [_sessionId]);
    await _connection.query('DELETE FROM draws WHERE game_id = ?', [_sessionId]);
    await _connection.query('DELETE FROM game_sales WHERE game_id = ?', [_sessionId]);
    await _connection.query(
      `UPDATE cards
       SET status = 'AVAILABLE', sold_at = NULL, updated_at = NOW()
       WHERE game_id = ?`,
      [_sessionId]
    );
  }

  async complete(_connection, _sessionId, _actorId = null) {
    await _connection.query(
      `UPDATE games
       SET status = 'COMPLETED', ended_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [_sessionId]
    );

    const [[counts]] = await _connection.query(
      `SELECT
        (SELECT COUNT(*) FROM draws d WHERE d.game_id = ?) AS drawCount,
        (SELECT COUNT(*) FROM winners w WHERE w.game_id = ?) AS winnersCount,
        (SELECT COUNT(*) FROM winners w WHERE w.game_id = ? AND w.is_claimed = 1) AS claimsCount,
        (SELECT COALESCE(SUM(gs.sold_price), 0) FROM game_sales gs WHERE gs.game_id = ?) AS revenue`,
      [_sessionId, _sessionId, _sessionId, _sessionId]
    );

    const refreshed = await this.findById(_connection, _sessionId);
    return {
      sessionId: refreshed.id,
      status: refreshed.status,
      version: refreshed.version,
      summary: {
        drawCount: Number(counts.drawCount || 0),
        winnersCount: Number(counts.winnersCount || 0),
        claimsCount: Number(counts.claimsCount || 0),
        revenue: Number(counts.revenue || 0),
      },
    };
  }

  async listSessions(connection, filters = {}) {
    const where = [];
    const params = [];

    if (filters.companyId) {
      where.push('hb.company_id = ?');
      params.push(filters.companyId);
    }

    if (filters.branchId) {
      where.push('g.branch_id = ?');
      params.push(filters.branchId);
    }

    if (filters.status) {
      where.push('g.status = ?');
      params.push(filters.status);
    }
    
    if (filters.templateId) {
      where.push('g.template_id = ?');
      params.push(filters.templateId);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await connection.query(
      `SELECT
        g.id AS sessionId,
        g.game_code AS sessionCode,
        g.template_id AS templateId,
        g.title,
        g.status,
        g.card_price AS cardPrice,
        g.total_cards AS totalCards,
        g.numbers_per_card AS numbersPerCard,
        g.total_prize_beers AS totalPrizeBeers,
        g.total_numbers_pool AS totalNumbersPool,
        g.branch_id AS branchId,
        hb.company_id AS companyId,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt
       FROM games g
       JOIN hotel_branches hb ON hb.id = g.branch_id
       ${whereSql}
       ORDER BY g.created_at DESC
       LIMIT 100`,
      params
    );

    return rows.map((row) => ({
      ...row,
      cardPrice: Number(row.cardPrice || 0),
      totalCards: Number(row.totalCards || 0),
      numbersPerCard: Number(row.numbersPerCard || 0),
      totalPrizeBeers: Number(row.totalPrizeBeers || 0),
      totalNumbersPool: Number(row.totalNumbersPool || 0),
      version: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    }));
  }
}

export const gameSessionRepository = new GameSessionRepository();
