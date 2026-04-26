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

export const listWaterBodiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.nativeEnum(WaterBodyType).optional(),
  countryCode: z.string().trim().toUpperCase().length(2).optional(),
});

export const createWaterBodyBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.nativeEnum(WaterBodyType).default(WaterBodyType.UNKNOWN),
  countryCode: z.string().trim().toUpperCase().length(2).optional(),
  osmId: z.string().trim().min(1).max(128).optional(),
  bbox: bboxSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const getWaterBodyParamsSchema = z.object({
  waterBodyId: z.string().cuid(),
});
