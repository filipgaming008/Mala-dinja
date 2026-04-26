import { EnvironmentalSourceType, RiskLevel } from "@prisma/client";
import { z } from "zod";

export const listEnvironmentalSourcesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sourceType: z.nativeEnum(EnvironmentalSourceType).optional(),
  riskLevel: z.nativeEnum(RiskLevel).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
})
  .superRefine((query, context) => {
    const coordinates = [query.south, query.west, query.north, query.east];
    const presentCount = coordinates.filter((value) => value !== undefined).length;

    if (presentCount !== 0 && presentCount !== 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bbox filter requires south, west, north, and east together",
      });
      return;
    }

    if (presentCount === 4 && query.south !== undefined && query.north !== undefined && query.south >= query.north) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "south must be smaller than north",
        path: ["south"],
      });
    }

    if (presentCount === 4 && query.west !== undefined && query.east !== undefined && query.west >= query.east) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "west must be smaller than east",
        path: ["west"],
      });
    }
  })
  .transform((query) => {
    const bbox =
      query.south === undefined ||
      query.west === undefined ||
      query.north === undefined ||
      query.east === undefined
        ? undefined
        : {
            south: query.south,
            west: query.west,
            north: query.north,
            east: query.east,
          };

    return {
      limit: query.limit,
      offset: query.offset,
      sourceType: query.sourceType,
      riskLevel: query.riskLevel,
      search: query.search,
      bbox,
    };
  });

export const getEnvironmentalSourceParamsSchema = z.object({
  sourceId: z.string().cuid(),
});
