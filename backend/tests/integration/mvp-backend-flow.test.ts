import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Router } from "../../src/routes/v1.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";

const runPythonJsonMock = vi.hoisted(() => vi.fn());
const generateFullReportMock = vi.hoisted(() => vi.fn());

type Db = {
  waterBodies: Array<{
    id: string;
    name: string;
    type: string;
    countryCode: string | null;
    osmId: string | null;
    bbox: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  analyses: Array<{
    id: string;
    waterBodyId: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    radiusKm: number;
    requestPayload: Record<string, unknown>;
    resultData: Record<string, unknown> | null;
    errorData: Record<string, unknown> | null;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  sources: Array<{
    id: string;
    osmId: string | null;
    osmType: string | null;
    name: string | null;
    sourceType: string;
    countryCode: string | null;
    latitude: number | null;
    longitude: number | null;
    distanceMeters: number | null;
    osmTags: Record<string, unknown> | null;
    rawData: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  analysisSources: Array<{
    analysisId: string;
    sourceId: string;
    distanceMeters: number | null;
    createdAt: Date;
  }>;
  riskReports: Array<{
    id: string;
    analysisId: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
    summary: string;
    riskFactors: Record<string, unknown>;
    recommendations: string[];
    rawData: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }>;
  aiLogs: Array<{
    analysisId: string;
    provider: string;
    promptData: Record<string, unknown>;
    responseData: Record<string, unknown>;
  }>;
};

const mockedDb = vi.hoisted(() => {
  const db: Db = {
    waterBodies: [],
    analyses: [],
    sources: [],
    analysisSources: [],
    riskReports: [],
    aiLogs: [],
  };

  let seq = 1;
  const nextId = () => `c${String(seq++).padStart(24, "0")}`;

  const withAnalysisJoins = (analysisId: string) => {
    return db.analysisSources
      .filter((join) => join.analysisId === analysisId)
      .map((join) => ({
        distanceMeters: join.distanceMeters,
        source: db.sources.find((source) => source.id === join.sourceId)!,
      }));
  };

  const prisma = {
    waterBody: {
      findFirst: vi.fn(async ({ where }: { where: { name: string; type: string; countryCode?: string } }) => {
        return (
          db.waterBodies.find(
            (row) => row.name === where.name && row.type === where.type && row.countryCode === (where.countryCode ?? null),
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where, take, skip }: { where: { type?: string; countryCode?: string }; take: number; skip: number }) => {
        const filtered = db.waterBodies.filter((row) => {
          if (where.type && row.type !== where.type) return false;
          if (where.countryCode && row.countryCode !== where.countryCode) return false;
          return true;
        });
        return filtered.slice(skip, skip + take);
      }),
      count: vi.fn(async ({ where }: { where: { type?: string; countryCode?: string } }) => {
        return db.waterBodies.filter((row) => {
          if (where.type && row.type !== where.type) return false;
          if (where.countryCode && row.countryCode !== where.countryCode) return false;
          return true;
        }).length;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: nextId(),
          name: String(data.name),
          type: String(data.type),
          countryCode: (data.countryCode as string | undefined) ?? null,
          osmId: (data.osmId as string | undefined) ?? null,
          bbox: (data.bbox as Record<string, unknown> | undefined) ?? null,
          metadata: (data.metadata as Record<string, unknown> | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        db.waterBodies.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return db.waterBodies.find((row) => row.id === where.id) ?? null;
      }),
    },
    waterAnalysis: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: nextId(),
          waterBodyId: String(data.waterBodyId),
          status: "RUNNING" as const,
          radiusKm: Number(data.radiusKm),
          requestPayload: (data.requestPayload as Record<string, unknown>) ?? {},
          resultData: null,
          errorData: null,
          startedAt: now,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        db.analyses.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => {
        const row = db.analyses.find((item) => item.id === where.id)!;
        if (data.status) row.status = String(data.status) as Db["analyses"][number]["status"];
        if (data.resultData !== undefined) row.resultData = (data.resultData as Record<string, unknown>) ?? null;
        if (data.errorData !== undefined) row.errorData = (data.errorData as Record<string, unknown>) ?? null;
        if (data.completedAt !== undefined) row.completedAt = (data.completedAt as Date | null) ?? null;
        row.updatedAt = new Date();

        if (!include) return row;

        return {
          ...row,
          waterBody: db.waterBodies.find((wb) => wb.id === row.waterBodyId)!,
          analysisSources: withAnalysisJoins(row.id),
        };
      }),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => {
        const row = db.analyses.find((item) => item.id === where.id);
        if (!row) return null;

        if (!include) return row;
        return {
          ...row,
          waterBody: db.waterBodies.find((wb) => wb.id === row.waterBodyId)!,
          analysisSources: withAnalysisJoins(row.id),
        };
      }),
    },
    environmentalSource: {
      findFirst: vi.fn(async ({ where }: { where: { osmId?: string; osmType?: string } }) => {
        return db.sources.find((row) => row.osmId === (where.osmId ?? null) && row.osmType === (where.osmType ?? null)) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: nextId(),
          osmId: (data.osmId as string | undefined) ?? null,
          osmType: (data.osmType as string | undefined) ?? null,
          name: (data.name as string | undefined) ?? null,
          sourceType: (data.sourceType as string | undefined) ?? "UNKNOWN",
          countryCode: (data.countryCode as string | undefined) ?? null,
          latitude: (data.latitude as number | undefined) ?? null,
          longitude: (data.longitude as number | undefined) ?? null,
          distanceMeters: (data.distanceMeters as number | undefined) ?? null,
          osmTags: (data.osmTags as Record<string, unknown> | undefined) ?? null,
          rawData: (data.rawData as Record<string, unknown> | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        db.sources.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.sources.find((item) => item.id === where.id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return { id: row.id };
      }),
    },
    waterAnalysisSource: {
      createMany: vi.fn(async ({ data }: { data: Array<{ analysisId: string; sourceId: string; distanceMeters: number | null }> }) => {
        data.forEach((item) => {
          if (!db.analysisSources.find((existing) => existing.analysisId === item.analysisId && existing.sourceId === item.sourceId)) {
            db.analysisSources.push({ ...item, createdAt: new Date() });
          }
        });
        return { count: data.length };
      }),
    },
    riskReport: {
      create: vi.fn(async ({ data, include }: { data: Record<string, unknown>; include?: unknown }) => {
        const now = new Date();
        const row = {
          id: nextId(),
          analysisId: String(data.analysisId),
          riskLevel: String(data.riskLevel) as Db["riskReports"][number]["riskLevel"],
          summary: String(data.summary),
          riskFactors: (data.riskFactors as Record<string, unknown>) ?? {},
          recommendations: (data.recommendations as string[]) ?? [],
          rawData: (data.rawData as Record<string, unknown>) ?? {},
          createdAt: now,
          updatedAt: now,
        };
        db.riskReports.push(row);

        if (!include) return row;
        const analysis = db.analyses.find((a) => a.id === row.analysisId)!;
        return {
          ...row,
          analysis: {
            ...analysis,
            waterBody: db.waterBodies.find((wb) => wb.id === analysis.waterBodyId)!,
            analysisSources: withAnalysisJoins(analysis.id),
          },
        };
      }),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => {
        const row = db.riskReports.find((item) => item.id === where.id);
        if (!row) return null;
        if (!include) return row;
        const analysis = db.analyses.find((a) => a.id === row.analysisId)!;
        return {
          ...row,
          analysis: {
            ...analysis,
            waterBody: db.waterBodies.find((wb) => wb.id === analysis.waterBodyId)!,
            analysisSources: withAnalysisJoins(analysis.id),
          },
        };
      }),
    },
    aiAnalysisLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.aiLogs.push({
          analysisId: String(data.analysisId),
          provider: String(data.provider),
          promptData: (data.promptData as Record<string, unknown>) ?? {},
          responseData: (data.responseData as Record<string, unknown>) ?? {},
        });
        return { id: nextId() };
      }),
    },
  };

  const reset = () => {
    db.waterBodies = [];
    db.analyses = [];
    db.sources = [];
    db.analysisSources = [];
    db.riskReports = [];
    db.aiLogs = [];
    seq = 1;
  };

  return { prisma, db, reset };
});

vi.mock("../../src/shared/prisma/prismaClient.js", () => ({ prisma: mockedDb.prisma }));
vi.mock("../../src/shared/python/pythonRunner.js", () => ({ runPythonJson: runPythonJsonMock }));
vi.mock("../../src/shared/ai/aiClient.js", () => ({ generateFullReport: generateFullReportMock }));

const buildIntegrationApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe("MVP backend integration flow", () => {
  beforeEach(() => {
    mockedDb.reset();
    runPythonJsonMock.mockReset();
    generateFullReportMock.mockReset();
    generateFullReportMock.mockResolvedValue({
      executiveSummary: "Risk correlation may indicate stress patterns potentially associated with nearby sources; field verification required.",
      riskOverview: {
        score: 59,
        level: "MEDIUM",
        confidenceScore: 0.74,
        explanation: "Explanation reflects provided deterministic risk score factors only.",
      },
      detectedSignals: ["turbidityScore: 0.80"],
      potentialEnvironmentalPressureSources: ["Industrial Site"],
      longTermImpact: {
        oneYear: "One-year impact may indicate localized variability.",
        fiveYears: "Five-year trend may indicate recurring stress if unchanged.",
        tenYears: "Ten-year horizon may indicate cumulative risk correlation.",
        fiftyYears: "Fifty-year horizon requires scenario-based interpretation.",
      },
      recommendedActions: ["Run targeted field sampling before operational conclusions."],
      verificationPlan: ["Sample upstream/downstream locations."],
      mitigationPlan: ["Improve runoff controls near possible environmental pressure sources."],
      businessOpportunities: ["Deliver monitoring and risk-reduction support services."],
      disclaimer: "This report is decision-support only and requires field verification.",
    });
  });

  it("runs full MVP flow with mocked external processing", async () => {
    const app = buildIntegrationApp();

    const waterBodyResponse = await request(app).post("/api/v1/water-bodies").send({
      name: "Test River",
      type: "RIVER",
      countryCode: "RO",
    });

    expect(waterBodyResponse.status).toBe(201);
    expect(mockedDb.db.waterBodies.length).toBe(1);

    runPythonJsonMock.mockResolvedValueOnce({
      potentialSources: [
        {
          osmId: "123",
          osmType: "node",
          name: "Industrial Site",
          sourceType: "FACTORY",
          latitude: 45.1,
          longitude: 19.8,
          distanceMeters: 640,
          osmTags: { industrial: "factory" },
        },
      ],
      detectedIndicators: { turbidityScore: 0.8 },
    });

    const runResponse = await request(app).post("/api/v1/water-analysis/run").send({
      waterBodyName: "Flow River",
      waterBodyType: "RIVER",
      countryCode: "RO",
      radiusKm: 2,
    });

    expect(runResponse.status).toBe(200);
    expect(mockedDb.db.waterBodies.length).toBe(2);
    expect(mockedDb.db.analyses.length).toBe(1);
    expect(mockedDb.db.sources.length).toBe(1);
    expect(mockedDb.db.analysisSources.length).toBe(1);

    const analysisId = runResponse.body.data.analysisId as string;
    const getAnalysisResponse = await request(app).get(`/api/v1/water-analysis/${analysisId}`);

    expect(getAnalysisResponse.status).toBe(200);
    expect(getAnalysisResponse.body.data.potentialSources.length).toBe(1);
    expect(getAnalysisResponse.body.data.potentialSources[0].name).toBe("Industrial Site");

    const generateReportResponse = await request(app).post("/api/v1/risk-reports/generate").send({ analysisId });

    expect(generateReportResponse.status).toBe(201);
    expect(mockedDb.db.riskReports.length).toBe(1);
    expect(generateReportResponse.body.data.disclaimer.toLowerCase()).toContain("field verification");
    expect(generateReportResponse.body.data.executiveSummary.toLowerCase()).not.toContain("guilty");
  });

  it("fails validation for invalid radiusKm", async () => {
    const app = buildIntegrationApp();

    const response = await request(app).post("/api/v1/water-analysis/run").send({
      waterBodyName: "Invalid Radius River",
      waterBodyType: "RIVER",
      radiusKm: 6,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("marks analysis as FAILED when python worker fails", async () => {
    const app = buildIntegrationApp();
    runPythonJsonMock.mockRejectedValueOnce(new Error("worker failure"));

    const response = await request(app).post("/api/v1/water-analysis/run").send({
      waterBodyName: "Failure River",
      waterBodyType: "RIVER",
      radiusKm: 1,
    });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("WATER_ANALYSIS_FAILED");
    expect(mockedDb.db.analyses.length).toBe(1);
    expect(mockedDb.db.analyses[0]?.status).toBe("FAILED");
  });
});
