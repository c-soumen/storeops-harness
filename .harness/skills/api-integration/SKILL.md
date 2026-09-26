# Skill: api-integration

**Purpose.** How the StoreOps HTTP layer is built: router construction, auth, input shaping,
status codes, and the traps that have already bitten this codebase once. The route layer is thin
by rule (R4) — everything here is about keeping it thin.

**Read by:** generator (and evaluator, when reviewing a route change).

---

## 1. Router factory + singleton

Every module exports a factory taking its service (so tests can inject) and a default singleton
(so `app.ts` stays declarative):

```ts
export const createActivityRouter = (service: ActivityService = activityService): Router => {
  const router = Router();
  router.use(requireAuth());
  // … routes …
  return router;
};

export const activityRouter = createActivityRouter();
```

Mount in `src/app.ts` under its `/api/<module>` prefix. `reports` has no router yet — adding one
is a feature, not a wiring task.

## 2. Auth

`router.use(requireAuth())` once, at the top of the router — not per route. The two exceptions in
the codebase are `POST /api/staff/login` and `GET /health`, which sit outside an authenticated
router.

Inside a handler, narrow the user with `currentUser`:

```ts
const caller = currentUser(req.user);   // throws UnauthorizedError if absent
```

Never `req.user!` and never `if (!req.user) return res.status(401)` — that duplicates the middleware
and produces an error body that does not match `errorHandler`'s shape.

For role-gated routes use `requireRole('STORE_MANAGER', 'REGIONAL_MANAGER')` as middleware. Do not
hand-roll a role check in a handler; role checks that depend on the *entity* (owner-or-manager)
belong in the service, not the route.

## 3. Every async handler is wrapped

Express 4 does not forward rejected promises. An unwrapped `async` handler is a hung request, not
a 500:

```ts
router.get('/:id', asyncHandler(async (req, res) => {
  res.status(200).json(await service.getTask(String(req.params.id)));
}));
```

`asyncHandler` comes from `shared/errors/errorHandler.ts`. No `try/catch` in handlers — let the
error reach `errorHandler`, which owns the mapping.

## 4. Input shaping helpers

Routes validate **shape** (is it a string?); services validate **domain** (is it a legal status?).
Use these three, defined locally in each `routes.ts`:

```ts
const asObject = (body: unknown): Record<string, unknown> => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, { field });
  }
  return value;
};

const nullableString = (value: unknown, field: string): string | null =>
  value === null ? null : optionalString(value, field) ?? null;
```

Enum-valued fields are passed through as a cast and validated by the **service** guard:

```ts
status: body.status as TaskStatus | undefined,   // service calls isTaskStatus
```

That keeps one source of truth for legal values (`types.ts`) instead of two.

## 5. Two traps this codebase already hit

**Trap 1 — explicit `null` must be distinguishable from absent.** `PATCH /api/activities/:id`
originally rejected `{"assigneeId": null}` with a 400, so an assignee could never be cleared.
`optionalString` throws on `null` because `null` is not `undefined` and not a string. For any
nullable field use `nullableString`, and gate on `=== undefined` when building the patch:

```ts
...(body.assigneeId === undefined
  ? {}
  : { assigneeId: nullableString(body.assigneeId, 'assigneeId') }),
```

**Trap 2 — repeated query params arrive as arrays.** `?status=TODO&status=DONE` makes
`req.query.status` a `string[]`, which is why filters go through `optionalString(req.query.status,
'status')` — it returns a clean 400 instead of leaking an array into the service. Tests assert this
(`"returns 400 when a filter is repeated into an array"`). Never `String(req.query.x)` for a
filter: it would stringify the array to `"TODO,DONE"` and produce a confusing error.

`String(req.params.id)` **is** correct — path params are always single strings.

## 6. Route ordering

Express matches in registration order. A literal path must be registered **before** a parameterised
sibling at the same depth:

```ts
router.patch('/bulk-status', /* … */);   // must come first
router.patch('/:id', /* … */);           // else :id captures "bulk-status"
```

Get this wrong and the new endpoint returns a 404 from the single-item handler — which looks like a
missing route, not an ordering bug.

## 7. Status codes

| Operation | Success | Notes |
|---|---|---|
| List / get / update | `200` | Always a JSON body |
| Create | `201` | Return the created entity, not a wrapper |
| Delete | `204` | `res.status(204).send()` — no body |
| Batch with per-item outcomes | `207` | Describes the *batch*; per-item failures live in the body |
| Action on a sub-resource | `200` | e.g. `POST /api/alerts/:id/read` |

Failures are never hand-built. Throw the `AppError` subclass and let `errorHandler` produce:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "title is required",
             "details": { "field": "title" } } }
```

`res.status(4xx).json({ error: '…' })` inside a handler is a review finding — the shape will not
match and clients break.

**On 207:** a batch endpoint returns 207 whenever the batch was *processed*, even if every item
failed. Request-level problems (malformed body, empty id list, unknown target status) are still
`400` — they mean the batch was never processable. The line is: could we attempt the items?

## 8. Response bodies

- Lists return a bare JSON array, not `{ data: [...] }`.
- Single entities return the entity object.
- Batch endpoints return the service's result object unchanged — the route adds no fields. Shape
  the payload in the service so HTTP and future callers see the same thing.
- Never return an internal field that does not exist on the domain type.

## 9. Adding an endpoint — checklist

- [ ] Registered in the right module's `routes.ts` (the module that owns the data)
- [ ] Literal paths before parameterised ones (§6)
- [ ] `asyncHandler` wrapping
- [ ] `currentUser(req.user)` for anything caller-dependent
- [ ] Shape validation via the three helpers; domain validation left to the service
- [ ] Status code from §7
- [ ] No business logic, no authorization decision, no repository import in the route
- [ ] Route test asserts status **and** body **and** any observable side effect (R6)
- [ ] `app-context/SKILL.md` §4 updated if it changes the public surface
