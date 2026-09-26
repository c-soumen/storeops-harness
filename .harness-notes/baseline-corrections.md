# StoreOps Baseline — Corrections During Generation

These are the corrections Claude Code made while generating the StoreOps scaffold from the bootstrap prompt. They are the primary raw material for the Evaluator's hard gates (Day 7–9) and the Evaluator/Generator skill files.

**Rule of thumb:** every correction below is a failure mode the Evaluator must catch OR a fact the Generator's skill files must state up front to prevent recurrence.

## Corrections

1. **EventBus typing under strict generics** — `{[K in Name]?: Set<EventHandler<K>>}` fails (TS2322, `Set` invariance). Replaced with `Map<DomainEventName, Set<AnyHandler>>` narrowed at the public generic boundary.
   - **Skill file impact:** `coding-conventions/SKILL.md` — note the pattern for typed event registries in strict mode.

2. **`StaffService.updateProfile` had an unused caller param** (TS6133 under `noUnusedParameters`). Turned it into a real authorization check — self or manager — plus a `ForbiddenError` test.
   - **Skill file impact:** `coding-conventions/SKILL.md` — no vestigial parameters; every param is either used or removed.
   - **Evaluator gate:** `tsc --noEmit` must be a hard gate (catches TS6133 automatically).

3. **PATCH `/api/activities/:id` rejected `"assigneeId": null`** — validator treated null as a type error, so assignee could never be cleared. Added `nullableString` helper used by both POST and PATCH.
   - **Skill file impact:** `api-integration/SKILL.md` — nullable-vs-optional field convention; explicit null must be a valid "clear" signal on PATCH.

4. **Test bug — threw `Number.NaN` to exercise the non-Error path in `errorHandler`**; Express treats a falsy `next(err)` as "no error". Changed to a truthy non-Error throwable.
   - **Skill file impact:** `how-to-test/SKILL.md` — Express error-middleware testing gotcha: `next()` argument must be truthy to route to the error handler.

5. **Build pointed at `tsconfig.json`** which includes `tests/` — would have emitted tests into `dist/`. Split out `tsconfig.build.json`.
   - **Skill file impact:** `coding-conventions/SKILL.md` — separate `tsconfig.build.json` (excludes `tests/`) from `tsconfig.json` (used by editor + jest).
   - **Evaluator gate:** verify `dist/` contains no test files after build.

6. **`jest.config.ts` wasn't in `tsconfig.json` `include`** — breaks type-aware ESLint on a root .ts file. Added it (build config still restricts emit to `src/`).
   - **Skill file impact:** `coding-conventions/SKILL.md` — root .ts config files must be in `tsconfig.json` include for ESLint, but excluded from build.

7. **Jest ran for 79 minutes** with 12 ts-jest workers each type-checking on OneDrive-backed disk. Moved type checking out of the transform (`isolatedModules: true` in tsconfig, `diagnostics: false` in ts-jest) and set `maxWorkers: '50%'` → 21s. Type errors are still gated by `npm run typecheck`.
   - **Skill file impact:** `how-to-test/SKILL.md` — jest performance rule: type-check separately via `tsc --noEmit`; keep ts-jest transform lean.
   - **Note on environment:** OneDrive-backed disks amplify small-file I/O — this is a machine reality, not a code smell.

8. **ts-jest deprecation warning for transform-level `isolatedModules`** → moved the flag to `tsconfig.json`.
   - Minor tooling-currency note.

9. **Added `prestart: npm run build`** so `npm start` works from a clean checkout.
   - **Skill file impact:** `coding-conventions/SKILL.md` — package.json scripts must be self-sufficient (no assumed prior build).

10. **Extended staff seeds with deliberately expired / deactivated / orphaned tokens** so every auth failure branch is covered by a test rather than unreachable.
    - **Skill file impact:** `how-to-test/SKILL.md` — coverage rule: every error branch must have at least one hitting test; seed data must exercise auth failure paths.

## Additional facts captured from this run

- **Seeded bearer tokens:** `token-regional`, `token-manager`, `token-lead`, `token-associate`
- **Acceptance curl (post-auth):** `curl -H "Authorization: Bearer token-manager" http://localhost:3000/api/activities`
- **Extra endpoints beyond the 9 base:** `POST /api/staff/login`, `GET /api/staff/me`, `GET /api/programmes/:id`, `GET /api/programmes/:id/members`, `POST /api/alerts/:id/read`, `GET /health` — all kept intentionally.
- **`tests/shared/architecture.test.ts` exists** and scans `src/` for: cross-module `repository/` imports, `shared/` importing a domain module, raw `throw new Error` in service/route, `reports` mutating calls or a `routes.ts` file. This is the seed of the Evaluator's "Module boundary" and "Error contract" hard gates — do NOT delete when refactoring.

## Bootstrap-prompt improvements for future harness runs

- State up front that jest should use `isolatedModules: true` + `diagnostics: false` + `maxWorkers: '50%'` to avoid the 79-minute cold run.
- State up front that the build must use a separate `tsconfig.build.json` that excludes `tests/`.
- State up front that PATCH validators must accept explicit `null` to clear nullable fields.
- State up front that `prestart` should chain to `build`.
