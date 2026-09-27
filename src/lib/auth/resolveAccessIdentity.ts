import type { JWTVerifyGetKey } from 'jose';
import { isAllowedWriter } from './allowlist';
import { verifyAccessJwt } from './verifyAccessJwt';

export interface ResolveAccessIdentityEnv {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_WRITER_EMAILS: string;
  /** Local-dev/test-only — see src/middleware.ts and .dev.vars.example. */
  E2E_BYPASS_SECRET?: string;
}

export interface ResolveAccessIdentityOptions {
  headers: Headers;
  env: ResolveAccessIdentityEnv;
  jwks: JWTVerifyGetKey;
}

/**
 * Resolves the verified, allow-listed writer email for a request to a
 * protected route, or `null` if the request should be rejected.
 *
 * Two paths:
 *  - Production: verifies the real `Cf-Access-Jwt-Assertion` header against
 *    Access's JWKS, then re-checks the email against ALLOWED_WRITER_EMAILS
 *    as defense-in-depth.
 *  - Local dev / tests only, and only when E2E_BYPASS_SECRET is actually
 *    set (never true for the deployed Worker): a plain request with no
 *    bypass headers logs straight in as the first configured writer, so
 *    opening /admin in a browser locally just works with no setup. A
 *    request that DOES send bypass headers must present the exact secret
 *    plus an allow-listed email — used by tests that need to simulate a
 *    specific (including specifically-disallowed) identity.
 */
export async function resolveAccessIdentity({
  headers,
  env,
  jwks,
}: ResolveAccessIdentityOptions): Promise<string | null> {
  if (env.E2E_BYPASS_SECRET) {
    const suppliedSecret = headers.get('X-E2E-Bypass-Secret');
    const explicitEmail = headers.get('X-Test-Access-Email');

    if (!suppliedSecret && !explicitEmail) {
      const [defaultWriter] = env.ALLOWED_WRITER_EMAILS.split(',');
      return defaultWriter?.trim() || null;
    }

    if (
      suppliedSecret === env.E2E_BYPASS_SECRET &&
      explicitEmail &&
      isAllowedWriter(explicitEmail, env.ALLOWED_WRITER_EMAILS)
    ) {
      return explicitEmail;
    }

    return null;
  }

  const token = headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;

  try {
    const payload = await verifyAccessJwt({
      token,
      issuerBase: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
      jwks,
    });

    return isAllowedWriter(payload.email, env.ALLOWED_WRITER_EMAILS) ? payload.email : null;
  } catch {
    return null;
  }
}
