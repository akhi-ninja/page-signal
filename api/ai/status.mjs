import { status } from '../../lib/extraction.mjs';

export default {
  fetch(request) {
    return request.method === 'GET'
      ? status(process.env)
      : new Response(null, { status: 405 });
  }
};
