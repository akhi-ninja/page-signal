import { community } from '../lib/community.mjs';
export default { fetch(request) { return community(request,process.env); } };
