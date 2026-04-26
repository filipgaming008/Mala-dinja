import { WaterBodyType } from "@prisma/client";
import { z } from "zod";

const bboxSchema = z
  .object({
    south: z.number().min(-90).max(90),
    west: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
  })
  .refine((bbox) => bbox.south < bbox.north, {
    message: "bbox south must be smaller than north",
    path: ["south"],
  })
  .refine((bbox) => bbox.west < bbox.east, {
    message: "bbox west must be smaller than east",
    path: ["west"],
  });

export const runWaterAnalysisBodySchema = z.object({
  waterBodyName: z.string().trim().min(1).max(160),
  waterBodyType: z.nativeEnum(WaterBodyType),
  countryCode: z.string().trim().toUpperCase().length(2).optional(),
  radiusKm: z.number().min(0.5).max(5),
  bbox: bboxSchema.optional(),
});

export const getWaterAnalysisParamsSchema = z.object({
  analysisId: z.string().cuid(),
});
