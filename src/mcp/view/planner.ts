import type { App } from '@modelcontextprotocol/ext-apps';
import type { LivePlan, Planner } from '@/lib/planner/client';
import { isPlanResult, type PlanResult } from '../protocol';

const UNREADABLE: PlanResult = {
  source: 'failed',
  error: 'The plan came back in a shape Countersign could not read.',
  reason: 'unparseable',
};

export function toPlanResult(structured: unknown): PlanResult {
  return isPlanResult(structured) ? structured : UNREADABLE;
}

function unwrap(result: PlanResult): LivePlan {
  if (result.source === 'live') return result.plan;
  if (result.source === 'failed') throw new Error(result.error);
  throw new Error('Live planning is not configured on this server.');
}

/**
 * Plans inside a chat. The first plan is the result of the tool call the chat already made, so opening
 * an old conversation shows that plan again instead of paying for a new one. Try again and Replay ask
 * the server for a fresh plan through the host.
 */
export function mcpPlanner(app: App, first: Promise<PlanResult>): Planner {
  let firstUsed = false;
  return {
    async available() {
      const result = await first;
      return result.source !== 'recorded';
    },
    async plan(signal) {
      if (!firstUsed) {
        firstUsed = true;
        return unwrap(await first);
      }
      let res;
      try {
        res = await app.callServerTool({ name: 'plan_month_end', arguments: {} }, { signal });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error('Could not reach the planning server.');
      }
      if (res.isError) throw new Error('The planning server returned an error.');
      return unwrap(toPlanResult(res.structuredContent));
    },
  };
}
