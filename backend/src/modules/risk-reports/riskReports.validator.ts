import { z } from "zod";

export const generateRiskReportBodySchema = z.object({
  analysisId: z.string().cuid(),
});

export const getRiskReportParamsSchema = z.object({
  reportId: z.string().cuid(),
});
