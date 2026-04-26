import { RiskLevel } from "@prisma/client";
import type {
  AnalysisContextRecord,
  DeterministicReportDraft,
  LongTermImpact,
  PotentialSourceSnapshot,
  RiskReportRecord,
  RiskReportResult,
} from "./riskReports.types.js";

const DISCLAIMER = "Field verification required. This report does not determine legal responsibility.";

const toPotentialSources = (analysis: AnalysisContextRecord): PotentialSourceSnapshot[] => {
  return analysis.analysisSources.map((join) => ({
    sourceId: join.source.id,
    name: join.source.name,
    sourceType: join.source.sourceType,
    distanceMeters: join.distanceMeters ?? join.source.distanceMeters,
  }));
};

const calculateRiskLevel = (sources: PotentialSourceSnapshot[]): RiskLevel => {
  if (sources.length === 0) {
    return RiskLevel.LOW;
  }

  const weightedScore = sources.reduce((total, source) => {
    const typeWeight =
      source.sourceType === "WASTEWATER" || source.sourceType === "FACTORY"
        ? 2
        : source.sourceType === "INDUSTRIAL_BUILDING" || source.sourceType === "CONSTRUCTION"
          ? 1.5
          : 1;

    const distanceWeight = source.distanceMeters !== null && source.distanceMeters <= 1000 ? 1.5 : 1;
    return total + typeWeight * distanceWeight;
  }, 0);

  if (weightedScore >= 8) return RiskLevel.VERY_HIGH;
  if (weightedScore >= 5) return RiskLevel.HIGH;
  if (weightedScore >= 2) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
};

const buildLongTermImpact = (riskLevel: RiskLevel): LongTermImpact => {
  if (riskLevel === RiskLevel.VERY_HIGH || riskLevel === RiskLevel.HIGH) {
    return {
      year1: "Potential short-term water-quality stress requires immediate monitoring.",
      year5: "Sustained risk correlation may affect ecosystem balance without mitigation.",
      year10: "Long-term exposure could increase restoration complexity and monitoring costs.",
      year50: "Without sustained intervention, cumulative impact risk remains significant.",
    };
  }

  if (riskLevel === RiskLevel.MEDIUM) {
    return {
      year1: "Localized risk signals should be validated through field sampling.",
      year5: "Recurring signals may indicate persistent pressure requiring targeted controls.",
      year10: "Chronic medium-level pressure may reduce resilience during seasonal extremes.",
      year50: "Long-horizon uncertainty remains; periodic reassessment is recommended.",
    };
  }

  return {
    year1: "No high-severity pattern detected from current analysis inputs.",
    year5: "Low-level risk correlation should still be reviewed with periodic checks.",
    year10: "Environmental conditions may change; maintain baseline monitoring.",
    year50: "Very long-term outcomes are uncertain and require future reassessment.",
  };
};

const buildRecommendations = (riskLevel: RiskLevel): string[] => {
  const base = [
    "Validate anomaly context with targeted field verification.",
    "Compare findings against historical seasonal patterns before escalation.",
  ];

  if (riskLevel === RiskLevel.VERY_HIGH || riskLevel === RiskLevel.HIGH) {
    return [
      ...base,
      "Prioritize rapid on-site sampling near potential environmental pressure sources.",
      "Coordinate local authority review for short-interval follow-up monitoring.",
    ];
  }

  if (riskLevel === RiskLevel.MEDIUM) {
    return [...base, "Schedule follow-up sampling and trend review in the near term."];
  }

  return [...base, "Maintain periodic monitoring and update risk correlation baseline."];
};

const buildConfidenceScore = (sources: PotentialSourceSnapshot[]): number => {
  const raw = 0.45 + Math.min(sources.length, 5) * 0.08;
  return Number(Math.min(0.85, raw).toFixed(2));
};

export const buildDeterministicReport = (analysis: AnalysisContextRecord): DeterministicReportDraft => {
  const potentialSources = toPotentialSources(analysis);
  const riskLevel = calculateRiskLevel(potentialSources);
  const longTermImpact = buildLongTermImpact(riskLevel);
  const recommendations = buildRecommendations(riskLevel);
  const confidenceScore = buildConfidenceScore(potentialSources);

  const summary =
    potentialSources.length === 0
      ? "No potential environmental pressure sources were linked in this analysis window; continue baseline monitoring with field verification required."
      : `Risk correlation is assessed as ${riskLevel} with ${potentialSources.length} potential environmental pressure source(s) linked to this analysis. Field verification required.`;

  return {
    riskLevel,
    summary,
    longTermImpact,
    recommendations,
    confidenceScore,
    disclaimer: DISCLAIMER,
    potentialSources,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const toRiskReportResult = (record: RiskReportRecord): RiskReportResult => {
  const riskFactors = isRecord(record.riskFactors) ? record.riskFactors : {};
  const longTermImpact = isRecord(riskFactors.longTermImpact)
    ? (riskFactors.longTermImpact as LongTermImpact)
    : {
        year1: "Field verification required.",
        year5: "Field verification required.",
        year10: "Field verification required.",
        year50: "Field verification required.",
      };

  const confidenceScore =
    typeof riskFactors.confidenceScore === "number" ? Number(riskFactors.confidenceScore.toFixed(2)) : 0.5;

  const confidenceExplanation =
    typeof riskFactors.confidenceExplanation === "string"
      ? riskFactors.confidenceExplanation
      : "Confidence reflects deterministic data completeness and factor coverage; field verification required.";

  const riskExplanation =
    typeof riskFactors.riskExplanation === "string"
      ? riskFactors.riskExplanation
      : "Risk explanation is based on deterministic factors and risk correlation; no legal responsibility is inferred.";

  const disclaimer =
    typeof riskFactors.disclaimer === "string" ? riskFactors.disclaimer : DISCLAIMER;

  const recommendations = Array.isArray(record.recommendations)
    ? record.recommendations.filter((item): item is string => typeof item === "string")
    : [];

  const verificationSteps = Array.isArray(riskFactors.verificationSteps)
    ? riskFactors.verificationSteps.filter((item): item is string => typeof item === "string")
    : [];

  const mitigationIdeas = Array.isArray(riskFactors.mitigationIdeas)
    ? riskFactors.mitigationIdeas.filter((item): item is string => typeof item === "string")
    : [];

  const potentialSources = toPotentialSources(record.analysis);

  return {
    reportId: record.id,
    analysisId: record.analysisId,
    riskLevel: record.riskLevel,
    summary: record.summary ?? "Risk report generated. Field verification required.",
    riskExplanation,
    longTermImpact,
    recommendations,
    verificationSteps,
    mitigationIdeas,
    confidenceScore,
    confidenceExplanation,
    disclaimer,
    potentialSources,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};
