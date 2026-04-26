import type { Request, Response } from "express";
import { created, ok } from "../../shared/http/apiResponse.js";
import { waterBodiesService } from "./waterBodies.service.js";
import {
  createWaterBodyBodySchema,
  getWaterBodyParamsSchema,
  listWaterBodiesQuerySchema,
} from "./waterBodies.validator.js";

const listWaterBodies = async (req: Request, res: Response) => {
  const query = listWaterBodiesQuerySchema.parse(req.query);
  const result = await waterBodiesService.listWaterBodies(query);

  return ok(res, result);
};

const createWaterBody = async (req: Request, res: Response) => {
  const body = createWaterBodyBodySchema.parse(req.body);
  const result = await waterBodiesService.createWaterBody(body);

  return created(res, result);
};

const getWaterBodyById = async (req: Request, res: Response) => {
  const { waterBodyId } = getWaterBodyParamsSchema.parse(req.params);
  const result = await waterBodiesService.getWaterBodyById(waterBodyId);

  return ok(res, result);
};

export const waterBodiesController = {
  listWaterBodies,
  createWaterBody,
  getWaterBodyById,
};
