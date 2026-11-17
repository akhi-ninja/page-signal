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
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetcher(this.baseUrl + '/api/ai/extract', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image, text }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'error'
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'PageSignal request failed.');
      error.status = response.status;
      throw error;
    }
    return result;
  }
}
