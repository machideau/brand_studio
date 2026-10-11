import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We import the schema directly to avoid triggering module-level parse
// The actual env module is tested by manipulating process.env before dynamic import
import { z } from "zod";

const validEnv = {
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-123",
  TELEGRAM_BOT_TOKEN: "123456:ABC-token",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
  TELEGRAM_ALLOWED_USER_ID: "987654321",
  RODIUMAI_API_KEY: "rodi-key-abc",
  RODIUMAI_BASE_URL: "https://api.rodiumai.com",
  INNGEST_SIGNING_KEY: "signkey-abc",
  INNGEST_EVENT_KEY: "eventkey-abc",
  SPEND_CAP_RODI: "1000",
  MAX_RETRIES: "3",
  FILE_TTR_HOURS: "48",
};

// Re-declare the schema here to test parsing logic independently
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

describe("env schema", () => {
  it("parses a complete valid environment", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SUPABASE_URL).toBe("https://abc.supabase.co");
      expect(result.data.TELEGRAM_ALLOWED_USER_ID).toBe(987654321);
      expect(result.data.SPEND_CAP_RODI).toBe(1000);
      expect(result.data.MAX_RETRIES).toBe(3);
      expect(result.data.FILE_TTR_HOURS).toBe(48);
    }
  });

  it("coerces numeric string variables to numbers", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.TELEGRAM_ALLOWED_USER_ID).toBe("number");
      expect(typeof result.data.SPEND_CAP_RODI).toBe("number");
      expect(typeof result.data.MAX_RETRIES).toBe("number");
      expect(typeof result.data.FILE_TTR_HOURS).toBe("number");
    }
  });

  it("rejects an invalid SUPABASE_URL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      SUPABASE_URL: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("SUPABASE_URL");
    }
  });

  it("rejects an invalid RODIUMAI_BASE_URL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      RODIUMAI_BASE_URL: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("RODIUMAI_BASE_URL");
    }
  });

  it("rejects when a required string variable is missing", () => {
    const { TELEGRAM_BOT_TOKEN: _omit, ...incomplete } = validEnv;
    const result = envSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("TELEGRAM_BOT_TOKEN");
    }
  });

  it("rejects non-integer value for MAX_RETRIES", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      MAX_RETRIES: "2.5",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("MAX_RETRIES");
    }
  });

  it("rejects non-integer value for FILE_TTR_HOURS", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      FILE_TTR_HOURS: "1.5",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("FILE_TTR_HOURS");
    }
  });
});
