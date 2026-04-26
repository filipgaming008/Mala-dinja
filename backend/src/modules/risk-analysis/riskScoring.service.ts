import {
  normalizeSignal,
  proximityWeight,
  pushFactor,
  riskLevelFromScore,
  riskWeightByLevel,
  round2,
} from "./riskScoring.helpers.js";
import type { RiskScoringInput, RiskScoringResult } from "./riskScoring.types.js";

const INDICATOR_WEIGHTS = {
  turbidityScore: 22,
  chlorophyllScore: 18,
  temperatureAnomaly: 12,
  suspendedMatterScore: 15,
} as const;

const SOURCE_TOTAL_CAP = 40;

export const calculateRiskScore = (input: RiskScoringInput): RiskScoringResult => {
  const factors = [] as RiskScoringResult["factors"];
  const indicators = input.detectedIndicators ?? {};
  const sources = input.potentialSources ?? [];

  let score = 0;

  const turbidity = normalizeSignal(indicators.turbidityScore);
  if (turbidity > 0) {
    const contribution = turbidity * INDICATOR_WEIGHTS.turbidityScore;
    score += contribution;
    pushFactor(factors, {
      code: "IND_TURBIDITY",
      label: "Turbidity signal",
      weight: contribution,
      explanation: "Higher turbidity may indicate elevated suspended load and increased environmental stress.",
    });
  }

  const chlorophyll = normalizeSignal(indicators.chlorophyllScore);
  if (chlorophyll > 0) {
    const contribution = chlorophyll * INDICATOR_WEIGHTS.chlorophyllScore;
    score += contribution;
    pushFactor(factors, {
      code: "IND_CHLOROPHYLL",
      label: "Chlorophyll signal",
      weight: contribution,
      explanation: "Higher chlorophyll may indicate eutrophication pressure and risk correlation with nutrient inputs.",
    });
  }

  const temperature = normalizeSignal(indicators.temperatureAnomaly);
  if (temperature > 0) {
    const contribution = temperature * INDICATOR_WEIGHTS.temperatureAnomaly;
    score += contribution;
    pushFactor(factors, {
      code: "IND_TEMPERATURE",
      label: "Temperature anomaly",
      weight: contribution,
      explanation: "Temperature anomalies may indicate altered water conditions and ecosystem sensitivity.",
    });
  }

  const suspendedMatter = normalizeSignal(indicators.suspendedMatterScore);
  if (suspendedMatter > 0) {
    const contribution = suspendedMatter * INDICATOR_WEIGHTS.suspendedMatterScore;
    score += contribution;
    pushFactor(factors, {
      code: "IND_SUSPENDED_MATTER",
      label: "Suspended matter signal",
      weight: contribution,
      explanation: "Higher suspended matter may indicate sediment-related stress and possible pressure-source influence.",
    });
  }

  let sourceContributionTotal = 0;
  let missingDistanceCount = 0;
  let missingSignatureCount = 0;

  for (const source of sources) {
    const riskWeight = riskWeightByLevel(source.riskLevel);
    const distanceWeight = proximityWeight(source.distanceMeters, input.radiusKm);

    if (source.distanceMeters === undefined) {
      missingDistanceCount += 1;
    }

    if (!source.satelliteSignature) {
      missingSignatureCount += 1;
    }

    const sourceContribution = riskWeight * distanceWeight * 22;
    sourceContributionTotal += sourceContribution;

    pushFactor(factors, {
      code: "SRC_CONTRIBUTION",
      label: `Source proximity/risk: ${source.sourceType}`,
      weight: sourceContribution,
      explanation:
        "Possible environmental pressure source contribution increases with higher source risk level and closer proximity; this does not infer legal responsibility.",
    });
  }

  if (sourceContributionTotal > SOURCE_TOTAL_CAP) {
    pushFactor(factors, {
      code: "SRC_CAP",
      label: "Source contribution cap",
      weight: SOURCE_TOTAL_CAP - sourceContributionTotal,
      explanation: "Multiple-source contribution is capped to keep scoring stable and explainable.",
    });
  }

  score += Math.min(sourceContributionTotal, SOURCE_TOTAL_CAP);

  let confidenceScore = 0.9;

  const missingIndicatorCount = [
    indicators.turbidityScore,
    indicators.chlorophyllScore,
    indicators.temperatureAnomaly,
    indicators.suspendedMatterScore,
  ].filter((value) => value === undefined).length;

  if (missingIndicatorCount === 4) {
    confidenceScore -= 0.25;
    pushFactor(factors, {
      code: "CONF_MISSING_ALL_INDICATORS",
      label: "Missing indicators",
      weight: -0.25,
      explanation: "Missing indicator inputs reduce confidence in risk-correlation assessment.",
    });
  } else if (missingIndicatorCount > 0) {
    const penalty = Math.min(0.2, missingIndicatorCount * 0.05);
    confidenceScore -= penalty;
    pushFactor(factors, {
      code: "CONF_PARTIAL_INDICATORS",
      label: "Partial indicator coverage",
      weight: -penalty,
      explanation: "Partial satellite indicator coverage lowers confidence in the deterministic score.",
    });
  }

  if (missingDistanceCount > 0) {
    const penalty = Math.min(0.24, missingDistanceCount * 0.06);
    confidenceScore -= penalty;
    pushFactor(factors, {
      code: "CONF_MISSING_DISTANCE",
      label: "Missing source distance",
      weight: -penalty,
      explanation: "Missing source distances lower confidence because proximity weighting is less precise.",
    });
  }

  if (missingSignatureCount > 0) {
    const penalty = Math.min(0.15, missingSignatureCount * 0.03);
    confidenceScore -= penalty;
    pushFactor(factors, {
      code: "CONF_MISSING_SIGNATURE",
      label: "Missing satellite signatures",
      weight: -penalty,
      explanation: "Missing satellite signatures reduce confidence by limiting observable corroboration.",
    });
  }

  if (sources.length === 0) {
    confidenceScore -= 0.05;
    pushFactor(factors, {
      code: "CONF_NO_SOURCES",
      label: "No potential sources in input",
      weight: -0.05,
      explanation: "No potential source context reduces confidence in source-linked interpretation.",
    });
  }

  const boundedScore = Math.max(0, Math.min(100, round2(score)));
  const boundedConfidence = Math.max(0.2, Math.min(0.95, round2(confidenceScore)));

  return {
    score: boundedScore,
    level: riskLevelFromScore(boundedScore),
    factors,
    confidenceScore: boundedConfidence,
  };
};

export const riskScoringService = {
  calculateRiskScore,
};
