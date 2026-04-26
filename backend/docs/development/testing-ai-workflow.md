# testing ai workflow

This guide explains how to validate the AI + DB + Python workflow locally.

## 1) required env variables

For mock AI mode:

```env
AI_PROVIDER=MOCK
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

For real OpenAI mode:

```env
AI_PROVIDER=OPENAI
OPENAI_API_KEY=<local secret>
OPENAI_MODEL=gpt-4.1-mini
```

## 2) startup commands

Run from `backend/`:

```bash
npm install
docker compose up -d
npx prisma migrate dev
npm run dev
```

## 3) test mock ai integration health

Request:

- `GET /api/v1/dev/ai-health`

Expected:

- `ok: true`
- provider/model returned
- schema validation passes
- sample report payload is returned

## 4) test full mock db workflow

Request:

- `POST /api/v1/dev/full-workflow-test`

Expected:

- creates/reuses demo water body
- creates water analysis
- upserts environmental sources
- creates source joins
- computes deterministic risk score
- generates AI full report
- stores risk report + AI analysis log
- returns `dbRecords` ids

## 5) test real python flow

Request:

- `POST /api/v1/water-analysis/run`

Example body:

```json
{
  "waterBodyName": "Брегалница",
  "waterBodyType": "RIVER",
  "countryCode": "MK",
  "radiusKm": 5,
  "bbox": {
    "south": 40.852478,
    "west": 20.4529023,
    "north": 42.3739044,
    "east": 23.034051
  }
}
```

Expected:

- analysis moves RUNNING -> COMPLETED (or FAILED with safe error)
- potential sources stored
- deterministic risk score included in response/result payload

## 6) generate ai report

Request:

- `POST /api/v1/risk-reports/generate`

Body:

```json
{
  "analysisId": "<analysis id from previous response>"
}
```

Expected:

- frontend-ready report payload returned
- `AiAnalysisLog` record stored

## 7) verify database records

After running the flow, verify these tables contain related rows:

- `WaterBody` exists
- `WaterAnalysis` exists
- `EnvironmentalSource` exists
- `WaterAnalysisSource` exists
- `RiskReport` exists
- `AiAnalysisLog` exists

## 8) safety expectations

Output must:

- include a disclaimer
- not include blame language
- not say `confirmed polluter`
- state that field verification is required
