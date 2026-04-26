import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const app = buildApp();

app.listen(env.PORT, () => {
  logger.info("AI integration config", {
    AI_PROVIDER: env.AI_PROVIDER,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_API_KEY_CONFIGURED: Boolean(env.OPENAI_API_KEY),
  });

  logger.info("Backend server is running", {
    env: env.NODE_ENV,
    port: env.PORT,
    url: `http://localhost:${env.PORT}`,
  });
});
