import { z } from "zod";

const riskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);

export const AiRiskAnalysisSchema = z.object({
  summary: z.string().min(1),
  riskExplanation: z.string().min(1),
  riskLevel: riskLevelEnum,
  possibleDrivers: z.array(z.string()),
  satelliteObservableSignals: z.array(z.string()),
  limitations: z.array(z.string()),
  verificationSteps: z.array(z.string()),
  confidenceExplanation: z.string().min(1),
  disclaimer: z.string().min(1),
});

export const AiSourceMitigationSchema = z.object({
  sourceRecommendations: z.array(
    z.object({
      sourceName: z.string(),
      sourceType: z.string(),
      riskLevel: riskLevelEnum,
      potentialIssues: z.array(z.string()),
      immediateActions: z.array(z.string()),
      longTermMitigations: z.array(z.string()),
      monitoringSuggestions: z.array(z.string()),
      businessFriendlyExplanation: z.string(),
    }),
  ),
});

export const AiFullReportSchema = z.object({
  executiveSummary: z.string().min(1),
  riskOverview: z.object({
    score: z.number().min(0).max(100),
    level: riskLevelEnum,
    confidenceScore: z.number().min(0).max(1),
    explanation: z.string().min(1),
  }),
  detectedSignals: z.array(z.string()),
  potentialEnvironmentalPressureSources: z.array(z.string()),
  longTermImpact: z.object({
    oneYear: z.string().min(1),
    fiveYears: z.string().min(1),
    tenYears: z.string().min(1),
    fiftyYears: z.string().min(1),
  }),
  recommendedActions: z.array(z.string()),
  verificationPlan: z.array(z.string()),
  mitigationPlan: z.array(z.string()),
  businessOpportunities: z.array(z.string()),
  disclaimer: z.string().min(1),
});

export const aiRiskNarrativeSchema = z.object({
  summary: z.string().min(1),
  riskExplanation: z.string().min(1),
  possibleDrivers: z.array(z.string()),
  longTermImpact: z.object({
    oneYear: z.string().min(1),
    fiveYears: z.string().min(1),
    tenYears: z.string().min(1),
    fiftyYears: z.string().min(1),
  }),
  recommendedActions: z.array(z.string()),
  verificationSteps: z.array(z.string()),
  mitigationIdeas: z.array(z.string()),
  confidenceExplanation: z.string().min(1),
  disclaimer: z
    .string()
    .min(1)
    .default("This report is decision-support only. It does not assign legal responsibility and requires field verification."),
});

export type AiRiskAnalysis = z.infer<typeof AiRiskAnalysisSchema>;
export type AiSourceMitigation = z.infer<typeof AiSourceMitigationSchema>;
export type AiFullReport = z.infer<typeof AiFullReportSchema>;
export type AiRiskNarrativeSchema = z.infer<typeof aiRiskNarrativeSchema>;
