# cassini hackathon backend

Satellite-powered environmental risk intelligence backend for water ecosystems.

## purpose

This backend supports CASSINI MVP workflows that analyze water-body conditions, return nearby potential environmental pressure sources, and provide risk-correlation outputs for decision support.
It is built to assist investigations and prioritization, with field verification required for real-world conclusions.

## what it does

- serves REST APIs for health checks, environmental sources, and water-analysis workflows
- includes water-bodies APIs for list/create/get-by-id workflows
- supports environmental-sources filtering by source type, bbox, search text, and optional risk-level context
- runs water-analysis jobs that persist analysis records and return potential sources from Python JSON output
- generates deterministic risk reports from analysis context with long-term impact notes and recommendations
- includes shared AI narrative generation with `MOCK` provider and `OPENAI` placeholder support
- validates request payloads with Zod
- orchestrates Python processing for JSON-based analysis output
- stores and retrieves domain data with PostgreSQL + Prisma
- exposes contract-first endpoints documented in `docs/contracts/api/`

## tech stack

- node.js + express + typescript
- postgresql + prisma
- python integration (JSON-only processing output)
- zod validation
- vitest + supertest

## run backend locally

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL with Docker:

```bash
docker compose -f docker-compose.yaml up -d
```

3. Start the backend in dev mode (hot reload):

```bash
npm run dev
```

4. Optional checks:

```bash
npm run build
npm test
npm run prisma:generate
npm run prisma:migrate
```

Backend default URL: `http://localhost:3000`

## environment

- copy values from `.env.example` into `.env` if needed
- key variables include `PORT`, `DATABASE_URL`, and Python runner config
- AI variables: `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- default Python worker path is `python/water_sources_worker.py`
- worker stdout must output JSON only (debug logs go to stderr)

## status

This repository contains a backend skeleton with shared infrastructure, initial module scaffolds, and contract-first API documentation.
Business behavior is still incremental, but route/module foundations and Prisma schema are in place.

Shared foundation currently includes:

- centralized `AppError` and error middleware
- response helpers: `ok`, `created`, `noContent`
- `asyncRoute` and Zod-based request validation middleware
- Prisma singleton client and shared Python runner
- basic shared error-handler tests

## contracts

API contracts are the highest source of truth for endpoint behavior.

- `docs/contracts/api/water-bodies.md`
- `docs/contracts/api/environmental-sources.md`
- `docs/contracts/api/water-analysis.md`
- `docs/contracts/api/risk-reports.md`
