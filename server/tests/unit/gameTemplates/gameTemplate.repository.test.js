import test from 'node:test';
import assert from 'node:assert/strict';
import { gameTemplateRepository } from '../../../src/contexts/gameTemplates/gameTemplate.repository.js';

test('createTemplate persists generated template cards and card numbers', async () => {
  const queries = [];
  let uuidCounter = 0;
  const connection = {
    query: async (sql, params = []) => {
      queries.push({ sql: String(sql), params });

      if (String(sql).includes('SELECT UUID() AS id')) {
        uuidCounter += 1;
        return [[{ id: `card-${uuidCounter}` }]];
      }

      if (String(sql).includes('SELECT id FROM game_templates WHERE id = ? LIMIT 1')) {
        return [[{ id: 'template-1' }]];
      }

      return [[{ affectedRows: 1 }]];
    },
  };

  const result = await gameTemplateRepository.createTemplate(connection, {
    id: 'template-1',
    companyId: 'co-1',
    branchId: 'br-1',
    templateCode: 'TMP-001',
    title: 'Template 1',
    cardPrice: 10,
    totalCards: 3,
    totalNumbersPool: 20,
    numbersPerCard: 4,
    generationMode: 'SEQUENTIAL',
    totalPrizeBeers: 8,
    prizes: [{ drawPosition: 1, beerQuantity: 3 }],
    createdBy: 'user-1',
  });

  assert.deepEqual(result, { id: 'template-1' });

  const cardInsertQueries = queries.filter((q) => q.sql.includes('INSERT INTO game_template_cards'));
  const numberInsertQueries = queries.filter((q) => q.sql.includes('INSERT INTO game_template_card_numbers'));

  assert.equal(cardInsertQueries.length, 3);
  assert.equal(numberInsertQueries.length, 12);
  assert.deepEqual(cardInsertQueries[0].params, ['card-1', 'template-1', 1]);
  assert.deepEqual(numberInsertQueries[0].params, ['template-1', 'card-1', 1, 1]);
});

test('generatePreview sequential mode produces sequential numbers', async () => {
  const template = { totalCards: 25, numbersPerCard: 4, totalNumbersPool: 100, generationMode: 'SEQUENTIAL' };
  const res = await gameTemplateRepository.generatePreview({ template, totalCards: 25, generationMode: 'SEQUENTIAL' });
  assert.equal(res.cards.length, 25);
  // card 1 numbers should be 1..4, card 2 5..8
  assert.deepEqual(res.cards[0].numbers, [1,2,3,4]);
  assert.deepEqual(res.cards[1].numbers, [5,6,7,8]);
  // last card should wrap within pool
  const last = res.cards[24];
  assert.equal(last.numbers.length, 4);
  for (const n of last.numbers) {
    assert.ok(n >= 1 && n <= 100);
  }
});

test('generatePreview random mode produces unique numbers per card within pool', async () => {
  const template = { totalCards: 10, numbersPerCard: 4, totalNumbersPool: 50, generationMode: 'RANDOM' };
  const res = await gameTemplateRepository.generatePreview({ template, totalCards: 10, generationMode: 'RANDOM' });
  assert.equal(res.cards.length, 10);
  for (const c of res.cards) {
    assert.equal(c.numbers.length, 4);
    const set = new Set(c.numbers);
    assert.equal(set.size, 4, 'numbers in a card must be unique');
    for (const n of c.numbers) {
      assert.ok(n >= 1 && n <= 50);
    }
  }
});
