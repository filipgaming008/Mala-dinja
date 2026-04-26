# environmental sources api contract

## endpoint: list environmental sources

### purpose

Return nearby potential environmental pressure sources from stored records.

### method/path

- method: `GET`
- path: `/api/v1/environmental-sources`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params: none
- query:
  - `limit` optional number, default `20`, min `1`, max `100`
  - `offset` optional number, default `0`, min `0`
  - `sourceType` optional enum: `FACTORY | FARM | CONSTRUCTION | WASTEWATER | INDUSTRIAL_BUILDING | UNKNOWN`
  - `riskLevel` optional enum filter through joined analysis data: `LOW | MEDIUM | HIGH | VERY_HIGH`
  - `search` optional string filter against source name and osm id
  - `south`, `west`, `north`, `east` optional bbox filter values (all 4 required together)
- body: none

### response shape

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "sourceId": "string",
        "name": "string|null",
        "sourceType": "FACTORY",
        "latitude": 0,
        "longitude": 0,
        "distanceMeters": 0,
        "osmTags": {},
        "descriptor": "potential environmental pressure source"
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 0
    }
  }
}
```

### error cases

- `400` invalid query values
- `500` internal server error

### notes

- response objects represent potential environmental pressure sources only
- endpoint output supports risk correlation, not causation claims
- field verification required for real-world enforcement actions

## endpoint: get environmental source by id

### purpose

Return one potential environmental pressure source by identifier.

### method/path

- method: `GET`
- path: `/api/v1/environmental-sources/:sourceId`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params:
  - `sourceId` required cuid string
- query: none
- body: none

### response shape

```json
{
  "success": true,
  "data": {
    "sourceId": "string",
    "name": "string|null",
    "sourceType": "FACTORY",
    "latitude": 0,
    "longitude": 0,
    "distanceMeters": 0,
    "osmTags": {},
    "descriptor": "potential environmental pressure source",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### error cases

- `400` invalid path param
- `404` environmental source not found
- `500` internal server error

### notes

- this endpoint does not prove that a source polluted a water body
- use output as risk-correlation context with field verification required
- sources are returned as potential environmental pressure sources only
