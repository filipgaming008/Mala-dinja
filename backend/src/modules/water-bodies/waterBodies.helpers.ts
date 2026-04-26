import type {
  WaterBody,
  WaterBodyBbox,
  WaterBodyRecord,
  WaterBodiesListResult,
} from "./waterBodies.types.js";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toBbox = (value: unknown): WaterBodyBbox | null => {
  if (!isRecord(value)) {
    return null;
  }

  const south = value.south;
  const west = value.west;
  const north = value.north;
  const east = value.east;

  if (
    typeof south !== "number" ||
    typeof west !== "number" ||
    typeof north !== "number" ||
    typeof east !== "number"
  ) {
    return null;
  }

  return { south, west, north, east };
};

export const toWaterBody = (row: WaterBodyRecord): WaterBody => {
  return {
    waterBodyId: row.id,
    name: row.name,
    type: row.type,
    countryCode: row.countryCode,
    osmId: row.osmId,
    bbox: toBbox(row.bbox),
    metadata: isRecord(row.metadata) ? row.metadata : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

export const toWaterBodiesListResult = (
  rows: WaterBodyRecord[],
  limit: number,
  offset: number,
  total: number,
): WaterBodiesListResult => {
  return {
    items: rows.map(toWaterBody),
    pagination: {
      limit,
      offset,
      total,
    },
  };
};
