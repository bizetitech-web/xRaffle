import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const read = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('game template routes declare permission guards per contract', () => {
  const source = read('src/contexts/gameTemplates/gameTemplate.routes.js');

  assert.match(source, /router\.post\([\s\S]*'\/game-templates'[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
  assert.match(source, /router\.get\([\s\S]*'\/game-templates'[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(source, /router\.get\([\s\S]*'\/game-templates\/:templateId'[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(source, /router\.put\([\s\S]*'\/game-templates\/:templateId'[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
  assert.match(source, /router\.patch\([\s\S]*'\/game-templates\/:templateId\/archive'[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
  assert.match(source, /router\.post\([\s\S]*'\/game-templates\/:templateId\/cards\/preview'[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
});

test('game session routes declare permission guards per contract', () => {
  const source = read('src/contexts/gameSessions/gameSession.routes.js');

  assert.match(source, /router\.post\([\s\S]*'\/game-sessions'[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
  assert.match(source, /router\.get\([\s\S]*'\/game-sessions'[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(source, /router\.get\([\s\S]*'\/game-sessions\/:sessionId'[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(source, /sessionId\/start[\s\S]*requirePermissions\(\['RUN_DRAWS'\]\)/);
  assert.match(source, /sessionId\/pause[\s\S]*requirePermissions\(\['RUN_DRAWS'\]\)/);
  assert.match(source, /sessionId\/resume[\s\S]*requirePermissions\(\['RUN_DRAWS'\]\)/);
  assert.match(source, /sessionId\/end[\s\S]*requirePermissions\(\['RUN_DRAWS'\]\)/);
  assert.match(source, /sessionId\/reset[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
  assert.match(source, /sessionId\/complete[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);
});

test('board and playground routes declare permission guards per contract', () => {
  const board = read('src/contexts/board/board.routes.js');
  const playground = read('src/contexts/playground/playground.routes.js');

  assert.match(board, /board\/cards[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(board, /board\/sell[\s\S]*requirePermissions\(\['SELL_CARDS'\]\)/);
  assert.match(board, /board\/unsell[\s\S]*requirePermissions\(\['SELL_CARDS'\]\)/);
  assert.match(board, /board\/bulk[\s\S]*requirePermissions\(\['SELL_CARDS'\]\)/);
  assert.match(board, /board\/reset[\s\S]*requirePermissions\(\['MANAGE_GAMES'\]\)/);

  assert.match(playground, /playground\/pool[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(playground, /draw\/next[\s\S]*requirePermissions\(\['RUN_DRAWS'\]\)/);
  assert.match(playground, /auto-draw[\s\S]*requirePermissions\(\['RUN_DRAWS'\]\)/);
  assert.match(playground, /playground\/history[\s\S]*requirePermissions\(\['VIEW_GAMES'\]\)/);
  assert.match(playground, /playground\/winners[\s\S]*requirePermissions\(\['VIEW_WINNERS'\]\)/);
  assert.match(playground, /game-winners\/:winnerId\/claim[\s\S]*requirePermissions\(\['CLAIM_PRIZES'\]\)/);
});
