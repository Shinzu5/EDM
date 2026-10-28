/**
 * Environment configuration — validated once with zod. server.ts re-validates
 * via loadConfig() so boot fails fast with a readable message instead of a
 * stack trace. Test/dev get safe defaults so the API boots with no .env.
 */
import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-insecure-jwt-secret-change-me';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
    /** Token lifetime issued at login. */
    JWT_TTL_SECONDS: z.coerce.number().int().positive().default(8 * 60 * 60),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
    LOG_LEVEL: z.string().default('info'),
    /** Inbound/outbound webhook HMAC secret — falls back to JWT_SECRET. */
    WEBHOOK_SECRET: z.string().min(16).optional(),
    /** Optional S3-compatible object storage for portal result downloads. */
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    AWS_S3_ENDPOINT: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be set to a strong value in production',
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema> & {
  isTest: boolean;
  isProd: boolean;
  /** Effective HMAC secret for webhooks (WEBHOOK_SECRET ?? JWT_SECRET). */
  webhookSecret: string;
  jwtTtlMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid API configuration:\n${issues}`);
  }
  const e = parsed.data;
  return {
    ...e,
    isTest: e.NODE_ENV === 'test',
    isProd: e.NODE_ENV === 'production',
    webhookSecret: e.WEBHOOK_SECRET ?? e.JWT_SECRET,
    jwtTtlMs: e.JWT_TTL_SECONDS * 1000,
  };
}

export const config: AppConfig = loadConfig();
