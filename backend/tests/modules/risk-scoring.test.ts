import { describe, expect, it } from "vitest";
import { calculateRiskScore } from "../../src/modules/risk-analysis/riskScoring.service.js";

describe("risk scoring engine", () => {
  it("low risk no indicators", () => {
    const result = calculateRiskScore({
      radiusKm: 5,
      detectedIndicators: {},
      potentialSources: [],
    });

    expect(result.level).toBe("LOW");
    expect(result.score).toBeLessThan(25);
    expect(result.confidenceScore).toBeLessThan(0.8);
  });

  it("high turbidity + nearby high-risk source", () => {
    const result = calculateRiskScore({
      radiusKm: 1,
      detectedIndicators: {
        turbidityScore: 90,
        chlorophyllScore: 65,
      },
      potentialSources: [
        {
          sourceType: "FACTORY",
          distanceMeters: 120,
          riskLevel: "HIGH",
          pollutants: ["suspended solids"],
          satelliteSignature: "turbidity plume",
        },
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(["HIGH", "VERY_HIGH"]).toContain(result.level);
  });

  it("many medium sources apply capped total contribution", () => {
    const sources = Array.from({ length: 12 }).map((_, index) => ({
      sourceType: `SOURCE_${index}`,
      distanceMeters: 500 + index * 20,
      riskLevel: "MEDIUM" as const,
      pollutants: ["nutrients"],
      satelliteSignature: "possible runoff",
    }));

    const result = calculateRiskScore({
      radiusKm: 2,
      detectedIndicators: {
        chlorophyllScore: 40,
      },
      potentialSources: sources,
    });

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors.some((factor) => factor.code === "SRC_CAP")).toBe(true);
  });

  it("missing data reduces confidence", () => {
    const result = calculateRiskScore({
      radiusKm: 3,
      detectedIndicators: {
        turbidityScore: 20,
      },
      potentialSources: [
        {
          sourceType: "UNKNOWN_SITE",
          riskLevel: "MEDIUM",
        },
      ],
    });

    expect(result.confidenceScore).toBeLessThan(0.8);
  });
});
