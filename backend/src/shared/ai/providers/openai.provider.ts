import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "../../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import { AiFullReportSchema } from "../aiSchemas.js";
import { FULL_REPORT_PROMPT_V1 } from "../aiPrompts.js";
import type { AiFullReport, AiFullReportInput, AiProviderAdapter } from "../ai.types.js";

type OpenAiProviderOptions = {
  apiKey: string;
};

export const createOpenAiProvider = (options: OpenAiProviderOptions): AiProviderAdapter => {
  const client = new OpenAI({ apiKey: options.apiKey });

  const generateFullReport = async (input: AiFullReportInput): Promise<AiFullReport> => {
    try {
      const response = await client.responses.parse({
        model: env.OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: FULL_REPORT_PROMPT_V1,
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
        text: {
          format: zodTextFormat(AiFullReportSchema, "ai_full_report"),
        },
      });

      if (!response.output_parsed) {
        throw new AppError(500, "OPENAI_EMPTY_PARSED_RESPONSE", "OpenAI response missing parsed output");
      }

      return response.output_parsed;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(502, "OPENAI_REQUEST_FAILED", "OpenAI request failed", {
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
  };

  return {
    generateFullReport,
  };
};
