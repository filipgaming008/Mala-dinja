# Run Full E2E Curl (UTF-8 Safe)

Use payload files instead of inline JSON to avoid Cyrillic encoding issues in some terminals.

## 1) Run water analysis

```bash
curl -s -X POST "http://localhost:3000/api/v1/water-analysis/run" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary "@api_testing/water_analysis_run_request.json"
```

Copy `data.analysisId` from the response.

## 2) Generate risk report

```bash
curl -s -X POST "http://localhost:3000/api/v1/risk-reports/generate" \
  -H "Content-Type: application/json" \
  -d '{"analysisId":"<analysisId>"}'
```

## 3) Fetch risk report

```bash
curl -s "http://localhost:3000/api/v1/risk-reports/<riskReportId>"
```
