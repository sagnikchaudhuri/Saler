import { createCapabilityRoute } from '../src/server/nodeAdapter';
import { issueCapability, aiSecurityFromEnv } from './_config';

// GET /api/ai-capability — issues a short-lived, same-origin AI capability
// token (or {token:null} when no signing secret is configured). Never returns
// a secret; the token is opaque and signed server-side.
export default createCapabilityRoute(issueCapability, aiSecurityFromEnv);
