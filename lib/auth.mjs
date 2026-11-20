import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins/magic-link';
import pg from 'pg';

const runtimes = new WeakMap();
export function authConfiguration(env) {
  let origin;
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null;
    origin = url.origin;
  } catch { return null; }
  if (!env.DATABASE_URL || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) return null;
  return {
    origin,
    providers: {
      github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      linkedin: Boolean((env.LINKEDIN_CLIENT_ID || env.LINKED_CLIENT_ID) && env.LINKEDIN_CLIENT_SECRET),
      email: Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM)
    }
  };
}
export function requestLimits(env) {
  const positive = (value, fallback, max) => /^\d+$/.test(String(value)) && Number(value) > 0
    ? Math.min(Number(value), max) : fallback;
  return {
    daily: positive(env.PAGESIGNAL_DAILY_AI_REQUESTS, 20, 10000),
    perMinute: positive(env.PAGESIGNAL_AI_REQUESTS_PER_MINUTE, 6, 100),
    globalDaily: positive(env.PAGESIGNAL_GLOBAL_DAILY_AI_REQUESTS, 200, 100000)
  };
}
export function getAuthRuntime(env = process.env) {
  if (runtimes.has(env)) return runtimes.get(env);
  const configuration = authConfiguration(env);
  if (!configuration) return null;
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
  // TLS verification is controlled by the database connection string; never disable it here.
  const socialProviders = {};
  if (configuration.providers.github) socialProviders.github = {
    clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET,
    scope: ['read:user', 'user:email']
  };
  if (configuration.providers.linkedin) socialProviders.linkedin = {
    clientId: env.LINKEDIN_CLIENT_ID || env.LINKED_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET,
    scope: ['openid', 'profile', 'email']
  };
  const plugins = configuration.providers.email ? [magicLink({
    expiresIn: 600,
    storeToken: 'hashed',
    rateLimit: { window: 60, max: 3 },
    async sendMagicLink({ email, url }) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [email], subject: 'Sign in to PageSignal',
          text: `Use this one-time link to sign in to PageSignal:\n\n${url}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.` }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('The sign-in email could not be sent.');
    }
  })] : [];
  const auth = betterAuth({
    appName: 'PageSignal',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: configuration.origin,
    basePath: '/api/auth',
    trustedOrigins: [configuration.origin],
    database: pool,
    emailAndPassword: { enabled: false },
    socialProviders,
    account: { accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false }, encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
      customRules: { '/sign-in/social': { window: 60, max: 10 } } },
    // Vercel replaces x-vercel-forwarded-for. The Node runner replaces x-pagesignal-client-ip.
    advanced: { ipAddress: { ipAddressHeaders: [env.VERCEL ? 'x-vercel-forwarded-for' : 'x-pagesignal-client-ip'] } },
    plugins
  });
  const runtime = { auth, pool, ...configuration };
  runtimes.set(env, runtime);
  return runtime;
}
export async function handleAuth(request, env = process.env) {
  const runtime = getAuthRuntime(env);
  if (!runtime) return Response.json({ error: 'Sign-in is not configured yet.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try { return await runtime.auth.handler(request); }
  catch { return Response.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
