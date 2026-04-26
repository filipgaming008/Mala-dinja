# water analysis api contract

## endpoint: run water analysis

### purpose

Run a water analysis job for a selected water body and return structured results with potential environmental pressure sources and risk correlation context.

### method/path

- method: `POST`
- path: `/api/v1/water-analysis/run`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params: none
- query: none
- body:
  - `waterBodyName` required string
  - `waterBodyType` required enum: `RIVER | LAKE | RESERVOIR | COASTAL | UNKNOWN`
  - `countryCode` optional ISO-2 uppercase string
  - `radiusKm` required number, min `0.5`, max `5`
  - `bbox` optional object `{ south, west, north, east }`

### response shape

```json
{
  "success": true,
  "data": {
    "analysisId": "string",
    "status": "COMPLETED",
    "waterBody": {
      "name": "string",
      "countryCode": "string|null"
    },
    "analysisSummary": {
      "anomalyDetected": true,
      "riskCorrelation": "MEDIUM",
      "fieldVerificationRequired": true
    },
    "potentialSources": [
      {
        "sourceId": "string",
        "osmId": "string|null",
        "osmType": "string|null",
        "name": "string|null",
        "sourceType": "FACTORY",
        "distanceMeters": 0
      }
    ],
    "raw": {}
  }
}
```

### error cases

- `400` invalid request body
- `500` python process failure
- `500` invalid python JSON output (`PYTHON_INVALID_JSON`)
- `504` python process timeout

### notes

- python processing must output structured JSON only
- node parses and validates python JSON before responding
- endpoint output is decision support and does not prove source responsibility
- sources are returned as potential environmental pressure sources only
- default worker script: `python/water_sources_worker.py`
- worker CLI contract: `--water-body-name`, `--radius-km`, optional `--country-code`, optional `--bbox` (JSON string)
- worker debug output must go to stderr, while stdout must remain JSON-only

## endpoint: get water analysis by id

### purpose

Return one water-analysis record by identifier for retrieval, audit, or follow-up reporting.

### method/path

- method: `GET`
- path: `/api/v1/water-analysis/:analysisId`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params:
  - `analysisId` required string
- query: none
- body: none

### response shape

```json
{
  "success": true,
  "data": {
    "analysisId": "string",
    "status": "COMPLETED",
    "waterBodyId": "string",
    "radiusKm": 1.5,
    "analysisSummary": {
      "anomalyDetected": true,
      "riskCorrelation": "MEDIUM",
      "fieldVerificationRequired": true
    },
    "potentialSources": [],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### error cases

- `400` invalid path param
- `404` analysis record not found
- `500` internal server error

### notes

- stored results support risk correlation and investigation prioritization
- field verification required before regulatory or legal action
- endpoint does not claim pollution causation by any source
- response avoids terms like polluter, guilty, or confirmed contamination source
