import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Router } from "../../src/routes/v1.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";

type MockWaterBody = {
  id: string;
  name: string;
  type: "RIVER" | "LAKE" | "RESERVOIR" | "COASTAL" | "UNKNOWN";
  countryCode: string | null;
  osmId: string | null;
  bbox: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

const mockedDb = vi.hoisted(() => {
  let sequence = 1;
  let rows: MockWaterBody[] = [];

  const nextId = () => {
    const id = `c${String(sequence).padStart(24, "0")}`;
    sequence += 1;
    return id;
  };

  const applyWhere = (
    inputRows: MockWaterBody[],
    where?: { type?: MockWaterBody["type"]; countryCode?: string },
  ) => {
    return inputRows.filter((row) => {
      if (where?.type && row.type !== where.type) {
        return false;
      }

      if (where?.countryCode && row.countryCode !== where.countryCode) {
        return false;
      }

      return true;
    });
  };

  const prisma = {
    waterBody: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row: MockWaterBody = {
          id: nextId(),
          name: String(data.name),
          type: (data.type as MockWaterBody["type"]) ?? "UNKNOWN",
          countryCode: (data.countryCode as string | undefined) ?? null,
          osmId: (data.osmId as string | undefined) ?? null,
          bbox: (data.bbox as Record<string, unknown> | undefined) ?? null,
          metadata: (data.metadata as Record<string, unknown> | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
        };

        rows = [row, ...rows];

        return row;
      }),
      findMany: vi.fn(
        async ({ where, take, skip }: { where?: { type?: MockWaterBody["type"]; countryCode?: string }; take: number; skip: number }) => {
          const filtered = applyWhere(rows, where);
          return filtered.slice(skip, skip + take);
        },
      ),
      count: vi.fn(async ({ where }: { where?: { type?: MockWaterBody["type"]; countryCode?: string } } = {}) => {
        return applyWhere(rows, where).length;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return rows.find((row) => row.id === where.id) ?? null;
      }),
    },
  };

  const reset = () => {
    sequence = 1;
    rows = [];
  };

  return { prisma, reset };
});

vi.mock("../../src/shared/prisma/prismaClient.js", () => {
  return {
    prisma: mockedDb.prisma,
  };
});

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe("water-bodies module", () => {
  beforeEach(() => {
    mockedDb.reset();
  });

  it("create water body", async () => {
    const app = buildTestApp();

    const response = await request(app).post("/api/v1/water-bodies").send({
      name: "Danube",
      type: "RIVER",
      countryCode: "RO",
      bbox: {
        south: 44.3,
        west: 21.1,
        north: 45.0,
        east: 22.2,
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe("Danube");
    expect(response.body.data.type).toBe("RIVER");
    expect(typeof response.body.data.waterBodyId).toBe("string");
  });

  it("list water bodies", async () => {
    const app = buildTestApp();

    await request(app).post("/api/v1/water-bodies").send({ name: "Sava", type: "RIVER" });
    await request(app).post("/api/v1/water-bodies").send({ name: "Skadar", type: "LAKE" });

    const response = await request(app).get("/api/v1/water-bodies?limit=10&offset=0");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items.length).toBe(2);
    expect(response.body.data.pagination.total).toBe(2);
  });

  it("get water body by id", async () => {
    const app = buildTestApp();

    const createdResponse = await request(app).post("/api/v1/water-bodies").send({
      name: "Ohrid",
      type: "LAKE",
    });

    const waterBodyId = createdResponse.body.data.waterBodyId as string;
    const response = await request(app).get(`/api/v1/water-bodies/${waterBodyId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.waterBodyId).toBe(waterBodyId);
    expect(response.body.data.name).toBe("Ohrid");
  });

  it("invalid id returns validation error", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/api/v1/water-bodies/not-a-cuid");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
