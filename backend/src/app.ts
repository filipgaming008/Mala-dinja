import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { corsOptions, helmetOptions, rateLimitOptions } from "./config/security.js";
import { errorHandler, notFoundHandler } from "./shared/errors/errorHandler.js";
import { requestContextMiddleware } from "./shared/middleware/requestContext.middleware.js";
import { requestLoggerMiddleware } from "./shared/middleware/requestLogger.middleware.js";
import { healthRouter } from "./routes/health.routes.js";
import { v1Router } from "./routes/v1.js";

export const buildApp = () => {
  const app = express();

  app.use(helmet(helmetOptions));
  app.use(cors(corsOptions));
  app.use(rateLimit(rateLimitOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);

  app.use("/health", healthRouter);
  app.use("/api/v1", v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info("App initialized", { env: env.NODE_ENV });

  return app;
};
