/*
  Warnings:

  - A unique constraint covering the columns `[osmId,osmType]` on the table `EnvironmentalSource` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "EnvironmentalSource" ADD COLUMN     "osmType" TEXT;

-- CreateIndex
CREATE INDEX "EnvironmentalSource_osmType_idx" ON "EnvironmentalSource"("osmType");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentalSource_osmId_osmType_key" ON "EnvironmentalSource"("osmId", "osmType");
