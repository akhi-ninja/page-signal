import { extract } from './extraction.mjs';

export class PageSignalError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PageSignalError';
    this.status = status;
  }
}

async function invoke(payload, { apiKey, model, signal } = {}) {
  signal?.throwIfAborted();
  if (!apiKey) throw new PageSignalError('An OpenAI API key is required.', 503);
  const request = new Request('https://pagesignal.internal/api/ai/extract', {
    method: 'POST',
    signal,
    headers: {
      Origin: 'https://pagesignal.internal',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const response = await extract(request, {
    OPENAI_API_KEY: apiKey,
    OPENAI_DOCUMENT_MODEL: model
  });
  const result = await response.json();
  if (!response.ok) throw new PageSignalError(result.error, response.status);
  return result;
}

/** Extract one rendered page. The credential belongs on the server. */
export function extractPage({ image, text = '' }, options) {
  return invoke({image,text},options);
}

/** Find fields or ask a question using caller-supplied numbered page text. */
export function queryDocument({pages,question,mode='fields',context=''},options) {
  return invoke({operation:'document_query',pages,question,mode,context},options);
}
