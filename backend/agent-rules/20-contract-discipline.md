# contract discipline

This file defines API contract discipline rules for Codex.

## rules

1. Every API endpoint must have a matching contract document in `docs/contracts/api/`.
2. API contracts are the highest source of truth for endpoint behavior.
3. If endpoint behavior changes, update contract docs in the same change.
4. Every contract must include:
   - method
   - path
   - auth requirement
   - request params
   - request query
   - request body
   - response shape
   - error cases
   - notes
5. Do not implement undocumented endpoint behavior.
6. If code and contract conflict, stop implementation and update the contract first.

## enforcement

Pull requests that change endpoint behavior without matching contract updates are not compliant.
