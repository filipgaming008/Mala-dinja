import { AiAnalysisStatus, AiProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/prismaClient.js";

type SaveAiAnalysisLogInput = {
  analysisId: string;
  provider: AiProvider;
  model: string;
  promptVersion: string;
  inputJson: Prisma.InputJsonValue;
  outputJson?: Prisma.InputJsonValue;
  status: AiAnalysisStatus;
  errorMessage?: string;
};

const save = async (input: SaveAiAnalysisLogInput) => {
  return prisma.aiAnalysisLog.create({
    data: {
      analysisId: input.analysisId,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      inputJson: input.inputJson,
      outputJson: input.outputJson,
      status: input.status,
      errorMessage: input.errorMessage,
    },
  });
};

export const aiAnalysisLogRepository = {
  save,
};
