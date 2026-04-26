import { EnvironmentalSourceType } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError.js";
import type { RiskScoringResult } from "../risk-analysis/riskScoring.types.js";
import type {
  JsonValue,
  PotentialSource,
  PotentialSourceInput,
  PythonWaterAnalysisResult,
  RunWaterAnalysisInput,
  WaterAnalysisRecord,
  WaterAnalysisResult,
} from "./waterAnalysis.types.js";

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }

  return false;
};

export const buildWaterAnalysisPythonArgs = (input: RunWaterAnalysisInput): string[] => {
  const args = [
    "--water-body-name",
    input.waterBodyName,
    "--radius-km",
    String(input.radiusKm),
    "--water-body-type",
    input.waterBodyType,
  ];

  if (input.countryCode) {
    args.push("--country-code", input.countryCode);
  }

  if (input.bbox) {
    args.push("--bbox", JSON.stringify(input.bbox));
  }

  return args;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const toPythonWaterAnalysisResult = (value: unknown): PythonWaterAnalysisResult => {
  if (!isJsonValue(value)) {
    throw new AppError(500, "PYTHON_OUTPUT_NOT_JSON_VALUE", "Python output contains non-JSON values");
  }

  if (!isRecord(value)) {
    throw new AppError(500, "PYTHON_OUTPUT_INVALID_SHAPE", "Python output must be a JSON object");
  }

  return value as PythonWaterAnalysisResult;
};

const sourceTypeAliasMap: Record<string, EnvironmentalSourceType> = {
  FACTORY: EnvironmentalSourceType.FACTORY,
  FARM: EnvironmentalSourceType.FARM,
  CONSTRUCTION: EnvironmentalSourceType.CONSTRUCTION,
  WASTEWATER: EnvironmentalSourceType.WASTEWATER,
  INDUSTRIAL_BUILDING: EnvironmentalSourceType.INDUSTRIAL_BUILDING,
  UNKNOWN: EnvironmentalSourceType.UNKNOWN,
};

export const toEnvironmentalSourceType = (value: string | undefined): EnvironmentalSourceType => {
  if (!value) {
    return EnvironmentalSourceType.UNKNOWN;
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  return sourceTypeAliasMap[normalized] ?? EnvironmentalSourceType.UNKNOWN;
};

export const getPotentialSourceInputs = (result: PythonWaterAnalysisResult): PotentialSourceInput[] => {
  const candidates = result.potentialSources ?? result.environmentalSources ?? [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.filter((item) => isRecord(item)) as PotentialSourceInput[];
};

const toJsonRecord = (value: unknown): Record<string, JsonValue> | null => {
  if (!isRecord(value) || !isJsonValue(value)) {
    return null;
  }

  return value as Record<string, JsonValue>;
};

export const toPotentialSource = (record: WaterAnalysisRecord["analysisSources"][number]["source"]): PotentialSource => {
  return {
    sourceId: record.id,
    osmId: record.osmId,
    osmType: record.osmType,
    name: record.name,
    sourceType: record.sourceType,
    latitude: record.latitude,
    longitude: record.longitude,
    distanceMeters: record.distanceMeters,
    osmTags: toJsonRecord(record.osmTags),
  };
};

export const toWaterAnalysisResult = (record: WaterAnalysisRecord): WaterAnalysisResult => {
  const raw = toJsonRecord(record.resultData) ?? {};
  const detectedIndicators =
    typeof raw.detectedIndicators === "object" && raw.detectedIndicators !== null && !Array.isArray(raw.detectedIndicators)
      ? (raw.detectedIndicators as Record<string, JsonValue>)
      : {};

  const riskScoreCandidate = raw.deterministicRiskScore;
  const riskScore =
    typeof riskScoreCandidate === "object" && riskScoreCandidate !== null && !Array.isArray(riskScoreCandidate)
      ? (riskScoreCandidate as unknown as RiskScoringResult)
      : null;

  return {
    analysisId: record.id,
    status: record.status,
    waterBody: {
      waterBodyId: record.waterBody.id,
      name: record.waterBody.name,
      type: record.waterBody.type,
      countryCode: record.waterBody.countryCode,
    },
    potentialSources: record.analysisSources.map((join) => toPotentialSource(join.source)),
    detectedIndicators,
    riskScore,
    disclaimer: "This analysis is decision-support only. It does not assign legal responsibility and requires field verification.",
    raw,
  };
};
