import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../config/env.js";
import { calculateRiskScore } from "../risk-analysis/riskScoring.service.js";
import { generateRiskNarrative } from "../../shared/ai/aiClient.js";
import { buildDeterministicReport, toRiskReportResult } from "./riskReports.helpers.js";
import { riskReportsRepository } from "./riskReports.repository.js";
import type { GenerateRiskReportInput, RiskReportResult } from "./riskReports.types.js";

const extractDetectedIndicators = (resultData: unknown): Record<string, unknown> => {
  if (typeof resultData !== "object" || resultData === null || Array.isArray(resultData)) {
    return {};
  }

  const record = resultData as Record<string, unknown>;
  const candidates = record.detectedIndicators;

  if (typeof candidates === "object" && candidates !== null && !Array.isArray(candidates)) {
    return candidates as Record<string, unknown>;
  }

  return {};
};

const generateRiskReport = async (input: GenerateRiskReportInput): Promise<RiskReportResult> => {
  const analysis = await riskReportsRepository.findAnalysisContext(input.analysisId);

  if (!analysis) {
    throw new AppError(404, "WATER_ANALYSIS_NOT_FOUND", "Water analysis not found", {
      analysisId: input.analysisId,
    });
  }

  const draft = buildDeterministicReport(analysis);
  const detectedIndicators = extractDetectedIndicators(analysis.resultData);

  const riskScore = calculateRiskScore({
    detectedIndicators: {
      turbidityScore:
        typeof detectedIndicators.turbidityScore === "number" ? detectedIndicators.turbidityScore : undefined,
      chlorophyllScore:
        typeof detectedIndicators.chlorophyllScore === "number" ? detectedIndicators.chlorophyllScore : undefined,
      temperatureAnomaly:
        typeof detectedIndicators.temperatureAnomaly === "number" ? detectedIndicators.temperatureAnomaly : undefined,
      suspendedMatterScore:
        typeof detectedIndicators.suspendedMatterScore === "number"
          ? detectedIndicators.suspendedMatterScore
          : undefined,
    },
    potentialSources: draft.potentialSources.map((source) => ({
      sourceType: source.sourceType,
      distanceMeters: source.distanceMeters ?? undefined,
      riskLevel: draft.riskLevel,
    })),
    radiusKm: analysis.radiusKm,
  });

  const narrative = await generateRiskNarrative({
    analysisId: analysis.id,
    waterBody: analysis.waterBody,
    analysisMetrics: typeof analysis.resultData === "object" && analysis.resultData !== null ? (analysis.resultData as Record<string, unknown>) : {},
    potentialSources: draft.potentialSources.map((source) => ({
      sourceType: source.sourceType,
      name: source.name,
      distanceMeters: source.distanceMeters,
      riskLevel: draft.riskLevel,
    })),
    detectedIndicators,
    riskScore,
    analysisMetadata: {
      analysisId: analysis.id,
      generatedAt: new Date().toISOString(),
      providerMode: env.AI_PROVIDER,
    },
    radiusKm: analysis.radiusKm,
  });

  const mergedDraft = {
    ...draft,
    summary: narrative.summary,
    longTermImpact: {
      year1: narrative.longTermImpact.oneYear,
      year5: narrative.longTermImpact.fiveYears,
      year10: narrative.longTermImpact.tenYears,
      year50: narrative.longTermImpact.fiftyYears,
    },
    recommendations: narrative.recommendedActions,
    confidenceScore: riskScore.confidenceScore,
    disclaimer: narrative.disclaimer,
    riskExplanation: narrative.riskExplanation,
    confidenceExplanation: narrative.confidenceExplanation,
    verificationSteps: narrative.verificationSteps,
    mitigationIdeas: narrative.mitigationIdeas,
  };

  const created = await riskReportsRepository.createRiskReport(input.analysisId, mergedDraft);

  return toRiskReportResult(created);
};

const getRiskReportById = async (reportId: string): Promise<RiskReportResult> => {
  const record = await riskReportsRepository.findRiskReportById(reportId);

  if (!record) {
    throw new AppError(404, "RISK_REPORT_NOT_FOUND", "Risk report not found", { reportId });
  }

  return toRiskReportResult(record);
};

export const riskReportsService = {
  generateRiskReport,
  getRiskReportById,
};
