import type { AiFullReport, AiRiskAnalysis, AiSourceMitigation } from "./aiSchemas.js";

export type AiPromptVersion = "risk-analysis-v1" | "source-mitigation-v1" | "full-report-v1";

export type AiRiskAnalysisInput = {
  waterBody: {
    name: string;
    type: string;
    countryCode?: string | null;
  };
  detectedIndicators?: Record<string, unknown>;
  potentialSources: Array<{
    sourceType: string;
    name?: string | null;
    distanceMeters?: number | null;
    riskLevel?: string;
    pollutants?: string[];
    satelliteSignature?: string;
  }>;
  riskScore: {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
    confidenceScore: number;
    factors: Array<{
      code: string;
      label: string;
      weight: number;
      explanation: string;
    }>;
  };
  analysisMetadata: {
    analysisId: string;
    generatedAt: string;
    providerMode: "MOCK" | "OPENAI";
  };
  analysisMetrics?: Record<string, unknown>;
  radiusKm: number;
};

export type AiSourceMitigationInput = {
  analysisId: string;
  sourceRecommendationsContext: Array<{
    sourceName: string;
    sourceType: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
    potentialIssues: string[];
  }>;
};

export type AiFullReportInput = {
  analysisId: string;
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  confidenceScore: number;
  detectedSignals: string[];
  potentialEnvironmentalPressureSources: string[];
  riskExplanation: string;
  longTermImpactContext: {
    oneYear: string;
    fiveYears: string;
    tenYears: string;
    fiftyYears: string;
  };
  recommendationsContext: string[];
  verificationContext: string[];
  mitigationContext: string[];
};

export type AiProviderAdapter = {
  generateFullReport(input: AiFullReportInput): Promise<AiFullReport>;
};

export type { AiRiskAnalysis, AiSourceMitigation, AiFullReport };
