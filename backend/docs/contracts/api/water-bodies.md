# water bodies api contract

## endpoint: list water bodies

### purpose

Return stored water bodies that can be selected for analysis workflows.

### method/path

- method: `GET`
- path: `/api/v1/water-bodies`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params: none
- query:
  - `limit` optional number, default `20`, min `1`, max `100`
  - `offset` optional number, default `0`, min `0`
  - `type` optional enum: `RIVER | LAKE | RESERVOIR | COASTAL | UNKNOWN`
  - `countryCode` optional ISO-2 uppercase string
- body: none

### response shape

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "waterBodyId": "string",
        "name": "string",
        "type": "RIVER",
        "countryCode": "string|null",
        "bbox": { "south": 0, "west": 0, "north": 0, "east": 0 }
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

- water bodies support downstream analysis and risk-correlation workflows
- responses are decision-support data only; field verification required

## endpoint: create water body

### purpose

Create a water-body record used as an analysis target.

### method/path

- method: `POST`
- path: `/api/v1/water-bodies`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params: none
- query: none
- body:
  - `name` required string
  - `type` optional enum: `RIVER | LAKE | RESERVOIR | COASTAL | UNKNOWN`
  - `countryCode` optional ISO-2 uppercase string
  - `osmId` optional string
  - `bbox` optional object `{ south, west, north, east }`
  - `metadata` optional object

### response shape

```json
{
  "success": true,
  "data": {
    "waterBodyId": "string",
    "name": "string",
    "type": "RIVER",
    "countryCode": "string|null",
    "osmId": "string|null",
    "bbox": {},
    "metadata": {},
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### error cases

- `400` invalid body payload
- `409` duplicate water-body conflict (if uniqueness rule is applied later)
- `500` internal server error

### notes

- this endpoint stores analysis targets only
- endpoint does not infer causation or source responsibility

## endpoint: get water body by id

### purpose

Return one stored water body by identifier.

### method/path

- method: `GET`
- path: `/api/v1/water-bodies/:waterBodyId`

### auth requirement

- MVP placeholder: no auth enforced yet

### request params/query/body

- params:
  - `waterBodyId` required cuid string
- query: none
- body: none

### response shape

```json
{
  "success": true,
  "data": {
    "waterBodyId": "string",
    "name": "string",
    "type": "RIVER",
    "countryCode": "string|null",
    "osmId": "string|null",
    "bbox": {},
    "metadata": {},
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### error cases

- `400` invalid path param
- `404` water body not found
- `500` internal server error

### notes

- returned water-body data can be used to run analysis and risk-correlation flows
- any resulting anomaly interpretation remains decision support; field verification required
