import type {
  EnvironmentalSource,
  EnvironmentalSourcePagination,
  EnvironmentalSourceRecord,
} from "./environmentalSources.types.js";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const toEnvironmentalSource = (row: EnvironmentalSourceRecord): EnvironmentalSource => {
  return {
    sourceId: row.id,
    name: row.name,
    sourceType: row.sourceType,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceMeters: row.distanceMeters,
    osmTags: isRecord(row.osmTags) ? row.osmTags : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    descriptor: "potential environmental pressure source",
  };
};

export const buildPagination = (limit: number, offset: number, total: number): EnvironmentalSourcePagination => {
  return {
    limit,
    offset,
    total,
  };
};
