export type DetectedIndicatorsInput = {
  turbidityScore?: number;
  chlorophyllScore?: number;
  temperatureAnomaly?: number;
  suspendedMatterScore?: number;
};

export type PotentialSourceRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type PotentialSourceInput = {
  sourceType: string;
  distanceMeters?: number;
  riskLevel?: PotentialSourceRiskLevel;
  pollutants?: string[];
  satelliteSignature?: string;
};

export type RiskScoringInput = {
  detectedIndicators?: DetectedIndicatorsInput;
  potentialSources?: PotentialSourceInput[];
  radiusKm: number;
};

export type RiskFactor = {
  code: string;
  label: string;
  weight: number;
  explanation: string;
};

export type RiskScoringResult = {
  score: number;
  level: PotentialSourceRiskLevel;
  factors: RiskFactor[];
  confidenceScore: number;
};
