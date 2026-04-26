import { AppError } from "../../shared/errors/AppError.js";
import { calculateRiskScore } from "../risk-analysis/riskScoring.service.js";
import { generateFullReport } from "../../shared/ai/aiClient.js";
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

const toDetectedSignals = (detectedIndicators: Record<string, unknown>): string[] => {
  return Object.entries(detectedIndicators)
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value as number))
    .map(([key, value]) => `${key}: ${Number(value).toFixed(2)}`);
};

const generate = async (analysisId: string): Promise<RiskReportResult> => {
  const analysis = await riskReportsRepository.findAnalysisContext(analysisId);

  if (!analysis) {
    throw new AppError(404, "WATER_ANALYSIS_NOT_FOUND", "Water analysis not found", {
      analysisId,
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

  const deterministicExplanation = `Deterministic backend score is ${riskScore.score} (${riskScore.level}) with confidence ${riskScore.confidenceScore}. The explanation reflects risk correlation from provided indicators and potential environmental pressure sources only; field verification required.`;

  const fullReport = await generateFullReport({
    analysisId: analysis.id,
    score: riskScore.score,
    level: riskScore.level,
    confidenceScore: riskScore.confidenceScore,
    riskExplanation: deterministicExplanation,
    detectedSignals: toDetectedSignals(detectedIndicators),
    potentialEnvironmentalPressureSources: draft.potentialSources.map(
      (source) => source.name ?? `${source.sourceType} source`,
    ),
    longTermImpactContext: {
      oneYear: draft.longTermImpact.year1,
      fiveYears: draft.longTermImpact.year5,
      tenYears: draft.longTermImpact.year10,
      fiftyYears: draft.longTermImpact.year50,
    },
    recommendationsContext: draft.recommendations,
    verificationContext: [
      "Collect upstream and downstream field samples.",
      "Compare field observations with satellite-observable signals.",
    ],
    mitigationContext: [
      "Prioritize source-agnostic runoff and discharge control reviews.",
      "Increase monitoring cadence near potential environmental pressure sources.",
    ],
  });

  const mergedDraft = {
    ...draft,
    summary: fullReport.executiveSummary,
    riskLevel: riskScore.level,
    longTermImpact: {
      year1: fullReport.longTermImpact.oneYear,
      year5: fullReport.longTermImpact.fiveYears,
      year10: fullReport.longTermImpact.tenYears,
      year50: fullReport.longTermImpact.fiftyYears,
    },
    recommendations: fullReport.recommendedActions,
    confidenceScore: riskScore.confidenceScore,
    disclaimer: fullReport.disclaimer,
    riskExplanation: deterministicExplanation,
    confidenceExplanation:
      "Confidence is deterministic and based on input completeness and factor coverage. Field verification required.",
    verificationSteps: fullReport.verificationPlan,
    mitigationIdeas: fullReport.mitigationPlan,
  };

  const created = await riskReportsRepository.createRiskReport(analysis.id, mergedDraft, {
    fullReport,
    deterministicRiskScore: riskScore,
  });

  return toRiskReportResult(created);
};

const generateRiskReport = async (input: GenerateRiskReportInput): Promise<RiskReportResult> => {
  return generate(input.analysisId);
};

const getRiskReportById = async (reportId: string): Promise<RiskReportResult> => {
  const record = await riskReportsRepository.findRiskReportById(reportId);

  if (!record) {
    throw new AppError(404, "RISK_REPORT_NOT_FOUND", "Risk report not found", { reportId });
  }

  return toRiskReportResult(record);
};

export const riskReportsService = {
  generate,
  generateRiskReport,
  getRiskReportById,
};
