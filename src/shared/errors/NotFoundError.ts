import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id === undefined ? `${resource} not found` : `${resource} '${id}' not found`,
      404,
    );
  }
}
