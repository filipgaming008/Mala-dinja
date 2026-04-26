# api contracts

This directory stores endpoint contract documents and is the highest source of truth for API behavior.

## rules

- every endpoint must have a matching contract file in this directory
- contract updates must ship in the same change as endpoint behavior updates
- undocumented behavior must not be implemented
- if code and contract conflict, update the contract first before implementation

## required contract sections

Each endpoint contract must include the following sections:

1. method
2. path
3. auth requirement
4. request params
5. request query
6. request body
7. response shape
8. error cases
9. notes

## suggested file naming

Use lowercase kebab-case names, for example:

- `get-water-bodies.md`
- `post-water-analysis.md`
- `get-risk-analysis-by-water-body.md`

## current contract files

- `water-bodies.md`
- `environmental-sources.md`
- `water-analysis.md`
- `risk-reports.md`

## required scientific and legal wording

Contracts and implementations must use:

- "potential environmental pressure source"
- "risk correlation"
- "field verification required"

Contracts and implementations must not claim proof that any source polluted water or is legally responsible.
