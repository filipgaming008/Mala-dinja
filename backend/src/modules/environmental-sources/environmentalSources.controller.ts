import type { Request, Response } from "express";
import { ok } from "../../shared/http/apiResponse.js";
import {
  getEnvironmentalSourceParamsSchema,
  listEnvironmentalSourcesQuerySchema,
} from "./environmentalSources.validator.js";
import { environmentalSourcesService } from "./environmentalSources.service.js";

const listEnvironmentalSources = async (req: Request, res: Response) => {
  const query = listEnvironmentalSourcesQuerySchema.parse(req.query);
  const result = await environmentalSourcesService.listEnvironmentalSources(query);

  return ok(res, result);
};

const getEnvironmentalSourceById = async (req: Request, res: Response) => {
  const { sourceId } = getEnvironmentalSourceParamsSchema.parse(req.params);
  const result = await environmentalSourcesService.getEnvironmentalSourceById(sourceId);

  return ok(res, result);
};

export const environmentalSourcesController = {
  listEnvironmentalSources,
  getEnvironmentalSourceById,
};
