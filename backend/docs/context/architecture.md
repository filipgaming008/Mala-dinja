# architecture

## architecture style

The backend uses a modular monolith architecture on Node.js + Express + TypeScript.
All domain capabilities live in one deployable service, but each capability is isolated in its own module with strict file-level responsibilities.

Core principles:

- modular monolith, single runtime, clear module boundaries
- route/controller/service/repository layering
- Prisma for database access
- Zod for request validation
- shared middleware for validation, error handling, auth placeholder, and request logging
- Python integration as an external processing script for MVP
- future option to move Python into FastAPI microservice or worker-based processing

## source-of-truth rules

These rules are canonical for backend structure and responsibility boundaries.

1. Controllers do not contain business logic.
2. Services own business logic and orchestration.
3. Repositories are the only layer allowed to access Prisma directly.
4. Validators define Zod schemas for params/query/body and are reused by routes/middleware.
5. Helpers are pure utility functions scoped to a module unless truly cross-cutting.
6. Shared middleware handles cross-cutting HTTP concerns, not domain decisions.
7. Python integration returns JSON only; Node validates/parses/persists/serves.

If implementation conflicts with these rules, these rules win.

## request flow

Standard request path:

1. Express route receives request.
2. Validation middleware applies Zod schemas.
3. Controller reads validated request data and calls service.
4. Service executes domain logic and orchestration.
5. Service calls repository for database operations and shared python adapter for external processing when needed.
6. Controller sends structured API response.
7. Shared error middleware normalizes failures.

## layering and responsibilities

### controller

- read request data
- call service
- return API response
- no business logic

### service

- business logic
- orchestration across repositories/processors
- call repositories and external processors

### repository

- Prisma only
- prefer generated Prisma client queries over raw SQL for standard CRUD flows
- no HTTP logic
- no AI prompt logic

### validator

- Zod schemas for params/query/body

### helpers

- pure helper functions used by the module

## module structure standard

Each business module in `src/modules/<module-name>/` must include:

- `<module>.controller.ts`
- `<module>.routes.ts`
- `<module>.service.ts`
- `<module>.repository.ts`
- `<module>.validator.ts`
- `<module>.types.ts`
- `<module>.helpers.ts`

Example:

```text
src/modules/water-analysis/
  water-analysis.controller.ts
  water-analysis.routes.ts
  water-analysis.service.ts
  water-analysis.repository.ts
  water-analysis.validator.ts
  water-analysis.types.ts
  water-analysis.helpers.ts
```

## shared folders

Cross-module building blocks are organized in:

- `src/shared/http/`
- `src/shared/errors/`
- `src/shared/middleware/`
- `src/shared/prisma/`
- `src/shared/ai/`
- `src/shared/python/`
- `src/shared/queue/`

Guidance:

- `shared/http`: response wrappers, request/response typing utilities
- `shared/errors`: base error classes, error mapping, error codes
- `shared/middleware`: validation middleware, error middleware, auth placeholder, request logging
- `shared/prisma`: Prisma client singleton and DB utilities
- `shared/ai`: provider abstraction, prompt templates, and AI request/response logging
- `shared/python`: Python script execution adapter, IO contract parsing, timeout handling
- `shared/queue`: queue abstraction for later BullMQ + Redis adoption

## python integration architecture

MVP integration mode:

- Node service invokes Python as an external script process
- input contract passed from Node to Python
- Python outputs JSON only
- Node validates JSON with Zod before use

Future evolution path:

- move Python processing behind FastAPI endpoints, or
- run Python workloads via worker queues with BullMQ + Redis

Node remains the API orchestration layer in all phases.

## persistence architecture

Prisma schema source of truth is `prisma/schema.prisma`.

Initial core models:

- `WaterBody`
- `EnvironmentalSource`
- `WaterAnalysis`
- `WaterAnalysisSource`
- `RiskReport`
- `AiAnalysisLog`

Initial enums:

- `WaterBodyType`: `RIVER`, `LAKE`, `RESERVOIR`, `COASTAL`, `UNKNOWN`
- `EnvironmentalSourceType`: `FACTORY`, `FARM`, `CONSTRUCTION`, `WASTEWATER`, `INDUSTRIAL_BUILDING`, `UNKNOWN`
- `AnalysisStatus`: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
- `RiskLevel`: `LOW`, `MEDIUM`, `HIGH`, `VERY_HIGH`
- `AiProvider`: `OPENAI`, `MOCK`

Primary relationships:

- `WaterBody` has many `WaterAnalysis`
- `WaterAnalysis` belongs to `WaterBody`
- `WaterAnalysis` has many `WaterAnalysisSource`
- `EnvironmentalSource` has many `WaterAnalysisSource`
- `WaterAnalysis` has many `RiskReport`
- `WaterAnalysis` has many `AiAnalysisLog`

All primary keys use `cuid()`.
JSON fields are used for flexible external/raw payloads and intermediate analysis data.
Indexes are defined for `waterBodyId`, `sourceId`, `analysisId`, and `osmId` to support MVP query patterns.

## initial modules

Prepare the following modules first:

- `water-bodies`
- `environmental-sources`
- `water-analysis`
- `risk-analysis`
- `reports`

Each must follow the exact module file pattern in this document.

## adding a new module

When adding `src/modules/<new-module>/`, follow this process:

1. create folder using lowercase kebab-case module name
2. create all required module files (`controller/routes/service/repository/validator/types/helpers`)
3. define Zod request schemas in `<module>.validator.ts`
4. implement controller as transport-only layer
5. implement service as orchestration/business layer
6. keep repository Prisma-only and persistence-focused
7. register module routes in the central route index
8. add tests under `tests/` for validator/service/controller behavior
9. update `docs/context/implementation-status.md` and relevant contracts docs

No module may skip required files even if some start as placeholders.
