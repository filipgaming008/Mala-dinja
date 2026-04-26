import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  JSON_BODY_LIMIT: z.string().default("1mb"),
  PYTHON_WATER_ANALYSIS_SCRIPT: z.string().default("python/water_sources_worker.py"),
  PYTHON_RUNNER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_PROVIDER: z.enum(["MOCK", "OPENAI"]).default("MOCK"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  DATABASE_URL: z.string().min(1),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
