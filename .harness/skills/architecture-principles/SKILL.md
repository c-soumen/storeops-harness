# Skill: architecture-principles

**Purpose.** The five non-negotiable StoreOps architecture rules, each traced to the specific
failure mode it prevents, with the compliant and non-compliant shape spelled out and the exact
check that catches a violation. These are not style preferences. A violation of any rule is a
**FAIL**, not a comment.

**Read by:** planner, generator, evaluator (shared foundation).

---

## Why these five rules exist

The client's engineering standards team observed four failure modes in a prior AI-assisted
experiment. Every rule below maps to one of them:

| # | Observed failure mode | Rule that prevents it |
|---|---|---|
| 1 | Direct imports from another module's repository, bypassing the service boundary | R1 Module boundary |
| 2 | Raw `Error` throws in service methods, bypassing the typed `AppError` hierarchy | R3 Error contract |
| 3 | Tests asserting HTTP status codes but not business rule compliance | R6 Test substance |
| 4 | Missing event bus integration — state written directly to sibling repositories | R2 Event bus only |

R4 (layer separation) and R5 (read-only reports) are the structural rules that keep 1 and 4 from
recurring in new shapes.

---

## R1 — Module boundary

**Rule.** No module may import from another module's `repository/`. Cross-module reads go through
the target module's **service** layer only.

**Compliant** (`activities/service.ts` validating a programme exists):
```ts
import { ProgrammeService, programmeService } from '../programmes/service';

constructor(
  private readonly repository: ActivityRepository = activityRepository,
  private readonly programmes: ProgrammeService = programmeService,  // service, injected
) {}

const programme = await this.programmes.getProject(programmeId); // throws NotFoundError
```

**Violation:**
```ts
import { programmeRepository } from '../programmes/repository';   // ❌ crosses the boundary
const programme = programmeRepository.findById(programmeId);      // ❌ no validation, no error contract
```

Why it matters: the repository has no validation, no authorization, and no error contract. Reaching
past the service means every caller re-implements those concerns, inconsistently.

**How it is checked.** Automated. `npx jest tests/shared/architecture.test.ts` scans every file in
`src/` for `../<other-module>/repository` and fails with the offending path. A dependency-cruiser
rule is the equivalent tool check.

## R2 — Event bus only

**Rule.** Side effects that cross a module boundary are raised via `EventBus.emit()`. Never by
importing a sibling service to perform the effect.

Reads are different from effects: a cross-module **read** through a service (R1) is correct. A
cross-module **write or notification** must be an event.

**Compliant** (`activities/service.ts` blocking a task):
```ts
this.bus.emit('task.sla_breached', {
  taskId: updated.id, storeId: updated.storeId,
  assigneeId: updated.assigneeId, priority: updated.priority,
  reason: `Activity moved to ${updated.status}`,
});
// alerts/service.ts subscribes and decides what alert to raise. activities does not know.
```

**Violation:**
```ts
import { alertService } from '../alerts/service';
await alertService.createNotification({ ... });   // ❌ activities now owns alerting policy
```

**Event catalogue** (`shared/events/events.types.ts`) — extend this union, never invent an
untyped event name:

| Event | Published by | Subscribed by |
|---|---|---|
| `task.created` | activities | alerts (INVENTORY alert when category is RESTOCKING and assignee set) |
| `task.status_changed` | activities | — (available for audit/reporting) |
| `task.sla_breached` | activities | alerts (SLA_BREACH; EMAIL when priority CRITICAL, else IN_APP) |
| `programme.member_added` | programmes | alerts (SHIFT_HANDOVER alert to the new member) |
| `report.store_summary_requested` | any | reports (generates a STORE_SUMMARY) |

Subscribers are registered once per process in `src/app.ts` via
`alertService.registerSubscribers()` and `reportService.registerSubscribers()`. A new subscriber is
registered there — not at import time inside a module.

`EventBus.emit()` catches and logs subscriber failures rather than rethrowing: a failing alert must
never roll back the activity update that triggered it.

**How it is checked.** LLM-assessed. The Evaluator confirms cross-module triggers use
`bus.emit(...)` and that no module imports a sibling service for an effect. Grep support: a new
`import { alertService }` or `import { reportService }` outside `src/app.ts` is a strong signal.

## R3 — Error contract

**Rule.** No raw `throw new Error(...)` in services or routes. Every error is an `AppError`
subclass, which carries `code`, `message`, and `statusCode`, and is mapped to HTTP by the central
`errorHandler`.

| Subclass | Status | `code` | Use for |
|---|---|---|---|
| `ValidationError` | 400 | VALIDATION_ERROR | Bad input. Pass `{ field }` as details |
| `UnauthorizedError` | 401 | UNAUTHORIZED | Missing/invalid/expired token |
| `ForbiddenError` | 403 | FORBIDDEN | Authenticated but not permitted; wrong store |
| `NotFoundError` | 404 | NOT_FOUND | Unknown id. Constructor is `(resource, id?)` |
| `ConflictError` | 409 | CONFLICT | Duplicate or already-exists |

**Compliant:**
```ts
if (title.length === 0) {
  throw new ValidationError('title is required', { field: 'title' });
}
const task = this.repository.findById(id);
if (!task) {
  throw new NotFoundError('Activity', id);
}
```

**Violation:**
```ts
throw new Error('title is required');          // ❌ becomes an opaque 500
res.status(400).json({ error: 'bad title' });  // ❌ bypasses the error handler, inconsistent shape
```

Choosing the wrong subclass is also a violation: a missing entity is 404, not 400; a cross-store
access attempt is 403, not 404.

**How it is checked.** Automated twice over. `.eslintrc.cjs` bans the syntax in
`src/**/service.ts` and `src/**/routes.ts` via `no-restricted-syntax` (verified: adding
`throw new Error('raw')` to a service produces 2 lint errors). `architecture.test.ts` independently
greps for the string. Plus LLM-assessed for correct subclass choice.

## R4 — Layer separation

**Rule.** Routes → Service → Repository. No skipping, no inversion.

| Layer | Owns | Must never |
|---|---|---|
| `routes.ts` | HTTP concerns: parse/shape input, status codes, `asyncHandler` wrapping, `requireAuth` | Contain business rules, authorization decisions, or touch a repository |
| `service.ts` | All business logic, validation, authorization, event publishing | Reference `req`, `res`, or HTTP status codes |
| `repository.ts` | Data access on its own `Map` | Call another service, emit events, or validate business rules |

Routes are thin by design:
```ts
router.patch('/:id', asyncHandler(async (req, res) => {
  const caller = currentUser(req.user);
  const body = asObject(req.body);
  res.status(200).json(await service.updateTask(caller, String(req.params.id), input));
}));
```

Type-shape checks in routes (`optionalString`, `nullableString`, `asObject`) are HTTP concerns and
belong there. Domain validation (is this a legal `TaskStatus`? may this caller delete?) belongs in
the service.

Express 4 does not forward rejected promises — **every async route handler is wrapped in
`asyncHandler`**. An unwrapped async handler is a hang, not an error response.

**How it is checked.** LLM-assessed. The generator summary must name the layer of each changed
file; the Evaluator confirms no HTTP logic in repositories and no business logic in routes.
Automated support: `architecture.test.ts` fails if any `routes.ts` imports a repository.

## R5 — Read-only reports

**Rule.** `reports` aggregates from `activities`, `programmes`, and `staff` through their service
layers and **never** writes to them. Its only writes are to its own `ReportRepository`.

**Compliant:**
```ts
const [programmes, activities, staff] = await Promise.all([
  this.programmes.listProjectsForStore(target),
  this.activities.listTasksForStore(target),
  this.staff.listByStore(target),
]);
```

**Violation:** any `this.activities.create(...)`, `this.programmes.update(...)`,
`this.staff.delete(...)` — or a "convenient" status flip on an aggregated record.

Read helpers exist for this purpose and should be extended rather than bypassed:
`listTasksForStore`, `listTasksForProgramme`, `listProjectsForStore`, `listByStore`, `getProfile`.

**How it is checked.** LLM-assessed plus automated. `architecture.test.ts` asserts
`reports/service.ts` contains no `this.<dep>.create|update|delete`, imports its dependencies only
via `/service`, and has no `routes.ts`.

## R6 — Test substance (not just status codes)

**Rule.** A test that asserts only an HTTP status code does not count as coverage of a business
rule. Failure mode 3 is exactly this.

Every service method needs **at least two tests**: the happy path, and one asserting the specific
`AppError` subclass thrown on the obvious failure.

**Compliant:**
```ts
it('throws ForbiddenError when an associate deletes somebody else activity', async () => {
  await expect(service.deleteTask(associate, 'act_restock_aisle4'))
    .rejects.toBeInstanceOf(ForbiddenError);
  expect(repository.count()).toBe(3);          // and the state did not change
});
```

**Weak** (passes, proves little):
```ts
it('returns 403', async () => {
  const res = await request(app).delete('/api/activities/act_restock_aisle4')
    .set('Authorization', ASSOCIATE);
  expect(res.status).toBe(403);                // no assertion that the activity survived
});
```

Route tests should assert the response **body** and any observable side effect, not only the code.
Event-driven behaviour is asserted at the effect: after blocking an activity, the assignee's alert
list gains an `SLA_BREACH` entry.

Service tests construct their own `EventBus` and repositories for isolation. Route tests use
`createApp()` and `reset()` the singleton repositories in `beforeEach`.

**How it is checked.** LLM-assessed against the coverage thresholds in `app-context` §7. Coverage
percentage alone is not sufficient evidence — the Evaluator reads the assertions.

---

## Quick reference: rule → check command

| Rule | Deterministic check | Type |
|---|---|---|
| R1 Module boundary | `npx jest tests/shared/architecture.test.ts` | Automated |
| R2 Event bus only | Evaluator review + grep for sibling service imports outside `app.ts` | LLM + grep |
| R3 Error contract | `npx eslint .` (`no-restricted-syntax`) + architecture test | Automated |
| R4 Layer separation | Architecture test (routes→repository) + Evaluator review | Automated + LLM |
| R5 Read-only reports | `npx jest tests/shared/architecture.test.ts` | Automated |
| R6 Test substance | `npx jest --coverage` thresholds + Evaluator reads assertions | Automated + LLM |
