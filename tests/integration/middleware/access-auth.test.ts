import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyAccessJwt } from '../../../src/lib/auth/verifyAccessJwt';
import { resolveAccessIdentity, type ResolveAccessIdentityEnv } from '../../../src/lib/auth/resolveAccessIdentity';

const ISSUER = 'https://dursky-k.cloudflareaccess.com';
const AUDIENCE = 'test-audience-tag';
const KEY_ID = 'test-key-1';

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

async function sign(overrides: {
  email?: string | null;
  issuer?: string;
  audience?: string;
  expiresInSeconds?: number;
  omitEmail?: boolean;
}): Promise<string> {
  const expiresIn = overrides.expiresInSeconds ?? 3600;

  return (
    new SignJWT(overrides.omitEmail ? {} : { email: overrides.email ?? 'dursky.k@gmail.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuedAt()
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUDIENCE)
      // An absolute timestamp (not a relative string like '1h') so a negative
      // expiresIn can express an already-expired token for the expiry test.
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
      .sign(privateKey)
  );
}

beforeAll(async () => {
  const { publicKey, privateKey: generatedPrivateKey } = await generateKeyPair('RS256');
  privateKey = generatedPrivateKey;
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

describe('verifyAccessJwt', () => {
  it('accepts a validly signed token and returns the email claim', async () => {
    const token = await sign({ email: 'dursky.k@gmail.com' });

    const payload = await verifyAccessJwt({ token, issuerBase: ISSUER, audience: AUDIENCE, jwks });

    expect(payload.email).toBe('dursky.k@gmail.com');
  });

  it('rejects a token signed by a different key (tampered/forged)', async () => {
    const { privateKey: otherKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: 'attacker@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('1h')
      .sign(otherKey);

    await expect(verifyAccessJwt({ token: forged, issuerBase: ISSUER, audience: AUDIENCE, jwks })).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ expiresInSeconds: -60 });

    await expect(verifyAccessJwt({ token, issuerBase: ISSUER, audience: AUDIENCE, jwks })).rejects.toThrow();
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await sign({ audience: 'some-other-app-aud-tag' });

    await expect(verifyAccessJwt({ token, issuerBase: ISSUER, audience: AUDIENCE, jwks })).rejects.toThrow();
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await sign({ issuer: 'https://someone-elses-team.cloudflareaccess.com' });

    await expect(verifyAccessJwt({ token, issuerBase: ISSUER, audience: AUDIENCE, jwks })).rejects.toThrow();
  });

  it('rejects a token missing the email claim', async () => {
    const token = await sign({ omitEmail: true });

    await expect(verifyAccessJwt({ token, issuerBase: ISSUER, audience: AUDIENCE, jwks })).rejects.toThrow(/email/i);
  });

  it('rejects a malformed token', async () => {
    await expect(
      verifyAccessJwt({ token: 'not-a-real-jwt', issuerBase: ISSUER, audience: AUDIENCE, jwks }),
    ).rejects.toThrow();
  });
});

describe('resolveAccessIdentity', () => {
  const baseEnv: ResolveAccessIdentityEnv = {
    ACCESS_TEAM_DOMAIN: 'dursky-k.cloudflareaccess.com',
    ACCESS_AUD: AUDIENCE,
    ALLOWED_WRITER_EMAILS: 'dursky.k@gmail.com, second-writer@example.com',
  };

  describe('production path (no E2E_BYPASS_SECRET configured)', () => {
    it('resolves the email from a valid Access JWT', async () => {
      const token = await sign({ email: 'dursky.k@gmail.com' });
      const headers = new Headers({ 'Cf-Access-Jwt-Assertion': token });

      const email = await resolveAccessIdentity({ headers, env: baseEnv, jwks });

      expect(email).toBe('dursky.k@gmail.com');
    });

    it('returns null when there is no JWT at all', async () => {
      const email = await resolveAccessIdentity({ headers: new Headers(), env: baseEnv, jwks });
      expect(email).toBeNull();
    });

    it('returns null for a validly-signed JWT whose email is not allow-listed', async () => {
      const token = await sign({ email: 'not-the-writer@example.com' });
      const headers = new Headers({ 'Cf-Access-Jwt-Assertion': token });

      const email = await resolveAccessIdentity({ headers, env: baseEnv, jwks });

      expect(email).toBeNull();
    });

    it('ignores bypass-style headers entirely when no bypass secret is configured', async () => {
      const headers = new Headers({
        'X-E2E-Bypass-Secret': 'anything',
        'X-Test-Access-Email': 'dursky.k@gmail.com',
      });

      const email = await resolveAccessIdentity({ headers, env: baseEnv, jwks });

      expect(email).toBeNull();
    });
  });

  describe('local dev / test bypass path (E2E_BYPASS_SECRET configured)', () => {
    const bypassEnv: ResolveAccessIdentityEnv = { ...baseEnv, E2E_BYPASS_SECRET: 'local-secret' };

    it('logs straight in as the first configured writer for a plain request with no bypass headers', async () => {
      const email = await resolveAccessIdentity({ headers: new Headers(), env: bypassEnv, jwks });
      expect(email).toBe('dursky.k@gmail.com');
    });

    it('accepts an explicit identity when the exact secret and an allow-listed email are both sent', async () => {
      const headers = new Headers({
        'X-E2E-Bypass-Secret': 'local-secret',
        'X-Test-Access-Email': 'second-writer@example.com',
      });

      const email = await resolveAccessIdentity({ headers, env: bypassEnv, jwks });

      expect(email).toBe('second-writer@example.com');
    });

    it('rejects an explicit identity that is not on the allow-list, even with the correct secret', async () => {
      const headers = new Headers({
        'X-E2E-Bypass-Secret': 'local-secret',
        'X-Test-Access-Email': 'attacker@example.com',
      });

      const email = await resolveAccessIdentity({ headers, env: bypassEnv, jwks });

      expect(email).toBeNull();
    });

    it('rejects a request with the wrong secret', async () => {
      const headers = new Headers({
        'X-E2E-Bypass-Secret': 'wrong-secret',
        'X-Test-Access-Email': 'dursky.k@gmail.com',
      });

      const email = await resolveAccessIdentity({ headers, env: bypassEnv, jwks });

      expect(email).toBeNull();
    });

    it('rejects a request with the correct secret but no identity header', async () => {
      const headers = new Headers({ 'X-E2E-Bypass-Secret': 'local-secret' });

      const email = await resolveAccessIdentity({ headers, env: bypassEnv, jwks });

      expect(email).toBeNull();
    });
  });
});
