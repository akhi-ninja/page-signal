import {handleConnections} from '../../lib/connector-api.mjs';
export default {fetch(request){return handleConnections(request,process.env)}};
