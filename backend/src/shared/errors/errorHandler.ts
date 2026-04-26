import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../../config/logger.js";
import { fail } from "../http/apiResponse.js";
import { AppError } from "./AppError.js";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, "NOT_FOUND", "Route not found", { path: req.originalUrl, method: req.method }));
};

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    const validationError = new AppError(400, "VALIDATION_ERROR", "Validation failed", error.flatten());

    return fail(res, validationError.statusCode, validationError.message, {
      code: validationError.code,
      details: validationError.details,
      requestId: req.requestId,
    });
  }

  if (error instanceof AppError) {
    return fail(res, error.statusCode, error.message, {
      code: error.code,
      details: error.details,
      requestId: req.requestId,
    });
  }

  logger.error("Unhandled error", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    error,
  });

  return fail(res, 500, "Internal server error", {
    code: "INTERNAL_SERVER_ERROR",
    requestId: req.requestId,
  });
};
