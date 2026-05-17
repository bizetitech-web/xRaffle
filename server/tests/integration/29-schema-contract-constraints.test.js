import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const hasDbConfig = Boolean(
  process.env.DB_HOST &&
  process.env.DB_USER &&
  process.env.DB_NAME
);

async function getUniqueConstraintMap(connection, schemaName, tableName) {
  const [rows] = await connection.query(
    `SELECT
       INDEX_NAME AS indexName,
       COLUMN_NAME AS columnName,
       SEQ_IN_INDEX AS seqInIndex
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND NON_UNIQUE = 0
       AND INDEX_NAME <> 'PRIMARY'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [schemaName, tableName]
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.indexName)) {
      map.set(row.indexName, []);
    }
    map.get(row.indexName).push(row.columnName);
  }
  return map;
}

async function getForeignKeys(connection, schemaName, tableName) {
  const [rows] = await connection.query(
    `SELECT
       CONSTRAINT_NAME AS constraintName,
       COLUMN_NAME AS columnName,
       REFERENCED_TABLE_NAME AS referencedTable,
       REFERENCED_COLUMN_NAME AS referencedColumn
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [schemaName, tableName]
  );

  return rows;
}

test('runtime schema contract for unique and foreign key constraints remains compatible', { skip: !hasDbConfig }, async () => {
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

    const cardsUniques = await getUniqueConstraintMap(connection, schemaName, 'cards');
    const drawsUniques = await getUniqueConstraintMap(connection, schemaName, 'draws');
    const winnersUniques = await getUniqueConstraintMap(connection, schemaName, 'winners');
    const salesUniques = await getUniqueConstraintMap(connection, schemaName, 'game_sales');

    const cardsHasGameCardNumberUnique = Array.from(cardsUniques.values()).some(
      (cols) => cols.length === 2 && cols[0] === 'game_id' && cols[1] === 'card_number'
    );
    assert.ok(cardsHasGameCardNumberUnique, 'Expected unique (game_id, card_number) on cards');

    const drawsHasGamePositionUnique = Array.from(drawsUniques.values()).some(
      (cols) => cols.length === 2 && cols[0] === 'game_id' && cols[1] === 'draw_position'
    );
    assert.ok(drawsHasGamePositionUnique, 'Expected unique (game_id, draw_position) on draws');

    const drawsHasGameNumberUnique = Array.from(drawsUniques.values()).some(
      (cols) => cols.length === 2 && cols[0] === 'game_id' && cols[1] === 'winning_number'
    );
    assert.ok(drawsHasGameNumberUnique, 'Expected unique (game_id, winning_number) on draws');

    const winnersHasGameCardUnique = Array.from(winnersUniques.values()).some(
      (cols) => cols.length === 2 && cols[0] === 'game_id' && cols[1] === 'card_id'
    );
    assert.ok(winnersHasGameCardUnique, 'Expected unique (game_id, card_id) on winners');

    const salesHasGameCardUnique = Array.from(salesUniques.values()).some(
      (cols) => cols.length === 2 && cols[0] === 'game_id' && cols[1] === 'card_id'
    );
    assert.ok(salesHasGameCardUnique, 'Expected unique (game_id, card_id) on game_sales');

    const winnersFks = await getForeignKeys(connection, schemaName, 'winners');
    const salesFks = await getForeignKeys(connection, schemaName, 'game_sales');

    const expectedWinnerFkPairs = [
      ['game_id', 'games', 'id'],
      ['draw_id', 'draws', 'id'],
      ['card_id', 'cards', 'id'],
    ];

    for (const [columnName, referencedTable, referencedColumn] of expectedWinnerFkPairs) {
      assert.ok(
        winnersFks.some(
          (fk) =>
            fk.columnName === columnName &&
            fk.referencedTable === referencedTable &&
            fk.referencedColumn === referencedColumn
        ),
        `Expected FK winners.${columnName} -> ${referencedTable}.${referencedColumn}`
      );
    }

    const expectedSalesFkPairs = [
      ['game_id', 'games', 'id'],
      ['card_id', 'cards', 'id'],
    ];

    for (const [columnName, referencedTable, referencedColumn] of expectedSalesFkPairs) {
      assert.ok(
        salesFks.some(
          (fk) =>
            fk.columnName === columnName &&
            fk.referencedTable === referencedTable &&
            fk.referencedColumn === referencedColumn
        ),
        `Expected FK game_sales.${columnName} -> ${referencedTable}.${referencedColumn}`
      );
    }
  } finally {
    await connection.end();
  }
});
