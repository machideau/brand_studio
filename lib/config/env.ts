import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_USER_ID: z.coerce.number(),
  RODIUMAI_API_KEY: z.string().min(1),
  RODIUMAI_BASE_URL: z.string().url(),
  INNGEST_SIGNING_KEY: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  SPEND_CAP_RODI: z.coerce.number(),
  MAX_RETRIES: z.coerce.number().int(),
  FILE_TTR_HOURS: z.coerce.number().int(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `[env] Missing or invalid environment variables: ${missing}\n` +
        result.error.issues
          .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
          .join("\n"),
    );
  }

  return result.data;
}

const env: Env = parseEnv();

export default env;
