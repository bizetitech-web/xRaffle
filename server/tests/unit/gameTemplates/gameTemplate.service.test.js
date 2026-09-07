import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { gameTemplateService } from '../../../src/contexts/gameTemplates/gameTemplate.service.js';
import { gameTemplateRepository } from '../../../src/contexts/gameTemplates/gameTemplate.repository.js';

test('createTemplate persists template and returns id', async () => {
  const originalGetConnection = pool.getConnection;
  const originalCreateTemplate = gameTemplateRepository.createTemplate;

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql) => {
      if (String(sql).includes('SELECT UUID() AS id')) return [[{ id: 'uuid-1' }]];
      return [[]];
    },
  };

  pool.getConnection = async () => connection;

  let calledWith = null;
  gameTemplateRepository.createTemplate = async (conn, payload) => {
    calledWith = payload;
    return { id: payload.id };
  };

  try {
    const req = {
      body: {
        templateCode: 'T1',
        title: 'Test',
        companyId: 'co-1',
        cardPrice: 10,
        totalCards: 25,
        totalNumbersPool: 100,
        numbersPerCard: 4,
        generationMode: 'SEQUENTIAL',
        totalPrizeBeers: 10,
        prizes: [{ drawPosition: 1, beerQuantity: 3 }],
      },
      user: { sub: 'user-1' },
    };

    const res = await gameTemplateService.createTemplate(req);
    assert.equal(res.templateId, 'uuid-1');
    assert.ok(calledWith);
    assert.equal(calledWith.templateCode, 'T1');
    assert.equal(calledWith.totalCards, 25);
    assert.equal(calledWith.totalNumbersPool, 100);
    assert.equal(calledWith.numbersPerCard, 4);
    assert.equal(calledWith.generationMode, 'SEQUENTIAL');
  } finally {
    pool.getConnection = originalGetConnection;
    gameTemplateRepository.createTemplate = originalCreateTemplate;
  }
});

test('createTemplate throws when repository create returns null', async () => {
  const originalGetConnection = pool.getConnection;
  const originalCreateTemplate = gameTemplateRepository.createTemplate;

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql) => {
      if (String(sql).includes('SELECT UUID() AS id')) return [[{ id: 'uuid-1' }]];
      return [[]];
    },
  };

  pool.getConnection = async () => connection;
  gameTemplateRepository.createTemplate = async () => null;

  try {
    await assert.rejects(
      () => gameTemplateService.createTemplate({
        body: {
          templateCode: 'T2',
          title: 'Test 2',
          companyId: 'co-1',
          cardPrice: 10,
          totalCards: 25,
          totalNumbersPool: 100,
          numbersPerCard: 4,
        },
        user: { sub: 'user-1' },
      }),
      (error) => {
        assert.equal(error.status, 500);
        return true;
      }
    );
  } finally {
    pool.getConnection = originalGetConnection;
    gameTemplateRepository.createTemplate = originalCreateTemplate;
  }
});

test('generatePreview returns card samples from repository logic', async () => {
  const originalFindTemplate = gameTemplateRepository.findTemplate;

  gameTemplateRepository.findTemplate = async () => ({
    id: 'template-1',
    totalCards: 10,
    numbersPerCard: 4,
    totalNumbersPool: 50,
    generationMode: 'RANDOM',
  });

  try {
    const req = { params: { templateId: 'template-1' }, body: { totalCards: 10 } };
    const res = await gameTemplateService.generatePreview(req);
    assert.equal(res.cards.length, 10);
    assert.equal(res.cards[0].numbers.length, 4);
  } finally {
    gameTemplateRepository.findTemplate = originalFindTemplate;
  }
});
