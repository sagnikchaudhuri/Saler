import { handleAiStatus } from '../src/server/ai';
import { sendJson, type NodeRequestLike, type NodeResponseLike } from '../src/server/nodeAdapter';
import { aiStatusFromEnv } from './_config';

/**
 * Secret-free probe: reports AI enabled ONLY when key + capability secret are
 * both configured (matches the fail-closed route policy). Never leaks values.
 */
export default function handler(_req: NodeRequestLike, res: NodeResponseLike): void {
  const result = handleAiStatus(aiStatusFromEnv());
  sendJson(res, result.status, result.body);
}
