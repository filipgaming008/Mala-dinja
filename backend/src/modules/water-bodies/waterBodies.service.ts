import { AppError } from "../../shared/errors/AppError.js";
import { toWaterBody, toWaterBodiesListResult } from "./waterBodies.helpers.js";
import { waterBodiesRepository } from "./waterBodies.repository.js";
import type {
  CreateWaterBodyInput,
  ListWaterBodiesQuery,
  WaterBody,
  WaterBodiesListResult,
} from "./waterBodies.types.js";

const listWaterBodies = async (query: ListWaterBodiesQuery): Promise<WaterBodiesListResult> => {
  const { rows, total } = await waterBodiesRepository.list(query);

  return toWaterBodiesListResult(rows, query.limit, query.offset, total);
};

const createWaterBody = async (input: CreateWaterBodyInput): Promise<WaterBody> => {
  const created = await waterBodiesRepository.create(input);

  return toWaterBody(created);
};

const getWaterBodyById = async (waterBodyId: string): Promise<WaterBody> => {
  const row = await waterBodiesRepository.findById(waterBodyId);

  if (!row) {
    throw new AppError(404, "WATER_BODY_NOT_FOUND", "Water body not found", { waterBodyId });
  }

  return toWaterBody(row);
};

export const waterBodiesService = {
  listWaterBodies,
  createWaterBody,
  getWaterBodyById,
};
