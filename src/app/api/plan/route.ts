import { NextResponse } from 'next/server';
import { liveAvailable } from '@/lib/planner/live';
import { planMonthEnd } from '@/lib/planner/run';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ live: liveAvailable() });
}

/** Takes no input: the request and documents are the fixed scenario, so this is not an open proxy to Claude. */
export async function POST() {
  const outcome = await planMonthEnd();
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, reason: outcome.reason }, { status: outcome.status });
  }
  return NextResponse.json(outcome.plan);
}
