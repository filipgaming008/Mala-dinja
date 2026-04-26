import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Router } from "../../src/routes/v1.js";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler.js";

const generateRiskNarrativeMock = vi.hoisted(() => vi.fn());

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
  summary: string | null;
  riskFactors: Record<string, unknown>;
  recommendations: string[];
  createdAt: Date;
  updatedAt: Date;
  analysis: AnalysisRecord;
};

const mockedDb = vi.hoisted(() => {
  const analyses: AnalysisRecord[] = [];
  const reports: RiskReportRecord[] = [];
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
          summary: (data.summary as string | undefined) ?? null,
          riskFactors: (data.riskFactors as Record<string, unknown> | undefined) ?? {},
          recommendations: (data.recommendations as string[] | undefined) ?? [],
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
  };

  const reset = () => {
    analyses.length = 0;
    reports.length = 0;
    seq = 1;
    analyses.push({
      id: "c00000000000000000000010",
      radiusKm: 2,
      resultData: { detectedIndicators: ["turbidity", "chlorophyll"] },
      waterBody: { name: "Danube", type: "RIVER", countryCode: "RO" },
      analysisSources: [
        {
          distanceMeters: 700,
          source: { id: "c00000000000000000000100", name: "Factory A", sourceType: "FACTORY", distanceMeters: 700 },
        },
        {
          distanceMeters: 1600,
          source: { id: "c00000000000000000000101", name: "Farm B", sourceType: "FARM", distanceMeters: 1600 },
        },
      ],
    });
  };

  return { prisma, reset };
});

vi.mock("../../src/shared/prisma/prismaClient.js", () => ({ prisma: mockedDb.prisma }));
vi.mock("../../src/shared/ai/aiClient.js", () => ({ generateRiskNarrative: generateRiskNarrativeMock }));

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe("risk-reports module", () => {
  beforeEach(() => {
    mockedDb.reset();
    generateRiskNarrativeMock.mockReset();
    generateRiskNarrativeMock.mockResolvedValue({
      summary: "AI narrative summary with potential contributing sources and field verification required.",
      riskExplanation: "Risk explanation tied to provided deterministic score and factors.",
      possibleDrivers: ["Potential contributing sources near the water body"],
      longTermImpact: {
        oneYear: "One-year scenario note.",
        fiveYears: "Five-year scenario note.",
        tenYears: "Ten-year scenario note.",
        fiftyYears: "Fifty-year scenario note.",
      },
      recommendedActions: ["Run targeted field sampling."],
      verificationSteps: ["Collect field samples near observed anomalies."],
      mitigationIdeas: ["Plan preventive runoff control measures."],
      confidenceExplanation: "Confidence reflects provided deterministic confidence and data coverage.",
      disclaimer: "Field verification required.",
    });
  });

  it("generates deterministic risk report", async () => {
    const app = buildTestApp();
    const response = await request(app)
      .post("/api/v1/risk-reports/generate")
      .send({ analysisId: "c00000000000000000000010" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.analysisId).toBe("c00000000000000000000010");
    expect(response.body.data.disclaimer).toContain("Field verification required");
    expect(response.body.data.summary.toLowerCase()).not.toContain("guilty");
  });

  it("gets risk report by id", async () => {
    const app = buildTestApp();
    const createResponse = await request(app)
      .post("/api/v1/risk-reports/generate")
      .send({ analysisId: "c00000000000000000000010" });

    const reportId = createResponse.body.data.reportId as string;
    const getResponse = await request(app).get(`/api/v1/risk-reports/${reportId}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.success).toBe(true);
    expect(getResponse.body.data.reportId).toBe(reportId);
  });

  it("returns 404 when analysis does not exist", async () => {
    const app = buildTestApp();
    const response = await request(app)
      .post("/api/v1/risk-reports/generate")
      .send({ analysisId: "c00000000000000000009999" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("WATER_ANALYSIS_NOT_FOUND");
  });
});
