# Valeria / Mala-dinja

Satellite-assisted environmental risk intelligence MVP for water ecosystems.

This project combines:
- a Node/TypeScript backend API
- a React + Leaflet frontend dashboard
- a Python water-source worker
- AI-generated narrative risk reports (MOCK or OpenAI)

The platform is decision-support oriented: it highlights risk correlation and requires field verification.

## What the MVP does

1. Accepts a water-body request (name/type/country/bbox/radius).
2. Runs Python worker to discover nearby potential environmental pressure sources.
3. Stores analysis and sources in Postgres.
4. Computes deterministic risk score + factors.
5. Generates AI report from deterministic backend context.
6. Visualizes all of it on a map with layers (sources, static industrial dataset, pollution raster overlay).

## Tech stack

Backend:
- Node.js, Express, TypeScript, Zod
- Prisma ORM + PostgreSQL
- Python worker orchestration via child process
- OpenAI SDK (Responses API parse + Zod schema) and MOCK provider
- Vitest + Supertest

Frontend:
- React + Vite
- Material UI
- Leaflet + React Leaflet
- Recharts
- Framer Motion

Data/experiments:
- `api_testing/` JSONs, HTML map prototype, and Python exploration scripts
- `models/main.ipynb` notebook experimentation

## Repository structure

- `backend/` - API, DB models/migrations, Python worker integration, AI integration
- `frontend/` - dashboard, map layers, pipeline controls, analysis/report pages
- `api_testing/` - static datasets and prototype map/testing scripts
- `models/` - notebook experiments

## End-to-end flow (backend)

Main production-style flow:

1. `POST /api/v1/water-analysis/run`
   - validates request with Zod
   - creates/reuses `WaterBody`
   - creates `WaterAnalysis` (RUNNING)
   - runs Python worker (`PYTHON_WATER_ANALYSIS_SCRIPT`)
   - parses JSON-only stdout
   - upserts `EnvironmentalSource` + creates `WaterAnalysisSource`
   - computes deterministic risk score
   - stores result and marks analysis COMPLETED (or FAILED on error)

2. `POST /api/v1/risk-reports/generate`
   - loads analysis context
   - uses deterministic score context
   - generates AI full report via `MOCK` or `OPENAI`
   - stores `RiskReport`
   - stores `AiAnalysisLog` (input/output/status)

3. `GET /api/v1/risk-reports/:reportId`
   - returns frontend-ready report JSON

## AI integration (what is real vs mock)

- `AI_PROVIDER=MOCK`: no key needed, deterministic mock report generation.
- `AI_PROVIDER=OPENAI`: uses OpenAI Responses API parse with Zod schema validation.

Important:
- AI report text is generated from the provider response (not a hardcoded paragraph in OPENAI mode).
- Deterministic backend scoring remains authoritative for risk computation.
- Language must remain non-accusatory and include field verification/disclaimer framing.

## Database models (high level)

Core tables:
- `WaterBody`
- `WaterAnalysis`
- `EnvironmentalSource`
- `WaterAnalysisSource` (join)
- `RiskReport`
- `AiAnalysisLog`

`AiAnalysisLog` persists:
- provider/model/promptVersion
- inputJson/outputJson
- status (`COMPLETED`/`FAILED`)
- errorMessage (if failed)

## api_testing: what each file is used for

- `api_testing/water_analysis_run_request.json`
  - request payload template used by frontend for `POST /water-analysis/run`.

- `api_testing/river_industrial_data.json`
  - static industrial/factory risk dataset shown as a map overlay layer.

- `api_testing/output_data.json`
  - large GeoJSON raster-like polygon/pixel dataset (Sentinel-derived) used as pollution overlay.
  - frontend loads this as a separate map layer for pollution intensity visualization.

- `api_testing/index.html`
  - standalone prototype Leaflet visualization (legacy/prototype reference).

- `api_testing/run_full_e2e_curl.md`
  - curl helper sequence for local flow testing.

## Local setup

Prerequisites:
- Node 18+
- Docker Desktop
- Python 3.x available as `python` or `py`

### 1) Backend setup

```bash
cd backend
npm install
docker compose up -d
npx prisma migrate dev
npm run dev
```

Backend default URL: `http://localhost:3000`

### 2) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Environment variables (backend)

From `backend/.env.example`:

```env
AI_PROVIDER=MOCK
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

For real OpenAI mode:

```env
AI_PROVIDER=OPENAI
OPENAI_API_KEY=<your-local-secret>
OPENAI_MODEL=gpt-4.1-mini
```

Validation rules:
- `AI_PROVIDER` must be `MOCK` or `OPENAI`.
- `OPENAI_API_KEY` required only when `AI_PROVIDER=OPENAI`.

## Development endpoints

Enabled only when `NODE_ENV != production`:

- `GET /api/v1/dev/ai-health`
  - checks AI provider/model/key config
  - runs transient sample AI report
  - validates schema
  - does not persist DB records

- `POST /api/v1/dev/full-workflow-test`
  - runs full demo workflow with persisted records
  - returns created IDs and full output snapshot

## Quick test sequence (curl)

```bash
curl -s -X POST "http://localhost:3000/api/v1/water-analysis/run" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary "@api_testing/water_analysis_run_request.json"
```

Take `analysisId`, then:

```bash
curl -s -X POST "http://localhost:3000/api/v1/risk-reports/generate" \
  -H "Content-Type: application/json" \
  -d '{"analysisId":"<analysisId>"}'
```

Then fetch report by returned `id`:

```bash
curl -s "http://localhost:3000/api/v1/risk-reports/<reportId>"
```

## Safety expectations

Outputs should:
- include disclaimer text
- avoid blame/accusation language
- avoid statements like "confirmed polluter"
- require field verification before conclusions

## Notes for showcase

- Use frontend Dashboard actions in order:
  1. Run Real Analysis
  2. Generate Report
  3. Inspect map layers + report page
- Pollution overlay (`output_data.json`) is heavy; frontend loads it from `frontend/public/output_data.json`.
- "Focus analysis" / "Focus pollution" controls help jump map viewport to the relevant area.
