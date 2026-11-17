# PageSignal Community 0.1.0

MIT-licensed document extraction with a self-hosted app, a server-side engine and SDK,
and a React component for embedding the workspace.

## Run with Node.js 22 or newer

Set OPENAI_API_KEY to your own provider credential and PAGESIGNAL_API_KEY to a randomly
generated secret of at least 24 characters in your server environment. Run npm start.
Open http://localhost:3000 and use username pagesignal with PAGESIGNAL_API_KEY as the password.
The browser handles PDF rendering and OCR. Enable AI to send rendered pages to OpenAI.
Keep network deployments behind HTTPS. Each installation currently uses one shared service account.
Tenant accounts and credit metering are future Cloud capabilities.

## Docker

Build with docker build -t pagesignal-community .
Run with docker run --rm -p 3000:3000 --env-file .env pagesignal-community
Supply OPENAI_API_KEY and PAGESIGNAL_API_KEY in the local .env file.
Keep that file outside version control.

## Packages

Run npm run pack:packages. Install each resulting .tgz file with npm install.
The proposed npm scope is @pagesignal. Registry ownership and name availability
must be established before publishing. These packages have not been published to npm.

- @pagesignal/core exposes extractPage using your server-side OpenAI credential.
- @pagesignal/sdk calls the Community endpoint using its service key.
- @pagesignal/react embeds the self-hosted workspace under your application's origin.

Package READMEs include integration examples. The React package is an iframe wrapper.
A host application can authenticate its own users and proxy API calls with the service key.

## API currently implemented

POST /api/ai/extract
Authorization: Bearer YOUR_SERVICE_KEY
Content-Type: application/json

Body contains image (base64 JPEG data URL) and optional text (OCR transcription).
One request extracts one rendered page. Maximum request body is 4 MB and concurrency is
three per process. The same engine is available through the core package.
Use client.extractPage({ image, text }) from the SDK.

The bundled browser app supports PDFs and common images, 10 files per batch,
30 MiB per file, 100 MiB per batch, and 40 pages per PDF.

## Version and Cloud roadmap

The browser UI was recovered from Vercel deployment dpl_4VP8Z1KKA2ZwFMohaP5Uu5sPzJLd.
The document question handler was reconstructed because the source export was truncated,
then checked with mocked evidence validation. It supports specific-field extraction and
follow-up questions alongside document preview and JSON export.

Development workflow: commit changes to development, review a pull request into main,
and let the connected Vercel Git integration deploy main. Preserve Vercel runtime secrets
in project environment settings.

PageSignal Cloud is planned as a managed API and web service with account quotas,
prepaid credits, bulk jobs, private storage, and usage reporting. Payments and commercial
plans have not been enabled. Versioned durable submission endpoints are planned.
Self-hosted users pay their own model and hosting charges.

## Verification

npm test checks SDK request routing, credential handling, error propagation, and the
core's missing-key behavior. npm run pack:packages creates installable tarballs.
A live Docker build and real OpenAI extraction have not been exercised for this release.

MIT licensed. Retain the LICENSE and copyright notices when distributing copies.
