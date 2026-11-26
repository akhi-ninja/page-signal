import { authorizeExtensionConnection } from '../../lib/extension-auth.mjs';
export default { fetch(request) { return authorizeExtensionConnection(request,process.env); } };
