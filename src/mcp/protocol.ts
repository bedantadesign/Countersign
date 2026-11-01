import type { LivePlan } from '@/lib/planner/client';

/** What `run_month_end` and `plan_month_end` hand the view in `structuredContent`. */
export type PlanResult =
  | { source: 'live'; plan: LivePlan }
  | { source: 'recorded' }
  | { source: 'failed'; error: string; reason: string };

export function isPlanResult(value: unknown): value is PlanResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.source === 'recorded') return true;
  if (v.source === 'failed') return typeof v.error === 'string';
  if (v.source === 'live') {
    const plan = v.plan as Record<string, unknown> | undefined;
    return Boolean(plan && Array.isArray(plan.actions));
  }
  return false;
}
