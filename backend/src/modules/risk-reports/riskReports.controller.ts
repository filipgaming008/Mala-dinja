import type { Request, Response } from "express";
import { created, ok } from "../../shared/http/apiResponse.js";
import { riskReportsService } from "./riskReports.service.js";
import { generateRiskReportBodySchema, getRiskReportParamsSchema } from "./riskReports.validator.js";

const generateRiskReport = async (req: Request, res: Response) => {
  const input = generateRiskReportBodySchema.parse(req.body);
  const result = await riskReportsService.generateRiskReport(input);

  return created(res, result);
};

const getRiskReportById = async (req: Request, res: Response) => {
  const { reportId } = getRiskReportParamsSchema.parse(req.params);
  const result = await riskReportsService.getRiskReportById(reportId);

  return ok(res, result);
};

export const riskReportsController = {
  generateRiskReport,
  getRiskReportById,
};
