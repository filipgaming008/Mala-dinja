import { resolve } from "node:path";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../config/env.js";
import { calculateRiskScore } from "../risk-analysis/riskScoring.service.js";
import { runPythonJson } from "../../shared/python/pythonRunner.js";
import {
  buildWaterAnalysisPythonArgs,
  getPotentialSourceInputs,
  toPythonWaterAnalysisResult,
  toWaterAnalysisResult,
} from "./waterAnalysis.helpers.js";
import { waterAnalysisRepository } from "./waterAnalysis.repository.js";
import type { RunWaterAnalysisInput, WaterAnalysisResult } from "./waterAnalysis.types.js";

const runWaterAnalysis = async (input: RunWaterAnalysisInput): Promise<WaterAnalysisResult> => {
  const waterBody =
    (await waterAnalysisRepository.findWaterBodyByIdentity(input)) ??
    (await waterAnalysisRepository.createWaterBody(input));

  const analysis = await waterAnalysisRepository.createRunningAnalysis(waterBody.id, input);

  const scriptPath = resolve(process.cwd(), env.PYTHON_WATER_ANALYSIS_SCRIPT);
  const args = buildWaterAnalysisPythonArgs(input);

  try {
    const pythonRaw = await runPythonJson({
      scriptPath,
      args,
      timeoutMs: env.PYTHON_RUNNER_TIMEOUT_MS,
    });

    const pythonResult = toPythonWaterAnalysisResult(pythonRaw);
    await waterAnalysisRepository.upsertPotentialSources(analysis.id, pythonResult);

    const sourceInputs = getPotentialSourceInputs(pythonResult);
    const detectedIndicators =
      typeof pythonResult.detectedIndicators === "object" &&
      pythonResult.detectedIndicators !== null &&
      !Array.isArray(pythonResult.detectedIndicators)
        ? (pythonResult.detectedIndicators as Record<string, unknown>)
        : {};

    const riskScore = calculateRiskScore({
      detectedIndicators: {
        turbidityScore:
          typeof detectedIndicators.turbidityScore === "number" ? detectedIndicators.turbidityScore : undefined,
        chlorophyllScore:
          typeof detectedIndicators.chlorophyllScore === "number" ? detectedIndicators.chlorophyllScore : undefined,
        suspendedMatterScore:
          typeof detectedIndicators.suspendedMatterScore === "number"
            ? detectedIndicators.suspendedMatterScore
            : undefined,
        temperatureAnomaly:
          typeof detectedIndicators.temperatureAnomaly === "number" ? detectedIndicators.temperatureAnomaly : undefined,
      },
      potentialSources: sourceInputs.map((source) => ({
        sourceType: source.sourceType ?? "UNKNOWN",
        distanceMeters: source.distanceMeters,
        riskLevel: source.riskLevel,
        pollutants: source.pollutants,
        satelliteSignature: source.satelliteSignature,
      })),
      radiusKm: input.radiusKm,
    });

    const completed = await waterAnalysisRepository.markAnalysisCompleted(analysis.id, {
      ...pythonResult,
      deterministicRiskScore: riskScore,
    });

    return toWaterAnalysisResult(completed);
  } catch (error) {
    const details = error instanceof Error ? { message: error.message } : { message: "unknown_error" };
    await waterAnalysisRepository.markAnalysisFailed(analysis.id, details);

    throw new AppError(
      500,
      "WATER_ANALYSIS_FAILED",
      "Water analysis failed. Field verification required before conclusions.",
    );
  }
};

const getWaterAnalysisById = async (analysisId: string): Promise<WaterAnalysisResult> => {
  const row = await waterAnalysisRepository.findAnalysisById(analysisId);

  if (!row) {
    throw new AppError(404, "WATER_ANALYSIS_NOT_FOUND", "Water analysis not found", { analysisId });
  }

  return toWaterAnalysisResult(row);
};

export const waterAnalysisService = {
  runWaterAnalysis,
  getWaterAnalysisById,
};
