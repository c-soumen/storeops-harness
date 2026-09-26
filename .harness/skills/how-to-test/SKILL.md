# Skill: how-to-test

**Purpose.** How StoreOps tests are written so they prove business rules rather than status codes
(failure mode 3), stay isolated, and hit the coverage thresholds. 219 tests pass in ~21s at 97%
statements — that is the bar to hold, not a ceiling to admire.

**Read by:** generator (and evaluator, when judging test substance).

---

## 1. Layout and thresholds

`tests/` mirrors `src/`: `tests/<module>/service.test.ts`, `tests/<module>/routes.test.ts`, plus
`tests/shared/`. Thresholds are enforced by `jest.config.ts` and a miss fails the run:

| Scope | Minimum |
|---|---|
| `src/*/service.ts` | 80% |
| `src/*/routes.ts` | 70% |
| `src/shared/` | 60% |
| Overall | 70% |

Jest runs with `diagnostics: false` and `isolatedModules`, so **type errors do not fail the
test run**. Always run `npx tsc --noEmit` separately.

## 2. Service tests — construct your own everything

Never use the exported singletons in a service test. Build the object graph so each test file is
hermetic:

```ts
beforeEach(() => {
  repository = new ActivityRepository();
  bus = new EventBus();
  const programmes = new ProgrammeService(
    new ProgrammeRepository(),
    new StaffService(new StaffRepository()),
    bus,
  );
  service = new ActivityService(repository, programmes, bus);
});
```

Callers are plain literals at the top of the file, one per role you need:

```ts
const manager: AuthenticatedUser = { id: 'usr_manager', storeId: 'store_001', role: 'STORE_MANAGER' };
const associate: AuthenticatedUser = { id: 'usr_associate', storeId: 'store_001', role: 'ASSOCIATE' };
```

For a different store, spread: `{ ...manager, storeId: 'store_002' }`.

## 3. Route tests — `createApp()` plus `reset()`

Route tests exercise the real wiring, so they use the singletons and must re-seed:

```ts
beforeEach(() => {
  activityRepository.reset();
  programmeRepository.reset();
  staffRepository.reset();
  alertRepository.reset();
  app = createApp();
});
```

Reset **every** repository the request path can touch, including `alertRepository` when events
fire — otherwise alert counts leak between tests. Auth is a header constant:

```ts
const MANAGER = 'Bearer token-manager';
const ASSOCIATE = 'Bearer token-associate';
```

## 4. Every service method gets two tests minimum

One happy path, one asserting the specific `AppError` subclass on the obvious failure. Assert the
**class**, not the message:

```ts
await expect(service.getTask('act_missing')).rejects.toBeInstanceOf(NotFoundError);
```

Use `rejects.toBeInstanceOf` / `resolves.toMatchObject`. `toMatchObject` for entities (ignores
timestamps); `toEqual` for exact shapes like tally objects.

Invalid enum values are cast, not fabricated: `{ status: 'PAUSED' as never }`.

## 5. Assert substance, not just the status code

This is failure mode 3 and the most common reason a test suite passes while the feature is broken.
Every negative-path test asserts the **state did not change**:

```ts
it('throws ForbiddenError when an associate deletes somebody else activity', async () => {
  await expect(service.deleteTask(associate, 'act_restock_aisle4'))
    .rejects.toBeInstanceOf(ForbiddenError);
  expect(repository.count()).toBe(3);          // ← the assertion that matters
});
```

Route tests assert status **and** body:

```ts
expect(response.status).toBe(400);
expect(response.body.error.details).toEqual({ field: 'title' });
```

A test whose only assertion is `expect(res.status).toBe(403)` will be marked insufficient by the
Evaluator even if coverage is green.

## 6. Events — assert at the effect, and at the emit

Two complementary styles, both required for a cross-module feature.

**Service test — subscribe to the bus you injected:**

```ts
const handler = jest.fn();
bus.on('task.sla_breached', handler);

await service.updateTask(manager, 'act_restock_aisle4', { status: 'BLOCKED' });

expect(handler).toHaveBeenCalledTimes(1);
expect(handler.mock.calls[0]?.[0]).toMatchObject({ taskId: 'act_restock_aisle4', priority: 'HIGH' });
```

Note `?.[0]` — `noUncheckedIndexedAccess` makes the index access optional.

Also assert the **negative**: no event when nothing changed.

```ts
await service.updateTask(manager, 'act_restock_aisle4', { status: 'TODO' }); // already TODO
expect(handler).not.toHaveBeenCalled();
```

**Route test — assert the observable consequence,** not the emit:

```ts
const before = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);
await request(app).patch('/api/activities/act_restock_aisle4')
  .set('Authorization', MANAGER).send({ status: 'BLOCKED' });
const after = await request(app).get('/api/alerts').set('Authorization', ASSOCIATE);

expect(after.body.length).toBe(before.body.length + 1);
expect(after.body.some((a: { type: string }) => a.type === 'SLA_BREACH')).toBe(true);
```

**Timing:** subscribers are `async`, and `EventBus.emit()` does not await them. The handler runs
synchronously up to its first real suspension, and `createNotification` has no internal `await`,
so the alert exists by the time the HTTP response is sent — route tests need no flush. In a
**service** test that emits directly, flush before asserting:

```ts
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
```

## 7. Fixtures: reference, don't invent

Use the seeded ids from `app-context` §6 (`act_restock_aisle4`, `prg_spring_reset`,
`token-manager`). When you need something the seeds lack, **arrange it inside the test**:

```ts
const created = await service.createTask(
  { id: 'usr_manager', storeId: 'store_002', role: 'STORE_MANAGER' },
  { title: 'Cross-store activity', programmeId: 'prg_backroom_refit' },
);
```

Do **not** add it to the seed data. `tests/reports/service.test.ts` asserts
`activitiesByStore: { store_001: 3, store_002: 0 }` and `data.activityCount` — new seeds break
them. (`staff` seeds were extended once, deliberately, to make the auth failure branches
reachable; that is the exception, and it is why reports assertions use
`toBeGreaterThanOrEqual` for `staffCount`.)

## 8. Test names describe the rule

`it('<verb phrase naming the business rule>')` — not `it('works')`, not `it('test 3')`:

- ✅ `'refuses activities from another store without touching them'`
- ✅ `'publishes task.status_changed only when the status actually moves'`
- ❌ `'returns 403'`

Group with `describe('<methodName>')` for services and
`describe('<METHOD> /api/<path>')` for routes.

## 9. Gotchas already paid for

- **Express treats a falsy `next(err)` as "no error".** Throwing `Number.NaN` to exercise the
  non-`Error` branch silently fell through to the 404 handler. Use a truthy non-Error throwable:
  `throw { code: 'NOT_AN_ERROR_INSTANCE' }`.
- **`architecture.test.ts` reads files off disk**, so a new module or a stray cross-module import
  fails it immediately. That is the point. Never edit it to go green.
- **`clearMocks: true`** is set globally — do not hand-write `jest.clearAllMocks()` in `beforeEach`.
- **`maxWorkers: '50%'`** and no type checking in the transform are deliberate performance
  settings. Twelve type-checking workers on this disk once took 79 minutes.
- **Repositories are singletons in route tests.** A missing `reset()` shows up as a test that
  passes alone and fails in suite.

## 10. Before claiming a sprint is done

- [ ] `npx tsc --noEmit` → 0 errors (Jest will not catch these)
- [ ] `npx eslint .` → 0 errors
- [ ] `npx jest --coverage` → all pass, thresholds met
- [ ] `npx jest tests/shared/architecture.test.ts` → passes
- [ ] Every AC in the contract maps to a named test, and the test asserts the AC's THEN clause in
      full — including the "state unchanged" half
- [ ] Every new error branch has a test naming its `AppError` subclass
- [ ] Every new event has both a positive and a negative assertion
