import { ErrorCodes } from './errorCodes.js';

export class AppError extends Error {
  constructor(message, { status = 500, code = ErrorCodes.INTERNAL_ERROR, details = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static validation(message = 'Validation failed', details = null) {
    return new AppError(message, {
      status: 400,
      code: ErrorCodes.VALIDATION_ERROR,
      details,
    });
  }

  static forbidden(message = 'Access denied', code = ErrorCodes.ACCESS_DENIED, details = null) {
    return new AppError(message, {
      status: 403,
      code,
      details,
    });
  }

  static notFound(message = 'Resource not found', code = ErrorCodes.SESSION_NOT_FOUND, details = null) {
    return new AppError(message, {
      status: 404,
      code,
      details,
    });
  }

  static conflict(message = 'Conflict', code = ErrorCodes.VERSION_CONFLICT, details = null) {
    return new AppError(message, {
      status: 409,
      code,
      details,
    });
  }

  static notImplemented(message = 'Phase not yet implemented', details = null) {
    return new AppError(message, {
      status: 501,
      code: ErrorCodes.NOT_IMPLEMENTED,
      details,
    });
  }
}
