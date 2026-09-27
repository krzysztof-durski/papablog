import { jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccessJwtPayload {
  email: string;
  [claim: string]: unknown;
}

export interface VerifyAccessJwtOptions {
  token: string;
  /** e.g. "https://dursky-k.cloudflareaccess.com" */
  issuerBase: string;
  audience: string;
  /** Injectable so tests can supply a local JWKS instead of a network fetch. */
  jwks: JWTVerifyGetKey;
}

/**
 * Verifies a Cloudflare Access JWT (from the `Cf-Access-Jwt-Assertion`
 * header) against the team's JWKS, issuer, and audience, per
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 *
 * Throws on any invalid signature, issuer, audience, or expiry — callers
 * should treat a throw as "reject the request," not attempt to inspect the
 * error for a partial identity.
 */
export async function verifyAccessJwt({
  token,
  issuerBase,
  audience,
  jwks,
}: VerifyAccessJwtOptions): Promise<AccessJwtPayload> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: issuerBase,
    audience,
  });

  if (typeof payload.email !== 'string' || payload.email.length === 0) {
    throw new Error('Access JWT is missing a valid "email" claim');
  }

  return payload as AccessJwtPayload;
}
