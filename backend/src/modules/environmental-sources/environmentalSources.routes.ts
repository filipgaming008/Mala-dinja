import { Router } from "express";
import { asyncRoute } from "../../shared/http/asyncRoute.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { environmentalSourcesController } from "./environmentalSources.controller.js";
import {
  getEnvironmentalSourceParamsSchema,
  listEnvironmentalSourcesQuerySchema,
} from "./environmentalSources.validator.js";

export const environmentalSourcesRouter = Router();

environmentalSourcesRouter.get(
  "/",
  validate({ query: listEnvironmentalSourcesQuerySchema }),
  asyncRoute(environmentalSourcesController.listEnvironmentalSources),
);

environmentalSourcesRouter.get(
  "/:sourceId",
  validate({ params: getEnvironmentalSourceParamsSchema }),
  asyncRoute(environmentalSourcesController.getEnvironmentalSourceById),
);
