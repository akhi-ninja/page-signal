export class PageSignalClient {
  constructor({ baseUrl, apiKey, fetch: fetcher = globalThis.fetch, timeoutMs = 120000 }) {
    const url = new URL(baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new TypeError('Use an HTTP(S) base URL without embedded credentials.');
    }
    if (!apiKey) throw new TypeError('A PageSignal service API key is required.');
    this.baseUrl = url.origin;
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  /** image is a base64 JPEG data URL. Keep this client in server code. */
  async extractPage({ image, text = '' }, { signal } = {}) {
    return this.#request({image,text},{signal});
  }

  /** Query caller-supplied numbered page text; no server-side document storage. */
  async queryDocument({pages,question,mode='fields',context=''}, {signal} = {}) {
    return this.#request({operation:'document_query',pages,question,mode,context},{signal});
  }

  async #request(payload,{signal}={}) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetcher(this.baseUrl + '/api/ai/extract', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'error'
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'PageSignal request failed.');
      error.status = response.status;
      if(typeof result.code==='string')error.code=result.code;
      if(typeof result.retryable==='boolean')error.retryable=result.retryable;
      if(Number.isFinite(result.retry_after_seconds))error.retryAfterSeconds=result.retry_after_seconds;
      throw error;
    }
    return result;
  }
}
