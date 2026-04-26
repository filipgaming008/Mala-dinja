import { AnalysisStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma/prismaClient.js";
import {
  getPotentialSourceInputs,
  toEnvironmentalSourceType,
} from "./waterAnalysis.helpers.js";
import type {
  PythonWaterAnalysisResult,
  RunWaterAnalysisInput,
  WaterAnalysisRecord,
  WaterBodyRecord,
} from "./waterAnalysis.types.js";

const analysisInclude = {
  waterBody: {
    select: {
      id: true,
      name: true,
      type: true,
      countryCode: true,
    },
  },
  analysisSources: {
    select: {
      distanceMeters: true,
      source: {
        select: {
          id: true,
          osmId: true,
          osmType: true,
          name: true,
          sourceType: true,
          latitude: true,
          longitude: true,
          distanceMeters: true,
          osmTags: true,
        },
      },
    },
  },
} as const;

const findWaterBodyByIdentity = async (input: RunWaterAnalysisInput): Promise<WaterBodyRecord | null> => {
  const row = await prisma.waterBody.findFirst({
    where: {
      name: input.waterBodyName,
      type: input.waterBodyType,
      countryCode: input.countryCode,
    },
    select: {
      id: true,
      name: true,
      type: true,
      countryCode: true,
    },
  });

  return (row as WaterBodyRecord | null) ?? null;
};

const createWaterBody = async (input: RunWaterAnalysisInput): Promise<WaterBodyRecord> => {
  const row = await prisma.waterBody.create({
    data: {
      name: input.waterBodyName,
      type: input.waterBodyType,
      countryCode: input.countryCode,
      bbox: input.bbox as Prisma.InputJsonValue | undefined,
    },
    select: {
      id: true,
      name: true,
      type: true,
      countryCode: true,
    },
  });

  return row as WaterBodyRecord;
};

const createRunningAnalysis = async (waterBodyId: string, input: RunWaterAnalysisInput) => {
  return prisma.waterAnalysis.create({
    data: {
      waterBodyId,
      status: AnalysisStatus.RUNNING,
      radiusKm: input.radiusKm,
      requestPayload: input as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
    select: {
      id: true,
    },
  });
};

const upsertPotentialSources = async (analysisId: string, pythonResult: PythonWaterAnalysisResult) => {
  const inputs = getPotentialSourceInputs(pythonResult);
  const sourceIds: Array<{ sourceId: string; distanceMeters: number | null }> = [];

  for (const sourceInput of inputs) {
    const sourceType = toEnvironmentalSourceType(sourceInput.sourceType);

    const existing =
      sourceInput.osmId && sourceInput.osmType
        ? await prisma.environmentalSource.findFirst({
            where: {
              osmId: sourceInput.osmId,
              osmType: sourceInput.osmType,
            },
            select: { id: true },
          })
        : null;

    const stored = existing
      ? await prisma.environmentalSource.update({
          where: { id: existing.id },
          data: {
            name: sourceInput.name,
            sourceType,
            latitude: sourceInput.latitude,
            longitude: sourceInput.longitude,
            distanceMeters: sourceInput.distanceMeters,
            osmTags: sourceInput.osmTags as Prisma.InputJsonValue | undefined,
            rawData: sourceInput.rawData as Prisma.InputJsonValue | undefined,
          },
          select: { id: true },
        })
      : await prisma.environmentalSource.create({
          data: {
            osmId: sourceInput.osmId,
            osmType: sourceInput.osmType,
            name: sourceInput.name,
            sourceType,
            latitude: sourceInput.latitude,
            longitude: sourceInput.longitude,
            distanceMeters: sourceInput.distanceMeters,
            osmTags: sourceInput.osmTags as Prisma.InputJsonValue | undefined,
            rawData: sourceInput.rawData as Prisma.InputJsonValue | undefined,
          },
          select: { id: true },
        });

    sourceIds.push({
      sourceId: stored.id,
      distanceMeters: sourceInput.distanceMeters ?? null,
    });
  }

  if (sourceIds.length > 0) {
    await prisma.waterAnalysisSource.createMany({
      data: sourceIds.map((item) => ({
        analysisId,
        sourceId: item.sourceId,
        distanceMeters: item.distanceMeters,
      })),
      skipDuplicates: true,
    });
  }
};

const markAnalysisCompleted = async (analysisId: string, pythonResult: PythonWaterAnalysisResult): Promise<WaterAnalysisRecord> => {
  const row = await prisma.waterAnalysis.update({
    where: { id: analysisId },
    data: {
      status: AnalysisStatus.COMPLETED,
      resultData: pythonResult as Prisma.InputJsonValue,
      errorData: Prisma.JsonNull,
      completedAt: new Date(),
    },
    include: analysisInclude,
  });

  return row as WaterAnalysisRecord;
};

const markAnalysisFailed = async (analysisId: string, errorData: unknown) => {
  await prisma.waterAnalysis.update({
    where: { id: analysisId },
    data: {
      status: AnalysisStatus.FAILED,
      errorData: {
        error: "analysis_failed",
        details: errorData,
      } as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
};

const findAnalysisById = async (analysisId: string): Promise<WaterAnalysisRecord | null> => {
  const row = await prisma.waterAnalysis.findUnique({
    where: { id: analysisId },
    include: analysisInclude,
  });

  return (row as WaterAnalysisRecord | null) ?? null;
};

export const waterAnalysisRepository = {
  findWaterBodyByIdentity,
  createWaterBody,
  createRunningAnalysis,
  upsertPotentialSources,
  markAnalysisCompleted,
  markAnalysisFailed,
  findAnalysisById,
};
