# Skill: coding-conventions

**Purpose.** How StoreOps code is actually written, so generated code is indistinguishable from
the baseline. Everything here is enforced by `tsc`, ESLint, or review — none of it is taste.

**Read by:** generator (and evaluator, when judging whether code matches the codebase).

---

## 1. Compiler flags you must write for

`tsconfig.json` runs strict plus these, and they change how you write:

| Flag | Consequence for your code |
|---|---|
| `noUncheckedIndexedAccess` | `arr[0]` is `T \| undefined`. In tests use `results[0]?.outcome`; in src, destructure or guard. `Map.get()` already returns `\| undefined` — always check |
| `noUnusedLocals` / `noUnusedParameters` | An unused parameter is a **build failure** (TS6133). Either use it or prefix `_`. Do not leave a vestigial `caller` argument "for later" — give it a real job or drop it |
| `noImplicitReturns` | Every code path returns. Filter callbacks need an explicit `return true` at the end |
| `noImplicitOverride` | Subclass overrides need the `override` keyword |
| `isolatedModules` | Re-export types with `export type { X }`, never bare `export { X }` |
| `exactOptionalPropertyTypes: false` | `{ foo?: string }` accepts `undefined`. Still prefer conditional spread (§4) over passing `undefined` |

Type checking is **not** run by Jest (`diagnostics: false`). `npx tsc --noEmit` is the only gate
that catches type errors — run it before you claim a sprint is done.

## 2. File and symbol naming

| Thing | Convention | Example |
|---|---|---|
| Layer files | lowercase, fixed names | `routes.ts`, `service.ts`, `repository.ts`, `types.ts` |
| Error classes | PascalCase, one per file, `Error` suffix | `shared/errors/ConflictError.ts` |
| Classes | PascalCase, `Service` / `Repository` suffix | `ActivityService`, `AlertRepository` |
| Singletons | camelCase instance beside the class | `export const activityService = new ActivityService();` |
| Enum-like unions | SCREAMING_SNAKE members, plural const array | `TASK_STATUSES` → `TaskStatus` |
| Type guards | `is` prefix | `isTaskStatus`, `isBulkStatusTarget` |
| Ids | `<prefix>_<slug>` | `act_restock_aisle4`, `prg_spring_reset`, `usr_manager` |

## 3. The enum + guard pattern — always both

Never a bare union type, never a hand-rolled validation chain:

```ts
export const BULK_STATUS_TARGETS = ['DONE', 'BLOCKED'] as const;
export type BulkStatusTarget = (typeof BULK_STATUS_TARGETS)[number];

export const isBulkStatusTarget = (value: unknown): value is BulkStatusTarget =>
  typeof value === 'string' && (BULK_STATUS_TARGETS as readonly string[]).includes(value);
```

The const array is the single source of truth: it drives the type, the guard, and any tally in
`reports`. Validation in a service **calls the guard** — `if (!isBulkStatusTarget(input.status))` —
it does not re-list the members.

## 4. Immutable updates, centralised timestamps

Repositories never mutate a stored object in place. Spread, re-stamp, re-set:

```ts
public update(id: ID, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | undefined {
  const existing = this.tasks.get(id);
  if (!existing) {
    return undefined;
  }
  const updated: Task = { ...existing, ...patch, id: existing.id, updatedAt: nowIso() };
  this.tasks.set(id, updated);
  return updated;
}
```

Note `id: existing.id` after the spread — the patch can never reassign an id. `createdAt` is
excluded at the type level. `updatedAt` is set by the repository, never by the caller.

Use `nowIso()` and `newId(prefix)` from `shared/types/common.ts`. Never `new Date().toISOString()`
inline, never `Math.random()` or `crypto.randomUUID()` for ids.

Build partial patches with **conditional spread**, so an absent field is absent rather than
`undefined`:

```ts
const updated = this.repository.update(id, {
  ...(input.status === undefined ? {} : { status: input.status }),
  ...(input.priority === undefined ? {} : { priority: input.priority }),
});
```

## 5. Class shape and dependency injection

Every class member carries an explicit accessibility keyword — ESLint
(`explicit-member-accessibility`) enforces it. Dependencies are constructor parameter properties
with the singleton as the **default value**, so production wiring is zero-config and tests inject
fakes:

```ts
export class ActivityService {
  constructor(
    private readonly repository: ActivityRepository = activityRepository,
    private readonly programmes: ProgrammeService = programmeService,
    private readonly bus: EventBus = eventBus,
  ) {}

  public async getTask(id: ID): Promise<Task> { /* … */ }
}

export const activityService = new ActivityService();
```

Rules: constructor takes no `public` keyword (ESLint `constructors: 'no-public'`); all deps
`private readonly`; never `new ActivityRepository()` inside a method; never reach for the singleton
from inside a class that received it by injection.

Service methods are `async` even when the body is synchronous — the in-memory store is a stand-in
for I/O, and the signature should not change when it is replaced.

## 6. Repositories

- One `Map<ID, T>` per collection, `private`.
- `reset()` is **mandatory** — re-seeds from a `seed*()` factory function. Route tests call it in
  `beforeEach`; without it tests become order-dependent.
- Seed factories return fresh objects each call (`const seedTasks = (): Task[] => [ … ]`), never a
  shared module-level array.
- Return `undefined` for a miss. **Never throw from a repository** — classifying a miss as
  `NotFoundError` is the service's job.
- Methods: `findAll`, `findById`, `findByIds`, `findBy<Field>`, `create`, `update`, `delete`,
  `count`. Filtering helpers return arrays and take a filters object.
- `create` takes `Omit<T, 'id' | 'createdAt' | 'updatedAt'>` and stamps the rest.

## 7. Services

Order inside a method, every time:

1. Normalise input (`typeof x === 'string' ? x.trim() : ''`)
2. Validate shape → `ValidationError` with `{ field }`
3. Load the entity → `NotFoundError` if missing
4. Authorize → `ForbiddenError` (store scope, then ownership/role)
5. Check conflicts → `ConflictError`
6. Mutate via the repository
7. Emit events for cross-module effects
8. Return the entity

Authorization idiom — store scope first, then role:

```ts
if (existing.storeId !== caller.storeId) {
  throw new ForbiddenError('Activity belongs to a different store');
}
if (existing.createdBy !== caller.id && !isManagerRole(caller.role)) {
  throw new ForbiddenError('Only the activity owner or a store manager can delete it');
}
```

Use `isManagerRole(caller.role)` from `shared/types/common.ts`. Never inline
`role === 'STORE_MANAGER' || role === 'REGIONAL_MANAGER'`.

Read helpers for other modules are explicit and named for the consumer:
`listTasksForStore`, `listTasksForProgramme`, `listProjectsForStore`. Add one rather than exposing
the repository.

## 8. Errors

Import subclasses directly from their file, not the barrel, inside `src/`:

```ts
import { ValidationError } from '../shared/errors/ValidationError';
```

`shared/errors/index.ts` is a convenience barrel for tests. Never `throw new Error(...)` in a
service or route — ESLint `no-restricted-syntax` fails the build (verified). Messages are
lowercase-field, human-readable, no trailing period: `'title is required'`. Always pass
`{ field: '<name>' }` as details on a `ValidationError`.

## 9. Imports

Order, blank-line separated: node builtins → external packages → internal modules. Within
internal, `shared/` before sibling modules before `./` files. Use `import type` for
type-only imports — `isolatedModules` requires it for re-exports and it keeps the emit clean.

## 10. Comments

Sparse and load-bearing. The baseline comments three things only:

- **Why**, never what: `// Side effect (alerting the new member) is another module job — rule #3.`
- Architecture-rule anchors: `/** Cross-module read through the staff *service* — rule #2. */`
- Real hazards: `// Express forwards any truthy throwable to the error middleware.`

Every auth-stub file carries `// TODO: replace with real auth`. Keep it. Do not add JSDoc that
restates the signature, and do not narrate the obvious.

## 11. Hard "do not" list

- Do not add a runtime dependency. `package.json` has exactly one (`express`). A feature that needs
  a library needs a conversation, not an install.
- Do not introduce a database, ORM, cache, or queue.
- Do not edit `tests/shared/architecture.test.ts` to make a check pass — fix the code.
- Do not extend seed data casually: `tests/reports/service.test.ts` asserts exact counts
  (`activitiesByStore: { store_001: 3, store_002: 0 }`) and will break. Arrange fixtures inside the
  test instead.
- Do not add an event name outside `shared/events/events.types.ts`, and do not register a
  subscriber anywhere but `src/app.ts`.
- Do not widen `tsconfig` or disable an ESLint rule to get green. Both are review findings.
- Do not emit into `dist/` from tests — `tsconfig.build.json` excludes `tests/` deliberately.
