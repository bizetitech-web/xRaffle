import test from 'node:test';
import assert from 'node:assert/strict';

import { gameSessionRepository } from '../../../src/contexts/gameSessions/gameSession.repository.js';

test('findTemplateForSessionCreate returns normalized template record', async () => {
  const connection = {
    query: async () => [[{
      id: 'template-1',
      companyId: 'co-1',
      branchId: 'br-1',
      title: 'Night Draw',
      cardPrice: '10.00',
      totalCards: 25,
      numbersPerCard: 4,
      totalPrizeBeers: 12,
      totalNumbersPool: 100,
      isActive: 1,
    }]],
  };

  const template = await gameSessionRepository.findTemplateForSessionCreate(connection, 'template-1');

  assert.deepEqual(template, {
    id: 'template-1',
    companyId: 'co-1',
    branchId: 'br-1',
    title: 'Night Draw',
    cardPrice: 10,
    totalCards: 25,
    numbersPerCard: 4,
    totalPrizeBeers: 12,
    totalNumbersPool: 100,
    isActive: true,
  });
});

test('createFromTemplate clones template prizes/cards/card_numbers into game tables', async () => {
  const calls = [];
  let uuidCounter = 0;

  const connection = {
    query: async (sql, params = []) => {
      const text = String(sql);
      calls.push({ sql: text, params });

      if (text.includes('SELECT UUID() AS id')) {
        uuidCounter += 1;
        return [[{ id: `uuid-${uuidCounter}` }]];
      }

      if (text.includes('FROM game_templates') && text.includes('WHERE id = ?')) {
        return [[{
          id: 'template-1',
          branchId: 'br-1',
          title: 'Night Draw',
          cardPrice: 15,
          totalCards: 2,
          numbersPerCard: 4,
          totalPrizeBeers: 8,
          totalNumbersPool: 20,
        }]];
      }

      if (text.includes('FROM game_template_prizes')) {
        return [[
          { drawPosition: 1, beerQuantity: 3 },
          { drawPosition: 2, beerQuantity: 2 },
        ]];
      }

      if (text.includes('FROM game_template_cards')) {
        return [[
          { templateCardId: 'tc-1', cardNumber: 1 },
          { templateCardId: 'tc-2', cardNumber: 2 },
        ]];
      }

      if (text.includes('FROM game_template_card_numbers')) {
        return [[
          { templateCardId: 'tc-1', numberPosition: 1, numberValue: 1 },
          { templateCardId: 'tc-1', numberPosition: 2, numberValue: 2 },
          { templateCardId: 'tc-1', numberPosition: 3, numberValue: 3 },
          { templateCardId: 'tc-1', numberPosition: 4, numberValue: 4 },
          { templateCardId: 'tc-2', numberPosition: 1, numberValue: 5 },
          { templateCardId: 'tc-2', numberPosition: 2, numberValue: 6 },
          { templateCardId: 'tc-2', numberPosition: 3, numberValue: 7 },
          { templateCardId: 'tc-2', numberPosition: 4, numberValue: 8 },
        ]];
      }

      return [[{ affectedRows: 1 }]];
    },
  };

  const created = await gameSessionRepository.createFromTemplate(connection, {
    templateId: 'template-1',
    gameCode: 'GAME-123',
    branchId: 'br-1',
    createdBy: 'user-1',
  });

  assert.deepEqual(created, {
    id: 'uuid-1',
    sessionCode: 'GAME-123',
    status: 'PENDING',
    version: 1,
  });

  const gameInsertCalls = calls.filter((c) => c.sql.includes('INSERT INTO games'));
  const prizeInsertCalls = calls.filter((c) => c.sql.includes('INSERT INTO game_prizes'));
  const cardInsertCalls = calls.filter((c) => c.sql.includes('INSERT INTO cards'));
  const cardNumberInsertCalls = calls.filter((c) => c.sql.includes('INSERT INTO card_numbers'));

  assert.equal(gameInsertCalls.length, 1);
  assert.equal(prizeInsertCalls.length, 2);
  assert.equal(cardInsertCalls.length, 2);
  assert.equal(cardNumberInsertCalls.length, 8);

  assert.deepEqual(gameInsertCalls[0].params.slice(0, 3), ['uuid-1', 'template-1', 'br-1']);

  assert.deepEqual(cardInsertCalls[0].params, ['uuid-2', 'uuid-1', 1]);
  assert.deepEqual(cardNumberInsertCalls[0].params, ['uuid-1', 'uuid-2', 1, 1]);
});

test('listSessions applies templateId filter and returns projected templateId', async () => {
  const calls = [];
  const connection = {
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return [[{
        sessionId: 'session-1',
        sessionCode: 'GAME-1',
        templateId: 'template-1',
        title: 'Night Draw',
        status: 'PENDING',
        cardPrice: 10,
        totalCards: 20,
        numbersPerCard: 4,
        totalPrizeBeers: 8,
        totalNumbersPool: 100,
        branchId: 'br-1',
        companyId: 'co-1',
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:01',
      }]];
    },
  };

  const rows = await gameSessionRepository.listSessions(connection, {
    companyId: 'co-1',
    templateId: 'template-1',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].templateId, 'template-1');

  const query = calls[0];
  assert.match(query.sql, /g\.template_id\s*=\s*\?/);
  assert.deepEqual(query.params, ['co-1', 'template-1']);
});

test('findDefaultBranchByCompany uses status column when available', async () => {
  const connection = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes("status = 'ACTIVE'")) {
        return [[{ id: 'branch-1' }]];
      }
      return [[]];
    },
  };

  const branchId = await gameSessionRepository.findDefaultBranchByCompany(connection, 'company-1');
  assert.equal(branchId, 'branch-1');
});

test('findDefaultBranchByCompany falls back to is_active for legacy schema', async () => {
  const connection = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes("status = 'ACTIVE'")) {
        const error = new Error('Unknown column');
        error.code = 'ER_BAD_FIELD_ERROR';
        throw error;
      }

      if (text.includes('is_active = 1')) {
        return [[{ id: 'branch-legacy-1' }]];
      }

      return [[]];
    },
  };

  const branchId = await gameSessionRepository.findDefaultBranchByCompany(connection, 'company-1');
  assert.equal(branchId, 'branch-legacy-1');
});
