# Deployment — StoreOps API

**Target:** container image on `node:20-alpine` (spec §2.3 Step 1: Node 20 LTS). The cloud path is
Google Cloud Run.
**Evidence (Docker-built):** CI run
[`36815992345`](https://github.com/c-soumen/storeops-harness/actions/runs/36815992345) passed.
Its `container` job builds the `node:20-alpine` image from this `Dockerfile`, runs the image, and
asserts that `PATCH /api/activities/bulk-status` returns `207 Multi-Status`.
**Evidence (local runtime stage):**
[`deploy/evidence/bulk-status-207.txt`](./deploy/evidence/bulk-status-207.txt), a full request and
response transcript captured 2026-10-01T04:00Z at commit `e1c052d`.

## What was and was not executed

| Step | Status | Notes |
|---|---|---|
| `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `deploy/cloudrun.sh` written | ✅ | This commit |
| Container **runtime stage** reproduced and verified on Node 20 | ✅ | See below. Same Node major, same `npm ci --omit=dev`, same `dist/`-only layout, same `NODE_ENV=production`, same `CMD` |
| `docker build` + `docker run` + 207 acceptance | ✅ **in CI** | [Run 36815992345](https://github.com/c-soumen/storeops-harness/actions/runs/36815992345): `gates` job 35s, `container` job 25s, 1m 9s total, both green |
| `docker build` / `docker compose up` locally | ❌ **not executed** | Docker is not installed on the capture host (a corporate-managed Windows laptop) |
| Cloud Run deploy | ❌ **not executed** | `gcloud` 586 is installed, but `gcloud auth list` reports *No credentialed accounts*. No live URL exists |

A real container ran and answered 207, but only in CI. Nothing in this document claims a public
URL. The local transcript comes from the runtime-equivalent process described next.

## How the evidence was produced

The runtime stage of the `Dockerfile`, reproduced by hand in a clean scratch directory:

```bash
npm run build                                   # = build stage
mkdir runtime && cp package.json package-lock.json runtime/ && cp -r dist runtime/
cd runtime && npm ci --omit=dev                 # = runtime stage, prod deps only (66 packages)
NODE_ENV=production PORT=3000 npx -p node@20 node dist/server.js   # Node v20.20.2
```

The transcript then records the following (headers trimmed):

| Request | Result |
|---|---|
| `GET /health` | `200` `{"status":"ok","service":"storeops"}`, the same probe as the `HEALTHCHECK` |
| `PATCH /bulk-status` `{"ids":["act_restock_aisle4","act_missing"],"status":"DONE"}` | **`207 Multi-Status`**: `updated` 1, plus `not_found` / `NOT_FOUND`. This is the contract's manual gate verbatim |
| `PATCH /bulk-status` with three ids, `BLOCKED` | `207`: 2 updated + 1 `not_found` |
| `PATCH /bulk-status`, no token | `401 UNAUTHORIZED` |
| `GET /api/alerts` as `token-lead` | Two new `SLA_BREACH` alerts with the activity id in `title`. The CRITICAL one was routed to `EMAIL` by the unmodified `alerts` subscriber (R2, end to end) |

## Run it with Docker

```bash
docker compose up --build            # or: docker build -t storeops-harness . && docker run -p 3000:3000 storeops-harness
curl -i -X PATCH http://localhost:3000/api/activities/bulk-status \
  -H "Authorization: Bearer token-manager" -H "Content-Type: application/json" \
  -d '{"ids":["act_restock_aisle4","act_missing"],"status":"DONE"}'
# expect: HTTP/1.1 207 Multi-Status
```

Image design:
- **Multi-stage.** `tsc` and the dev dependencies stay in the build stage. The runtime holds
  `dist/` plus `express` and its transitive dependencies.
- **`CMD ["node", "dist/server.js"]`, not `npm start`.** `package.json`'s `prestart` runs `tsc`,
  which the runtime image does not ship (`coding-conventions`: `prestart: npm run build`).
- **Non-root** (`USER node`) and a `HEALTHCHECK` on `/health` using alpine's built-in `wget`.
- **`PORT` env** is honoured by `src/server.ts`, which Cloud Run requires.
- The `.dockerignore` excludes `.harness/`, `tests/`, and docs. The harness governs generation and
  is not part of the runtime (`CLAUDE.md` §7).

## Deploy to Cloud Run

```bash
gcloud auth login
PROJECT_ID=<project> REGION=europe-west2 sh deploy/cloudrun.sh
```

`gcloud run deploy --source .` builds the `Dockerfile` in Cloud Build, so no local Docker is needed.
The script finishes by running the same 207 acceptance curl against the service URL.

**Security note.** The service is `--allow-unauthenticated` at the HTTP edge, but every `/api` route
still requires a bearer token. The seeded tokens (`token-manager` etc.) are **demo credentials** and
the repository is in-memory with seed data. Keep the service up only for a review window, then
`gcloud run services delete storeops-harness --region <region>`.

## Relationship to CI/CD

Deployment sits after the harness (`CLAUDE.md` §7). An image built from a commit the harness
passed has already cleared `tsc`, `eslint`, `jest --coverage`, and `architecture.test.ts`.
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) re-runs the same four gates after every
push. It then builds this `Dockerfile` and runs the 207 acceptance curl against the running
container, so a green `container` job is Docker-built evidence for this endpoint. Its first run,
[36815992345](https://github.com/c-soumen/storeops-harness/actions/runs/36815992345), passed both
jobs in 1m 9s. The deploy step is not automated, because it needs cloud credentials as repository
secrets. `deploy/cloudrun.sh` is its manual equivalent.

### Cloud deploy attempt — blocked by Cognizant IAM

- Authenticated as `soumen.choudhury@cognizant.com` via `gcloud auth login`.
- `gcloud projects list` shows two Cognizant-managed GCP projects:
  - `cb10784055a-gcpcowork-gc`, the coworking sandbox
  - `cb11250657a-gebronze-gc`, which is client-named and was not used
- Set the gcpcowork sandbox as the active project and opened the Cloud Run console.
- GCP returned: `Permission 'run.locations.list' denied on resource 'projects/cog01ky50amhdwvrhchqv7nj0e8d5'`.
- **Conclusion:** Cognizant GCP requires an explicit Cloud Run IAM grant from a project admin. That
  is out of scope for the capstone window.
- `deploy/cloudrun.sh` remains reviewable. The Docker-built container evidence is unchanged: GitHub
  Actions CI run [36815992345](https://github.com/c-soumen/storeops-harness/actions/runs/36815992345).

The alternative was a personal Google account and a personal credit card. That would have mixed
corporate capstone work with personal GCP billing, so stopping at the IAM boundary is the honest
trade-off.
