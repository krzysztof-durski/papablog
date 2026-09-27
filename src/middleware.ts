import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getAccessJwks } from './lib/auth/accessJwks';
import { resolveAccessIdentity } from './lib/auth/resolveAccessIdentity';

const PROTECTED_PREFIXES = ['/admin', '/api/admin'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const accessGate = defineMiddleware(async (context, next) => {
  if (!isProtectedPath(context.url.pathname)) {
    return next();
  }

  const email = await resolveAccessIdentity({
    headers: context.request.headers,
    env,
    jwks: getAccessJwks(env.ACCESS_TEAM_DOMAIN),
  });

  if (!email) {
    // Deliberately no detail leaked to the client on any rejection reason
    // (missing token, bad signature, wrong audience/issuer, expired,
    // disallowed email, etc).
    return new Response('Forbidden', { status: 403 });
  }

  context.locals.accessEmail = email;
  return next();
});

// A single-step sequence for now — security headers join this pipeline in
// the security-hardening pass, applied to every route rather than just the
// protected ones this gate covers.
export const onRequest = sequence(accessGate);
