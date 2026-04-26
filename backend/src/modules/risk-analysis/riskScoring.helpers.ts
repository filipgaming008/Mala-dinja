import type { PotentialSourceRiskLevel, RiskFactor } from "./riskScoring.types.js";

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const normalizeSignal = (value?: number): number => {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }

  const normalized = value > 1 ? value / 100 : value;
  return clamp(normalized, 0, 1);
};

export const riskWeightByLevel = (level?: PotentialSourceRiskLevel): number => {
  switch (level) {
    case "VERY_HIGH":
      return 1;
    case "HIGH":
      return 0.75;
    case "MEDIUM":
      return 0.45;
    case "LOW":
      return 0.2;
    default:
      return 0.35;
  }
};

export const proximityWeight = (distanceMeters: number | undefined, radiusKm: number): number => {
  if (distanceMeters === undefined) {
    return 0.45;
  }

  const radiusMeters = Math.max(radiusKm * 1000, 1);
  const linear = 1 - distanceMeters / (radiusMeters * 1.3);
  const bounded = clamp(linear, 0.1, 1);
  return distanceMeters <= radiusMeters * 0.25 ? clamp(bounded + 0.2, 0, 1) : bounded;
};

export const riskLevelFromScore = (score: number): PotentialSourceRiskLevel => {
  if (score >= 75) return "VERY_HIGH";
  if (score >= 45) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
};

export const round2 = (value: number): number => {
  return Number(value.toFixed(2));
};

export const pushFactor = (factors: RiskFactor[], factor: RiskFactor) => {
  factors.push({
    ...factor,
    weight: round2(factor.weight),
  });
};
