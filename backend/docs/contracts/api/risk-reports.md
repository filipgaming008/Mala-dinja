# risk reports api contract

## endpoint: generate risk report

### purpose

Generate a structured risk report from an existing water analysis.

### method/path

- method: `POST`
- path: `/api/v1/risk-reports/generate`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params: none
- query: none
- body:
  - `analysisId` required string

### response shape

```json
{
  "success": true,
  "data": {
    "reportId": "string",
    "analysisId": "string",
    "riskLevel": "MEDIUM",
    "summary": "string",
    "riskExplanation": "string",
    "longTermImpact": {
      "year1": "string",
      "year5": "string",
      "year10": "string",
      "year50": "string"
    },
    "recommendations": [],
    "verificationSteps": [],
    "mitigationIdeas": [],
    "confidenceScore": 0.72,
    "confidenceExplanation": "string",
    "disclaimer": "field verification required",
    "potentialSources": [],
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### error cases

- `400` invalid request body
- `404` analysis record not found
- `500` provider or processing failure

### notes

- report conclusions must remain decision-support focused
- reports may describe risk correlation only
- reports must not claim proof of pollution responsibility

## endpoint: get risk report by id

### purpose

Return a generated risk report by identifier.

### method/path

- method: `GET`
- path: `/api/v1/risk-reports/:reportId`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params:
  - `reportId` required string
- query: none
- body: none

### response shape

```json
{
  "success": true,
  "data": {
    "reportId": "string",
    "analysisId": "string",
    "riskLevel": "HIGH",
    "summary": "string",
    "riskExplanation": "string",
    "longTermImpact": {
      "year1": "string",
      "year5": "string",
      "year10": "string",
      "year50": "string"
    },
    "confidenceScore": 0.79,
    "confidenceExplanation": "string",
    "disclaimer": "field verification required",
    "potentialSources": [],
    "recommendations": [],
    "verificationSteps": [],
    "mitigationIdeas": [],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### error cases

- `400` invalid path param
- `404` risk report not found
- `500` internal server error

### notes

- report output is intended for prioritization and investigation support
- field verification required before definitive operational decisions
- endpoint never proves source guilt or legal responsibility
