import type { Express } from 'express';
import request from 'supertest';

import { activityRepository } from '../../src/activities/repository';
import { alertRepository } from '../../src/alerts/repository';
import { createApp } from '../../src/app';
import { programmeRepository } from '../../src/programmes/repository';
import { staffRepository } from '../../src/staff/repository';

const MANAGER = 'Bearer token-manager';
const ASSOCIATE = 'Bearer token-associate';

describe('programmes routes', () => {
  let app: Express;

  beforeEach(() => {
    programmeRepository.reset();
    activityRepository.reset();
    staffRepository.reset();
    alertRepository.reset();
    app = createApp();
  });

  describe('GET /api/programmes', () => {
    it('returns 200 and the programmes for the authenticated store', async () => {
      const response = await request(app).get('/api/programmes').set('Authorization', MANAGER);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.map((p: { id: string }) => p.id)).not.toContain('prg_backroom_refit');
    });

    it('supports a status filter', async () => {
      const response = await request(app)
        .get('/api/programmes?status=PLANNING')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('returns 400 for an unknown status filter', async () => {
      const response = await request(app)
        .get('/api/programmes?status=ARCHIVED')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const response = await request(app).get('/api/programmes');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/programmes', () => {
    it('returns 201 with the created programme', async () => {
      const response = await request(app)
        .post('/api/programmes')
        .set('Authorization', MANAGER)
        .send({ name: 'Autumn Rollout', description: 'Seasonal changeover' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Autumn Rollout',
        ownerId: 'usr_manager',
        storeId: 'store_001',
        status: 'PLANNING',
      });
    });

    it('returns 400 when the name is missing', async () => {
      const response = await request(app)
        .post('/api/programmes')
        .set('Authorization', MANAGER)
        .send({ description: 'no name' });
      expect(response.status).toBe(400);
    });

    it('returns 400 when the body is not an object', async () => {
      const response = await request(app)
        .post('/api/programmes')
        .set('Authorization', MANAGER)
        .send([]);
      expect(response.status).toBe(400);
    });

    it('returns 409 for a duplicate programme name', async () => {
      const response = await request(app)
        .post('/api/programmes')
        .set('Authorization', MANAGER)
        .send({ name: 'Spring Planogram Reset' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  describe('GET /api/programmes/:id', () => {
    it('returns 200 for a known programme', async () => {
      const response = await request(app)
        .get('/api/programmes/prg_compliance_q1')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Q1 Compliance Drive');
    });

    it('returns 404 for an unknown programme', async () => {
      const response = await request(app)
        .get('/api/programmes/prg_missing')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/programmes/:id/members', () => {
    it('returns 201 and notifies the new member', async () => {
      const response = await request(app)
        .post('/api/programmes/prg_spring_reset/members')
        .set('Authorization', MANAGER)
        .send({ userId: 'usr_associate', role: 'ASSOCIATE' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        projectId: 'prg_spring_reset',
        userId: 'usr_associate',
        role: 'ASSOCIATE',
      });

      const members = await request(app)
        .get('/api/programmes/prg_spring_reset/members')
        .set('Authorization', MANAGER);
      expect(members.body).toHaveLength(3);

      const alerts = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);
      expect(
        alerts.body.some((alert: { type: string }) => alert.type === 'SHIFT_HANDOVER'),
      ).toBe(true);
    });

    it('returns 400 for an unknown role', async () => {
      const response = await request(app)
        .post('/api/programmes/prg_spring_reset/members')
        .set('Authorization', MANAGER)
        .send({ userId: 'usr_associate', role: 'CHIEF' });
      expect(response.status).toBe(400);
    });

    it('returns 403 when an associate tries to add a member', async () => {
      const response = await request(app)
        .post('/api/programmes/prg_compliance_q1/members')
        .set('Authorization', ASSOCIATE)
        .send({ userId: 'usr_associate', role: 'ASSOCIATE' });
      expect(response.status).toBe(403);
    });

    it('returns 404 for an unknown programme', async () => {
      const response = await request(app)
        .post('/api/programmes/prg_missing/members')
        .set('Authorization', MANAGER)
        .send({ userId: 'usr_associate', role: 'ASSOCIATE' });
      expect(response.status).toBe(404);
    });

    it('returns 409 when the member is already on the programme', async () => {
      const response = await request(app)
        .post('/api/programmes/prg_spring_reset/members')
        .set('Authorization', MANAGER)
        .send({ userId: 'usr_lead', role: 'DEPARTMENT_LEAD' });
      expect(response.status).toBe(409);
    });
  });
});
