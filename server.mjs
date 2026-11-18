import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { extract } from './packages/core/extraction.mjs';

const token = process.env.PAGESIGNAL_API_KEY;
if (!token || token.length < 24) {
  throw new Error('Set PAGESIGNAL_API_KEY to a random secret of at least 24 characters.');
}
const maximumBody = 4000000;
const assets = {
  '/favicon.ico': ['web/favicon.ico', 'image/x-icon'],
  '/favicon-16x16.png': ['web/favicon-16x16.png', 'image/png'],
  '/favicon-32x32.png': ['web/favicon-32x32.png', 'image/png'],
  '/apple-touch-icon.png': ['web/apple-touch-icon.png', 'image/png'],
  '/android-chrome-192x192.png': ['web/android-chrome-192x192.png', 'image/png'],
  '/android-chrome-512x512.png': ['web/android-chrome-512x512.png', 'image/png'],
  '/pagesignal-icon-128.png': ['web/pagesignal-icon-128.png', 'image/png'],
  '/site.webmanifest': ['web/site.webmanifest', 'application/manifest+json'],
  '/': ['web/index.html', 'text/html; charset=utf-8'],
  '/docs': ['web/docs.html', 'text/html; charset=utf-8'],
  '/docs/': ['web/docs.html', 'text/html; charset=utf-8'],
  '/docs.html': ['web/docs.html', 'text/html; charset=utf-8'],
  '/openapi.json': ['web/openapi.json', 'application/json; charset=utf-8'],
  '/app.js': ['web/app.js', 'text/javascript; charset=utf-8'],
  '/engine.js': ['web/engine.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['web/style.css', 'text/css; charset=utf-8']
};
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};
function authorized(request) {
  const actual = Buffer.from(request.headers.authorization || '');
  const credentials = ['Bearer ' + token, 'Basic ' + Buffer.from('pagesignal:' + token).toString('base64')];
  return credentials.some(value => {
    const expected = Buffer.from(value);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
let active = 0;
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!authorized(request)) {
      response.setHeader('WWW-Authenticate', 'Basic realm="PageSignal Community", charset="UTF-8"');
      return json(response, 401, { error: 'Sign in with the Community service credential.' });
    }
    if (path === '/api/ai/status' && request.method === 'GET') {
      return json(response, 200, { configured: Boolean(process.env.OPENAI_API_KEY), provider: 'OpenAI' });
    }
    if (path === '/api/ai/extract') {
      if (!authorized(request)) return json(response, 401, { error: 'A service API key is required.' });
      if (request.method !== 'POST') return json(response, 405, { error: 'Use POST.' });
      if (active >= 3) return json(response, 429, { error: 'Processing capacity reached. Retry later.' });
      active++;
      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of request) {
          length += chunk.length;
          if (length > maximumBody) {
            json(response, 413, { error: 'The request exceeds 4 MB.' });
            return;
          }
          chunks.push(chunk);
        }
        const internal = new Request('https://pagesignal.internal/api/ai/extract', {
          method: 'POST',
          headers: { Origin: 'https://pagesignal.internal', 'Content-Type': request.headers['content-type'] || '' },
          body: Buffer.concat(chunks)
        });
        const result = await extract(internal, process.env);
        response.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(await result.text());
      } finally {
        active--;
      }
      return;
    }
    const asset = assets[path];
    if (!asset || !['GET', 'HEAD'].includes(request.method)) {
      return json(response, 404, { error: 'Not found.' });
    }
    response.writeHead(200, { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : await readFile(new URL(asset[0], import.meta.url)));
  } catch {
    if (!response.headersSent) json(response, 500, { error: 'The request could not be completed.' });
    else response.end();
  }
}).listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
