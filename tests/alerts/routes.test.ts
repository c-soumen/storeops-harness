import type { Express } from 'express';
import request from 'supertest';

import { alertRepository } from '../../src/alerts/repository';
import { createApp } from '../../src/app';
import { staffRepository } from '../../src/staff/repository';

const MANAGER = 'Bearer token-manager';
const ASSOCIATE = 'Bearer token-associate';

describe('alerts routes', () => {
  let app: Express;

  beforeEach(() => {
    alertRepository.reset();
    staffRepository.reset();
    app = createApp();
  });

  describe('GET /api/alerts', () => {
    it('returns 200 and the alerts for the authenticated user', async () => {
      const response = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ userId: 'usr_associate', type: 'INVENTORY' });
    });

    it('does not leak alerts addressed to other staff', async () => {
      const response = await request(app).get('/api/alerts').set('Authorization', MANAGER);
      expect(response.status).toBe(200);
      expect(
        response.body.every((alert: { userId: string }) => alert.userId === 'usr_manager'),
      ).toBe(true);
    });

    it('supports status and type filters', async () => {
      const response = await request(app)
        .get('/api/alerts?status=PENDING&type=SLA_BREACH')
        .set('Authorization', MANAGER);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('alr_sla_chiller');
    });

    it('returns 400 for an unknown status filter', async () => {
      const response = await request(app)
        .get('/api/alerts?status=ARCHIVED')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a filter is repeated into an array', async () => {
      const response = await request(app)
        .get('/api/alerts?type=INVENTORY&type=SLA_BREACH')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const response = await request(app).get('/api/alerts');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/alerts/:id/read', () => {
    it('returns 200 and marks the alert as read', async () => {
      const response = await request(app)
        .post('/api/alerts/alr_low_stock_aisle4/read')
        .set('Authorization', ASSOCIATE);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('READ');
    });

    it('returns 403 when the caller is not the recipient', async () => {
      const response = await request(app)
        .post('/api/alerts/alr_low_stock_aisle4/read')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown alert', async () => {
      const response = await request(app)
        .post('/api/alerts/alr_missing/read')
        .set('Authorization', ASSOCIATE);
      expect(response.status).toBe(404);
    });
  });
});
