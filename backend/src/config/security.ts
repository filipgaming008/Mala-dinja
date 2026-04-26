import type { CorsOptions } from "cors";
import type { HelmetOptions } from "helmet";
import type { Options as RateLimitOptions } from "express-rate-limit";
import { env } from "./env.js";

export const helmetOptions: HelmetOptions = {
  crossOriginResourcePolicy: { policy: "cross-origin" },
};

export const corsOptions: CorsOptions = {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
  credentials: true,
};

export const rateLimitOptions: Partial<RateLimitOptions> = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,
};
