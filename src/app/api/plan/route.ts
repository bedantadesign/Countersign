import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { buildScenario } from '@/lib/fixtures';
import { planFailure } from '@/lib/planner/errors';
import { liveAvailable, requestPlan } from '@/lib/planner/live';
import { toProposedActions } from '@/lib/planner/map';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ live: liveAvailable() });
}

/** Takes no input: the request and documents are the fixed scenario, so this is not an open proxy to Claude. */
export async function POST() {
  if (!liveAvailable()) {
    return NextResponse.json(
      { error: 'Live planning is not configured on this server.', reason: 'unavailable' },
      { status: 503 },
    );
  }

  const { ctx } = buildScenario(Date.now());
  try {
    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    const { plan, model } = await requestPlan(client, ctx.request, ctx.documents);
    const { actions, dropped } = toProposedActions(plan, ctx.documents);
    return NextResponse.json({ actions, dropped, notes: plan.notes.slice(0, 3), model });
  } catch (error) {
    const { status, body } = planFailure(error);
    if (status >= 500 && body.reason === 'unknown') console.error('Planning failed', error);
    return NextResponse.json(body, { status });
  }
}
