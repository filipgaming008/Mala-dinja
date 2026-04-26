import type { AnalysisStatus, EnvironmentalSourceType, WaterBodyType } from "@prisma/client";
import type { RiskScoringResult } from "../risk-analysis/riskScoring.types.js";

export type WaterAnalysisBbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type RunWaterAnalysisInput = {
  waterBodyName: string;
  waterBodyType: WaterBodyType;
  countryCode?: string;
  radiusKm: number;
  bbox?: WaterAnalysisBbox;
};

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PotentialSourceInput = {
  osmId?: string;
  osmType?: string;
  name?: string;
  sourceType?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  pollutants?: string[];
  satelliteSignature?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  osmTags?: Record<string, JsonValue>;
  rawData?: Record<string, JsonValue>;
};

export type PythonWaterAnalysisResult = {
  potentialSources?: PotentialSourceInput[];
  environmentalSources?: PotentialSourceInput[];
  [key: string]: JsonValue | PotentialSourceInput[] | undefined;
};

export type PotentialSource = {
  sourceId: string;
  osmId: string | null;
  osmType: string | null;
  name: string | null;
  sourceType: EnvironmentalSourceType;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  osmTags: Record<string, JsonValue> | null;
};

export type WaterAnalysisResult = {
  analysisId: string;
  status: AnalysisStatus;
  waterBody: {
    waterBodyId: string;
    name: string;
    type: WaterBodyType;
    countryCode: string | null;
  };
  potentialSources: PotentialSource[];
  detectedIndicators: Record<string, JsonValue>;
  riskScore: RiskScoringResult | null;
  disclaimer: string;
  raw: Record<string, JsonValue>;
};

export type WaterBodyRecord = {
  id: string;
  name: string;
  type: WaterBodyType;
  countryCode: string | null;
};

export type WaterAnalysisRecord = {
  id: string;
  waterBodyId: string;
  status: AnalysisStatus;
  radiusKm: number;
  resultData: unknown;
  errorData: unknown;
  createdAt: Date;
  updatedAt: Date;
  waterBody: WaterBodyRecord;
  analysisSources: Array<{
    distanceMeters: number | null;
    source: {
      id: string;
      osmId: string | null;
      osmType: string | null;
      name: string | null;
      sourceType: EnvironmentalSourceType;
      latitude: number | null;
      longitude: number | null;
      distanceMeters: number | null;
      osmTags: unknown;
    };
  }>;
};
