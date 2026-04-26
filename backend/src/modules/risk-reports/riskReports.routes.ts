import { Router } from "express";
import { asyncRoute } from "../../shared/http/asyncRoute.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { riskReportsController } from "./riskReports.controller.js";
import { generateRiskReportBodySchema, getRiskReportParamsSchema } from "./riskReports.validator.js";

export const riskReportsRouter = Router();

riskReportsRouter.post(
  "/generate",
  validate({ body: generateRiskReportBodySchema }),
  asyncRoute(riskReportsController.generateRiskReport),
);

riskReportsRouter.get(
  "/:reportId",
  validate({ params: getRiskReportParamsSchema }),
  asyncRoute(riskReportsController.getRiskReportById),
);
