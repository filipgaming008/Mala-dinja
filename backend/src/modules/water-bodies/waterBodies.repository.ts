import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma/prismaClient.js";
import type {
  CreateWaterBodyInput,
  ListWaterBodiesQuery,
  WaterBodyRecord,
} from "./waterBodies.types.js";

const selectShape = {
  id: true,
  name: true,
  type: true,
  countryCode: true,
  osmId: true,
  bbox: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

const list = async (query: ListWaterBodiesQuery) => {
  const where = {
    type: query.type,
    countryCode: query.countryCode,
  };

  const [rows, total] = await Promise.all([
    prisma.waterBody.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: query.limit,
      skip: query.offset,
      select: selectShape,
    }),
    prisma.waterBody.count({ where }),
  ]);

  return {
    rows: rows as WaterBodyRecord[],
    total,
  };
};

const create = async (input: CreateWaterBodyInput) => {
  const row = await prisma.waterBody.create({
    data: {
      name: input.name,
      type: input.type,
      countryCode: input.countryCode,
      osmId: input.osmId,
      bbox: input.bbox as Prisma.InputJsonValue | undefined,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
    select: selectShape,
  });

  return row as WaterBodyRecord;
};

const findById = async (waterBodyId: string) => {
  const row = await prisma.waterBody.findUnique({
    where: { id: waterBodyId },
    select: selectShape,
  });

  return (row as WaterBodyRecord | null) ?? null;
};

export const waterBodiesRepository = {
  list,
  create,
  findById,
};
