import { accountExtract } from '../../lib/account-api.mjs';
export default { fetch(request) { return accountExtract(request, process.env); } };
