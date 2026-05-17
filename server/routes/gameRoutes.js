import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { canAccessOrganization, hasPermission } from '../middleware/rbac.js';
import pool from '../config/database.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

function makeGameCode() {
  const stamp = Date.now().toString().slice(-8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GAME-${stamp}-${rand}`;
}

function createSeededRng(seedInput) {
  let h = 2166136261;
  const text = String(seedInput || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateUniqueCardNumbers(numbersPerCard, totalNumbersPool, rng) {
  const picked = new Set();
  while (picked.size < numbersPerCard) {
    picked.add(1 + Math.floor(rng() * totalNumbersPool));
  }
  return Array.from(picked).sort((a, b) => a - b);
}

router.post(
  '/',
  hasPermission(['MANAGE_GAMES']),
  [
    body('branchId').isUUID(),
    body('title').optional().isString().trim(),
    body('cardPrice').isFloat({ gt: 0 }),
    body('totalCards').isInt({ gt: 0 }),
    body('numbersPerCard').optional().isInt({ gt: 0 }),
    body('totalPrizeBeers').isInt({ gt: 0 }),
    body('totalNumbersPool').optional().isInt({ gt: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const isSuperAdmin = req.user.role_level === 1;
      const {
        branchId,
        title,
        cardPrice,
        totalCards,
        numbersPerCard = 4,
        totalPrizeBeers,
        totalNumbersPool = 100,
      } = req.body;

      const [branchRows] = await pool.query(
        'SELECT id, company_id FROM hotel_branches WHERE id = ? LIMIT 1',
        [branchId]
      );

      if (branchRows.length === 0) {
        return res.status(400).json({ error: 'Invalid branch' });
      }

      const branch = branchRows[0];
      if (!isSuperAdmin && branch.company_id !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const gameId = uuidv4();
      const gameCode = makeGameCode();

      await pool.query(
        `INSERT INTO games (
          id, branch_id, game_code, title, card_price, total_cards, numbers_per_card,
          total_prize_beers, total_numbers_pool, status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
        [
          gameId,
          branchId,
          gameCode,
          title || null,
          Number(cardPrice),
          Number(totalCards),
          Number(numbersPerCard),
          Number(totalPrizeBeers),
          Number(totalNumbersPool),
          req.user.sub,
        ]
      );

      await pool.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), branch.company_id, req.user.sub, 'CREATE_GAME', 'games', gameId]
      );

      return res.status(201).json({
        id: gameId,
        gameCode,
        status: 'PENDING',
      });
    } catch (error) {
      console.error('Create game error:', error);
      return res.status(500).json({ error: 'Failed to create game' });
    }
  }
);

router.post(
  '/:gameId/prizes',
  hasPermission(['MANAGE_GAMES']),
  [
    param('gameId').isUUID(),
    body('prizes').isArray({ min: 1 }),
    body('prizes.*.drawPosition').isInt({ gt: 0 }),
    body('prizes.*.beerQuantity').isInt({ gt: 0 }),
  ],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const { prizes } = req.body;
      const isSuperAdmin = req.user.role_level === 1;

      const [gameRows] = await pool.query(
        `SELECT g.id, g.total_prize_beers, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1`,
        [gameId]
      );

      if (gameRows.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const seen = new Set();
      for (const item of prizes) {
        if (seen.has(item.drawPosition)) {
          return res.status(400).json({ error: 'Duplicate draw positions are not allowed' });
        }
        seen.add(item.drawPosition);
      }

      const totalPrize = prizes.reduce((sum, item) => sum + Number(item.beerQuantity), 0);
      if (totalPrize !== Number(game.total_prize_beers)) {
        return res.status(400).json({
          error: `Total configured prize beers (${totalPrize}) must equal game total prize beers (${game.total_prize_beers})`,
        });
      }

      await connection.beginTransaction();

      await connection.query('DELETE FROM game_prizes WHERE game_id = ?', [gameId]);

      for (const item of prizes) {
        await connection.query(
          `INSERT INTO game_prizes (id, game_id, draw_position, beer_quantity, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [uuidv4(), gameId, Number(item.drawPosition), Number(item.beerQuantity)]
        );
      }

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'CONFIGURE_GAME_PRIZES', 'game_prizes', gameId]
      );

      await connection.commit();

      return res.status(201).json({
        gameId,
        totalPositions: prizes.length,
        totalPrizeBeers: totalPrize,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Configure game prizes error:', error);
      return res.status(500).json({ error: 'Failed to configure game prizes' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/charge',
  hasPermission(['MANAGE_GAMES']),
  [
    param('gameId').isUUID(),
    body('feeAmount').isFloat({ gt: 0 }),
    body('description').optional().isString(),
  ],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const feeAmount = Number(req.body.feeAmount);
      const description = req.body.description || 'Platform game fee';
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT g.id, g.status, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      const [existingChargeRows] = await connection.query(
        'SELECT id FROM game_charges WHERE game_id = ? LIMIT 1 FOR UPDATE',
        [gameId]
      );

      if (existingChargeRows.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          error: 'Game fee has already been charged',
          code: 'GAME_ALREADY_CHARGED',
        });
      }

      const [walletRows] = await connection.query(
        'SELECT id, balance FROM wallet_accounts WHERE company_id = ? LIMIT 1 FOR UPDATE',
        [game.company_id]
      );

      if (walletRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Wallet account not found for game company' });
      }

      const wallet = walletRows[0];
      const balanceBefore = Number(wallet.balance);

      if (balanceBefore < feeAmount) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Insufficient wallet balance',
          code: 'INSUFFICIENT_WALLET_BALANCE',
          balanceBefore,
          requiredAmount: feeAmount,
        });
      }

      const balanceAfter = balanceBefore - feeAmount;
      const gameChargeId = uuidv4();
      const walletTransactionId = uuidv4();

      await connection.query(
        `INSERT INTO wallet_transactions (
          id, wallet_id, transaction_type, amount, balance_before, balance_after,
          reference_type, reference_id, description, created_by, created_at
        ) VALUES (?, ?, 'GAME_FEE', ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          walletTransactionId,
          wallet.id,
          feeAmount,
          balanceBefore,
          balanceAfter,
          'GAME_CHARGE',
          gameChargeId,
          description,
          req.user.sub,
        ]
      );

      await connection.query(
        `INSERT INTO game_charges (
          id, game_id, wallet_transaction_id, charge_amount, charge_percentage, created_at
        ) VALUES (?, ?, ?, ?, NULL, NOW())`,
        [gameChargeId, gameId, walletTransactionId, feeAmount]
      );

      await connection.query(
        'UPDATE wallet_accounts SET balance = ?, updated_at = NOW() WHERE id = ?',
        [balanceAfter, wallet.id]
      );

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'CHARGE_GAME_FEE', 'game_charges', gameChargeId]
      );

      await connection.commit();

      return res.json({
        gameId,
        walletTransactionId,
        gameChargeId,
        balanceBefore,
        balanceAfter,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Charge game fee error:', error);
      return res.status(500).json({ error: 'Failed to charge game fee' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/cards/generate',
  hasPermission(['MANAGE_GAMES']),
  [param('gameId').isUUID(), body('seed').optional().isString()],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT
           g.id,
           g.status,
           g.total_cards,
           g.numbers_per_card,
           g.total_numbers_pool,
           hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (game.status !== 'PENDING') {
        await connection.rollback();
        return res.status(409).json({
          error: 'Cards can only be generated while game is PENDING',
          code: 'GAME_NOT_PENDING',
        });
      }

      const [prizeRows] = await connection.query(
        'SELECT COUNT(*) AS count FROM game_prizes WHERE game_id = ?',
        [gameId]
      );
      const prizeCount = Number(prizeRows[0].count || 0);
      if (prizeCount <= 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Configure prize matrix before generating cards',
          code: 'PRIZES_NOT_CONFIGURED',
        });
      }

      const [chargeRows] = await connection.query(
        'SELECT id FROM game_charges WHERE game_id = ? LIMIT 1',
        [gameId]
      );
      if (chargeRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Charge game fee before generating cards',
          code: 'GAME_NOT_CHARGED',
        });
      }

      const [existingCardRows] = await connection.query(
        'SELECT COUNT(*) AS count FROM cards WHERE game_id = ? FOR UPDATE',
        [gameId]
      );
      const existingCards = Number(existingCardRows[0].count || 0);
      if (existingCards > 0) {
        await connection.rollback();
        return res.status(409).json({
          error: 'Cards already generated for this game',
          code: 'CARDS_ALREADY_GENERATED',
        });
      }

      const totalCards = Number(game.total_cards);
      const numbersPerCard = Number(game.numbers_per_card);
      const totalNumbersPool = Number(game.total_numbers_pool);

      if (numbersPerCard > totalNumbersPool) {
        await connection.rollback();
        return res.status(400).json({
          error: 'numbersPerCard cannot exceed totalNumbersPool',
          code: 'INVALID_CARD_NUMBER_POOL',
        });
      }

      const rng = req.body.seed ? createSeededRng(req.body.seed) : Math.random;

      for (let cardNumber = 1; cardNumber <= totalCards; cardNumber += 1) {
        const cardId = uuidv4();
        const numbers = generateUniqueCardNumbers(numbersPerCard, totalNumbersPool, rng);

        await connection.query(
          `INSERT INTO cards (id, game_id, card_number, status, created_at, updated_at)
           VALUES (?, ?, ?, 'AVAILABLE', NOW(), NOW())`,
          [cardId, gameId, cardNumber]
        );

        for (let idx = 0; idx < numbers.length; idx += 1) {
          await connection.query(
            `INSERT INTO card_numbers (id, game_id, card_id, number_position, number_value, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [uuidv4(), gameId, cardId, idx + 1, numbers[idx]]
          );
        }
      }

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'GENERATE_GAME_CARDS', 'cards', gameId]
      );

      await connection.commit();

      return res.status(201).json({
        gameId,
        cardsGenerated: totalCards,
        numbersPerCard,
        status: 'PENDING',
      });
    } catch (error) {
      await connection.rollback();
      console.error('Generate game cards error:', error);
      return res.status(500).json({ error: 'Failed to generate game cards' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/activate',
  hasPermission(['MANAGE_GAMES']),
  [param('gameId').isUUID()],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT
           g.id,
           g.status,
           g.total_cards,
           g.numbers_per_card,
           hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (game.status === 'ACTIVE' || game.status === 'DRAWING' || game.status === 'COMPLETED') {
        await connection.rollback();
        return res.status(409).json({
          error: 'Game is already active or past activation stage',
          code: 'GAME_ALREADY_ACTIVE',
        });
      }

      if (game.status !== 'PENDING') {
        await connection.rollback();
        return res.status(409).json({
          error: 'Only PENDING games can be activated',
          code: 'GAME_NOT_PENDING',
        });
      }

      const [prizeRows] = await connection.query(
        'SELECT COUNT(*) AS count FROM game_prizes WHERE game_id = ?',
        [gameId]
      );
      const prizeCount = Number(prizeRows[0].count || 0);
      if (prizeCount <= 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Configure prize matrix before activation',
          code: 'PRIZES_NOT_CONFIGURED',
        });
      }

      const [chargeRows] = await connection.query(
        'SELECT id FROM game_charges WHERE game_id = ? LIMIT 1',
        [gameId]
      );
      if (chargeRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Charge game fee before activation',
          code: 'GAME_NOT_CHARGED',
        });
      }

      const [cardRows] = await connection.query(
        'SELECT COUNT(*) AS count FROM cards WHERE game_id = ?',
        [gameId]
      );
      const cardsCount = Number(cardRows[0].count || 0);
      const requiredCards = Number(game.total_cards);
      if (cardsCount !== requiredCards) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Generate full card inventory before activation',
          code: 'CARDS_NOT_GENERATED',
          expectedCards: requiredCards,
          generatedCards: cardsCount,
        });
      }

      const [cardNumberRows] = await connection.query(
        'SELECT COUNT(*) AS count FROM card_numbers WHERE game_id = ?',
        [gameId]
      );
      const cardNumbersCount = Number(cardNumberRows[0].count || 0);
      const requiredCardNumbers = requiredCards * Number(game.numbers_per_card);
      if (cardNumbersCount !== requiredCardNumbers) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Card numbers inventory is incomplete',
          code: 'CARD_NUMBERS_INCOMPLETE',
          expectedNumbers: requiredCardNumbers,
          generatedNumbers: cardNumbersCount,
        });
      }

      await connection.query(
        `UPDATE games
         SET status = 'ACTIVE', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [gameId]
      );

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'ACTIVATE_GAME', 'games', gameId]
      );

      await connection.commit();

      return res.json({
        gameId,
        status: 'ACTIVE',
        cardsGenerated: cardsCount,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Activate game error:', error);
      return res.status(500).json({ error: 'Failed to activate game' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/sales',
  hasPermission(['SELL_CARDS']),
  [
    param('gameId').isUUID(),
    body('cardId').optional().isUUID(),
    body('cardNumber').optional().isInt({ gt: 0 }),
    body('amount').optional().isFloat({ gt: 0 }),
    body('paymentMethod').optional().isIn(['CASH', 'TELEBIRR', 'CBEBIRR', 'BANK', 'OTHER']),
    body('customerName').optional().isString().trim(),
    body('customerPhone').optional().isString().trim(),
    body('note').optional().isString(),
  ],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const { cardId, customerName = null, customerPhone = null, note = null } = req.body;
      const cardNumber = req.body.cardNumber ? Number(req.body.cardNumber) : null;
      const paymentMethod = String(req.body.paymentMethod || 'CASH').toUpperCase();
      const isSuperAdmin = req.user.role_level === 1;

      if (!cardId && !cardNumber) {
        return res.status(400).json({
          error: 'Provide cardId or cardNumber',
          code: 'CARD_IDENTIFIER_REQUIRED',
        });
      }

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT g.id, g.status, g.card_price, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (game.status !== 'ACTIVE') {
        await connection.rollback();
        return res.status(400).json({
          error: 'Cards can only be sold for ACTIVE games',
          code: 'GAME_NOT_ACTIVE',
        });
      }

      const cardQuery = cardId
        ? {
            sql: `SELECT id, game_id, card_number, status
                  FROM cards
                  WHERE id = ? AND game_id = ?
                  LIMIT 1
                  FOR UPDATE`,
            values: [cardId, gameId],
          }
        : {
            sql: `SELECT id, game_id, card_number, status
                  FROM cards
                  WHERE game_id = ? AND card_number = ?
                  LIMIT 1
                  FOR UPDATE`,
            values: [gameId, cardNumber],
          };

      const [cardRows] = await connection.query(cardQuery.sql, cardQuery.values);
      if (cardRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Card not found for game' });
      }

      const card = cardRows[0];
      if (card.status !== 'AVAILABLE') {
        await connection.rollback();
        return res.status(409).json({
          error: `Card is not available (current status: ${card.status})`,
          code: 'CARD_NOT_AVAILABLE',
        });
      }

      const soldPrice = Number(req.body.amount || game.card_price);
      const saleId = uuidv4();

      await connection.query(
        `INSERT INTO game_sales (
          id, game_id, card_id, sold_by, sold_price, payment_method,
          customer_name, customer_phone, note, sold_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          saleId,
          gameId,
          card.id,
          req.user.sub,
          soldPrice,
          paymentMethod,
          customerName,
          customerPhone,
          note,
        ]
      );

      await connection.query(
        `UPDATE cards
         SET status = 'SOLD', sold_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [card.id]
      );

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'SELL_GAME_CARD', 'game_sales', saleId]
      );

      await connection.commit();

      return res.status(201).json({
        saleId,
        gameId,
        cardId: card.id,
        cardNumber: Number(card.card_number),
        amount: soldPrice,
        paymentMethod,
        cardStatus: 'SOLD',
      });
    } catch (error) {
      await connection.rollback();
      console.error('Sell game card error:', error);
      return res.status(500).json({ error: 'Failed to sell game card' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/draw/start',
  hasPermission(['RUN_DRAWS']),
  [param('gameId').isUUID()],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT g.id, g.status, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (game.status !== 'ACTIVE') {
        await connection.rollback();
        return res.status(400).json({
          error: 'Draw can only start when game is ACTIVE',
          code: 'GAME_NOT_ACTIVE_FOR_DRAW',
        });
      }

      await connection.query(
        `UPDATE games
         SET status = 'DRAWING', updated_at = NOW()
         WHERE id = ?`,
        [gameId]
      );

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'START_GAME_DRAW', 'games', gameId]
      );

      await connection.commit();

      return res.json({
        gameId,
        status: 'DRAWING',
      });
    } catch (error) {
      await connection.rollback();
      console.error('Start game draw error:', error);
      return res.status(500).json({ error: 'Failed to start game draw' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/draw/next',
  hasPermission(['RUN_DRAWS']),
  [param('gameId').isUUID(), body('forceNumber').optional().isInt({ gt: 0 })],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT g.id, g.status, g.total_numbers_pool, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (game.status !== 'DRAWING') {
        await connection.rollback();
        return res.status(400).json({
          error: 'Draw can only continue while game is DRAWING',
          code: 'GAME_NOT_DRAWING',
        });
      }

      const [drawRows] = await connection.query(
        `SELECT draw_position AS drawPosition, winning_number AS winningNumber
         FROM draws
         WHERE game_id = ?
         ORDER BY draw_position ASC
         FOR UPDATE`,
        [gameId]
      );

      const nextDrawPosition = drawRows.length + 1;
      const [prizeRows] = await connection.query(
        `SELECT draw_position AS drawPosition, beer_quantity AS beerQuantity
         FROM game_prizes
         WHERE game_id = ? AND draw_position = ?
         LIMIT 1`,
        [gameId, nextDrawPosition]
      );

      if (prizeRows.length === 0) {
        await connection.rollback();
        return res.status(409).json({
          error: 'All configured draw positions have been completed',
          code: 'DRAWS_COMPLETED',
        });
      }

      const usedNumbers = new Set(drawRows.map((row) => Number(row.winningNumber)));
      const totalNumbersPool = Number(game.total_numbers_pool);
      let winningNumber = null;

      if (req.body.forceNumber) {
        const forced = Number(req.body.forceNumber);
        if (forced < 1 || forced > totalNumbersPool) {
          await connection.rollback();
          return res.status(400).json({
            error: `forceNumber must be between 1 and ${totalNumbersPool}`,
            code: 'INVALID_DRAW_NUMBER',
          });
        }

        if (usedNumbers.has(forced)) {
          await connection.rollback();
          return res.status(409).json({
            error: 'Winning number already used in this game',
            code: 'DRAW_NUMBER_ALREADY_USED',
          });
        }

        winningNumber = forced;
      } else {
        const available = [];
        for (let n = 1; n <= totalNumbersPool; n += 1) {
          if (!usedNumbers.has(n)) {
            available.push(n);
          }
        }

        if (available.length === 0) {
          await connection.rollback();
          return res.status(409).json({
            error: 'No remaining numbers available for drawing',
            code: 'DRAW_POOL_EXHAUSTED',
          });
        }

        winningNumber = available[Math.floor(Math.random() * available.length)];
      }

      const drawId = uuidv4();
      const beerQuantity = Number(prizeRows[0].beerQuantity);

      await connection.query(
        `INSERT INTO draws (id, game_id, draw_position, winning_number, beer_quantity, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [drawId, gameId, nextDrawPosition, winningNumber, beerQuantity, req.user.sub]
      );

      const [winnerCardRows] = await connection.query(
        `SELECT c.id AS cardId, c.card_number AS cardNumber
         FROM card_numbers cn
         JOIN cards c ON c.id = cn.card_id
         WHERE cn.game_id = ?
           AND cn.number_value = ?
           AND c.game_id = ?
           AND c.status = 'SOLD'
         ORDER BY c.card_number ASC
         FOR UPDATE`,
        [gameId, winningNumber, gameId]
      );

      const winnerCardIds = [];
      const winnerCardNumbers = [];
      for (const row of winnerCardRows) {
        const winnerId = uuidv4();
        winnerCardIds.push(row.cardId);
        winnerCardNumbers.push(Number(row.cardNumber));

        await connection.query(
          `INSERT INTO winners (id, game_id, draw_id, card_id, beer_quantity, is_claimed, created_at)
           VALUES (?, ?, ?, ?, ?, 0, NOW())`,
          [winnerId, gameId, drawId, row.cardId, beerQuantity]
        );
      }

      if (winnerCardIds.length > 0) {
        const placeholders = winnerCardIds.map(() => '?').join(', ');
        await connection.query(
          `UPDATE cards
           SET status = 'WINNER', updated_at = NOW()
           WHERE id IN (${placeholders})`,
          winnerCardIds
        );
      }

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'EXECUTE_GAME_DRAW', 'draws', drawId]
      );

      await connection.commit();

      return res.status(201).json({
        drawId,
        drawPosition: nextDrawPosition,
        winningNumber,
        beerQuantity,
        winnerCount: winnerCardIds.length,
        winnerCardIds,
        winnerCardNumbers,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Execute next draw error:', error);
      return res.status(500).json({ error: 'Failed to execute draw' });
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/:gameId/complete',
  hasPermission(['MANAGE_GAMES']),
  [param('gameId').isUUID()],
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      await connection.beginTransaction();

      const [gameRows] = await connection.query(
        `SELECT g.id, g.status, g.total_cards, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1
         FOR UPDATE`,
        [gameId]
      );

      if (gameRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied' });
      }

      if (game.status === 'COMPLETED') {
        await connection.rollback();
        return res.status(409).json({
          error: 'Game is already completed',
          code: 'GAME_ALREADY_COMPLETED',
        });
      }

      if (game.status !== 'DRAWING') {
        await connection.rollback();
        return res.status(400).json({
          error: 'Game can only be completed while status is DRAWING',
          code: 'GAME_NOT_DRAWING_FOR_COMPLETION',
        });
      }

      const [[prizeCountRow]] = await connection.query(
        'SELECT COUNT(*) AS count FROM game_prizes WHERE game_id = ?',
        [gameId]
      );
      const [[drawCountRow]] = await connection.query(
        'SELECT COUNT(*) AS count FROM draws WHERE game_id = ?',
        [gameId]
      );

      const totalPrizePositions = Number(prizeCountRow.count || 0);
      const executedDraws = Number(drawCountRow.count || 0);
      if (executedDraws < totalPrizePositions) {
        await connection.rollback();
        return res.status(400).json({
          error: 'All configured draw positions must be executed before completion',
          code: 'DRAWS_NOT_COMPLETED',
          totalPrizePositions,
          executedDraws,
          remainingDraws: totalPrizePositions - executedDraws,
        });
      }

      const [[cardsSoldRow]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM cards
         WHERE game_id = ? AND status IN ('SOLD', 'WINNER', 'CLAIMED')`,
        [gameId]
      );

      const [[revenueRow]] = await connection.query(
        `SELECT COALESCE(SUM(sold_price), 0) AS revenue
         FROM game_sales
         WHERE game_id = ?`,
        [gameId]
      );

      const [[winnerRow]] = await connection.query(
        'SELECT COUNT(*) AS count FROM winners WHERE game_id = ?',
        [gameId]
      );

      const [[claimRow]] = await connection.query(
        'SELECT COUNT(*) AS count FROM winners WHERE game_id = ? AND is_claimed = 1',
        [gameId]
      );

      await connection.query(
        `UPDATE games
         SET status = 'COMPLETED', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [gameId]
      );

      await connection.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), game.company_id, req.user.sub, 'COMPLETE_GAME', 'games', gameId]
      );

      await connection.commit();

      return res.json({
        gameId,
        status: 'COMPLETED',
        summary: {
          totalCards: Number(game.total_cards),
          cardsSold: Number(cardsSoldRow.count || 0),
          revenue: Number(revenueRow.revenue || 0),
          winners: Number(winnerRow.count || 0),
          claims: Number(claimRow.count || 0),
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error('Complete game error:', error);
      return res.status(500).json({ error: 'Failed to complete game' });
    } finally {
      connection.release();
    }
  }
);

router.get(
  '/',
  hasPermission(['VIEW_GAMES']),
  [
    query('branchId').optional().isUUID(),
    query('status').optional().isIn(['PENDING', 'ACTIVE', 'DRAWING', 'COMPLETED', 'CANCELLED']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const isSuperAdmin = req.user.role_level === 1;
      const { branchId, status } = req.query;

      const whereClauses = [];
      const params = [];

      if (!isSuperAdmin) {
        whereClauses.push('hb.company_id = ?');
        params.push(req.hotelCompanyId);
      }

      if (branchId) {
        whereClauses.push('g.branch_id = ?');
        params.push(branchId);
      }

      if (status) {
        whereClauses.push('g.status = ?');
        params.push(status);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT
          g.id,
          g.game_code AS gameCode,
          g.title,
          g.status,
          g.branch_id AS branchId,
          hb.name AS branchName,
          hb.company_id AS companyId,
          g.card_price AS cardPrice,
          g.total_cards AS totalCards,
          g.numbers_per_card AS numbersPerCard,
          g.total_prize_beers AS totalPrizeBeers,
          g.total_numbers_pool AS totalNumbersPool,
          g.created_at AS createdAt,
          g.updated_at AS updatedAt,
          COALESCE(COUNT(DISTINCT gp.id), 0) AS configuredPrizePositions,
          COALESCE(SUM(gp.beer_quantity), 0) AS configuredPrizeBeers,
          COALESCE(COUNT(DISTINCT d.id), 0) AS drawsExecuted,
          COALESCE(COUNT(DISTINCT w.id), 0) AS winnersCount
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         LEFT JOIN game_prizes gp ON gp.game_id = g.id
         LEFT JOIN draws d ON d.game_id = g.id
         LEFT JOIN winners w ON w.game_id = g.id
         ${whereSql}
         GROUP BY g.id, hb.name, hb.company_id
         ORDER BY g.created_at DESC`,
        params
      );

      const items = rows.map((row) => ({
        ...row,
        totalCards: Number(row.totalCards || 0),
        numbersPerCard: Number(row.numbersPerCard || 0),
        totalPrizeBeers: Number(row.totalPrizeBeers || 0),
        totalNumbersPool: Number(row.totalNumbersPool || 0),
        configuredPrizePositions: Number(row.configuredPrizePositions || 0),
        configuredPrizeBeers: Number(row.configuredPrizeBeers || 0),
        drawsExecuted: Number(row.drawsExecuted || 0),
        winnersCount: Number(row.winnersCount || 0),
      }));

      return res.json({
        total: items.length,
        items,
      });
    } catch (error) {
      console.error('List games error:', error);
      return res.status(500).json({ error: 'Failed to list games' });
    }
  }
);

router.get(
  '/:gameId/winners',
  hasPermission(['VIEW_WINNERS']),
  [param('gameId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;
      const claimedFilterRaw = req.query.claimed;

      const [gameRows] = await pool.query(
        `SELECT g.id, hb.company_id
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         WHERE g.id = ?
         LIMIT 1`,
        [gameId]
      );

      if (gameRows.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameRows[0];
      if (!isSuperAdmin && game.company_id !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      let claimedPredicate = '';
      const queryParams = [gameId];
      if (claimedFilterRaw === 'true' || claimedFilterRaw === 'false') {
        claimedPredicate = ' AND w.is_claimed = ?';
        queryParams.push(claimedFilterRaw === 'true' ? 1 : 0);
      }

      const [rows] = await pool.query(
        `SELECT
           w.id,
           w.game_id AS gameId,
           w.draw_id AS drawId,
           d.draw_position AS drawPosition,
           d.winning_number AS winningNumber,
           c.id AS cardId,
           c.card_number AS cardNumber,
           w.beer_quantity AS beerQuantity,
           w.is_claimed AS isClaimed,
           w.claimed_at AS claimedAt,
           w.created_at AS createdAt
         FROM winners w
         JOIN draws d ON d.id = w.draw_id
         JOIN cards c ON c.id = w.card_id
         WHERE w.game_id = ?${claimedPredicate}
         ORDER BY d.draw_position ASC, c.card_number ASC`,
        queryParams
      );

      const items = rows.map((row) => ({
        ...row,
        cardNumber: Number(row.cardNumber),
        drawPosition: Number(row.drawPosition),
        winningNumber: Number(row.winningNumber),
        beerQuantity: Number(row.beerQuantity),
        isClaimed: Number(row.isClaimed) === 1,
      }));

      return res.json({
        gameId,
        total: items.length,
        items,
      });
    } catch (error) {
      console.error('List winners error:', error);
      return res.status(500).json({ error: 'Failed to list winners' });
    }
  }
);

router.get(
  '/:gameId',
  hasPermission(['VIEW_GAMES']),
  [param('gameId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { gameId } = req.params;
      const isSuperAdmin = req.user.role_level === 1;

      const [rows] = await pool.query(
        `SELECT
          g.id,
          g.branch_id AS branchId,
          g.game_code AS gameCode,
          g.title,
          g.card_price AS cardPrice,
          g.total_cards AS totalCards,
          g.numbers_per_card AS numbersPerCard,
          g.total_prize_beers AS totalPrizeBeers,
          g.total_numbers_pool AS totalNumbersPool,
          g.status,
          g.started_at AS startedAt,
          g.ended_at AS endedAt,
          g.created_at AS createdAt,
          g.updated_at AS updatedAt,
          hb.company_id AS companyId,
          hb.name AS branchName,
          COALESCE(COUNT(gp.id), 0) AS configuredPrizePositions,
          COALESCE(SUM(gp.beer_quantity), 0) AS configuredPrizeBeers
         FROM games g
         JOIN hotel_branches hb ON hb.id = g.branch_id
         LEFT JOIN game_prizes gp ON gp.game_id = g.id
         WHERE g.id = ?
         GROUP BY g.id, hb.company_id, hb.name`,
        [gameId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = rows[0];
      if (!isSuperAdmin && game.companyId !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      game.configuredPrizePositions = Number(game.configuredPrizePositions || 0);
      game.configuredPrizeBeers = Number(game.configuredPrizeBeers || 0);

      return res.json(game);
    } catch (error) {
      console.error('Fetch game detail error:', error);
      return res.status(500).json({ error: 'Failed to fetch game details' });
    }
  }
);

export default router;
