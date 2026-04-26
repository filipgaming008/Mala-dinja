import { Router } from "express";
import { asyncRoute } from "../shared/http/asyncRoute.js";
import { ok } from "../shared/http/apiResponse.js";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    return ok(res, {
      status: "ok",
    });
  }),
);
