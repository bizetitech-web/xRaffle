export class GameTemplateRepository {
  async create(connection, payload) {
    const {
      id,
      companyId,
      branchId,
      templateCode,
      title,
      cardPrice,
      totalCards,
      totalNumbersPool,
      numbersPerCard,
      totalPrizeBeers,
      secondsPerCall,
      generationMode,
      createdBy,
    } = payload;

    await connection.query(
      `INSERT INTO game_templates (
        id, company_id, branch_id, template_code, title,
        card_price, total_cards, total_numbers_pool, numbers_per_card,
        total_prize_beers, seconds_per_call, generation_mode,
        is_active, version, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, NOW(), NOW())`,
      [
        id,
        companyId,
        branchId || null,
        templateCode,
        title,
        cardPrice,
        totalCards,
        totalNumbersPool,
        numbersPerCard,
        totalPrizeBeers,
        secondsPerCall,
        generationMode,
        createdBy,
        createdBy,
      ]
    );

    return this.findById(connection, id);
  }

  async findById(connection, templateId) {
    const [rows] = await connection.query(
      `SELECT
        gt.id,
        gt.company_id AS companyId,
        gt.branch_id AS branchId,
        gt.template_code AS templateCode,
        gt.title,
        gt.card_price AS cardPrice,
        gt.total_cards AS totalCards,
        gt.total_numbers_pool AS totalNumbersPool,
        gt.numbers_per_card AS numbersPerCard,
        gt.total_prize_beers AS totalPrizeBeers,
        gt.seconds_per_call AS secondsPerCall,
        gt.generation_mode AS generationMode,
        gt.is_active AS isActive,
        gt.version,
        gt.created_by AS createdBy,
        gt.updated_by AS updatedBy,
        gt.created_at AS createdAt,
        gt.updated_at AS updatedAt,
        hb.name AS branchName,
        hc.name AS companyName
       FROM game_templates gt
       JOIN hotel_companies hc ON hc.id = gt.company_id
       LEFT JOIN hotel_branches hb ON hb.id = gt.branch_id
       WHERE gt.id = ?
       LIMIT 1`,
      [templateId]
    );

    if (rows.length === 0) {
      return null;
    }

    const [prizeRows] = await connection.query(
      `SELECT
        id,
        template_id AS templateId,
        draw_position AS drawPosition,
        beer_quantity AS beerQuantity,
        created_at AS createdAt
       FROM game_template_prizes
       WHERE template_id = ?
       ORDER BY draw_position ASC`,
      [templateId]
    );

    return {
      ...rows[0],
      isActive: Number(rows[0].isActive) === 1,
      version: Number(rows[0].version || 1),
      cardPrice: Number(rows[0].cardPrice || 0),
      totalCards: Number(rows[0].totalCards || 0),
      totalNumbersPool: Number(rows[0].totalNumbersPool || 0),
      numbersPerCard: Number(rows[0].numbersPerCard || 0),
      totalPrizeBeers: Number(rows[0].totalPrizeBeers || 0),
      secondsPerCall: Number(rows[0].secondsPerCall || 0),
      prizes: prizeRows.map((row) => ({
        ...row,
        drawPosition: Number(row.drawPosition),
        beerQuantity: Number(row.beerQuantity),
      })),
    };
  }

  async list(connection, filters = {}) {
    const whereClauses = [];
    const params = [];

    if (filters.companyId) {
      whereClauses.push('gt.company_id = ?');
      params.push(filters.companyId);
    }

    if (filters.branchId) {
      whereClauses.push('gt.branch_id = ?');
      params.push(filters.branchId);
    }

    if (typeof filters.active === 'boolean') {
      whereClauses.push('gt.is_active = ?');
      params.push(filters.active ? 1 : 0);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await connection.query(
      `SELECT
        gt.id,
        gt.company_id AS companyId,
        gt.branch_id AS branchId,
        gt.template_code AS templateCode,
        gt.title,
        gt.card_price AS cardPrice,
        gt.total_cards AS totalCards,
        gt.total_numbers_pool AS totalNumbersPool,
        gt.numbers_per_card AS numbersPerCard,
        gt.total_prize_beers AS totalPrizeBeers,
        gt.seconds_per_call AS secondsPerCall,
        gt.generation_mode AS generationMode,
        gt.is_active AS isActive,
        gt.version,
        gt.created_at AS createdAt,
        gt.updated_at AS updatedAt,
        hb.name AS branchName,
        hc.name AS companyName,
        COALESCE(COUNT(gp.id), 0) AS prizeCount,
        COALESCE(SUM(gp.beer_quantity), 0) AS prizeBeerTotal
       FROM game_templates gt
       JOIN hotel_companies hc ON hc.id = gt.company_id
       LEFT JOIN hotel_branches hb ON hb.id = gt.branch_id
       LEFT JOIN game_template_prizes gp ON gp.template_id = gt.id
       ${whereSql}
       GROUP BY gt.id, hb.name, hc.name
       ORDER BY gt.updated_at DESC`,
      params
    );

    return rows.map((row) => ({
      ...row,
      isActive: Number(row.isActive) === 1,
      version: Number(row.version || 1),
      cardPrice: Number(row.cardPrice || 0),
      totalCards: Number(row.totalCards || 0),
      totalNumbersPool: Number(row.totalNumbersPool || 0),
      numbersPerCard: Number(row.numbersPerCard || 0),
      totalPrizeBeers: Number(row.totalPrizeBeers || 0),
      secondsPerCall: Number(row.secondsPerCall || 0),
      prizeCount: Number(row.prizeCount || 0),
      prizeBeerTotal: Number(row.prizeBeerTotal || 0),
    }));
  }

  async update(connection, templateId, payload) {
    const updates = [];
    const params = [];

    const setIf = (condition, clause, value) => {
      if (condition) {
        updates.push(clause);
        params.push(value);
      }
    };

    setIf(payload.title !== undefined, 'title = ?', payload.title);
    setIf(payload.cardPrice !== undefined, 'card_price = ?', payload.cardPrice);
    setIf(payload.totalCards !== undefined, 'total_cards = ?', payload.totalCards);
    setIf(payload.totalNumbersPool !== undefined, 'total_numbers_pool = ?', payload.totalNumbersPool);
    setIf(payload.numbersPerCard !== undefined, 'numbers_per_card = ?', payload.numbersPerCard);
    setIf(payload.totalPrizeBeers !== undefined, 'total_prize_beers = ?', payload.totalPrizeBeers);
    setIf(payload.secondsPerCall !== undefined, 'seconds_per_call = ?', payload.secondsPerCall);
    setIf(payload.generationMode !== undefined, 'generation_mode = ?', payload.generationMode);
    setIf(payload.branchId !== undefined, 'branch_id = ?', payload.branchId || null);
    setIf(payload.updatedBy !== undefined, 'updated_by = ?', payload.updatedBy || null);

    if (updates.length > 0) {
      updates.push('version = version + 1');
      updates.push('updated_at = NOW()');
      params.push(templateId);
      await connection.query(
        `UPDATE game_templates
         SET ${updates.join(', ')}
         WHERE id = ?`,
        params
      );
    }

    return this.findById(connection, templateId);
  }

  async archive(connection, templateId, updatedBy = null) {
    await connection.query(
      `UPDATE game_templates
       SET is_active = 0,
           version = version + 1,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [updatedBy, templateId]
    );

    return this.findById(connection, templateId);
  }

  async replacePrizes(connection, templateId, prizes) {
    await connection.query('DELETE FROM game_template_prizes WHERE template_id = ?', [templateId]);

    for (const item of prizes) {
      await connection.query(
        `INSERT INTO game_template_prizes (
          id, template_id, draw_position, beer_quantity, created_at
        ) VALUES (UUID(), ?, ?, ?, NOW())`,
        [templateId, item.drawPosition, item.beerQuantity]
      );
    }

    return this.findById(connection, templateId);
  }
}

export const gameTemplateRepository = new GameTemplateRepository();
