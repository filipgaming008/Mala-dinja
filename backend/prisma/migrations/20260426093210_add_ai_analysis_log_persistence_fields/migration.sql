/*
  Warnings:

  - You are about to drop the column `modelName` on the `AiAnalysisLog` table. All the data in the column will be lost.
  - You are about to drop the column `promptData` on the `AiAnalysisLog` table. All the data in the column will be lost.
  - You are about to drop the column `responseData` on the `AiAnalysisLog` table. All the data in the column will be lost.
  - You are about to drop the column `usageData` on the `AiAnalysisLog` table. All the data in the column will be lost.
  - Added the required column `inputJson` to the `AiAnalysisLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `AiAnalysisLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `promptVersion` to the `AiAnalysisLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `AiAnalysisLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "AiAnalysisLog" DROP COLUMN "modelName",
DROP COLUMN "promptData",
DROP COLUMN "responseData",
DROP COLUMN "usageData",
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "inputJson" JSONB NOT NULL,
ADD COLUMN     "model" TEXT NOT NULL,
ADD COLUMN     "outputJson" JSONB,
ADD COLUMN     "promptVersion" TEXT NOT NULL,
ADD COLUMN     "status" "AiAnalysisStatus" NOT NULL;
