import { refreshExtensionConnection } from '../../lib/extension-auth.mjs';
export default { fetch(request) { return refreshExtensionConnection(request,process.env); } };
