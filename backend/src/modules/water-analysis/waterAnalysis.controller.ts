import type { Request, Response } from "express";
import { ok } from "../../shared/http/apiResponse.js";
import { waterAnalysisService } from "./waterAnalysis.service.js";
import { getWaterAnalysisParamsSchema, runWaterAnalysisBodySchema } from "./waterAnalysis.validator.js";

const runWaterAnalysis = async (req: Request, res: Response) => {
  const input = runWaterAnalysisBodySchema.parse(req.body);
  const result = await waterAnalysisService.runWaterAnalysis(input);

  return ok(res, result);
};

const getWaterAnalysisById = async (req: Request, res: Response) => {
  const { analysisId } = getWaterAnalysisParamsSchema.parse(req.params);
  const result = await waterAnalysisService.getWaterAnalysisById(analysisId);

  return ok(res, result);
};

export const waterAnalysisController = {
  runWaterAnalysis,
  getWaterAnalysisById,
};
