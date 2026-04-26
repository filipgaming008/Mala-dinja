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
  reportId: string;
  analysisId: string;
  riskLevel: RiskLevel;
  summary: string;
  riskExplanation: string;
  longTermImpact: LongTermImpact;
  recommendations: string[];
  verificationSteps: string[];
  mitigationIdeas: string[];
  confidenceScore: number;
  confidenceExplanation: string;
  disclaimer: string;
  potentialSources: PotentialSourceSnapshot[];
  createdAt: string;
  updatedAt: string;
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
