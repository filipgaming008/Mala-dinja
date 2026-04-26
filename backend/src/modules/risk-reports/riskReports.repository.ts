import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma/prismaClient.js";
import type { AnalysisContextRecord, DeterministicReportDraft, RiskReportRecord } from "./riskReports.types.js";

const analysisInclude = {
  waterBody: {
    select: {
      name: true,
      type: true,
      countryCode: true,
    },
  },
  analysisSources: {
    select: {
      distanceMeters: true,
      source: {
        select: {
          id: true,
          name: true,
          sourceType: true,
          distanceMeters: true,
        },
      },
    },
  },
} as const;

const riskReportInclude = {
  analysis: {
    include: analysisInclude,
  },
} as const;

const findAnalysisContext = async (analysisId: string): Promise<AnalysisContextRecord | null> => {
  const row = await prisma.waterAnalysis.findUnique({
    where: { id: analysisId },
    include: analysisInclude,
  });

  return (row as AnalysisContextRecord | null) ?? null;
};

const createRiskReport = async (analysisId: string, draft: DeterministicReportDraft): Promise<RiskReportRecord> => {
  const row = await prisma.riskReport.create({
    data: {
      analysisId,
      riskLevel: draft.riskLevel,
      summary: draft.summary,
      riskFactors: {
        longTermImpact: draft.longTermImpact,
        confidenceScore: draft.confidenceScore,
        confidenceExplanation: draft.confidenceExplanation,
        riskExplanation: draft.riskExplanation,
        verificationSteps: draft.verificationSteps,
        mitigationIdeas: draft.mitigationIdeas,
        disclaimer: draft.disclaimer,
      } as Prisma.InputJsonValue,
      recommendations: draft.recommendations as unknown as Prisma.InputJsonValue,
      rawData: {
        potentialSources: draft.potentialSources,
        strategy: "deterministic_template_v1",
      } as Prisma.InputJsonValue,
    },
    include: riskReportInclude,
  });

  return row as RiskReportRecord;
};

const findRiskReportById = async (reportId: string): Promise<RiskReportRecord | null> => {
  const row = await prisma.riskReport.findUnique({
    where: { id: reportId },
    include: riskReportInclude,
  });

  return (row as RiskReportRecord | null) ?? null;
};

export const riskReportsRepository = {
  findAnalysisContext,
  createRiskReport,
  findRiskReportById,
};
