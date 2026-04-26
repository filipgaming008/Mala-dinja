-- CreateEnum
CREATE TYPE "WaterBodyType" AS ENUM ('RIVER', 'LAKE', 'RESERVOIR', 'COASTAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EnvironmentalSourceType" AS ENUM ('FACTORY', 'FARM', 'CONSTRUCTION', 'WASTEWATER', 'INDUSTRIAL_BUILDING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'MOCK');

-- CreateTable
CREATE TABLE "WaterBody" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WaterBodyType" NOT NULL DEFAULT 'UNKNOWN',
    "countryCode" TEXT,
    "osmId" TEXT,
    "bbox" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentalSource" (
    "id" TEXT NOT NULL,
    "osmId" TEXT,
    "name" TEXT,
    "sourceType" "EnvironmentalSourceType" NOT NULL DEFAULT 'UNKNOWN',
    "countryCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "tags" JSONB,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterAnalysis" (
    "id" TEXT NOT NULL,
    "waterBodyId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "resultData" JSONB,
    "errorData" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterAnalysisSource" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterAnalysisSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskReport" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "summary" TEXT,
    "riskFactors" JSONB,
    "recommendations" JSONB,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysisLog" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'MOCK',
    "modelName" TEXT,
    "promptData" JSONB,
    "responseData" JSONB,
    "usageData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysisLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaterBody_osmId_idx" ON "WaterBody"("osmId");

-- CreateIndex
CREATE INDEX "EnvironmentalSource_osmId_idx" ON "EnvironmentalSource"("osmId");

-- CreateIndex
CREATE INDEX "WaterAnalysis_waterBodyId_idx" ON "WaterAnalysis"("waterBodyId");

-- CreateIndex
CREATE INDEX "WaterAnalysisSource_analysisId_idx" ON "WaterAnalysisSource"("analysisId");

-- CreateIndex
CREATE INDEX "WaterAnalysisSource_sourceId_idx" ON "WaterAnalysisSource"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WaterAnalysisSource_analysisId_sourceId_key" ON "WaterAnalysisSource"("analysisId", "sourceId");

-- CreateIndex
CREATE INDEX "RiskReport_analysisId_idx" ON "RiskReport"("analysisId");

-- CreateIndex
CREATE INDEX "AiAnalysisLog_analysisId_idx" ON "AiAnalysisLog"("analysisId");

-- AddForeignKey
ALTER TABLE "WaterAnalysis" ADD CONSTRAINT "WaterAnalysis_waterBodyId_fkey" FOREIGN KEY ("waterBodyId") REFERENCES "WaterBody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterAnalysisSource" ADD CONSTRAINT "WaterAnalysisSource_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "WaterAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterAnalysisSource" ADD CONSTRAINT "WaterAnalysisSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EnvironmentalSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskReport" ADD CONSTRAINT "RiskReport_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "WaterAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysisLog" ADD CONSTRAINT "AiAnalysisLog_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "WaterAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
