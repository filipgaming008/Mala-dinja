# backend default

This file defines strict backend implementation rules for Codex.

## rules

1. Use TypeScript ESM imports with `.js` extension in local imports.
2. Follow modular structure in every module: `controller`, `routes`, `service`, `repository`, `validator`, `types`, `helpers`.
3. Do not put Prisma calls in controllers.
4. Do not put request/response objects in services.
5. Use Zod schemas for every endpoint.
6. Use `asyncRoute` wrapper for async controllers.
7. Use centralized `AppError` for expected errors.
8. Use shared API response helpers.
9. Keep functions small and readable.
10. Do not implement business logic before `docs/context/product-context.md` and `docs/context/architecture.md` are read.
11. Do not make claims that the app proves pollution source responsibility.
12. Use "potential source", "risk correlation", and "field verification required".
13. Python scripts must output valid JSON only.
14. Node parses and validates Python JSON output.

## enforcement

If implementation conflicts with any rule in this file, update the implementation to comply before adding new behavior.
