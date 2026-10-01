# Deployment — StoreOps API

**Target:** container image on `node:20-alpine` (spec §2.3 Step 1: Node 20 LTS). The cloud path is
Google Cloud Run.
**Evidence:** [`deploy/evidence/bulk-status-207.txt`](./deploy/evidence/bulk-status-207.txt).
It shows `PATCH /api/activities/bulk-status` returning `207 Multi-Status`, captured
2026-10-01T04:00Z at commit `e1c052d`.

## What was and was not executed

| Step | Status | Notes |
|---|---|---|
| `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `deploy/cloudrun.sh` written | ✅ | This commit |
| Container **runtime stage** reproduced and verified on Node 20 | ✅ | See below. Same Node major, same `npm ci --omit=dev`, same `dist/`-only layout, same `NODE_ENV=production`, same `CMD` |
| `docker build` / `docker compose up` | ❌ **not executed** | Docker is not installed on the capture host (corporate-managed Windows laptop) |
| Cloud Run deploy | ❌ **not executed** | `gcloud` 586 is installed, but `gcloud auth list` reports *No credentialed accounts*. No live URL exists |

Nothing in this document claims a running container or a public URL. The transcript comes from
the runtime-equivalent process described next.

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
`CLAUDE.md` §7 describes a `.github/` pipeline that would re-run those gates and then build and
deploy this image. That pipeline is not in this repository: `deploy/cloudrun.sh` is the manual
equivalent of its deploy step.
