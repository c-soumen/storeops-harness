import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../../src/app';
import { activityRepository } from '../../src/activities/repository';
import { alertRepository } from '../../src/alerts/repository';
import { programmeRepository } from '../../src/programmes/repository';
import { reportRepository } from '../../src/reports/repository';
import { staffRepository } from '../../src/staff/repository';

const MANAGER = 'Bearer token-manager';
const ASSOCIATE = 'Bearer token-associate';

describe('activities routes', () => {
  let app: Express;

  beforeEach(() => {
    activityRepository.reset();
    programmeRepository.reset();
    staffRepository.reset();
    alertRepository.reset();
    reportRepository.reset();
    app = createApp();
  });

  describe('GET /api/activities', () => {
    it('returns 200 and a non-empty array', async () => {
      const response = await request(app).get('/api/activities').set('Authorization', MANAGER);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);
    });

    it('supports programme and status filters', async () => {
      const response = await request(app)
        .get('/api/activities?programmeId=prg_spring_reset&status=TODO')
        .set('Authorization', MANAGER);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('act_restock_aisle4');
    });

    it('returns 400 for an unknown status filter', async () => {
      const response = await request(app)
        .get('/api/activities?status=PAUSED')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a filter is repeated into an array', async () => {
      const response = await request(app)
        .get('/api/activities?status=TODO&status=DONE')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const response = await request(app).get('/api/activities');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/activities', () => {
    it('returns 201 with the created activity', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', MANAGER)
        .send({
          title: 'Check date codes in chilled',
          programmeId: 'prg_compliance_q1',
          priority: 'HIGH',
          category: 'COMPLIANCE',
          assigneeId: 'usr_lead',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        title: 'Check date codes in chilled',
        status: 'TODO',
        priority: 'HIGH',
        createdBy: 'usr_manager',
      });
    });

    it('returns 400 when the title is missing', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', MANAGER)
        .send({ programmeId: 'prg_compliance_q1' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual({ field: 'title' });
    });

    it('returns 400 when a field has the wrong type', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', MANAGER)
        .send({ title: 42, programmeId: 'prg_compliance_q1' });
      expect(response.status).toBe(400);
    });

    it('returns 400 when the body is an array', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', MANAGER)
        .send([]);
      expect(response.status).toBe(400);
    });

    it('returns 404 when the programme does not exist', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', MANAGER)
        .send({ title: 'Orphan activity', programmeId: 'prg_missing' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/activities/:id', () => {
    it('returns 200 for a known activity', async () => {
      const response = await request(app)
        .get('/api/activities/act_planogram_home')
        .set('Authorization', MANAGER);

      expect(response.status).toBe(200);
      expect(response.body.category).toBe('PLANOGRAM');
    });

    it('returns 404 for an unknown activity', async () => {
      const response = await request(app)
        .get('/api/activities/act_missing')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/activities/:id', () => {
    it('returns 200 with the updated activity', async () => {
      const response = await request(app)
        .patch('/api/activities/act_restock_aisle4')
        .set('Authorization', MANAGER)
        .send({ status: 'IN_PROGRESS', priority: 'CRITICAL' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'IN_PROGRESS', priority: 'CRITICAL' });
    });

    it('accepts a null assignee', async () => {
      const response = await request(app)
        .patch('/api/activities/act_restock_aisle4')
        .set('Authorization', MANAGER)
        .send({ assigneeId: null });

      expect(response.status).toBe(200);
      expect(response.body.assigneeId).toBeNull();
    });

    it('returns 400 for an empty patch', async () => {
      const response = await request(app)
        .patch('/api/activities/act_restock_aisle4')
        .set('Authorization', MANAGER)
        .send({});
      expect(response.status).toBe(400);
    });

    it('returns 404 for an unknown activity', async () => {
      const response = await request(app)
        .patch('/api/activities/act_missing')
        .set('Authorization', MANAGER)
        .send({ status: 'DONE' });
      expect(response.status).toBe(404);
    });

    it('raises an SLA alert for the assignee when an activity is blocked', async () => {
      const before = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);

      const patched = await request(app)
        .patch('/api/activities/act_restock_aisle4')
        .set('Authorization', MANAGER)
        .send({ status: 'BLOCKED' });
      expect(patched.status).toBe(200);

      const after = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);
      expect(after.body.length).toBe(before.body.length + 1);
      expect(after.body.some((alert: { type: string }) => alert.type === 'SLA_BREACH')).toBe(true);
    });
  });

  describe('PATCH /api/activities/bulk-status', () => {
    // AC-2.1
    it('returns 207 with per-item outcomes', async () => {
      const response = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', MANAGER)
        .send({ ids: ['act_restock_aisle4', 'act_missing'], status: 'DONE' });

      expect(response.status).toBe(207);
      expect(response.body.requested).toBe(2);
      expect(response.body.updated).toBe(1);
      expect(response.body.results).toContainEqual({
        id: 'act_restock_aisle4',
        outcome: 'updated',
        code: null,
        status: 'DONE',
      });
      expect(response.body.results).toContainEqual({
        id: 'act_missing',
        outcome: 'not_found',
        code: 'NOT_FOUND',
        status: null,
      });
    });

    // AC-2.2
    it('returns 207 when no item could be updated', async () => {
      const response = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', MANAGER)
        .send({ ids: ['act_missing'], status: 'DONE' });

      expect(response.status).toBe(207);
      expect(response.body.updated).toBe(0);
      expect(response.body.results[0].outcome).toBe('not_found');
    });

    // AC-2.3
    it('returns 400 for request-level problems', async () => {
      const emptyIds = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', MANAGER)
        .send({ ids: [], status: 'DONE' });
      expect(emptyIds.status).toBe(400);
      expect(emptyIds.body.error.code).toBe('VALIDATION_ERROR');
      expect(emptyIds.body.error.details).toEqual({ field: 'ids' });

      const badStatus = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', MANAGER)
        .send({ ids: ['act_restock_aisle4'], status: 'TODO' });
      expect(badStatus.status).toBe(400);
      expect(badStatus.body.error.details).toEqual({ field: 'status' });

      const missingIds = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', MANAGER)
        .send({ status: 'DONE' });
      expect(missingIds.status).toBe(400);
      expect(missingIds.body.error.details).toEqual({ field: 'ids' });
    });

    // AC-2.4
    it('returns 401 without a token', async () => {
      const response = await request(app)
        .patch('/api/activities/bulk-status')
        .send({ ids: ['act_restock_aisle4'], status: 'DONE' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');

      const unchanged = await request(app)
        .get('/api/activities/act_restock_aisle4')
        .set('Authorization', MANAGER);
      expect(unchanged.body.status).toBe('TODO');
    });

    // AC-2.6
    it('raises an SLA alert for the assignee via the bulk endpoint', async () => {
      const before = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);

      const response = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', MANAGER)
        .send({ ids: ['act_restock_aisle4'], status: 'BLOCKED' });
      expect(response.status).toBe(207);

      const after = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);
      expect(after.body.length).toBe(before.body.length + 1);

      const breach = after.body.find((alert: { type: string }) => alert.type === 'SLA_BREACH');
      expect(breach).toBeDefined();
      // The alerts subscriber composes the id into `title` and the reason into `body`.
      // AC-2.6 says "a body naming act_restock_aisle4"; in the Notification type that is
      // `title`. Asserting both halves so the alert is pinned either way.
      expect(breach.title).toContain('act_restock_aisle4');
      expect(breach.body).toContain('BLOCKED');
    });
  });

  describe('DELETE /api/activities/:id', () => {
    it('returns 204 for the owner', async () => {
      const response = await request(app)
        .delete('/api/activities/act_restock_aisle4')
        .set('Authorization', MANAGER);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      const list = await request(app).get('/api/activities').set('Authorization', MANAGER);
      expect(list.body).toHaveLength(2);
    });

    it('returns 403 when an associate deletes an activity they do not own', async () => {
      const response = await request(app)
        .delete('/api/activities/act_restock_aisle4')
        .set('Authorization', ASSOCIATE);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for an unknown activity', async () => {
      const response = await request(app)
        .delete('/api/activities/act_missing')
        .set('Authorization', MANAGER);
      expect(response.status).toBe(404);
    });
  });

  describe('app wiring', () => {
    it('exposes a health endpoint', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', service: 'storeops' });
    });

    it('returns 404 for an unknown route', async () => {
      const response = await request(app).get('/api/nope');
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('does not expose report endpoints yet', async () => {
      const response = await request(app).get('/api/reports').set('Authorization', MANAGER);
      expect(response.status).toBe(404);
    });
  });
});
