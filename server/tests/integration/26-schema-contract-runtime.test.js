import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const hasDbConfig = Boolean(
  process.env.DB_HOST &&
  process.env.DB_USER &&
  process.env.DB_NAME
);

function enumContainsAll(columnType, expectedValues) {
  return expectedValues.every((value) => columnType.includes(`'${value}'`));
}

async function getColumns(connection, schemaName, tableName) {
  const [rows] = await connection.query(
    `SELECT
       COLUMN_NAME AS columnName,
       DATA_TYPE AS dataType,
       COLUMN_TYPE AS columnType,
       IS_NULLABLE AS isNullable
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?`,
    [schemaName, tableName]
  );

  const byName = new Map();
  for (const row of rows) {
    byName.set(row.columnName, row);
  }

  return byName;
}

test('runtime schema contract for games/cards/game_sales/winners stays compatible', { skip: !hasDbConfig }, async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [[dbRow]] = await connection.query('SELECT DATABASE() AS dbName');
    const schemaName = dbRow?.dbName;
    assert.ok(schemaName, 'Expected active database name');

    const games = await getColumns(connection, schemaName, 'games');
    const cards = await getColumns(connection, schemaName, 'cards');
    const gameSales = await getColumns(connection, schemaName, 'game_sales');
    const winners = await getColumns(connection, schemaName, 'winners');

    const expectedGamesColumns = [
      'id',
      'branch_id',
      'game_code',
      'card_price',
      'total_cards',
      'numbers_per_card',
      'total_prize_beers',
      'total_numbers_pool',
      'status',
      'started_at',
      'ended_at',
      'updated_at',
    ];

    const expectedCardsColumns = [
      'id',
      'game_id',
      'card_number',
      'status',
      'sold_at',
    ];

    const expectedGameSalesColumns = [
      'id',
      'game_id',
      'card_id',
      'sold_price',
      'payment_method',
      'sold_by',
      'sold_at',
    ];

    const expectedWinnersColumns = [
      'id',
      'game_id',
      'draw_id',
      'card_id',
      'beer_quantity',
      'is_claimed',
      'claimed_at',
      'claimed_by',
    ];

    for (const name of expectedGamesColumns) {
      assert.ok(games.has(name), `Expected games.${name}`);
    }

    for (const name of expectedCardsColumns) {
      assert.ok(cards.has(name), `Expected cards.${name}`);
    }

    for (const name of expectedGameSalesColumns) {
      assert.ok(gameSales.has(name), `Expected game_sales.${name}`);
    }

    for (const name of expectedWinnersColumns) {
      assert.ok(winners.has(name), `Expected winners.${name}`);
    }

    const gamesStatus = games.get('status')?.columnType || '';
    assert.ok(
      enumContainsAll(gamesStatus, ['PENDING', 'ACTIVE', 'DRAWING', 'COMPLETED', 'CANCELLED']),
      `Unexpected games.status enum: ${gamesStatus}`
    );

    const cardsStatus = cards.get('status')?.columnType || '';
    assert.ok(
      enumContainsAll(cardsStatus, ['AVAILABLE', 'SOLD', 'WINNER', 'CLAIMED']),
      `Unexpected cards.status enum: ${cardsStatus}`
    );

    const paymentMethod = gameSales.get('payment_method')?.columnType || '';
    assert.ok(
      enumContainsAll(paymentMethod, ['CASH', 'TELEBIRR', 'CBEBIRR', 'BANK', 'OTHER']),
      `Unexpected game_sales.payment_method enum: ${paymentMethod}`
    );

    const winnerClaimType = winners.get('is_claimed')?.dataType || '';
    assert.equal(winnerClaimType, 'tinyint', `Expected winners.is_claimed tinyint, got ${winnerClaimType}`);
  } finally {
    await connection.end();
  }
});
