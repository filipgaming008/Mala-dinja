# implementation status

Tracks what has been scaffolded, implemented, validated, and deferred.

## scaffolded

- backend folder structure and base docs/rules
- express app skeleton with centralized error handling and shared middleware
- shared python runner for JSON-only script execution
- modules scaffolded: `environmental-sources`, `water-analysis`

## implemented

- initial Prisma schema in `prisma/schema.prisma`
- enums added: `WaterBodyType`, `EnvironmentalSourceType`, `AnalysisStatus`, `RiskLevel`, `AiProvider`
- models added: `WaterBody`, `EnvironmentalSource`, `WaterAnalysis`, `WaterAnalysisSource`, `RiskReport`, `AiAnalysisLog`
- required relationships and indexes added (`waterBodyId`, `sourceId`, `analysisId`, `osmId`)
- API contracts added for `water-bodies`, `environmental-sources`, `water-analysis`, and `risk-reports`
- shared backend foundation finalized: `AppError`, centralized `errorHandler`, `validate` middleware, `asyncRoute`, API response helpers (`ok`, `created`, `noContent`), Prisma singleton
- basic shared error-handling tests added in `tests/shared/error-handler.test.ts`
- `environmental-sources` repository now uses generated Prisma client queries (`findMany`, `findUnique`, `count`) instead of raw SQL
- added `distanceMeters` to `EnvironmentalSource` schema and wired it through repository and API mapping
- implemented `water-bodies` module endpoints: list, create, and get-by-id
- added module tests in `tests/modules/water-bodies.test.ts` for create/list/get and invalid-id validation
- upgraded `environmental-sources` filters: `sourceType`, `riskLevel`, bbox (`south/west/north/east`), and search
- renamed source metadata response field to `osmTags` and kept decision-support wording as potential environmental pressure source
- added module tests in `tests/modules/environmental-sources.test.ts` for list/get/filter behavior
- added unit tests for `runPythonJson` in `tests/shared/python-runner.test.ts` (valid JSON, invalid JSON, timeout, non-zero exit)
- implemented `water-analysis` run/get flow with persistence, including WaterBody reuse/create, RUNNING -> COMPLETED/FAILED transitions, and safe failure response
- `water-analysis` now stores potential source joins via `WaterAnalysisSource` and returns `potentialSources` wording
- added module tests in `tests/modules/water-analysis.test.ts` for run/get and safe failure handling
- added Python worker at `python/water_sources_worker.py` with CLI args and JSON-only stdout contract
- updated water-analysis Python invocation to use CLI flags (`--water-body-name`, `--radius-km`, optional `--country-code`, optional `--bbox`)
- implemented `risk-reports` module endpoints (`POST /risk-reports/generate`, `GET /risk-reports/:reportId`) with deterministic template logic
- risk reports now include summary, long-term impact notes (1/5/10/50 years), recommendations, confidence score, and disclaimer (field verification required)
- added module tests in `tests/modules/risk-reports.test.ts` for generate/get/not-found behavior
- added shared AI layer: `src/shared/ai/aiClient.ts` and `src/shared/ai/aiPrompts.ts` with `MOCK` and `OPENAI` provider support
- risk narrative generation now logs every AI request/response to `AiAnalysisLog`
- refined AI prompt template in `src/shared/ai/aiPrompts.ts` with strict legal-safety wording and strict JSON output schema
- added MVP integration tests in `tests/integration/mvp-backend-flow.test.ts` covering create/run/get/report/validation/failure flow with mocked external processing
- added deterministic risk scoring engine in `src/modules/risk-analysis/` with explainable factor output and deterministic level mapping
- added unit tests in `tests/modules/risk-scoring.test.ts` for low/high/multi-source/missing-data confidence scenarios
- AI integration now receives deterministic risk-scoring output and explains only provided score/factors (no hidden AI scoring)
- AI output schema expanded with `riskExplanation`, `recommendedActions`, `verificationSteps`, `mitigationIdeas`, and `confidenceExplanation`
- added canonical reusable AI template prompt for deterministic risk explanation in `src/shared/ai/aiPrompts.ts`
- refactored AI integration into provider-agnostic structure (`aiClient`, `aiPrompts`, `aiSchemas`, `ai.types`, `providers/openai.provider`, `providers/mock.provider`)
- added AI architecture context doc in `docs/context/ai-risk-analysis.md`
- upgraded AI prompt file with versioned prompts: `RISK_ANALYSIS_PROMPT_V1`, `SOURCE_MITIGATION_PROMPT_V1`, `FULL_REPORT_PROMPT_V1`
- upgraded AI schema contracts with `AiRiskAnalysisSchema`, `AiSourceMitigationSchema`, and `AiFullReportSchema`
- added `AiPromptVersion` helper type and structured input types in `src/shared/ai/ai.types.ts`

## validated

- TypeScript build passes with current backend skeleton and module wiring
- Prisma migration applied: `20260426072626_add_environmental_source_distance_meters`
- Prisma client regenerated after migration
- Vitest + Supertest module tests pass for `water-bodies`
- Vitest + Supertest module tests pass for `environmental-sources`
- Vitest + Supertest module tests pass for `water-analysis`
- Vitest + Supertest module tests pass for `risk-reports`

## deferred

- prisma migrations and seed data
- persistence implementation for water-analysis summary writes
- overpass/osm fetching logic in environmental-sources module
- risk-analysis and reports module implementation
