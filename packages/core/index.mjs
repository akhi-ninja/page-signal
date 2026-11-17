import { extract } from './extraction.mjs';

export class PageSignalError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PageSignalError';
    this.status = status;
  }
}

/** Extract one rendered page. The credential belongs on the server. */
export async function extractPage({ image, text = '' }, { apiKey, model } = {}) {
  if (!apiKey) throw new PageSignalError('An OpenAI API key is required.', 503);
  const request = new Request('https://pagesignal.internal/api/ai/extract', {
    method: 'POST',
    headers: {
      Origin: 'https://pagesignal.internal',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ image, text })
  });
  const response = await extract(request, {
    OPENAI_API_KEY: apiKey,
    OPENAI_DOCUMENT_MODEL: model
  });
  const result = await response.json();
  if (!response.ok) throw new PageSignalError(result.error, response.status);
  return result;
}
