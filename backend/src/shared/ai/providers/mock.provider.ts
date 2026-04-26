import type { AiFullReport, AiFullReportInput, AiProviderAdapter } from "../ai.types.js";

const DISCLAIMER =
  "This report is decision-support only. It does not assign legal responsibility and requires field verification.";

const generateFullReport = async (input: AiFullReportInput): Promise<AiFullReport> => {
  return {
    executiveSummary: `The deterministic backend score is ${input.score} (${input.level}). This may indicate risk correlation that requires field verification and does not assign legal responsibility.`,
    riskOverview: {
      score: input.score,
      level: input.level,
      confidenceScore: input.confidenceScore,
      explanation: input.riskExplanation,
    },
    detectedSignals: input.detectedSignals,
    potentialEnvironmentalPressureSources: input.potentialEnvironmentalPressureSources,
    longTermImpact: {
      oneYear: input.longTermImpactContext.oneYear,
      fiveYears: input.longTermImpactContext.fiveYears,
      tenYears: input.longTermImpactContext.tenYears,
      fiftyYears: input.longTermImpactContext.fiftyYears,
    },
    recommendedActions: input.recommendationsContext,
    verificationPlan: input.verificationContext,
    mitigationPlan: input.mitigationContext,
    businessOpportunities: [
      "Offer periodic field sampling and compliance-ready monitoring services.",
      "Provide source-agnostic risk-reduction advisory programs for nearby operators.",
    ],
    disclaimer: DISCLAIMER,
  };
};

export const mockProvider: AiProviderAdapter = {
  generateFullReport,
};
