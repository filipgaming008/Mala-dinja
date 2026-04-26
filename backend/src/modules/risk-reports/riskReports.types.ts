import type { RiskLevel } from "@prisma/client";

export type GenerateRiskReportInput = {
  analysisId: string;
};

export type LongTermImpact = {
  year1: string;
  year5: string;
  year10: string;
  year50: string;
};

export type PotentialSourceSnapshot = {
  sourceId: string;
  name: string | null;
  sourceType: string;
  distanceMeters: number | null;
};

export type RiskReportResult = {
  id: string;
  analysisId: string;
  executiveSummary: string;
  riskOverview: {
    score: number;
    level: RiskLevel;
    confidenceScore: number;
    explanation: string;
  };
  detectedSignals: string[];
  potentialEnvironmentalPressureSources: string[];
  longTermImpact: {
    oneYear: string;
    fiveYears: string;
    tenYears: string;
    fiftyYears: string;
  };
  recommendedActions: string[];
  verificationPlan: string[];
  mitigationPlan: string[];
  businessOpportunities: string[];
  disclaimer: string;
  createdAt: string;
};

export type AnalysisContextRecord = {
  id: string;
  radiusKm: number;
  resultData: unknown;
  waterBody: {
    name: string;
    type: string;
    countryCode: string | null;
  };
  analysisSources: Array<{
    distanceMeters: number | null;
    source: {
      id: string;
      name: string | null;
      sourceType: string;
      distanceMeters: number | null;
    };
  }>;
};

export type RiskReportRecord = {
  id: string;
  analysisId: string;
  riskLevel: RiskLevel;
  summary: string | null;
  riskFactors: unknown;
  recommendations: unknown;
  rawData: unknown;
  createdAt: Date;
  updatedAt: Date;
  analysis: AnalysisContextRecord;
};

export type DeterministicReportDraft = {
  riskLevel: RiskLevel;
  summary: string;
  longTermImpact: LongTermImpact;
  recommendations: string[];
  confidenceScore: number;
  disclaimer: string;
  potentialSources: PotentialSourceSnapshot[];
  riskExplanation?: string;
  confidenceExplanation?: string;
  verificationSteps?: string[];
  mitigationIdeas?: string[];
};
