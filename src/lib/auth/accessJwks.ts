import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

// Module-level cache: Workers isolates persist module state across requests
// within the same isolate, and jose's own remote-JWKS resolver already
// caches fetched keys internally — this just avoids constructing a new
// resolver (and losing that internal cache) on every request.
const jwksCache = new Map<string, JWTVerifyGetKey>();

export function getAccessJwks(teamDomain: string): JWTVerifyGetKey {
  const cached = jwksCache.get(teamDomain);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksCache.set(teamDomain, jwks);
  return jwks;
}
