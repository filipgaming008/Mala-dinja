import { Router } from "express";
import { environmentalSourcesRouter } from "../modules/environmental-sources/environmentalSources.routes.js";
import { riskReportsRouter } from "../modules/risk-reports/riskReports.routes.js";
import { waterBodiesRouter } from "../modules/water-bodies/waterBodies.routes.js";
import { waterAnalysisRouter } from "../modules/water-analysis/waterAnalysis.routes.js";
import { asyncRoute } from "../shared/http/asyncRoute.js";
import { ok } from "../shared/http/apiResponse.js";

export const v1Router = Router();

v1Router.get(
  "/",
  asyncRoute(async (_req, res) => {
    return ok(res, {
      message: "v1 API root",
    });
  }),
);

v1Router.use("/environmental-sources", environmentalSourcesRouter);
v1Router.use("/risk-reports", riskReportsRouter);
v1Router.use("/water-bodies", waterBodiesRouter);
v1Router.use("/water-analysis", waterAnalysisRouter);
