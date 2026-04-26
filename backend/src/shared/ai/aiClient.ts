import { AiProvider } from "@prisma/client";
import { env } from "../../config/env.js";
import type { RiskScoringResult } from "../../modules/risk-analysis/riskScoring.types.js";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../prisma/prismaClient.js";
import { AI_RISK_NARRATIVE_SYSTEM_PROMPT, buildRiskNarrativeUserPrompt } from "./aiPrompts.js";

export type AiRiskNarrative = {
  summary: string;
  riskExplanation: string;
  possibleDrivers: string[];
  longTermImpact: {
    oneYear: string;
    fiveYears: string;
    tenYears: string;
    fiftyYears: string;
  };
  recommendedActions: string[];
  verificationSteps: string[];
  mitigationIdeas: string[];
  confidenceExplanation: string;
  disclaimer: string;
};

export type AiRiskNarrativeInput = {
  analysisId: string;
  waterBody: {
    name: string;
    type: string;
    countryCode?: string | null;
  };
  analysisMetrics?: Record<string, unknown>;
  potentialSources: Array<{
    sourceType: string;
    name?: string | null;
    distanceMeters?: number | null;
    riskLevel?: string;
    pollutants?: string[];
    satelliteSignature?: string;
  }>;
  detectedIndicators?: Record<string, unknown>;
  riskScore: RiskScoringResult;
  analysisMetadata: {
    analysisId: string;
    generatedAt: string;
    providerMode: "MOCK" | "OPENAI";
  };
  radiusKm: number;
};

const createMockNarrative = (input: AiRiskNarrativeInput): AiRiskNarrative => {
  const sourceCount = input.potentialSources.length;
  const drivers = input.potentialSources.map((source) => `${source.sourceType} in proximity`).slice(0, 4);

  const summary =
    sourceCount === 0
      ? "No nearby potential contributing sources were linked in the current input. Satellite-observable indicators may indicate baseline conditions; field verification required."
      : `Analysis indicates ${sourceCount} potential contributing source(s) near the selected water body. The provided deterministic score may indicate risk correlation, and field verification required.`;

  return {
    summary,
    riskExplanation: `The provided deterministic score is ${input.riskScore.score} (${input.riskScore.level}) with ${input.riskScore.factors.length} explainable factors. This explanation reflects only those provided factors and does not assign responsibility.`,
    possibleDrivers: drivers.length > 0 ? drivers : ["No clear driver pattern from available structured inputs"],
    longTermImpact: {
      oneYear: "Potential short-term stress patterns may persist if current signals repeat; field verification required.",
      fiveYears: "Sustained pressure may increase ecological variability and operational monitoring burden.",
      tenYears: "Without mitigation, inferred risk pathways may contribute to long-term water-quality instability.",
      fiftyYears: "Long-horizon outcomes are uncertain and should be treated as scenario-level inference only.",
    },
    recommendedActions: [
      "Validate satellite-observable indicators with targeted field sampling.",
      "Prioritize monitoring around potential contributing sources nearest to the water body.",
      "Track trend evolution across seasons before escalation decisions.",
    ],
    verificationSteps: [
      "Collect field samples at upstream and downstream reference points.",
      "Cross-check observed indicators against local seasonal baseline.",
    ],
    mitigationIdeas: [
      "Increase monitoring cadence around possible environmental pressure sources.",
      "Coordinate preventive runoff and discharge-control reviews with local stakeholders.",
    ],
    confidenceExplanation: `Deterministic confidence score is ${input.riskScore.confidenceScore}. Confidence may indicate data completeness limits and requires field verification.`,
    disclaimer: "This narrative is decision-support only; field verification required and no legal responsibility is inferred.",
  };
};

const parseNarrative = (value: unknown): AiRiskNarrative => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(500, "AI_INVALID_RESPONSE_SHAPE", "AI response is not a valid object");
  }

  const record = value as Record<string, unknown>;

  const summary = typeof record.summary === "string" ? record.summary : "";
  const riskExplanation = typeof record.riskExplanation === "string" ? record.riskExplanation : "";
  const possibleDrivers = Array.isArray(record.possibleDrivers)
    ? record.possibleDrivers.filter((item): item is string => typeof item === "string")
    : [];
  const recommendedActions = Array.isArray(record.recommendedActions)
    ? record.recommendedActions.filter((item): item is string => typeof item === "string")
    : [];
  const verificationSteps = Array.isArray(record.verificationSteps)
    ? record.verificationSteps.filter((item): item is string => typeof item === "string")
    : [];
  const mitigationIdeas = Array.isArray(record.mitigationIdeas)
    ? record.mitigationIdeas.filter((item): item is string => typeof item === "string")
    : [];

  const longTermImpactRaw =
    typeof record.longTermImpact === "object" && record.longTermImpact !== null && !Array.isArray(record.longTermImpact)
      ? (record.longTermImpact as Record<string, unknown>)
      : {};

  const confidenceExplanation =
    typeof record.confidenceExplanation === "string"
      ? record.confidenceExplanation
      : "Confidence explanation unavailable; field verification required.";
  const disclaimer = typeof record.disclaimer === "string" ? record.disclaimer : "Field verification required.";

  return {
    summary:
      summary ||
      "Risk narrative generated with limited structured output. Field verification required for operational decisions.",
    riskExplanation:
      riskExplanation ||
      "Risk explanation unavailable. Use the provided deterministic score and factors with field verification required.",
    possibleDrivers,
    longTermImpact: {
      oneYear:
        typeof longTermImpactRaw.oneYear === "string"
          ? longTermImpactRaw.oneYear
          : "Potential one-year impact is uncertain from current inputs.",
      fiveYears:
        typeof longTermImpactRaw.fiveYears === "string"
          ? longTermImpactRaw.fiveYears
          : "Potential five-year impact is uncertain from current inputs.",
      tenYears:
        typeof longTermImpactRaw.tenYears === "string"
          ? longTermImpactRaw.tenYears
          : "Potential ten-year impact is uncertain from current inputs.",
      fiftyYears:
        typeof longTermImpactRaw.fiftyYears === "string"
          ? longTermImpactRaw.fiftyYears
          : "Potential fifty-year impact is uncertain from current inputs.",
    },
    recommendedActions,
    verificationSteps,
    mitigationIdeas,
    confidenceExplanation,
    disclaimer,
  };
};

const generateOpenAiNarrative = async (input: AiRiskNarrativeInput): Promise<AiRiskNarrative> => {
  if (!env.OPENAI_API_KEY) {
    throw new AppError(500, "OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is not configured");
  }

  const body = {
    model: env.OPENAI_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: AI_RISK_NARRATIVE_SYSTEM_PROMPT },
      { role: "user", content: buildRiskNarrativeUserPrompt(input) },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError(502, "OPENAI_REQUEST_FAILED", "OpenAI request failed", { status: response.status, errorText });
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, unknown>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError(500, "OPENAI_EMPTY_RESPONSE", "OpenAI returned an empty response");
  }

  const parsed = JSON.parse(content) as unknown;
  return parseNarrative(parsed);
};

export const generateRiskNarrative = async (input: AiRiskNarrativeInput): Promise<AiRiskNarrative> => {
  const provider = env.AI_PROVIDER === "OPENAI" ? AiProvider.OPENAI : AiProvider.MOCK;
  const promptPayload = {
    system: AI_RISK_NARRATIVE_SYSTEM_PROMPT,
    user: buildRiskNarrativeUserPrompt(input),
  };

  try {
    const narrative =
      provider === AiProvider.OPENAI ? await generateOpenAiNarrative(input) : createMockNarrative(input);

    await prisma.aiAnalysisLog.create({
      data: {
        analysisId: input.analysisId,
        provider,
        modelName: provider === AiProvider.OPENAI ? env.OPENAI_MODEL : "mock-risk-narrative-v1",
        promptData: promptPayload,
        responseData: narrative,
      },
    });

    return narrative;
  } catch (error) {
    await prisma.aiAnalysisLog.create({
      data: {
        analysisId: input.analysisId,
        provider,
        modelName: provider === AiProvider.OPENAI ? env.OPENAI_MODEL : "mock-risk-narrative-v1",
        promptData: promptPayload,
        responseData: {
          error: error instanceof Error ? error.message : "unknown_error",
        },
      },
    });

    if (provider === AiProvider.MOCK) {
      return createMockNarrative(input);
    }

    throw new AppError(
      500,
      "AI_NARRATIVE_GENERATION_FAILED",
      "Failed to generate AI risk narrative. Field verification required.",
    );
  }
};
