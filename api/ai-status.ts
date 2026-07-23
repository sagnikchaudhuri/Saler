import { handleAiStatus } from '../src/server/ai';
import { sendJson, type NodeRequestLike, type NodeResponseLike } from '../src/server/nodeAdapter';
import { llmConfigFromEnv } from './_config';

/** Secret-free capability probe: reports only whether AI is configured. */
export default function handler(_req: NodeRequestLike, res: NodeResponseLike): void {
  const result = handleAiStatus(llmConfigFromEnv());
  sendJson(res, result.status, result.body);
}
