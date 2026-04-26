import { Router } from "express";
import { asyncRoute } from "../../shared/http/asyncRoute.js";
import { validate } from "../../shared/middleware/validate.middleware.js";
import { waterBodiesController } from "./waterBodies.controller.js";
import {
  createWaterBodyBodySchema,
  getWaterBodyParamsSchema,
  listWaterBodiesQuerySchema,
} from "./waterBodies.validator.js";

export const waterBodiesRouter = Router();

waterBodiesRouter.get(
  "/",
  validate({ query: listWaterBodiesQuerySchema }),
  asyncRoute(waterBodiesController.listWaterBodies),
);

waterBodiesRouter.post(
  "/",
  validate({ body: createWaterBodyBodySchema }),
  asyncRoute(waterBodiesController.createWaterBody),
);

waterBodiesRouter.get(
  "/:waterBodyId",
  validate({ params: getWaterBodyParamsSchema }),
  asyncRoute(waterBodiesController.getWaterBodyById),
);
