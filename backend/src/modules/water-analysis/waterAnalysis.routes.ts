import { Router } from "express";
import { asyncRoute } from "../../shared/http/asyncRoute.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { waterAnalysisController } from "./waterAnalysis.controller.js";
import { getWaterAnalysisParamsSchema, runWaterAnalysisBodySchema } from "./waterAnalysis.validator.js";

export const waterAnalysisRouter = Router();

waterAnalysisRouter.post(
  "/run",
  validate({ body: runWaterAnalysisBodySchema }),
  asyncRoute(waterAnalysisController.runWaterAnalysis),
);

waterAnalysisRouter.get(
  "/:analysisId",
  validate({ params: getWaterAnalysisParamsSchema }),
  asyncRoute(waterAnalysisController.getWaterAnalysisById),
);
