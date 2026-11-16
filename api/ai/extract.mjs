import { extract } from '../../lib/extraction.mjs';

export default {
  fetch(request) {
    return extract(request, process.env);
  }
};
