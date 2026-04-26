import { AppError } from "../../shared/errors/AppError.js";
import { buildPagination, toEnvironmentalSource } from "./environmentalSources.helpers.js";
import { environmentalSourcesRepository } from "./environmentalSources.repository.js";
import type {
  EnvironmentalSource,
  EnvironmentalSourceListResult,
  ListEnvironmentalSourcesQuery,
} from "./environmentalSources.types.js";

const listEnvironmentalSources = async (
  query: ListEnvironmentalSourcesQuery,
): Promise<EnvironmentalSourceListResult> => {
  const { rows, total } = await environmentalSourcesRepository.list(query);

  return {
    items: rows.map(toEnvironmentalSource),
    pagination: buildPagination(query.limit, query.offset, total),
  };
};

const getEnvironmentalSourceById = async (sourceId: string): Promise<EnvironmentalSource> => {
  const row = await environmentalSourcesRepository.findById(sourceId);

  if (!row) {
    throw new AppError(
      404,
      "ENVIRONMENTAL_SOURCE_NOT_FOUND",
      "Potential environmental pressure source not found",
      {
        sourceId,
      },
    );
  }

  return toEnvironmentalSource(row);
};

export const environmentalSourcesService = {
  listEnvironmentalSources,
  getEnvironmentalSourceById,
};
