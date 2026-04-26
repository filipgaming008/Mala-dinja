import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../../src/shared/errors/AppError.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";
import { asyncRoute } from "../../src/shared/http/asyncRoute.js";
import { validate } from "../../src/shared/middleware/validate.middleware.js";

const buildTestApp = () => {
  const app = express();
  app.use(express.json());

  app.get(
    "/boom",
    asyncRoute(async () => {
      throw new AppError(409, "CONFLICT", "conflict happened", { reason: "duplicate" });
    }),
  );

  app.get(
    "/validate",
    validate({ query: z.object({ limit: z.coerce.number().int().min(1) }) }),
    asyncRoute(async (_req, res) => {
      res.status(200).json({ success: true });
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

describe("errorHandler", () => {
  it("returns AppError payload with status and code", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/boom");

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("CONFLICT");
    expect(response.body.error.message).toBe("conflict happened");
  });

  it("returns validation error for invalid query", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/validate?limit=0");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns not found payload for unknown routes", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
