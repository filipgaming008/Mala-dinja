import type { EnvironmentalSourceType, RiskLevel } from "@prisma/client";

export type EnvironmentalSourceBbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type EnvironmentalSource = {
  sourceId: string;
  name: string | null;
  sourceType: EnvironmentalSourceType;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  osmTags: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  descriptor: string;
};

export type EnvironmentalSourceRecord = {
  id: string;
  name: string | null;
  sourceType: EnvironmentalSourceType;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  osmTags: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type ListEnvironmentalSourcesQuery = {
  limit: number;
  offset: number;
  sourceType?: EnvironmentalSourceType;
  riskLevel?: RiskLevel;
  bbox?: EnvironmentalSourceBbox;
  search?: string;
};

export type EnvironmentalSourcePagination = {
  limit: number;
  offset: number;
  total: number;
};

export type EnvironmentalSourceListResult = {
  items: EnvironmentalSource[];
  pagination: EnvironmentalSourcePagination;
};
