import { validationResult } from 'express-validator';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import pool from '../../../config/database.js';
import { withTransaction } from '../../core/db/transaction.js';
import { gameTemplateRepository } from './gameTemplate.repository.js';

export class GameTemplateService {
  async createTemplate(req) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      throw AppError.validation('Invalid request payload', result.array());
    }

    const payload = req.body;
    const resolvedCompanyId = payload.companyId || req.hotelCompanyId || null;
    if (!resolvedCompanyId) {
      throw AppError.validation('companyId is required');
    }
    const id = req.body.id || null;

    return withTransaction(async (connection) => {
      const [[uuidRow]] = await connection.query('SELECT UUID() AS id');
      const newId = id || uuidRow.id;

      const shouldSetDefault = Boolean(payload.isDefault);
      if (shouldSetDefault) {
        await gameTemplateRepository.clearDefaultForCompany(connection, resolvedCompanyId, newId);
      } else {
        const existingDefault = await gameTemplateRepository.findDefaultTemplateByCompany(connection, resolvedCompanyId);
        if (!existingDefault) {
          payload.isDefault = true;
          await gameTemplateRepository.clearDefaultForCompany(connection, resolvedCompanyId, newId);
        }
      }

      const created = await gameTemplateRepository.createTemplate(connection, {
        id: newId,
        companyId: resolvedCompanyId,
        branchId: payload.branchId,
        templateCode: payload.templateCode,
        title: payload.title,
        cardPrice: payload.cardPrice,
        totalCards: payload.totalCards,
        totalNumbersPool: payload.totalNumbersPool,
        numbersPerCard: payload.numbersPerCard,
        secondsPerCall: payload.secondsPerCall || 5,
        generationMode: payload.generationMode || 'RANDOM',
        isDefault: Boolean(payload.isDefault),
        totalPrizeBeers: payload.totalPrizeBeers || 0,
        prizes: payload.prizes || [],
        createdBy: req.user?.sub,
      });

      if (!created) {
        throw new AppError('Failed to create template', { status: 500, code: ErrorCodes.INTERNAL_ERROR });
      }

      return { templateId: newId };
    });
  }

  async listTemplates(req) {
    const filters = {
      companyId: req.query.companyId,
      branchId: req.query.branchId,
      isActive: req.query.isActive === undefined ? undefined : String(req.query.isActive) === 'true',
      isDefault: req.query.isDefault === undefined ? undefined : String(req.query.isDefault) === 'true',
    };
    return gameTemplateRepository.listTemplates(pool, filters);
  }

  async getTemplate(req) {
    const template = await gameTemplateRepository.findTemplate(pool, req.params.templateId);
    if (!template) {
      throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
    }

    return template;
  }

  async updateTemplate(req) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      throw AppError.validation('Invalid request payload', result.array());
    }

    return withTransaction(async (connection) => {
      const existing = await gameTemplateRepository.findTemplate(connection, req.params.templateId);
      if (!existing) throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);

      const shouldSetDefault = req.body.isDefault === true;
      if (shouldSetDefault) {
        await gameTemplateRepository.clearDefaultForCompany(connection, existing.companyId, req.params.templateId);
      }

      const updated = await gameTemplateRepository.updateTemplate(connection, req.params.templateId, req.body);
      if (!updated) throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);

      if (updated.isDefault !== true && updated.isDefault !== 1) {
        const hasDefault = await gameTemplateRepository.findDefaultTemplateByCompany(connection, updated.companyId);
        if (!hasDefault) {
          await gameTemplateRepository.updateTemplate(connection, req.params.templateId, { isDefault: true });
          return gameTemplateRepository.findTemplate(connection, req.params.templateId);
        }
      }

      return updated;
    });
  }

  async generatePreview(req) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      throw AppError.validation('Invalid request payload', result.array());
    }

    const template = await gameTemplateRepository.findTemplate(pool, req.params.templateId);
    if (!template) {
      throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);
    }

    const opts = {
      template,
      totalCards: req.body.totalCards,
      numbersPerCard: req.body.numbersPerCard,
      totalNumbersPool: req.body.totalNumbersPool,
      generationMode: req.body.generationMode,
    };

    return gameTemplateRepository.generatePreview(opts);
  }

  async generatePreviewDraft(req) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      throw AppError.validation('Invalid request payload', result.array());
    }

    const opts = {
      template: {
        totalCards: req.body.totalCards,
        numbersPerCard: req.body.numbersPerCard,
        totalNumbersPool: req.body.totalNumbersPool,
        generationMode: req.body.generationMode,
      },
      totalCards: req.body.totalCards,
      numbersPerCard: req.body.numbersPerCard,
      totalNumbersPool: req.body.totalNumbersPool,
      generationMode: req.body.generationMode,
    };

    return gameTemplateRepository.generatePreview(opts);
  }

  async archiveTemplate(req) {
    const templateId = req.params.templateId;
    return withTransaction(async (connection) => {
      const existing = await gameTemplateRepository.findTemplate(connection, templateId);
      if (!existing) throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);

      const archived = await gameTemplateRepository.archiveTemplate(connection, templateId, req.user?.sub || null);
      if (!archived) throw AppError.notFound('Template not found', ErrorCodes.TEMPLATE_NOT_FOUND);

      if (Number(existing.isDefault) === 1) {
        const [nextTemplate] = await gameTemplateRepository.listTemplates(connection, {
          companyId: existing.companyId,
          isActive: true,
        });

        if (nextTemplate && nextTemplate.id) {
          await gameTemplateRepository.clearDefaultForCompany(connection, existing.companyId, nextTemplate.id);
          await gameTemplateRepository.updateTemplate(connection, nextTemplate.id, { isDefault: true });
        }
      }

      return archived;
    });
  }
}

export const gameTemplateService = new GameTemplateService();
