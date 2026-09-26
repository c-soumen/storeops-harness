import express from 'express';
import type { Express } from 'express';

import { activityRouter } from './activities/routes';
import { alertRouter } from './alerts/routes';
import { alertService } from './alerts/service';
import { programmeRouter } from './programmes/routes';
import { reportService } from './reports/service';
import { staffRouter } from './staff/routes';
import { errorHandler, notFoundHandler } from './shared/errors/errorHandler';

let subscribersRegistered = false;

/**
 * Wires the cross-module event subscribers exactly once per process. Modules
 * react to each other only through these subscriptions (architecture rule #3).
 */
export const registerEventSubscribers = (): void => {
  if (subscribersRegistered) {
    return;
  }
  alertService.registerSubscribers();
  reportService.registerSubscribers();
  subscribersRegistered = true;
};

export const createApp = (): Express => {
  registerEventSubscribers();

  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'storeops' });
  });

  app.use('/api/activities', activityRouter);
  app.use('/api/programmes', programmeRouter);
  app.use('/api/alerts', alertRouter);
  app.use('/api/staff', staffRouter);
  // reports has no HTTP surface yet — it is consumed via ReportService and the
  // event bus until its endpoints are added.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
