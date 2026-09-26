import { AppError } from './AppError';

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
  }
}
