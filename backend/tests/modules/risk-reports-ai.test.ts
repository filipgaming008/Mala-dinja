import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Router } from "../../src/routes/v1.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";

vi.mock("../../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 3000,
    CORS_ORIGIN: "*",
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX_REQUESTS: 120,
    JSON_BODY_LIMIT: "1mb",
    PYTHON_WATER_ANALYSIS_SCRIPT: "python/water_sources_worker.py",
    PYTHON_RUNNER_TIMEOUT_MS: 30_000,
    AI_PROVIDER: "MOCK",
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL: "gpt-4.1-mini",
    DATABASE_URL: "postgresql://test",
  },
}));

type AnalysisRecord = {
  id: string;
  radiusKm: number;
  resultData: Record<string, unknown>;
  waterBody: { name: string; type: string; countryCode: string | null };
  analysisSources: Array<{
    distanceMeters: number | null;
    source: { id: string; name: string | null; sourceType: string; distanceMeters: number | null };
  }>;
};

type RiskReportRecord = {
  id: string;
  analysisId: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  summary: string;
  riskFactors: Record<string, unknown>;
  recommendations: string[];
  rawData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  analysis: AnalysisRecord;
};

type AiLogRecord = {
  analysisId: string;
  provider: "MOCK" | "OPENAI";
  model: string;
  promptVersion: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> | null;
  status: "COMPLETED" | "FAILED";
  errorMessage: string | null;
};

const mockedDb = vi.hoisted(() => {
  const analyses: AnalysisRecord[] = [];
  const reports: RiskReportRecord[] = [];
  const aiLogs: AiLogRecord[] = [];
  let seq = 1;
  const nextId = () => `c${String(seq++).padStart(24, "0")}`;

  const prisma = {
    waterAnalysis: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return analyses.find((item) => item.id === where.id) ?? null;
      }),
    },
    riskReport: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const analysis = analyses.find((item) => item.id === String(data.analysisId))!;
        const now = new Date();
        const row: RiskReportRecord = {
          id: nextId(),
          analysisId: String(data.analysisId),
          riskLevel: data.riskLevel as RiskReportRecord["riskLevel"],
          summary: String(data.summary),
          riskFactors: (data.riskFactors as Record<string, unknown>) ?? {},
          recommendations: (data.recommendations as string[]) ?? [],
          rawData: (data.rawData as Record<string, unknown>) ?? {},
          createdAt: now,
          updatedAt: now,
          analysis,
        };
        reports.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return reports.find((item) => item.id === where.id) ?? null;
      }),
    },
    aiAnalysisLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        aiLogs.push({
          analysisId: String(data.analysisId),
          provider: data.provider as AiLogRecord["provider"],
          model: String(data.model),
          promptVersion: String(data.promptVersion),
          inputJson: (data.inputJson as Record<string, unknown>) ?? {},
          outputJson: (data.outputJson as Record<string, unknown> | undefined) ?? null,
          status: data.status as AiLogRecord["status"],
          errorMessage: (data.errorMessage as string | undefined) ?? null,
        });

        return { id: nextId() };
      }),
    },
  };

  const reset = () => {
    analyses.length = 0;
    reports.length = 0;
    aiLogs.length = 0;
    seq = 1;

    analyses.push({
      id: "c00000000000000000000021",
      radiusKm: 2,
      resultData: {
        detectedIndicators: {
          turbidityScore: 0.83,
          chlorophyllScore: 0.48,
        },
      },
      waterBody: { name: "Mures", type: "RIVER", countryCode: "RO" },
      analysisSources: [
        {
          distanceMeters: 620,
          source: {
            id: "c00000000000000000000111",
            name: "Industrial Zone A",
            sourceType: "FACTORY",
            distanceMeters: 620,
          },
        },
      ],
    });
  };

  return { prisma, reset, reports, aiLogs };
});

vi.mock("../../src/shared/prisma/prismaClient.js", () => ({ prisma: mockedDb.prisma }));

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe("risk-reports AI generation", () => {
  beforeEach(() => {
    mockedDb.reset();
  });

  it("creates report, includes AI full-report fields, and persists AiAnalysisLog", async () => {
    const app = buildTestApp();

    const response = await request(app).post("/api/v1/risk-reports/generate").send({
      analysisId: "c00000000000000000000021",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockedDb.reports.length).toBe(1);

    const storedReport = mockedDb.reports[0]!;
    const aiFullReport = (storedReport.rawData.aiFullReport as Record<string, unknown>) ?? {};

    expect(aiFullReport.executiveSummary).toEqual(expect.any(String));
    expect(aiFullReport.riskOverview).toEqual(expect.any(Object));
    expect(aiFullReport.longTermImpact).toEqual(expect.any(Object));
    expect(aiFullReport.mitigationPlan).toEqual(expect.any(Array));
    expect(aiFullReport.disclaimer).toEqual(expect.any(String));

    expect(mockedDb.aiLogs.length).toBe(1);
    expect(mockedDb.aiLogs[0]?.promptVersion).toBe("full-report-v1");
    expect(mockedDb.aiLogs[0]?.status).toBe("COMPLETED");

    const renderedText = JSON.stringify({
      summary: response.body.data.executiveSummary,
      disclaimer: response.body.data.disclaimer,
      aiFullReport,
    }).toLowerCase();

    expect(renderedText).not.toContain("guilty");
    expect(renderedText).not.toContain("responsible");
    expect(renderedText).not.toContain("caused pollution");
    expect(renderedText).not.toContain("confirmed polluter");
  });

  it("returns validation error for invalid analysisId", async () => {
    const app = buildTestApp();
    const response = await request(app).post("/api/v1/risk-reports/generate").send({ analysisId: "invalid-id" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when analysis is missing", async () => {
    const app = buildTestApp();
    const response = await request(app).post("/api/v1/risk-reports/generate").send({
      analysisId: "c00000000000000000000999",
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("WATER_ANALYSIS_NOT_FOUND");
  });
});
