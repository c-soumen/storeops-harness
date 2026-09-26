/**
 * Base class for every error that is safe to surface over HTTP.
 *
 * Services and routes throw `AppError` subclasses only; `errorHandler` maps
 * them to a response. Anything else is treated as an unexpected 500.
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }

  public toJSON(): { error: { code: string; message: string; details?: unknown } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;
