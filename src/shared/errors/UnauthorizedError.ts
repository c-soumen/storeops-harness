import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}
