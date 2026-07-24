import { handleEvaluateTurnRequest } from '../src/server/ai';
import { createAiRoute } from '../src/server/nodeAdapter';
import { llmConfigFromEnv, aiSecurityFromEnv } from './_config';

export default createAiRoute(handleEvaluateTurnRequest, llmConfigFromEnv, aiSecurityFromEnv);
