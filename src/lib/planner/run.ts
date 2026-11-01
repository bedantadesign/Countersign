import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { buildScenario } from '../fixtures';
import { planFailure } from './errors';
import { liveAvailable, requestPlan } from './live';
import { toProposedActions } from './map';
import type { LivePlan } from './client';

export type PlanOutcome =
  | { ok: true; plan: LivePlan }
  | { ok: false; status: number; error: string; reason: string };

/**
 * One live plan of the fixed scenario. Takes no input, so callers can't turn it into an open proxy to Claude.
 * Shared by `/api/plan` and the MCP server so both plan the same way.
 */
export async function planMonthEnd(): Promise<PlanOutcome> {
  if (!liveAvailable()) {
    return { ok: false, status: 503, error: 'Live planning is not configured on this server.', reason: 'unavailable' };
  }
  const { ctx } = buildScenario(Date.now());
  try {
    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    const { plan, model } = await requestPlan(client, ctx.request, ctx.documents);
    const { actions, dropped } = toProposedActions(plan, ctx.documents);
    return { ok: true, plan: { actions, dropped, notes: plan.notes.slice(0, 2), model } };
  } catch (error) {
    const { status, body } = planFailure(error);
    if (status >= 500 && body.reason === 'unknown') console.error('Planning failed', error);
    return { ok: false, status, ...body };
  }
}
