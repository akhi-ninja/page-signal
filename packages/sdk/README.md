# @pagesignal/sdk
MIT, prerelease 0.1.0. Server-side Node.js client for the Community API.

    import { PageSignalClient } from '@pagesignal/sdk';
    const client = new PageSignalClient({
      baseUrl: 'http://localhost:3000',
      apiKey: process.env.PAGESIGNAL_API_KEY
    });
    const result = await client.extractPage({ image: jpegDataUrl, text: ocrText });

The service key authenticates to your PageSignal server. Keep it in server environment variables.
The OpenAI credential stays on the PageSignal server. One call processes one rendered page.
Durable submissions, polling, and public Cloud billing APIs are planned.
