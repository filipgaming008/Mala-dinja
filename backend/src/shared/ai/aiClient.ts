import { AiAnalysisStatus, AiProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "../errors/AppError.js";
import { aiAnalysisLogRepository } from "./aiAnalysisLog.repository.js";
import {
  FULL_REPORT_PROMPT_V1,
  FULL_REPORT_PROMPT_VERSION,
  buildFullReportPromptInput,
} from "./aiPrompts.js";
import type { AiFullReport, AiFullReportInput, AiProviderAdapter } from "./ai.types.js";
import { mockProvider } from "./providers/mock.provider.js";
import { createOpenAiProvider } from "./providers/openai.provider.js";

const getProvider = (): { mode: AiProvider; adapter: AiProviderAdapter; modelName: string } => {
  if (env.AI_PROVIDER !== "OPENAI") {
    return {
      mode: AiProvider.MOCK,
      adapter: mockProvider,
      modelName: "mock-full-report-v1",
    };
  }

  if (!env.OPENAI_API_KEY) {
    throw new AppError(500, "OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is not configured");
  }

  return {
    mode: AiProvider.OPENAI,
    adapter: createOpenAiProvider({
      apiKey: env.OPENAI_API_KEY,
    }),
    modelName: env.OPENAI_MODEL,
  };
};

export const resolveAiProviderConfig = (): { provider: "MOCK" | "OPENAI"; model: string; keyConfigured: boolean } => {
  return {
    provider: env.AI_PROVIDER,
    model: env.OPENAI_MODEL,
    keyConfigured: Boolean(env.OPENAI_API_KEY),
  };
};

export const generateFullReportTransient = async (input: AiFullReportInput): Promise<AiFullReport> => {
  const provider = getProvider();
  return provider.adapter.generateFullReport(input);
};

export const generateFullReport = async (input: AiFullReportInput): Promise<AiFullReport> => {
  const provider = getProvider();
  const promptInput = JSON.parse(buildFullReportPromptInput(input)) as Prisma.InputJsonValue;
  const promptData = {
    promptVersion: FULL_REPORT_PROMPT_VERSION,
    systemPrompt: FULL_REPORT_PROMPT_V1,
    input: promptInput,
  };

  try {
    const output = await provider.adapter.generateFullReport(input);

    await aiAnalysisLogRepository.save({
      analysisId: input.analysisId,
      provider: provider.mode,
      model: provider.modelName,
      promptVersion: FULL_REPORT_PROMPT_VERSION,
      inputJson: promptData,
      outputJson: {
        promptVersion: FULL_REPORT_PROMPT_VERSION,
        output,
      },
      status: AiAnalysisStatus.COMPLETED,
    });

    return output;
  } catch (error) {
    await aiAnalysisLogRepository.save({
      analysisId: input.analysisId,
      provider: provider.mode,
      model: provider.modelName,
      promptVersion: FULL_REPORT_PROMPT_VERSION,
      inputJson: promptData,
      outputJson: {
        promptVersion: FULL_REPORT_PROMPT_VERSION,
      },
      status: AiAnalysisStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });

    if (provider.mode === AiProvider.MOCK) {
      return provider.adapter.generateFullReport(input);
    }

    throw new AppError(
      500,
      "AI_FULL_REPORT_GENERATION_FAILED",
      "Failed to generate AI full report. Field verification required.",
    );
  }
};

export type { AiFullReport, AiFullReportInput } from "./ai.types.js";
