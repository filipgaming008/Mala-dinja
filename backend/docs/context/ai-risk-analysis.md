# ai risk analysis

## ai role

AI provides narrative interpretation for environmental water-risk intelligence.
It explains deterministic backend outputs and converts them into decision-support language.

## what ai can do

- explain risk correlation from structured indicators and source context
- produce readable summaries for agencies, NGOs, agriculture firms, and operators
- suggest verification steps and mitigation ideas
- tailor mitigation recommendations by source type

## what ai must not do

- must not assign legal blame or responsibility
- must not claim a specific facility caused contamination
- must not invent laboratory measurements or concentrations
- must not override backend deterministic score/level/confidence
- must not output unstructured/freeform text when strict JSON is required

## prompt versions

- `risk-analysis-v1` → `RISK_ANALYSIS_PROMPT_V1`
- `source-mitigation-v1` → `SOURCE_MITIGATION_PROMPT_V1`
- `full-report-v1` → `FULL_REPORT_PROMPT_V1`

All prompts are versioned constants in `src/shared/ai/aiPrompts.ts`.

## json schema contract

Schemas are enforced in `src/shared/ai/aiSchemas.ts`:

- `AiRiskAnalysisSchema`
- `AiSourceMitigationSchema`
- `AiFullReportSchema`

Validation highlights:

- `riskLevel` must be `LOW | MEDIUM | HIGH | VERY_HIGH`
- `score` must be between `0` and `100`
- `confidenceScore` must be between `0` and `1`
- arrays are arrays of strings
- `disclaimer` must always be present

## safe wording examples

- "may indicate elevated environmental pressure"
- "potential environmental pressure source"
- "risk correlation observed in available indicators"
- "field verification required before operational conclusions"

## forbidden wording examples

- "this factory caused the pollution"
- "confirmed contamination source"
- "legally responsible facility"
- "measured concentration is X mg/L" (unless provided as measured lab data)

## provider architecture

- provider-agnostic orchestration: `src/shared/ai/aiClient.ts`
- OpenAI isolated: `src/shared/ai/providers/openai.provider.ts`
- mock provider for tests/local demo: `src/shared/ai/providers/mock.provider.ts`
- API keys are never hardcoded; `OPENAI_API_KEY` is read from environment

## environment setup

Use these variables in `.env` (also documented in `.env.example`):

- `AI_PROVIDER=MOCK` or `AI_PROVIDER=OPENAI`
- `OPENAI_API_KEY` optional for `MOCK`, required for `OPENAI`
- `OPENAI_MODEL=gpt-4.1-mini` (safe default)

Behavior:

- If `AI_PROVIDER=MOCK`, the system runs without any OpenAI key.
- If `AI_PROVIDER=OPENAI`, startup validation requires `OPENAI_API_KEY`.
- `OPENAI_MODEL` defaults to `gpt-4.1-mini` when not explicitly set.
