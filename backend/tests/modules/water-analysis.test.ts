import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Router } from "../../src/routes/v1.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";

type DbState = {
  waterBodies: Array<{ id: string; name: string; type: string; countryCode: string | null }>;
  analyses: Array<{
    id: string;
    waterBodyId: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    radiusKm: number;
    resultData: unknown;
    errorData: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
  sources: Array<{
    id: string;
    osmId: string | null;
    osmType: string | null;
    name: string | null;
    sourceType: string;
    latitude: number | null;
    longitude: number | null;
    distanceMeters: number | null;
    osmTags: Record<string, unknown> | null;
  }>;
  joins: Array<{ analysisId: string; sourceId: string; distanceMeters: number | null }>;
};

const runPythonJsonMock = vi.hoisted(() => vi.fn());

const mockedDb = vi.hoisted(() => {
  const state: DbState = {
    waterBodies: [],
    analyses: [],
    sources: [],
    joins: [],
  };

  let sequence = 1;
  const nextId = () => {
    const id = `c${String(sequence).padStart(24, "0")}`;
    sequence += 1;
    return id;
  };

  const prisma = {
    waterBody: {
      findFirst: vi.fn(async ({ where }: { where: { name: string; type: string; countryCode?: string } }) => {
        return (
          state.waterBodies.find(
            (row) => row.name === where.name && row.type === where.type && row.countryCode === (where.countryCode ?? null),
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: { name: string; type: string; countryCode?: string } }) => {
        const row = {
          id: nextId(),
          name: data.name,
          type: data.type,
          countryCode: data.countryCode ?? null,
        };
        state.waterBodies.push(row);
        return row;
      }),
    },
    waterAnalysis: {
      create: vi.fn(async ({ data }: { data: { waterBodyId: string; radiusKm: number } }) => {
        const now = new Date();
        const row = {
          id: nextId(),
          waterBodyId: data.waterBodyId,
          status: "RUNNING" as const,
          radiusKm: data.radiusKm,
          resultData: null,
          errorData: null,
          createdAt: now,
          updatedAt: now,
        };
        state.analyses.push(row);
        return { id: row.id };
      }),
      update: vi.fn(
        async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => {
          const row = state.analyses.find((item) => item.id === where.id);
          if (!row) throw new Error("analysis not found");
          Object.assign(row, data, { updatedAt: new Date() });

          if (!include) {
            return row;
          }

          const waterBody = state.waterBodies.find((item) => item.id === row.waterBodyId)!;
          const analysisSources = state.joins
            .filter((join) => join.analysisId === row.id)
            .map((join) => ({
              distanceMeters: join.distanceMeters,
              source: state.sources.find((source) => source.id === join.sourceId)!,
            }));

          return {
            ...row,
            waterBody,
            analysisSources,
          };
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = state.analyses.find((item) => item.id === where.id);
        if (!row) return null;
        const waterBody = state.waterBodies.find((item) => item.id === row.waterBodyId)!;
        const analysisSources = state.joins
          .filter((join) => join.analysisId === row.id)
          .map((join) => ({
            distanceMeters: join.distanceMeters,
            source: state.sources.find((source) => source.id === join.sourceId)!,
          }));

        return {
          ...row,
          waterBody,
          analysisSources,
        };
      }),
    },
    environmentalSource: {
      findFirst: vi.fn(async ({ where }: { where: { osmId?: string; osmType?: string } }) => {
        return state.sources.find((row) => row.osmId === where.osmId && row.osmType === where.osmType) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.sources.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return { id: row.id };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId(),
          osmId: (data.osmId as string | undefined) ?? null,
          osmType: (data.osmType as string | undefined) ?? null,
          name: (data.name as string | undefined) ?? null,
          sourceType: (data.sourceType as string | undefined) ?? "UNKNOWN",
          latitude: (data.latitude as number | undefined) ?? null,
          longitude: (data.longitude as number | undefined) ?? null,
          distanceMeters: (data.distanceMeters as number | undefined) ?? null,
          osmTags: (data.osmTags as Record<string, unknown> | undefined) ?? null,
        };
        state.sources.push(row);
        return { id: row.id };
      }),
    },
    waterAnalysisSource: {
      createMany: vi.fn(async ({ data }: { data: Array<{ analysisId: string; sourceId: string; distanceMeters: number | null }> }) => {
        data.forEach((item) => {
          if (!state.joins.find((row) => row.analysisId === item.analysisId && row.sourceId === item.sourceId)) {
            state.joins.push(item);
          }
        });
        return { count: data.length };
      }),
    },
  };

  const reset = () => {
    state.waterBodies = [];
    state.analyses = [];
    state.sources = [];
    state.joins = [];
    sequence = 1;
  };

  return { prisma, reset, state };
});

vi.mock("../../src/shared/prisma/prismaClient.js", () => {
  return { prisma: mockedDb.prisma };
});

vi.mock("../../src/shared/python/pythonRunner.js", () => {
  return { runPythonJson: runPythonJsonMock };
});

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe("water-analysis module", () => {
  beforeEach(() => {
    mockedDb.reset();
    runPythonJsonMock.mockReset();
  });

  it("runs analysis and returns potentialSources", async () => {
    runPythonJsonMock.mockResolvedValueOnce({
      potentialSources: [
        {
          osmId: "osm-1",
          osmType: "node",
          name: "Factory A",
          sourceType: "FACTORY",
          latitude: 45.1,
          longitude: 19.8,
          distanceMeters: 700,
          osmTags: { industrial: "factory" },
        },
      ],
      analysisSummary: { riskCorrelation: "MEDIUM", fieldVerificationRequired: true },
    });

    const app = buildTestApp();
    const response = await request(app).post("/api/v1/water-analysis/run").send({
      waterBodyName: "Danube",
      waterBodyType: "RIVER",
      countryCode: "RO",
      radiusKm: 2,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("COMPLETED");
    expect(response.body.data.potentialSources.length).toBe(1);
    expect(response.body.data.potentialSources[0].name).toBe("Factory A");
  });

  it("gets analysis by id", async () => {
    runPythonJsonMock.mockResolvedValueOnce({ potentialSources: [] });

    const app = buildTestApp();
    const runResponse = await request(app).post("/api/v1/water-analysis/run").send({
      waterBodyName: "Lake Ohrid",
      waterBodyType: "LAKE",
      radiusKm: 1,
    });

    const analysisId = runResponse.body.data.analysisId as string;
    const getResponse = await request(app).get(`/api/v1/water-analysis/${analysisId}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.success).toBe(true);
    expect(getResponse.body.data.analysisId).toBe(analysisId);
  });

  it("marks failed and returns safe error on python failure", async () => {
    runPythonJsonMock.mockRejectedValueOnce(new Error("python boom"));

    const app = buildTestApp();
    const response = await request(app).post("/api/v1/water-analysis/run").send({
      waterBodyName: "Vardar",
      waterBodyType: "RIVER",
      radiusKm: 1.5,
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("WATER_ANALYSIS_FAILED");

    const failed = mockedDb.state.analyses.find((item) => item.status === "FAILED");
    expect(failed).toBeTruthy();
  });
});
