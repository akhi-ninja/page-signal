import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { demoScope } from './store.mjs';

function validIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !value.includes('\0');
}

export function createJwtAuthenticator({ issuer, audience, keys }) {
  return async (authorization) => {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub', 'tenant_id'],
      });
      if (!validIdentifier(payload.tenant_id) || !validIdentifier(payload.sub)) return null;
      return JSON.stringify([issuer, payload.tenant_id, payload.sub]);
    } catch (error) {
      if (error.code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError ||
          (error.code === 'ERR_JOSE_GENERIC' && error.message.startsWith('Expected 200'))) throw error;
      return null;
    }
  };
}

export function configureAuthentication(env) {
  const demo = env.SYNC_MODE === 'demo';
  if (demo) {
    if (!env.SYNC_TOKEN) throw new Error('Set SYNC_TOKEN for demo mode.');
    const expected = Buffer.from(`Bearer ${env.SYNC_TOKEN}`);
    return async (header) => {
      const token = Buffer.from(header ?? '');
      return token.length === expected.length && timingSafeEqual(token, expected) ? demoScope : null;
    };
  }

  if (env.SYNC_MODE && env.SYNC_MODE !== 'jwt') throw new Error('SYNC_MODE must be jwt or demo.');
  const { SYNC_JWT_ISSUER: issuer, SYNC_JWT_AUDIENCE: audience, SYNC_JWKS_URL: endpoint } = env;
  if (!issuer || !audience || !endpoint || env.SYNC_TOKEN) {
    throw new Error('Set SYNC_JWT_ISSUER, SYNC_JWT_AUDIENCE and SYNC_JWKS_URL for JWT mode. Remove SYNC_TOKEN.');
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('SYNC_JWKS_URL must use HTTPS.');
  return createJwtAuthenticator({ issuer, audience, keys: createRemoteJWKSet(url) });
}
