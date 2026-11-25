import { extensionConnectionStatus } from '../../lib/extension-auth.mjs';
export default { fetch(request) { return extensionConnectionStatus(request,process.env); } };
