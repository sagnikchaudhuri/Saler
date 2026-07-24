import { handleEvaluateFinalRequest } from '../src/server/ai';
import { createAiRoute } from '../src/server/nodeAdapter';
import { llmConfigFromEnv, aiSecurityFromEnv } from './_config';

export default createAiRoute(handleEvaluateFinalRequest, llmConfigFromEnv, aiSecurityFromEnv);
