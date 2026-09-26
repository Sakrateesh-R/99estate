import { z } from 'zod';

/**
 * Environment access, validated once at module load.
 *
 * Split deliberately in two:
 *   `env`       — NEXT_PUBLIC_* only, safe to evaluate in the browser bundle.
 *   `serverEnv` — secrets. Guarded so an accidental client import fails loudly
 *                 at runtime instead of silently shipping a service-role key.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a full URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` only when referenced statically,
 * so these must be written out literally rather than looped over.
 */
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsedPublic.success) {
  const details = parsedPublic.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Invalid public environment configuration.\n${details}\n\n` +
      'Copy .env.example to .env.local and fill in your Supabase project values.',
  );
}

export const env = parsedPublic.data;

/**
 * Absolute origin of this deployment. Used for OAuth redirects, canonical
 * URLs, OG images and the sitemap — all of which must be absolute.
 *
 * Falls back to the Vercel-provided host so preview deployments work without
 * an extra env var.
 */
export function getSiteUrl(): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// Server-only
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  PAYMENT_PROVIDER_KEY: z.string().optional(),
  PAYMENT_PROVIDER_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Bearer token for /api/cron/listings (§18).
   *
   * Optional so local development of everything else works without it, but the
   * route refuses to run when it is missing rather than falling open. A short
   * value is rejected outright: this is the only thing standing between a
   * stranger and the ability to notify every seller on the platform at will.
   */
  CRON_SECRET: z.string().min(24, 'CRON_SECRET must be at least 24 characters').optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Reads a provider-agnostic variable, falling back to the gateway's own
 * naming.
 *
 * Razorpay's documentation calls these RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET, so that is what tends to get pasted into a dashboard,
 * while this codebase names them by role rather than by vendor. Accepting
 * both removes a silent failure where the credentials are present, correct,
 * and simply never read.
 *
 * The role-named variable wins, because it is the one this code documents. If
 * the two disagree, one of them is stale — say so rather than quietly picking
 * a side, since the losing value is invisible from the outside.
 */
/**
 * Blank counts as absent, and the value is trimmed.
 *
 * Both come from how these get entered rather than how they are read. A
 * dashboard will happily store an empty string, and `??` treats that as a real
 * value — so a defined-but-blank variable would shadow an alias and report
 * itself as configured. Pasting a key tends to bring a trailing newline with
 * it, which survives into the Basic auth header, the HMAC or a bearer token and
 * fails authentication for no visible reason.
 */
function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function pick(primary: string, alias: string): string | undefined {
  const a = read(primary);
  const b = read(alias);

  if (a && b && a !== b) {
    console.warn(
      `[env] ${primary} and ${alias} are both set to different values. ` +
        `Using ${primary}. Delete whichever is stale — the other is being ignored.`,
    );
  }

  return a ?? b;
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Lazily validated so that a missing payment secret does not break local
 * development of pages that never touch payments.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() was called in the browser. Server secrets must never reach the client bundle.');
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? 'mock',
    PAYMENT_PROVIDER_KEY: pick('PAYMENT_PROVIDER_KEY', 'RAZORPAY_KEY_ID'),
    PAYMENT_PROVIDER_SECRET: pick('PAYMENT_PROVIDER_SECRET', 'RAZORPAY_KEY_SECRET'),
    PAYMENT_WEBHOOK_SECRET: pick('PAYMENT_WEBHOOK_SECRET', 'RAZORPAY_WEBHOOK_SECRET'),
    CRON_SECRET: read('CRON_SECRET'),
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server environment configuration.\n${details}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
