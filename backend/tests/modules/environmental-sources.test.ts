import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Router } from "../../src/routes/v1.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";

type MockSourceType = "FACTORY" | "FARM" | "CONSTRUCTION" | "WASTEWATER" | "INDUSTRIAL_BUILDING" | "UNKNOWN";
type MockRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

type MockEnvironmentalSource = {
  id: string;
  osmId: string | null;
  name: string | null;
  sourceType: MockSourceType;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  osmTags: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  riskLevels: MockRiskLevel[];
};

const mockedDb = vi.hoisted(() => {
  let rows: MockEnvironmentalSource[] = [];

  const seed = () => {
    const now = new Date("2026-04-26T00:00:00.000Z");
    rows = [
      {
        id: "c00000000000000000000001",
        osmId: "osm-factory-1",
        name: "Factory One",
        sourceType: "FACTORY",
        latitude: 45.1,
        longitude: 19.8,
        distanceMeters: 850,
        osmTags: { industrial: "factory" },
        createdAt: now,
        updatedAt: now,
        riskLevels: ["HIGH"],
      },
      {
        id: "c00000000000000000000002",
        osmId: "osm-farm-1",
        name: "Farm Belt",
        sourceType: "FARM",
        latitude: 45.2,
        longitude: 19.7,
        distanceMeters: 1500,
        osmTags: { landuse: "farmland" },
        createdAt: now,
        updatedAt: now,
        riskLevels: ["MEDIUM"],
      },
      {
        id: "c00000000000000000000003",
        osmId: "osm-wwtp-1",
        name: "Wastewater Node",
        sourceType: "WASTEWATER",
        latitude: 44.6,
        longitude: 20.1,
        distanceMeters: 2200,
        osmTags: { man_made: "wastewater_plant" },
        createdAt: now,
        updatedAt: now,
        riskLevels: ["LOW"],
      },
    ];
  };

  const matchWhere = (row: MockEnvironmentalSource, where?: Record<string, unknown>) => {
    if (!where) {
      return true;
    }

    if (where.sourceType && row.sourceType !== where.sourceType) {
      return false;
    }

    const andClauses = (where.AND as Array<Record<string, unknown> | undefined> | undefined)?.filter(Boolean) ?? [];
    for (const clause of andClauses) {
      if (!clause) {
        continue;
      }

      if (clause.latitude) {
        const latitude = clause.latitude as { gte?: number; lte?: number };
        if (row.latitude === null || latitude.gte === undefined || latitude.lte === undefined) {
          return false;
        }
        if (row.latitude < latitude.gte || row.latitude > latitude.lte) {
          return false;
        }
      }

      if (clause.longitude) {
        const longitude = clause.longitude as { gte?: number; lte?: number };
        if (row.longitude === null || longitude.gte === undefined || longitude.lte === undefined) {
          return false;
        }
        if (row.longitude < longitude.gte || row.longitude > longitude.lte) {
          return false;
        }
      }

      if (clause.OR) {
        const searchClauses = clause.OR as Array<Record<string, unknown>>;
        const matched = searchClauses.some((searchClause) => {
          if (searchClause.name) {
            const needle = String((searchClause.name as { contains: string }).contains).toLowerCase();
            return (row.name ?? "").toLowerCase().includes(needle);
          }

          if (searchClause.osmId) {
            const needle = String((searchClause.osmId as { contains: string }).contains).toLowerCase();
            return (row.osmId ?? "").toLowerCase().includes(needle);
          }

          return false;
        });

        if (!matched) {
          return false;
        }
      }

      if (clause.analysisSources) {
        const riskLevel = (((clause.analysisSources as { some: { analysis: { riskReports: { some: { riskLevel: MockRiskLevel } } } } })
          .some.analysis.riskReports.some.riskLevel) ?? null) as MockRiskLevel | null;
        if (riskLevel && !row.riskLevels.includes(riskLevel)) {
          return false;
        }
      }
    }

    return true;
  };

  const prisma = {
    environmentalSource: {
      findMany: vi.fn(
        async ({ where, take, skip }: { where?: Record<string, unknown>; take: number; skip: number }) => {
          const filtered = rows.filter((row) => matchWhere(row, where));
          return filtered.slice(skip, skip + take);
        },
      ),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        return rows.filter((row) => matchWhere(row, where)).length;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return rows.find((row) => row.id === where.id) ?? null;
      }),
    },
  };

  const reset = () => {
    seed();
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

describe("environmental-sources module", () => {
  beforeEach(() => {
    mockedDb.reset();
  });

  it("list potential environmental pressure sources", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/api/v1/environmental-sources?limit=10&offset=0");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items.length).toBe(3);
    expect(response.body.data.items[0].descriptor).toBe("potential environmental pressure source");
  });

  it("get potential environmental pressure source by id", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/api/v1/environmental-sources/c00000000000000000000001");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.sourceId).toBe("c00000000000000000000001");
    expect(response.body.data.osmTags).toBeTruthy();
  });

  it("filter by sourceType, search and bbox", async () => {
    const app = buildTestApp();
    const response = await request(app).get(
      "/api/v1/environmental-sources?sourceType=FACTORY&search=factory&south=45.0&west=19.0&north=45.5&east=20.0",
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items.length).toBe(1);
    expect(response.body.data.items[0].sourceType).toBe("FACTORY");
    expect(response.body.data.items[0].name).toBe("Factory One");
  });

  it("filter by riskLevel through joined-analysis criteria", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/api/v1/environmental-sources?riskLevel=HIGH");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items.length).toBe(1);
    expect(response.body.data.items[0].sourceId).toBe("c00000000000000000000001");
  });
});
