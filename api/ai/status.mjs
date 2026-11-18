import { accountStatus } from '../../lib/account-api.mjs';
export default { fetch(request) { return accountStatus(request, process.env); } };
