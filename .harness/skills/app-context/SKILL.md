# Skill: app-context

**Purpose.** Ground every agent in what StoreOps actually is before it plans, writes, reviews, or
logs anything. Read this first, every time. If a statement here conflicts with the code, the code
wins — and say so in your handoff file so this skill gets corrected.

**Read by:** planner, generator, evaluator, monitor (shared foundation).

---

## 1. What StoreOps is

A REST API for **retail store operations management**. Store teams create operational
programmes, assign and track activities across departments, coordinate staff, and surface
performance reports by store and region.

In-memory storage only — every repository is a `Map<string, T>` seeded with 2–4 fixtures. There is
no database, no migration story, and no persistence across restarts. Do not introduce one; a
feature that "needs" a database is a feature that has been decomposed wrong.

Stack: Node.js / TypeScript 5.x strict, Express 4.x, Jest + supertest, ESLint + @typescript-eslint.

## 2. Module map

Five domain modules plus `shared/`. Each domain module owns exactly three layers plus its types.

| Module | Owns | Writes to other modules? | Notes |
|---|---|---|---|
| `activities` | Operational activities (restocking, planogram resets, compliance checks, general tasks) | No | The busiest module; most features land here |
| `programmes` | Store programmes and their staff membership | No | Seasonal rollouts, compliance drives, refits |
| `staff` | Identity: staff records, profiles, auth tokens | No | **Read-only for other modules.** Owns `auth.middleware.ts` |
| `alerts` | In-app/email alerts | No | Reacts to events; never polls other modules |
| `reports` | Store and regional performance summaries | **Never** | Read-only aggregator. No `routes.ts` yet — HTTP surface is a demonstration feature |

Dependency direction is strictly one-way and acyclic:

```
reports ──▶ activities ──▶ programmes ──▶ staff
   │            │              │
   └────────────┴──────────────┴──────────▶ shared
alerts ──▶ shared          (alerts is reached only via the event bus)
```

`shared/` must never import a domain module. That is why the canonical role vocabulary
(`StaffRole`, `MANAGER_ROLES`) lives in `shared/types/common.ts` and is re-exported by
`staff/types.ts`.

## 3. Domain types you must reuse, not reinvent

| Module | Types | Enum values |
|---|---|---|
| `activities` | `Task` | `TaskStatus`: TODO, IN_PROGRESS, DONE, BLOCKED · `TaskPriority`: LOW, MEDIUM, HIGH, CRITICAL · `TaskCategory`: RESTOCKING, PLANOGRAM, AUDIT, COMPLIANCE, GENERAL |
| `programmes` | `Project`, `ProjectMember` | `ProjectRole`: STORE_MANAGER, DEPARTMENT_LEAD, ASSOCIATE · `ProjectStatus`: PLANNING, ACTIVE, ON_HOLD, COMPLETED |
| `staff` | `User`, `UserProfile`, `AuthToken` | `StaffRole`: REGIONAL_MANAGER, STORE_MANAGER, DEPARTMENT_LEAD, ASSOCIATE |
| `alerts` | `Notification` | `AlertType`: INVENTORY, SLA_BREACH, SHIFT_HANDOVER, ESCALATION · `NotificationChannel`: IN_APP, EMAIL · `NotificationStatus`: PENDING, SENT, READ, FAILED |
| `reports` | `Report` | `ReportType`: STORE_SUMMARY, REGIONAL_ROLLUP, DEPARTMENT_PERFORMANCE · `ReportStatus`: PENDING, READY, FAILED |

Every enum has a `const` array and an `is*` type guard in the module's `types.ts`
(e.g. `TASK_STATUSES` + `isTaskStatus`). **Validation must use the existing guard.** A new
hand-rolled `if (status !== 'TODO' && ...)` chain is a review finding.

## 4. Base API surface

Nine base endpoints. All require `Authorization: Bearer <token>` except `POST /api/staff/login`
and `GET /health`.

| Method + Path | Module |
|---|---|
| GET `/api/activities` | activities (optional `programmeId`, `status` filters) |
| POST `/api/activities` | activities |
| GET `/api/activities/:id` | activities |
| PATCH `/api/activities/:id` | activities (status, priority, category, assignee) |
| DELETE `/api/activities/:id` | activities (owner or store manager only) |
| GET `/api/programmes` | programmes (authenticated store) |
| POST `/api/programmes` | programmes |
| POST `/api/programmes/:id/members` | programmes |
| GET `/api/alerts` | alerts (authenticated user) |

Additional endpoints present in the baseline beyond the nine: `POST /api/staff/login`,
`GET /api/staff/me`, `GET /api/programmes/:id`, `GET /api/programmes/:id/members`,
`POST /api/alerts/:id/read`, `GET /health`. Treat these as existing surface — extend the pattern,
do not duplicate it.

## 5. Auth model (stub — know its limits)

`staff/auth.middleware.ts` reads `Authorization: Bearer <token>`, looks the token up in an
in-memory map, and attaches `req.user = { id, storeId, role }`. There is no signature
verification and no refresh. Every file that touches it carries `// TODO: replace with real auth`.

Seeded tokens, for tests and manual verification:

| Token | User | Role |
|---|---|---|
| `token-regional` | usr_regional | REGIONAL_MANAGER |
| `token-manager` | usr_manager | STORE_MANAGER |
| `token-lead` | usr_lead | DEPARTMENT_LEAD |
| `token-associate` | usr_associate | ASSOCIATE |
| `token-expired` | usr_associate | expired — exercises the 401 expiry branch |
| `token-inactive` | usr_inactive | deactivated account |
| `token-orphaned` | usr_deleted | token whose user no longer exists |

The last three exist **so the auth failure branches are reachable from tests**. Do not delete them.

## 6. Seeded fixtures

Stores: `store_001` (4 active staff + 1 inactive, 2 programmes, 3 activities), `store_002`
(1 programme, 0 activities). Region: `region_north`.

- Activities: `act_restock_aisle4` (TODO/HIGH/RESTOCKING), `act_planogram_home`
  (IN_PROGRESS/MEDIUM/PLANOGRAM), `act_chiller_temp_check` (DONE/CRITICAL/COMPLIANCE)
- Programmes: `prg_spring_reset` (ACTIVE, 2 members), `prg_compliance_q1` (ACTIVE, 1 member),
  `prg_backroom_refit` (store_002, PLANNING)
- Alerts: one each for associate (INVENTORY), lead (SHIFT_HANDOVER), manager (SLA_BREACH)

Every repository exposes `reset()`, which re-seeds. Tests call it in `beforeEach`. **A new
repository must expose `reset()`** or route tests become order-dependent.

## 7. Commands

| Purpose | Command | Gate |
|---|---|---|
| Type check | `npx tsc --noEmit` | 0 errors |
| Lint | `npx eslint .` | 0 errors |
| Tests | `npx jest` | all pass |
| Coverage | `npx jest --coverage` | thresholds below |
| Build | `npm run build` (uses `tsconfig.build.json`) | 0 errors |
| Run | `npm start` (runs `prestart` → build) | listens on :3000 |

Coverage thresholds, enforced by `jest.config.ts` and non-negotiable:

| Scope | Minimum |
|---|---|
| `*/service.ts` | 80% |
| `*/routes.ts` | 70% |
| `shared/` | 60% |
| Overall | 70% |

Current baseline: 97.08% statements, 91.02% branches, 219 tests, ~21s.

## 8. Repository layout

```
src/<module>/{routes,service,repository,types}.ts   # reports has no routes.ts
src/shared/errors/    AppError + 5 subclasses + errorHandler + index
src/shared/events/    EventBus.ts, events.types.ts
src/shared/types/     common.ts, express.d.ts
src/app.ts            Express wiring + event subscriber registration
src/server.ts         Bootstrap on :3000
tests/<module>/*.test.ts                            # mirrors src/
tests/shared/architecture.test.ts                   # architecture invariants — do not delete
.harness/             agents/, skills/, output/ (gitignored), reviews/ (committed)
```

## 9. Baseline deviations an agent should know about

Recorded honestly so no agent "fixes" them by surprise:

- **Node v25.9.0 in this environment**, not the specified Node 20 LTS. All checks pass; 20 LTS is untested.
- The case study's §2.3 Step 4 table names `GET /api/tasks`; the real surface is
  `/api/activities` per §3.6. §3.6 is authoritative.
- Anonymous `GET /api/activities` returns **401**, not 200 — auth is enforced as specified in §3.3/§3.6.
- `.harness-notes/baseline-corrections.md` holds the 10 corrections made during generation. It is
  raw material for skill files, superseded by the skills themselves.
