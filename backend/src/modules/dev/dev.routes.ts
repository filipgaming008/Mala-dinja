import { Router } from "express";
import { AnalysisStatus, RiskLevel, WaterBodyType } from "@prisma/client";
import { env } from "../../config/env.js";
import { AiFullReportSchema } from "../../shared/ai/aiSchemas.js";
import { generateFullReportTransient, resolveAiProviderConfig } from "../../shared/ai/aiClient.js";
import { asyncRoute } from "../../shared/http/asyncRoute.js";
import { AppError } from "../../shared/errors/AppError.js";
import { prisma } from "../../shared/prisma/prismaClient.js";
import { calculateRiskScore } from "../risk-analysis/riskScoring.service.js";
import { generateFullReport } from "../../shared/ai/aiClient.js";

export const devRouter = Router();

const DEMO_BBOX = {
  south: 41.75,
  west: 22.15,
  north: 41.97,
  east: 22.8,
};

const DEMO_DETECTED_INDICATORS = {
  turbidityScore: 74,
  chlorophyllScore: 58,
  suspendedMatterScore: 69,
  temperatureAnomaly: 1.4,
};

const DEMO_SOURCES = [
  {
    osmId: "demo-factory-1",
    osmType: "way",
    name: "Demo Textile Facility",
    sourceType: "FACTORY" as const,
    latitude: 41.89,
    longitude: 22.47,
    distanceMeters: 850,
    riskLevel: "HIGH" as const,
    pollutants: ["dyes", "surfactants", "organic load"],
    osmTags: {
      building: "industrial",
      industrial: "textile",
    },
  },
  {
    osmId: "demo-farm-1",
    osmType: "way",
    name: "Demo Farm Area",
    sourceType: "FARM" as const,
    latitude: 41.91,
    longitude: 22.52,
    distanceMeters: 1400,
    riskLevel: "MEDIUM" as const,
    pollutants: ["nitrates", "phosphates", "sediment runoff"],
    osmTags: {
      landuse: "farmland",
    },
  },
  {
    osmId: "demo-construction-1",
    osmType: "node",
    name: "Demo Construction Site",
    sourceType: "CONSTRUCTION" as const,
    latitude: 41.87,
    longitude: 22.44,
    distanceMeters: 920,
    riskLevel: "MEDIUM" as const,
    pollutants: ["sediment runoff"],
    osmTags: {
      landuse: "construction",
    },
  },
];

const ensureDevRoute = () => {
  if (env.NODE_ENV === "production") {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }
};

devRouter.get(
  "/ai-health",
  asyncRoute(async (_req, res) => {
    ensureDevRoute();

    const providerConfig = resolveAiProviderConfig();
    if (providerConfig.provider === "OPENAI" && !providerConfig.keyConfigured) {
      throw new AppError(500, "OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is required when AI_PROVIDER=OPENAI");
    }

    const sample = await generateFullReportTransient({
      analysisId: "dev-ai-health-check",
      score: 68,
      level: "HIGH",
      confidenceScore: 0.72,
      riskExplanation:
        "Deterministic backend score is 68 (HIGH) with confidence 0.72. This may indicate risk correlation and requires field verification.",
      detectedSignals: ["Elevated turbidity proxy", "Nearby potential pressure sources"],
      potentialEnvironmentalPressureSources: [
        "Demo Textile Facility (FACTORY, 850m)",
        "Demo Farm Area (FARM, 1400m)",
      ],
      longTermImpactContext: {
        oneYear: "Potential localized stress may indicate short-term water-quality variability; field verification required.",
        fiveYears: "If recurring patterns persist, risk correlation could remain elevated in seasonal windows.",
        tenYears: "Long-term pressure may indicate resilience concerns without mitigation and monitoring.",
        fiftyYears: "Very long-range outcomes are uncertain and require periodic reassessment.",
      },
      recommendationsContext: [
        "Prioritize source-agnostic field sampling near observed indicator anomalies.",
        "Coordinate preventive runoff and discharge-control reviews with nearby operators.",
      ],
      verificationContext: [
        "Collect upstream and downstream reference samples.",
        "Compare field observations against satellite-observable indicators.",
      ],
      mitigationContext: [
        "Improve containment and housekeeping controls in industrial handling areas.",
        "Strengthen nutrient and sediment runoff controls in agricultural zones.",
      ],
    });

    const parsed = AiFullReportSchema.parse(sample);

    return res.status(200).json({
      ok: true,
      provider: providerConfig.provider,
      model: providerConfig.model,
      schemaValid: true,
      sample: parsed,
    });
  }),
);

devRouter.post(
  "/full-workflow-test",
  asyncRoute(async (_req, res) => {
    ensureDevRoute();

    const waterBody =
      (await prisma.waterBody.findFirst({
        where: {
          name: "Demo Bregalnica Segment",
          type: WaterBodyType.RIVER,
          countryCode: "MK",
        },
      })) ??
      (await prisma.waterBody.create({
        data: {
          name: "Demo Bregalnica Segment",
          type: WaterBodyType.RIVER,
          countryCode: "MK",
          bbox: DEMO_BBOX,
          metadata: {
            source: "dev_full_workflow_test",
          },
        },
      }));

    const analysis = await prisma.waterAnalysis.create({
      data: {
        waterBodyId: waterBody.id,
        status: AnalysisStatus.COMPLETED,
        radiusKm: 2,
        requestPayload: {
          mode: "dev_full_workflow_test",
          waterBodyName: waterBody.name,
        },
        resultData: {
          detectedIndicators: DEMO_DETECTED_INDICATORS,
        },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const sourceRows = await Promise.all(
      DEMO_SOURCES.map((source) => {
        return prisma.environmentalSource.upsert({
          where: {
            osmId_osmType: {
              osmId: source.osmId,
              osmType: source.osmType,
            },
          },
          update: {
            name: source.name,
            sourceType: source.sourceType,
            latitude: source.latitude,
            longitude: source.longitude,
            countryCode: "MK",
            distanceMeters: source.distanceMeters,
            osmTags: source.osmTags,
            rawData: {
              mode: "dev_full_workflow_test",
            },
          },
          create: {
            osmId: source.osmId,
            osmType: source.osmType,
            name: source.name,
            sourceType: source.sourceType,
            latitude: source.latitude,
            longitude: source.longitude,
            countryCode: "MK",
            distanceMeters: source.distanceMeters,
            osmTags: source.osmTags,
            rawData: {
              mode: "dev_full_workflow_test",
            },
          },
        });
      }),
    );

    await prisma.waterAnalysisSource.createMany({
      data: sourceRows.map((row) => {
        const source = DEMO_SOURCES.find((item) => item.osmId === row.osmId && item.osmType === row.osmType);
        return {
          analysisId: analysis.id,
          sourceId: row.id,
          distanceMeters: source?.distanceMeters ?? row.distanceMeters,
          metadata: {
            mode: "dev_full_workflow_test",
          },
        };
      }),
      skipDuplicates: true,
    });

    const riskScore = calculateRiskScore({
      detectedIndicators: DEMO_DETECTED_INDICATORS,
      potentialSources: DEMO_SOURCES.map((source) => ({
        sourceType: source.sourceType,
        distanceMeters: source.distanceMeters,
        riskLevel: source.riskLevel,
      })),
      radiusKm: 2,
    });

    const aiReport = await generateFullReport({
      analysisId: analysis.id,
      score: riskScore.score,
      level: riskScore.level,
      confidenceScore: riskScore.confidenceScore,
      riskExplanation:
        "Deterministic backend score indicates elevated risk correlation from provided indicators and nearby potential environmental pressure sources; field verification required.",
      detectedSignals: ["Elevated turbidity proxy", "Nearby potential pressure sources"],
      potentialEnvironmentalPressureSources: DEMO_SOURCES.map(
        (source) => `${source.name} (${source.sourceType}, ${source.distanceMeters}m)`,
      ),
      longTermImpactContext: {
        oneYear: "Potential short-term water-quality stress may indicate localized variability.",
        fiveYears: "Recurring patterns could remain elevated if prevention controls are not strengthened.",
        tenYears: "Sustained pressure may indicate cumulative ecosystem stress and higher intervention costs.",
        fiftyYears: "Very long-term outcomes remain uncertain and require periodic reassessment.",
      },
      recommendationsContext: [
        "Run targeted field sampling upstream and downstream of the observed corridor.",
        "Coordinate preventive monitoring with local operators and municipalities.",
      ],
      verificationContext: [
        "Collect reference and hotspot samples for laboratory validation.",
        "Cross-check field observations with satellite-observable indicators.",
      ],
      mitigationContext: [
        "Improve industrial handling and containment controls where relevant.",
        "Strengthen nutrient and sediment runoff controls in agricultural areas.",
      ],
    });

    const riskReport = await prisma.riskReport.create({
      data: {
        analysisId: analysis.id,
        riskLevel: riskScore.level as RiskLevel,
        summary: aiReport.executiveSummary,
        riskFactors: {
          confidenceScore: riskScore.confidenceScore,
          riskExplanation: aiReport.riskOverview.explanation,
          longTermImpact: aiReport.longTermImpact,
          verificationPlan: aiReport.verificationPlan,
          mitigationPlan: aiReport.mitigationPlan,
          disclaimer: aiReport.disclaimer,
        },
        recommendations: aiReport.recommendedActions,
        rawData: {
          aiFullReport: aiReport,
          deterministicRiskScore: riskScore,
          potentialSources: DEMO_SOURCES,
          mode: "dev_full_workflow_test",
        },
      },
    });

    const aiLog = await prisma.aiAnalysisLog.findFirst({
      where: { analysisId: analysis.id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      waterBody: {
        id: waterBody.id,
        name: waterBody.name,
        type: waterBody.type,
        countryCode: waterBody.countryCode,
        bbox: waterBody.bbox,
      },
      analysis: {
        id: analysis.id,
        status: analysis.status,
        radiusKm: analysis.radiusKm,
        resultData: analysis.resultData,
        createdAt: analysis.createdAt,
      },
      potentialSources: DEMO_SOURCES,
      riskScore,
      aiReport,
      dbRecords: {
        waterBodyId: waterBody.id,
        analysisId: analysis.id,
        riskReportId: riskReport.id,
        aiAnalysisLogId: aiLog?.id ?? null,
      },
    });
  }),
);
