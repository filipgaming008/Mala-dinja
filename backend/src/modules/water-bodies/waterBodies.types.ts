import type { WaterBodyType } from "@prisma/client";

export type WaterBodyBbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type WaterBody = {
  waterBodyId: string;
  name: string;
  type: WaterBodyType;
  countryCode: string | null;
  osmId: string | null;
  bbox: WaterBodyBbox | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type WaterBodyRecord = {
  id: string;
  name: string;
  type: WaterBodyType;
  countryCode: string | null;
  osmId: string | null;
  bbox: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type ListWaterBodiesQuery = {
  limit: number;
  offset: number;
  type?: WaterBodyType;
  countryCode?: string;
};

export type CreateWaterBodyInput = {
  name: string;
  type: WaterBodyType;
  countryCode?: string;
  osmId?: string;
  bbox?: WaterBodyBbox;
  metadata?: Record<string, unknown>;
};

export type WaterBodiesListResult = {
  items: WaterBody[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};
