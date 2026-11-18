import { handleAuth } from '../../lib/auth.mjs';
export default { fetch(request) { return handleAuth(request, process.env); } };
