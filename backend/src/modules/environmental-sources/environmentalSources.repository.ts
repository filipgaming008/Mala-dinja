import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma/prismaClient.js";
import type {
  EnvironmentalSourceRecord,
  ListEnvironmentalSourcesQuery,
} from "./environmentalSources.types.js";

const buildWhere = (query: ListEnvironmentalSourcesQuery) => {
  const andConditions: Prisma.EnvironmentalSourceWhereInput[] = [];

  if (query.bbox) {
    andConditions.push({
      latitude: {
        gte: query.bbox.south,
        lte: query.bbox.north,
      },
    });

    andConditions.push({
      longitude: {
        gte: query.bbox.west,
        lte: query.bbox.east,
      },
    });
  }

  if (query.search) {
    andConditions.push({
      OR: [
        {
          name: {
            contains: query.search,
            mode: "insensitive",
          },
        },
        {
          osmId: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (query.riskLevel) {
    andConditions.push({
      analysisSources: {
        some: {
          analysis: {
            riskReports: {
              some: {
                riskLevel: query.riskLevel,
              },
            },
          },
        },
      },
    });
  }

  return {
    sourceType: query.sourceType,
    AND: andConditions,
  } satisfies Prisma.EnvironmentalSourceWhereInput;
};

const list = async (query: ListEnvironmentalSourcesQuery) => {
  const where = buildWhere(query);

  const [rows, total] = await Promise.all([
    prisma.environmentalSource.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: query.limit,
      skip: query.offset,
      select: {
        id: true,
        name: true,
        sourceType: true,
        latitude: true,
        longitude: true,
        distanceMeters: true,
        osmTags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.environmentalSource.count({ where }),
  ]);

  return {
    rows: rows as EnvironmentalSourceRecord[],
    total,
  };
};

const findById = async (sourceId: string) => {
  const row = await prisma.environmentalSource.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      name: true,
      sourceType: true,
      latitude: true,
      longitude: true,
      distanceMeters: true,
      osmTags: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (row as EnvironmentalSourceRecord | null) ?? null;
};

export const environmentalSourcesRepository = {
  list,
  findById,
};
