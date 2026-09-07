export class GameTemplateRepository {
  async persistTemplateCards(connection, templateId, cards = []) {
    for (const card of cards) {
      const [[cardIdRow]] = await connection.query('SELECT UUID() AS id');
      const cardId = cardIdRow.id;

      await connection.query(
        `INSERT INTO game_template_cards (id, template_id, card_number, created_at)
         VALUES (?, ?, ?, NOW())`,
        [cardId, templateId, card.cardNumber]
      );

      for (let index = 0; index < card.numbers.length; index += 1) {
        await connection.query(
          `INSERT INTO game_template_card_numbers (id, template_id, template_card_id, number_position, number_value, created_at)
           VALUES (UUID(), ?, ?, ?, ?, NOW())`,
          [templateId, cardId, index + 1, card.numbers[index]]
        );
      }
    }
  }

  async createTemplate(connection, payload) {
    const { id, companyId, branchId, templateCode, title, cardPrice, totalCards, totalNumbersPool, numbersPerCard, generationMode, secondsPerCall, totalPrizeBeers, createdBy } = payload;

    await connection.query(
      `INSERT INTO game_templates (id, company_id, branch_id, template_code, title, card_price, total_cards, total_numbers_pool, numbers_per_card, seconds_per_call, generation_mode, is_default, total_prize_beers, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [id, companyId, branchId || null, templateCode, title, cardPrice, totalCards, totalNumbersPool, numbersPerCard, Number(secondsPerCall || 5), generationMode, payload.isDefault ? 1 : 0, totalPrizeBeers, createdBy || null]
    );

    if (Array.isArray(payload.prizes)) {
      for (const p of payload.prizes) {
        await connection.query(
          `INSERT INTO game_template_prizes (id, template_id, draw_position, beer_quantity, created_at)
           VALUES (UUID(), ?, ?, ?, NOW())`,
          [id, p.drawPosition, p.beerQuantity]
        );
      }
    }

    const { cards } = await this.generatePreview({
      template: {
        totalCards,
        numbersPerCard,
        totalNumbersPool,
        generationMode,
      },
    });

    await this.persistTemplateCards(connection, id, cards);

    const [[row]] = await connection.query('SELECT id FROM game_templates WHERE id = ? LIMIT 1', [id]);
    return row || null;
  }

  async listTemplates(connection, filters = {}) {
    const where = [];
    const params = [];
    if (filters.companyId) {
      where.push('company_id = ?'); params.push(filters.companyId);
    }
    if (filters.branchId) {
      where.push('branch_id = ?'); params.push(filters.branchId);
    }
    if (filters.isActive !== undefined) {
      where.push('is_active = ?'); params.push(filters.isActive ? 1 : 0);
    }
    if (filters.isDefault !== undefined) {
      where.push('is_default = ?'); params.push(filters.isDefault ? 1 : 0);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await connection.query(`SELECT id, template_code AS templateCode, title, company_id AS companyId, branch_id AS branchId, card_price AS cardPrice, total_cards AS totalCards, total_numbers_pool AS totalNumbersPool, numbers_per_card AS numbersPerCard, generation_mode AS generationMode, total_prize_beers AS totalPrizeBeers, is_default AS isDefault, is_active AS isActive, created_at AS createdAt FROM game_templates ${whereSql} ORDER BY is_default DESC, created_at DESC LIMIT 100`, params);
    return rows.map((r) => ({ ...r }));
  }

  async findTemplate(connection, templateId) {
    const [rows] = await connection.query(`SELECT id, template_code AS templateCode, title, company_id AS companyId, branch_id AS branchId, card_price AS cardPrice, total_cards AS totalCards, total_numbers_pool AS totalNumbersPool, numbers_per_card AS numbersPerCard, generation_mode AS generationMode, total_prize_beers AS totalPrizeBeers, is_default AS isDefault, is_active AS isActive, created_at AS createdAt FROM game_templates WHERE id = ? LIMIT 1`, [templateId]);
    if (rows.length === 0) return null;
    const template = rows[0];
    const [prizeRows] = await connection.query('SELECT draw_position AS drawPosition, beer_quantity AS beerQuantity FROM game_template_prizes WHERE template_id = ? ORDER BY draw_position ASC', [templateId]);
    template.prizes = prizeRows.map((p) => ({ drawPosition: Number(p.drawPosition || 0), beerQuantity: Number(p.beerQuantity || 0) }));
    return template;
  }

  async updateTemplate(connection, templateId, payload) {
    const sets = [];
    const params = [];
    if (payload.title) { sets.push('title = ?'); params.push(payload.title); }
    if (payload.cardPrice !== undefined) { sets.push('card_price = ?'); params.push(payload.cardPrice); }
    if (payload.totalCards !== undefined) { sets.push('total_cards = ?'); params.push(payload.totalCards); }
    if (payload.totalNumbersPool !== undefined) { sets.push('total_numbers_pool = ?'); params.push(payload.totalNumbersPool); }
    if (payload.numbersPerCard !== undefined) { sets.push('numbers_per_card = ?'); params.push(payload.numbersPerCard); }
    if (payload.generationMode) { sets.push('generation_mode = ?'); params.push(payload.generationMode); }
    if (payload.isDefault !== undefined) { sets.push('is_default = ?'); params.push(payload.isDefault ? 1 : 0); }
    if (sets.length === 0) return await this.findTemplate(connection, templateId);

    params.push(templateId);
    await connection.query(`UPDATE game_templates SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

    if (Array.isArray(payload.prizes)) {
      await connection.query('DELETE FROM game_template_prizes WHERE template_id = ?', [templateId]);
      for (const p of payload.prizes) {
        await connection.query('INSERT INTO game_template_prizes (id, template_id, draw_position, beer_quantity, created_at) VALUES (UUID(), ?, ?, ?, NOW())', [templateId, p.drawPosition, p.beerQuantity]);
      }
    }

    return this.findTemplate(connection, templateId);
  }

  async archiveTemplate(connection, templateId, archivedBy = null) {
    try {
      const [res] = await connection.query('UPDATE game_templates SET is_active = 0, updated_at = NOW() WHERE id = ?', [templateId]);
      if (res.affectedRows === 0) return null;
    } catch (err) {
      // Handle missing parent company FK by nulling company_id then retrying
      if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
        await connection.query('UPDATE game_templates SET company_id = NULL WHERE id = ?', [templateId]);
        const [res2] = await connection.query('UPDATE game_templates SET is_active = 0, updated_at = NOW() WHERE id = ?', [templateId]);
        if (res2.affectedRows === 0) return null;
      } else {
        throw err;
      }
    }

    await connection.query('INSERT INTO game_audit_logs (id, game_id, actor, action, details, created_at) VALUES (UUID(), NULL, ?, ?, ?, NOW())', [archivedBy, 'ARCHIVE_TEMPLATE', JSON.stringify({ templateId })]);
    return this.findTemplate(connection, templateId);
  }

  async clearDefaultForCompany(connection, companyId, exceptTemplateId = null) {
    if (!companyId) {
      return;
    }

    if (exceptTemplateId) {
      await connection.query(
        'UPDATE game_templates SET is_default = 0, updated_at = NOW() WHERE company_id = ? AND id <> ?',
        [companyId, exceptTemplateId]
      );
      return;
    }

    await connection.query(
      'UPDATE game_templates SET is_default = 0, updated_at = NOW() WHERE company_id = ?',
      [companyId]
    );
  }

  async findDefaultTemplateByCompany(connection, companyId) {
    const [rows] = await connection.query(
      `SELECT id, template_code AS templateCode, title, company_id AS companyId, branch_id AS branchId,
              card_price AS cardPrice, total_cards AS totalCards, total_numbers_pool AS totalNumbersPool,
              numbers_per_card AS numbersPerCard, generation_mode AS generationMode, total_prize_beers AS totalPrizeBeers,
              is_default AS isDefault, is_active AS isActive, created_at AS createdAt
       FROM game_templates
       WHERE company_id = ? AND is_default = 1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [companyId]
    );

    return rows[0] || null;
  }

  // Generate preview cards without persisting. Returns array of {cardNumber, numbers:[]}
  async generatePreview(opts) {
    const totalCards = Number(opts.totalCards || opts.template.totalCards || 25);
    const numbersPerCard = Number(opts.numbersPerCard || opts.template.numbersPerCard || 4);
    const pool = Number(opts.totalNumbersPool || opts.template.totalNumbersPool || 100);
    const mode = opts.generationMode || opts.template.generationMode || 'RANDOM';

    const cards = [];
    if (mode === 'SEQUENTIAL') {
      let cursor = 1;
      for (let i = 0; i < totalCards; i += 1) {
        const nums = [];
        for (let j = 0; j < numbersPerCard; j += 1) {
          nums.push(((cursor - 1) % pool) + 1);
          cursor += 1;
        }
        cards.push({ cardNumber: i + 1, numbers: nums });
      }
    } else {
      // RANDOM mode: ensure within-card uniqueness; allow duplicates across cards
      const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      for (let i = 0; i < totalCards; i += 1) {
        const set = new Set();
        while (set.size < numbersPerCard) {
          set.add(rand(1, pool));
        }
        cards.push({ cardNumber: i + 1, numbers: Array.from(set).sort((a,b) => a-b) });
      }
    }

    return { cards };
  }
}

export const gameTemplateRepository = new GameTemplateRepository();
