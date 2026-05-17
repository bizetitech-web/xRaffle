import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import { withTransaction } from '../../core/db/transaction.js';
import pool from '../../../config/database.js';
import { ensureBranchScope } from '../../core/policy/scopePolicy.js';
import { gameTemplateRepository } from './gameTemplate.repository.js';
import { randomUUID } from 'node:crypto';

const ensurePrizeShape = (prizes = []) => {
  if (!Array.isArray(prizes) || prizes.length === 0) {
    throw AppError.validation('At least one prize row is required.');
  }

  const seen = new Set();
  for (const item of prizes) {
    if (seen.has(item.drawPosition)) {
      throw AppError.validation('Duplicate draw positions are not allowed.');
    }
    seen.add(item.drawPosition);
  }
};

const validateTemplateMath = ({ totalNumbersPool, numbersPerCard, totalPrizeBeers, prizes }) => {
  if (Number(numbersPerCard) > Number(totalNumbersPool)) {
    throw AppError.validation('numbersPerCard cannot exceed totalNumbersPool.');
  }

  const prizeTotal = prizes.reduce((sum, item) => sum + Number(item.beerQuantity || 0), 0);
  if (prizeTotal !== Number(totalPrizeBeers)) {
    throw AppError.validation('Prize beer sum must equal totalPrizeBeers.', {
      expected: Number(totalPrizeBeers),
      actual: prizeTotal,
      code: ErrorCodes.TEMPLATE_INVALID_PRIZE_SUM,
    });
  }
};

const generateTemplateCode = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TPL-${stamp}-${rand}`;
};

const toBool = (value) => {
  if (value === undefined) {
    return undefined;
  }
  return String(value) === 'true';
};

const buildSequentialCards = (totalCards, numbersPerCard, totalNumbersPool) => {
  const cards = [];
  let cursor = 1;

  for (let i = 0; i < totalCards; i += 1) {
    const numbers = [];
    for (let p = 0; p < numbersPerCard; p += 1) {
      numbers.push(cursor);
      cursor += 1;
      if (cursor > totalNumbersPool) {
        cursor = 1;
      }
    }
    cards.push({ cardNumber: i + 1, numbers });
  }

  return cards;
};

const createSeededRng = (seedInput) => {
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
};

const buildRandomCards = (totalCards, numbersPerCard, totalNumbersPool, seed = '') => {
  const cards = [];
  const rng = createSeededRng(seed || Date.now());

  for (let i = 0; i < totalCards; i += 1) {
    const picked = new Set();
    while (picked.size < numbersPerCard) {
      picked.add(1 + Math.floor(rng() * totalNumbersPool));
    }
    cards.push({
      cardNumber: i + 1,
      numbers: Array.from(picked).sort((a, b) => a - b),
    });
  }

  return cards;
};

export class GameTemplateService {
  async createTemplate(req) {
    const {
      companyId: requestedCompanyId,
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
      prizes,
    } = req.body;

    ensurePrizeShape(prizes);
    validateTemplateMath({ totalNumbersPool, numbersPerCard, totalPrizeBeers, prizes });

    const isSuperAdmin = req.user?.role_level === 1;
    const companyId = isSuperAdmin
      ? (requestedCompanyId || req.hotelCompanyId)
      : req.hotelCompanyId;

    if (!companyId) {
      throw AppError.validation('companyId could not be resolved for template create.');
    }

    let scopedBranch = null;
    if (branchId) {
      scopedBranch = await ensureBranchScope(req, branchId);
      if (scopedBranch.company_id !== companyId) {
        throw AppError.forbidden(
          'Branch company does not match template company.',
          ErrorCodes.BRANCH_SCOPE_VIOLATION
        );
      }
    }

    return withTransaction(async (connection) => {
      const created = await gameTemplateRepository.create(connection, {
        id: randomUUID(),
        companyId,
        branchId: scopedBranch?.id || null,
        templateCode: templateCode || generateTemplateCode(),
        title,
        cardPrice: Number(cardPrice),
        totalCards: Number(totalCards),
        totalNumbersPool: Number(totalNumbersPool),
        numbersPerCard: Number(numbersPerCard),
        totalPrizeBeers: Number(totalPrizeBeers),
        secondsPerCall: Number(secondsPerCall),
        generationMode,
        createdBy: req.user.sub,
      });

      await gameTemplateRepository.replacePrizes(connection, created.id, prizes);
      return gameTemplateRepository.findById(connection, created.id);
    });
  }

  async listTemplates(req) {
    const isSuperAdmin = req.user?.role_level === 1;
    const filters = {
      companyId: isSuperAdmin ? req.query.companyId : req.hotelCompanyId,
      branchId: req.query.branchId,
      active: toBool(req.query.active),
    };

    const items = await gameTemplateRepository.list(pool, filters);
    return {
      total: items.length,
      items,
    };
  }

  async getTemplate(req) {
    const template = await gameTemplateRepository.findById(pool, req.params.templateId);
    if (!template) {
      throw AppError.notFound('Game template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
    }

    const isSuperAdmin = req.user?.role_level === 1;
    if (!isSuperAdmin && template.companyId !== req.hotelCompanyId) {
      throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
    }

    return template;
  }

  async updateTemplate(req) {
    const templateId = req.params.templateId;
    const {
      expectedVersion,
      title,
      cardPrice,
      totalCards,
      totalNumbersPool,
      numbersPerCard,
      totalPrizeBeers,
      secondsPerCall,
      generationMode,
      branchId,
      prizes,
    } = req.body;

    return withTransaction(async (connection) => {
      const existing = await gameTemplateRepository.findById(connection, templateId);
      if (!existing) {
        throw AppError.notFound('Game template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
      }

      const isSuperAdmin = req.user?.role_level === 1;
      if (!isSuperAdmin && existing.companyId !== req.hotelCompanyId) {
        throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
      }

      if (expectedVersion && Number(expectedVersion) !== Number(existing.version)) {
        throw AppError.conflict('Template version mismatch', ErrorCodes.VERSION_CONFLICT, {
          expectedVersion: Number(expectedVersion),
          currentVersion: Number(existing.version),
        });
      }

      const merged = {
        totalNumbersPool: totalNumbersPool !== undefined ? Number(totalNumbersPool) : Number(existing.totalNumbersPool),
        numbersPerCard: numbersPerCard !== undefined ? Number(numbersPerCard) : Number(existing.numbersPerCard),
        totalPrizeBeers: totalPrizeBeers !== undefined ? Number(totalPrizeBeers) : Number(existing.totalPrizeBeers),
        prizes: prizes || existing.prizes,
      };

      if (prizes) {
        ensurePrizeShape(prizes);
      }

      validateTemplateMath(merged);

      if (branchId) {
        const branch = await ensureBranchScope(req, branchId);
        if (branch.company_id !== existing.companyId) {
          throw AppError.forbidden(
            'Branch company does not match template company.',
            ErrorCodes.BRANCH_SCOPE_VIOLATION
          );
        }
      }

      await gameTemplateRepository.update(connection, templateId, {
        title,
        cardPrice: cardPrice !== undefined ? Number(cardPrice) : undefined,
        totalCards: totalCards !== undefined ? Number(totalCards) : undefined,
        totalNumbersPool: totalNumbersPool !== undefined ? Number(totalNumbersPool) : undefined,
        numbersPerCard: numbersPerCard !== undefined ? Number(numbersPerCard) : undefined,
        totalPrizeBeers: totalPrizeBeers !== undefined ? Number(totalPrizeBeers) : undefined,
        secondsPerCall: secondsPerCall !== undefined ? Number(secondsPerCall) : undefined,
        generationMode,
        branchId: branchId !== undefined ? branchId : undefined,
        updatedBy: req.user.sub,
      });

      if (prizes) {
        await gameTemplateRepository.replacePrizes(connection, templateId, prizes);
      }

      return gameTemplateRepository.findById(connection, templateId);
    });
  }

  async archiveTemplate(req) {
    const templateId = req.params.templateId;

    return withTransaction(async (connection) => {
      const existing = await gameTemplateRepository.findById(connection, templateId);
      if (!existing) {
        throw AppError.notFound('Game template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
      }

      const isSuperAdmin = req.user?.role_level === 1;
      if (!isSuperAdmin && existing.companyId !== req.hotelCompanyId) {
        throw AppError.forbidden('Access denied', ErrorCodes.ACCESS_DENIED);
      }

      return gameTemplateRepository.archive(connection, templateId, req.user.sub);
    });
  }

  async previewCards(req) {
    const template = await this.getTemplate(req);

    const mode = req.body.mode || template.generationMode;
    const totalCards = Number(req.body.totalCards || template.totalCards);
    const numbersPerCard = Number(template.numbersPerCard);
    const totalNumbersPool = Number(template.totalNumbersPool);

    const cards = mode === 'SEQUENTIAL'
      ? buildSequentialCards(totalCards, numbersPerCard, totalNumbersPool)
      : buildRandomCards(totalCards, numbersPerCard, totalNumbersPool, req.body.seed);

    return {
      templateId: template.id,
      mode,
      totalCards,
      cards,
      duplicateValidationSummary: {
        duplicateWithinCard: 0,
      },
    };
  }
}

export const gameTemplateService = new GameTemplateService();
