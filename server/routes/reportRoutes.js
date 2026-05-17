import express from 'express';
import { query, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { canAccessOrganization, hasPermission } from '../middleware/rbac.js';
import pool from '../config/database.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

function buildDateSeries(fromDate, toDate) {
  const dates = [];
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
    dates.push(local.toISOString().slice(0, 10));
  }
  return dates;
}

function normalizeDateKey(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}

router.get(
  '/branches/:branchId/daily',
  hasPermission(['VIEW_REPORTS']),
  [
    param('branchId').isUUID(),
    query('date').isISO8601({ strict: true, strictSeparator: true }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { branchId } = req.params;
      const { date } = req.query;
      const isSuperAdmin = req.user.role_level === 1;

      const [branchRows] = await pool.query(
        `SELECT id, company_id
         FROM hotel_branches
         WHERE id = ?
         LIMIT 1`,
        [branchId]
      );

      if (branchRows.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      const branch = branchRows[0];
      if (!isSuperAdmin && branch.company_id !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [[gamesPlayedRow]] = await pool.query(
        `SELECT COUNT(DISTINCT d.game_id) AS count
         FROM draws d
         JOIN games g ON g.id = d.game_id
         WHERE g.branch_id = ?
           AND DATE(d.created_at) = ?`,
        [branchId, date]
      );

      const [[cardsSoldRow]] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM game_sales s
         JOIN games g ON g.id = s.game_id
         WHERE g.branch_id = ?
           AND DATE(s.sold_at) = ?`,
        [branchId, date]
      );

      const [[salesRevenueRow]] = await pool.query(
        `SELECT COALESCE(SUM(s.sold_price), 0) AS total
         FROM game_sales s
         JOIN games g ON g.id = s.game_id
         WHERE g.branch_id = ?
           AND DATE(s.sold_at) = ?`,
        [branchId, date]
      );

      const [[beersDistributedRow]] = await pool.query(
        `SELECT COALESCE(SUM(w.beer_quantity), 0) AS total
         FROM winners w
         JOIN games g ON g.id = w.game_id
         WHERE g.branch_id = ?
           AND DATE(w.created_at) = ?`,
        [branchId, date]
      );

      const [[walletDeductionsRow]] = await pool.query(
        `SELECT COALESCE(SUM(gc.charge_amount), 0) AS total
         FROM game_charges gc
         JOIN games g ON g.id = gc.game_id
         WHERE g.branch_id = ?
           AND DATE(gc.created_at) = ?`,
        [branchId, date]
      );

      return res.json({
        date,
        branchId,
        gamesPlayed: Number(gamesPlayedRow.count || 0),
        cardsSold: Number(cardsSoldRow.count || 0),
        salesRevenue: Number(salesRevenueRow.total || 0),
        beersDistributed: Number(beersDistributedRow.total || 0),
        walletDeductions: Number(walletDeductionsRow.total || 0),
      });
    } catch (error) {
      console.error('Branch daily report error:', error);
      return res.status(500).json({ error: 'Failed to fetch branch daily report' });
    }
  }
);

router.get(
  '/companies/:companyId/wallet',
  hasPermission(['VIEW_REPORTS']),
  [
    param('companyId').isUUID(),
    query('from').isISO8601({ strict: true, strictSeparator: true }),
    query('to').isISO8601({ strict: true, strictSeparator: true }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { companyId } = req.params;
      const from = String(req.query.from);
      const to = String(req.query.to);
      const isSuperAdmin = req.user.role_level === 1;

      if (!isSuperAdmin && companyId !== req.hotelCompanyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (from > to) {
        return res.status(400).json({
          error: 'from must be earlier than or equal to to',
          code: 'INVALID_DATE_RANGE',
        });
      }

      const [walletRows] = await pool.query(
        `SELECT id
         FROM wallet_accounts
         WHERE company_id = ?
         LIMIT 1`,
        [companyId]
      );

      if (walletRows.length === 0) {
        return res.status(404).json({ error: 'Wallet not found for company' });
      }

      const walletId = walletRows[0].id;
      const fromStart = `${from} 00:00:00`;
      const toEnd = `${to} 23:59:59`;

      const [[openingRow]] = await pool.query(
        `SELECT COALESCE((
           SELECT wt.balance_after
           FROM wallet_transactions wt
           WHERE wt.wallet_id = ?
             AND wt.created_at < ?
           ORDER BY wt.created_at DESC
           LIMIT 1
         ), 0) AS openingBalance`,
        [walletId, fromStart]
      );

      const [[closingRow]] = await pool.query(
        `SELECT COALESCE((
           SELECT wt.balance_after
           FROM wallet_transactions wt
           WHERE wt.wallet_id = ?
             AND wt.created_at <= ?
           ORDER BY wt.created_at DESC
           LIMIT 1
         ), ?) AS closingBalance`,
        [walletId, toEnd, Number(openingRow.openingBalance || 0)]
      );

      const [[totalsRow]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN transaction_type = 'TOPUP' THEN amount ELSE 0 END), 0) AS topups,
           COALESCE(SUM(CASE WHEN transaction_type = 'GAME_FEE' THEN amount ELSE 0 END), 0) AS gameFees,
           COALESCE(SUM(CASE WHEN transaction_type = 'REFUND' THEN amount ELSE 0 END), 0) AS refunds,
           COALESCE(SUM(CASE WHEN transaction_type = 'ADJUSTMENT' THEN amount ELSE 0 END), 0) AS adjustments,
           COALESCE(SUM(CASE WHEN transaction_type = 'BONUS' THEN amount ELSE 0 END), 0) AS bonuses,
           COALESCE(SUM(CASE WHEN transaction_type = 'REVERSAL' THEN amount ELSE 0 END), 0) AS reversals,
           COUNT(*) AS transactions
         FROM wallet_transactions
         WHERE wallet_id = ?
           AND created_at >= ?
           AND created_at <= ?`,
        [walletId, fromStart, toEnd]
      );

      return res.json({
        companyId,
        from,
        to,
        openingBalance: Number(openingRow.openingBalance || 0),
        closingBalance: Number(closingRow.closingBalance || 0),
        topups: Number(totalsRow.topups || 0),
        gameFees: Number(totalsRow.gameFees || 0),
        refunds: Number(totalsRow.refunds || 0),
        adjustments: Number(totalsRow.adjustments || 0),
        bonuses: Number(totalsRow.bonuses || 0),
        reversals: Number(totalsRow.reversals || 0),
        transactions: Number(totalsRow.transactions || 0),
      });
    } catch (error) {
      console.error('Company wallet range report error:', error);
      return res.status(500).json({ error: 'Failed to fetch company wallet report' });
    }
  }
);

router.get(
  '/global/overview',
  hasPermission(['VIEW_GLOBAL_REPORTS']),
  [
    query('from').isISO8601({ strict: true, strictSeparator: true }),
    query('to').isISO8601({ strict: true, strictSeparator: true }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const from = String(req.query.from);
      const to = String(req.query.to);

      if (from > to) {
        return res.status(400).json({
          error: 'from must be earlier than or equal to to',
          code: 'INVALID_DATE_RANGE',
        });
      }

      const fromStart = `${from} 00:00:00`;
      const toEnd = `${to} 23:59:59`;

      const [[companiesRow]] = await pool.query(
        `SELECT
           COUNT(*) AS totalCompanies,
           COALESCE(SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END), 0) AS activeCompanies
         FROM hotel_companies`
      );

      const [[kpiRow]] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM hotel_branches) AS totalBranches,
           (SELECT COUNT(*) FROM games WHERE status IN ('ACTIVE', 'DRAWING')) AS activeGames,
           (SELECT COUNT(*) FROM games WHERE status = 'COMPLETED' AND ended_at >= ? AND ended_at <= ?) AS completedGames,
           (SELECT COUNT(*) FROM game_sales WHERE sold_at >= ? AND sold_at <= ?) AS cardsSold,
           (SELECT COALESCE(SUM(sold_price), 0) FROM game_sales WHERE sold_at >= ? AND sold_at <= ?) AS salesRevenue,
           (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE transaction_type = 'TOPUP' AND created_at >= ? AND created_at <= ?) AS walletTopups,
           (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE transaction_type = 'GAME_FEE' AND created_at >= ? AND created_at <= ?) AS walletGameFees,
           (SELECT COUNT(*) FROM winners WHERE created_at >= ? AND created_at <= ?) AS winners,
           (SELECT COUNT(*) FROM winners WHERE is_claimed = 1 AND claimed_at >= ? AND claimed_at <= ?) AS claims`,
        [
          fromStart,
          toEnd,
          fromStart,
          toEnd,
          fromStart,
          toEnd,
          fromStart,
          toEnd,
          fromStart,
          toEnd,
          fromStart,
          toEnd,
          fromStart,
          toEnd,
        ]
      );

      const [salesTrendRows] = await pool.query(
        `SELECT
           DATE(sold_at) AS date,
           COUNT(*) AS cardsSold,
           COALESCE(SUM(sold_price), 0) AS salesRevenue
         FROM game_sales
         WHERE sold_at >= ? AND sold_at <= ?
         GROUP BY DATE(sold_at)
         ORDER BY DATE(sold_at) ASC`,
        [fromStart, toEnd]
      );

      const [walletTrendRows] = await pool.query(
        `SELECT
           DATE(created_at) AS date,
           COALESCE(SUM(CASE WHEN transaction_type = 'TOPUP' THEN amount ELSE 0 END), 0) AS topups,
           COALESCE(SUM(CASE WHEN transaction_type = 'GAME_FEE' THEN amount ELSE 0 END), 0) AS gameFees
         FROM wallet_transactions
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at) ASC`,
        [fromStart, toEnd]
      );

      const [gameTrendRows] = await pool.query(
        `SELECT
           DATE(ended_at) AS date,
           COUNT(*) AS completedGames
         FROM games
         WHERE status = 'COMPLETED'
           AND ended_at IS NOT NULL
           AND ended_at >= ? AND ended_at <= ?
         GROUP BY DATE(ended_at)
         ORDER BY DATE(ended_at) ASC`,
        [fromStart, toEnd]
      );

      const salesMap = new Map(salesTrendRows.map((row) => [normalizeDateKey(row.date), row]));
      const walletMap = new Map(walletTrendRows.map((row) => [normalizeDateKey(row.date), row]));
      const gameMap = new Map(gameTrendRows.map((row) => [normalizeDateKey(row.date), row]));
      const daily = buildDateSeries(from, to).map((date) => {
        const sales = salesMap.get(date);
        const wallet = walletMap.get(date);
        const game = gameMap.get(date);

        return {
          date,
          cardsSold: Number(sales?.cardsSold || 0),
          salesRevenue: Number(sales?.salesRevenue || 0),
          topups: Number(wallet?.topups || 0),
          gameFees: Number(wallet?.gameFees || 0),
          completedGames: Number(game?.completedGames || 0),
        };
      });

      return res.json({
        from,
        to,
        kpis: {
          totalCompanies: Number(companiesRow.totalCompanies || 0),
          activeCompanies: Number(companiesRow.activeCompanies || 0),
          totalBranches: Number(kpiRow.totalBranches || 0),
          activeGames: Number(kpiRow.activeGames || 0),
          completedGames: Number(kpiRow.completedGames || 0),
          cardsSold: Number(kpiRow.cardsSold || 0),
          salesRevenue: Number(kpiRow.salesRevenue || 0),
          walletTopups: Number(kpiRow.walletTopups || 0),
          walletGameFees: Number(kpiRow.walletGameFees || 0),
          winners: Number(kpiRow.winners || 0),
          claims: Number(kpiRow.claims || 0),
        },
        trend: {
          granularity: 'day',
          points: daily,
        },
      });
    } catch (error) {
      console.error('Global overview report error:', error);
      return res.status(500).json({ error: 'Failed to fetch global overview report' });
    }
  }
);

export default router;
