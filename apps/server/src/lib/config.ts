import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  DEEPSEEK_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  LLM_MODEL: z.string().min(1).default("deepseek-chat"),
  ALLOWED_WEB_PROTOCOLS: z.string().default("http,https"),
  WEB_FETCH_TIMEOUT_MS: z.coerce.number().default(12000)
});

export const env = envSchema.parse(process.env);
